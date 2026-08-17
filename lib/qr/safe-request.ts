import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import type { BrowserContext } from "playwright";

import { scannerConfig } from "./config";
import { isLikelyMaliciousDownload, resolveSafeTarget, TargetUrlError } from "./security";

export type PinnedResponse = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
};

const REQUEST_HEADERS_TO_DROP = new Set(["connection", "content-length", "host", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"]);
const RESPONSE_HEADERS_TO_DROP = new Set(["connection", "content-encoding", "content-length", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);

export const PASSIVE_CHROMIUM_ARGS = Object.freeze(["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"]);

type Admission = { resolve: (release: () => void) => void; reject: (error: unknown) => void; signal?: AbortSignal; onAbort?: () => void };

export class ScanResourceBudget {
  private consumedBytes = 0;
  private active = 0;
  private readonly waiters: Admission[] = [];
  private readonly controller = new AbortController();

  constructor(readonly maxBytes: number, readonly maxInflight: number) {}

  get signal() { return this.controller.signal; }
  get consumed() { return this.consumedBytes; }

  consume(bytes: number) {
    if (!Number.isFinite(bytes) || bytes < 0 || this.consumedBytes + bytes > this.maxBytes) {
      const error = new TargetUrlError("TOTAL_RESPONSE_BUDGET", `The aggregate response budget of ${this.maxBytes} bytes was exceeded.`);
      this.controller.abort(error);
      throw error;
    }
    this.consumedBytes += bytes;
  }

  acquire(signal?: AbortSignal): Promise<() => void> {
    const combined = signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal;
    if (combined.aborted) return Promise.reject(combined.reason ?? new Error("Request admission was cancelled."));
    return new Promise((resolve, reject) => {
      const admission: Admission = { resolve, reject, signal: combined };
      admission.onAbort = () => {
        const index = this.waiters.indexOf(admission);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(combined.reason ?? new Error("Request admission was cancelled."));
      };
      combined.addEventListener("abort", admission.onAbort, { once: true });
      this.waiters.push(admission);
      this.grant();
    });
  }

  private grant() {
    while (this.active < this.maxInflight && this.waiters.length) {
      const admission = this.waiters.shift()!;
      if (admission.signal?.aborted) continue;
      if (admission.onAbort) admission.signal?.removeEventListener("abort", admission.onAbort);
      this.active += 1;
      let released = false;
      admission.resolve(() => {
        if (released) return;
        released = true;
        this.active -= 1;
        this.grant();
      });
    }
  }
}

function safeRequestHeaders(source: Record<string, string>, host: string) {
  const headers = Object.fromEntries(Object.entries(source).filter(([key]) => !REQUEST_HEADERS_TO_DROP.has(key.toLowerCase())));
  headers.host = host;
  headers["accept-encoding"] = "identity";
  return headers;
}

function safeResponseHeaders(source: NodeJS.Dict<string | string[]>, bodyLength: number) {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || RESPONSE_HEADERS_TO_DROP.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join("\n") : value;
  }
  headers["content-length"] = String(bodyLength);
  return headers;
}

export async function fetchPinnedResource(raw: string, options: {
  method?: string;
  headers?: Record<string, string>;
  maxBytes?: number;
  signal?: AbortSignal;
  budget?: ScanResourceBudget;
} = {}): Promise<PinnedResponse> {
  if (raw.length > scannerConfig.maxResourceUrlChars) throw new TargetUrlError("RESOURCE_URL_TOO_LARGE", "The resource URL exceeds the configured safety limit.");
  const signals = [AbortSignal.timeout(scannerConfig.pageTimeoutMs), options.budget?.signal, options.signal].filter((value): value is AbortSignal => Boolean(value));
  const signal = AbortSignal.any(signals);
  const release = await options.budget?.acquire(signal);

  try {
    const { url, addresses } = await resolveSafeTarget(raw);
    if (isLikelyMaliciousDownload(url.toString())) throw new TargetUrlError("DOWNLOAD_BLOCKED", "Executable and archive downloads are not inspected by ALT QR.");
    const address = addresses[0];
    const method = (options.method ?? "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) throw new TargetUrlError("METHOD_BLOCKED", "ALT QR only permits passive browser requests.");
    const maxBytes = options.maxBytes ?? scannerConfig.maxResourceBytes;
    return await new Promise<PinnedResponse>((resolve, reject) => {
      const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
      const request = transport({
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers: safeRequestHeaders(options.headers ?? {}, url.host),
        servername: url.hostname,
        rejectUnauthorized: true,
        signal,
      }, (response) => {
        const contentEncoding = String(response.headers["content-encoding"] ?? "identity").toLowerCase();
        const declaredLength = Number.parseInt(String(response.headers["content-length"] ?? "0"), 10);
        if (contentEncoding !== "identity") {
          response.destroy(new TargetUrlError("CONTENT_ENCODING_BLOCKED", "Compressed browser resources are blocked because their decoded size cannot be proven within the response budget."));
          return;
        }
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          response.destroy(new TargetUrlError("RESOURCE_TOO_LARGE", `The response exceeded the ${maxBytes} byte safety limit.`));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.byteLength;
          if (bytes > maxBytes) {
            response.destroy(new TargetUrlError("RESOURCE_TOO_LARGE", `The response exceeded the ${maxBytes} byte safety limit.`));
            return;
          }
          try {
            options.budget?.consume(buffer.byteLength);
          } catch (error) {
            response.destroy(error instanceof Error ? error : new Error("Aggregate response budget exceeded."));
            return;
          }
          chunks.push(buffer);
        });
        response.once("error", reject);
        response.once("end", () => {
          const body = Buffer.concat(chunks);
          resolve({ status: response.statusCode ?? 502, headers: safeResponseHeaders(response.headers, body.byteLength), body });
        });
      });
      request.once("error", reject);
      request.end();
    });
  } finally {
    release?.();
  }
}

function blockedStatus(error: unknown) {
  if (!(error instanceof TargetUrlError)) return 502;
  if (error.code === "METHOD_BLOCKED") return 405;
  if (error.code === "RESOURCE_TOO_LARGE") return 413;
  if (error.code === "TOTAL_RESPONSE_BUDGET") return 429;
  if (error.code === "CONTENT_ENCODING_BLOCKED") return 415;
  if (error.code === "REQUEST_LIMIT") return 429;
  if (error.code === "REDIRECT_LIMIT") return 508;
  return 451;
}

export async function installSafeBrowserRouting(context: BrowserContext, signal?: AbortSignal, budget = new ScanResourceBudget(scannerConfig.maxScanResponseBytes, scannerConfig.maxInflightRequests)) {
  let requestCount = 0;
  let documentOrigin: string | undefined;
  await context.addInitScript({ content: `(() => {
    const blocked = function RTCPeerConnection() { throw new DOMException("WebRTC is disabled during passive ALT QR inspection.", "SecurityError"); };
    for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection"]) {
      try { Object.defineProperty(globalThis, name, { configurable: false, enumerable: false, writable: false, value: blocked }); } catch {}
    }
  })();` });
  await context.routeWebSocket(/.*/, () => {
    // A routed socket does not contact the server unless connectToServer() is called.
    // ALT QR is passive and does not need live WebSocket traffic for deterministic inspection.
  });
  await context.route("**/*", async (route) => {
    const browserRequest = route.request();
    try {
      requestCount += 1;
      if (requestCount > scannerConfig.maxRequestsPerContext) throw new TargetUrlError("REQUEST_LIMIT", "The browser request budget was exceeded.");
      let redirectCount = 0;
      for (let redirected = browserRequest.redirectedFrom(); redirected; redirected = redirected.redirectedFrom()) redirectCount += 1;
      if (redirectCount > scannerConfig.maxRedirects) throw new TargetUrlError("REDIRECT_LIMIT", "The browser redirect budget was exceeded.");
      const url = new URL(browserRequest.url());
      if (url.protocol === "data:" || url.protocol === "blob:" || url.protocol === "about:") {
        await route.continue();
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new TargetUrlError("UNSUPPORTED_RESOURCE", "The browser requested an unsupported resource scheme.");
      const frame = browserRequest.resourceType() === "document" ? browserRequest.frame() : undefined;
      const isMainDocument = Boolean(frame && frame === frame.page().mainFrame());
      if (isMainDocument && documentOrigin && url.origin !== documentOrigin) {
        throw new TargetUrlError("CROSS_ORIGIN_REDIRECT", "A crawled page attempted to leave the selected site origin.");
      }
      const response = await fetchPinnedResource(url.toString(), {
        method: browserRequest.method(),
        headers: browserRequest.headers(),
        maxBytes: browserRequest.resourceType() === "document" ? scannerConfig.maxResponseBytes : scannerConfig.maxResourceBytes,
        signal,
        budget,
      });
      await route.fulfill({ status: response.status, headers: response.headers, body: response.body });
    } catch (error) {
      if (signal?.aborted) {
        await route.abort("aborted").catch(() => undefined);
        return;
      }
      if (!(error instanceof TargetUrlError)) {
        await route.abort("failed").catch(() => undefined);
        return;
      }
      await route.fulfill({
        status: blockedStatus(error),
        headers: { "content-type": "text/plain; charset=utf-8", "x-alt-qr-policy-block": error.code },
        body: "ALT QR blocked this request because it exceeded the scanner safety policy.",
      }).catch(() => route.abort("blockedbyclient"));
    }
  });
  return { setDocumentOrigin: (origin: string) => { documentOrigin = origin; } };
}
