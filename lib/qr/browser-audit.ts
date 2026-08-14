import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright";
import { PNG } from "pngjs";

import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT, scannerConfig } from "./config";
import { comparePngBuffers } from "./diff";
import { runLighthouseAudit } from "./lighthouse";
import { isAllowedByRobots, loadRobotsPolicy } from "./robots";
import { installSafeBrowserRouting } from "./safe-request";
import { sanitizeDiagnosticText } from "./sanitize";
import { assertSafeTarget, TargetUrlError } from "./security";
import { getAssetDirectory, resolveAssetPath } from "./store";
import type { AxeViolation, ConsoleEvent, NetworkFailure, NetworkResourceType, PageAudit, ScanCoverage, ScanTimings, ScreenshotAsset, VisualComparison } from "./types";
import { isCrawlableUrl, normalizeUrl } from "./url";
import { classifyVisualChange } from "./visual";

type Progress = (stage: "DISCOVERING" | "INSPECTING" | "AUDITING" | "CAPTURING" | "COMPARING", detail: string, completed: number, total: number | null, currentUrl?: string) => Promise<void>;

export type ComparisonReference = {
  target: "previous" | "baseline";
  scanId: string;
  desktop?: ScreenshotAsset;
  mobile?: ScreenshotAsset;
};

type BrowserAuditResult = {
  pages: PageAudit[];
  screenshots: ScreenshotAsset[];
  lighthouse: Awaited<ReturnType<typeof runLighthouseAudit>>;
  visualComparisons: VisualComparison[];
  coverage: ScanCoverage;
  timings: Pick<ScanTimings, "browserAuditMs" | "lighthouseMs" | "screenshotMs">;
};

export class ScanCancelledError extends Error {
  readonly code = "SCAN_CANCELLED";
  constructor() {
    super("The scan was cancelled.");
    this.name = "ScanCancelledError";
  }
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new ScanCancelledError();
}

function headers(response: Response | null) {
  if (!response) return {};
  const safe = new Set([
    "cache-control", "content-length", "content-security-policy", "content-type", "etag", "last-modified",
    "location", "referrer-policy", "strict-transport-security", "x-content-type-options", "x-frame-options",
  ]);
  return Object.fromEntries(Object.entries(response.headers()).map(([key, value]) => [key.toLowerCase(), value]).filter(([key]) => safe.has(key)));
}

function emptyFacts(): PageAudit["facts"] {
  return { title: "", metaDescription: "", lang: "", viewport: "", canonical: "", headings: [], headingSkips: [], duplicateIds: [], images: [], links: [], unlabeledControls: [], documentWidth: 0, viewportWidth: 0, htmlBytes: 0 };
}

function normalizeResourceType(value: string): NetworkResourceType {
  if (["document", "script", "stylesheet", "image", "font"].includes(value)) return value as NetworkResourceType;
  if (value === "fetch" || value === "xhr") return "fetch/xhr";
  return "other";
}

function conciseText(value: string) {
  return sanitizeDiagnosticText(value)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, scannerConfig.maxEventTextChars);
}

function failedPage(url: string, code: string, message: string): PageAudit {
  return {
    id: randomUUID(),
    url,
    status: 0,
    contentType: "",
    durationMs: 0,
    redirects: 0,
    headers: {},
    facts: emptyFacts(),
    consoleErrors: [],
    consoleWarnings: [],
    consoleEvents: [],
    pageErrors: [message],
    requestFailures: [],
    networkFailures: [],
    axeViolations: [],
    auditFailures: [],
    eventLimits: { consoleDropped: 0, networkDropped: 0, dialogsDismissed: 0, popupsBlocked: 0, downloadsBlocked: 0 },
    failure: { code, message },
  };
}

function documentInspectionFailed(page: PageAudit) {
  return page.status === 0 || page.status >= 400 || [
    "NAVIGATION_FAILED", "PRIMARY_INSPECTION_FAILED", "PAGE_INSPECTION_FAILED", "REDIRECT_LIMIT",
    "UNSAFE_REDIRECT", "RESPONSE_TOO_LARGE", "UNSUPPORTED_CONTENT_TYPE",
  ].includes(page.failure?.code ?? "");
}

async function inspectPage(page: Page, url: string, signal?: AbortSignal, allowedOrigin?: string): Promise<PageAudit> {
  const consoleByKey = new Map<string, ConsoleEvent>();
  const networkByKey = new Map<string, NetworkFailure>();
  const pageErrors: string[] = [];
  const auditFailures: PageAudit["auditFailures"] = [];
  const eventLimits = { consoleDropped: 0, networkDropped: 0, dialogsDismissed: 0, popupsBlocked: 0, downloadsBlocked: 0 };
  let consoleObserved = 0;
  let networkObserved = 0;
  let declaredOversize = false;
  let abuseFailure: PageAudit["failure"];

  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    consoleObserved += 1;
    if (consoleObserved > scannerConfig.maxConsoleEvents) {
      eventLimits.consoleDropped += 1;
      return;
    }
    const location = message.location();
    const text = conciseText(message.text());
    const key = `${message.type()}|${text}|${location.url ?? ""}|${location.lineNumber ?? 0}`;
    const existing = consoleByKey.get(key);
    if (existing) existing.count += 1;
    else consoleByKey.set(key, { level: message.type() === "warning" ? "warning" : "error", message: text, url: location.url?.slice(0, scannerConfig.maxResourceUrlChars), line: location.lineNumber, column: location.columnNumber, count: 1 });
  });
  page.on("pageerror", (error) => {
    if (pageErrors.length < scannerConfig.maxConsoleEvents) pageErrors.push(conciseText(error.message));
    else eventLimits.consoleDropped += 1;
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText === "net::ERR_BLOCKED_BY_CLIENT") return;
    if (request.failure()?.errorText === "net::ERR_ABORTED" && ["fetch", "xhr"].includes(request.resourceType())) return;
    networkObserved += 1;
    if (networkObserved > scannerConfig.maxNetworkFailures) {
      eventLimits.networkDropped += 1;
      return;
    }
    const failure: NetworkFailure = {
      method: request.method(),
      url: request.url().slice(0, scannerConfig.maxResourceUrlChars),
      resourceType: normalizeResourceType(request.resourceType()),
      reason: request.failure()?.errorText ?? "Request failed",
      count: 1,
    };
    const key = `${failure.method}|${failure.url}|${failure.resourceType}|${failure.reason}`;
    const existing = networkByKey.get(key);
    if (existing) existing.count += 1; else networkByKey.set(key, failure);
  });
  page.on("response", (response) => {
    const request = response.request();
    if (response.status() >= 400) {
      if (networkObserved >= scannerConfig.maxNetworkFailures) {
        eventLimits.networkDropped += 1;
      } else {
        networkObserved += 1;
        const failure: NetworkFailure = {
          method: request.method(),
          url: request.url().slice(0, scannerConfig.maxResourceUrlChars),
          resourceType: normalizeResourceType(request.resourceType()),
          reason: `HTTP ${response.status()}`,
          status: response.status(),
          count: 1,
        };
        const key = `${failure.method}|${failure.url}|${failure.resourceType}|${failure.status}`;
        const existing = networkByKey.get(key);
        if (existing) existing.count += 1; else networkByKey.set(key, failure);
      }
    }
    const length = Number(response.headers()["content-length"] ?? 0);
    if (length <= scannerConfig.maxResourceBytes) return;
    if (request.resourceType() === "document") declaredOversize = true;
    if (networkObserved >= scannerConfig.maxNetworkFailures) {
      eventLimits.networkDropped += 1;
      return;
    }
    networkObserved += 1;
    const failure: NetworkFailure = {
      method: request.method(),
      url: request.url().slice(0, scannerConfig.maxResourceUrlChars),
      resourceType: normalizeResourceType(request.resourceType()),
      reason: `Declared response size ${length} bytes exceeds the ${scannerConfig.maxResourceBytes} byte resource budget`,
      status: response.status(),
      count: 1,
    };
    networkByKey.set(`${failure.method}|${failure.url}|oversize`, failure);
  });
  page.on("dialog", (dialog) => {
    eventLimits.dialogsDismissed += 1;
    if (eventLimits.dialogsDismissed > scannerConfig.maxDialogs) abuseFailure = { code: "DIALOG_LIMIT", message: "The page exceeded the dialog safety limit." };
    void dialog.dismiss().catch(() => undefined);
  });
  page.on("popup", (popup) => {
    eventLimits.popupsBlocked += 1;
    if (eventLimits.popupsBlocked > scannerConfig.maxPopups) abuseFailure = { code: "POPUP_LIMIT", message: "The page exceeded the popup safety limit." };
    void popup.close().catch(() => undefined);
  });
  page.on("download", (download) => {
    eventLimits.downloadsBlocked += 1;
    void download.cancel().catch(() => undefined);
  });

  const started = performance.now();
  let response: Response | null = null;
  let failure: PageAudit["failure"];
  try {
    throwIfCancelled(signal);
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: scannerConfig.pageTimeoutMs });
    throwIfCancelled(signal);
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
  } catch (error) {
    throwIfCancelled(signal);
    const message = conciseText(error instanceof Error ? error.message : "Navigation failed");
    pageErrors.push(message);
    failure = { code: "NAVIGATION_FAILED", message };
  }
  const durationMs = Math.round(performance.now() - started);
  const responseHeaders = headers(response);
  let redirects = 0;
  for (let redirected = response?.request().redirectedFrom(); redirected; redirected = redirected.redirectedFrom()) redirects += 1;
  if (redirects > scannerConfig.maxRedirects) failure = { code: "REDIRECT_LIMIT", message: "The page exceeded the configured redirect limit." };
  const contentLength = Number(responseHeaders["content-length"] ?? 0);
  if (contentLength > scannerConfig.maxResponseBytes || declaredOversize) failure = { code: "RESPONSE_TOO_LARGE", message: "The page exceeds the configured response-size limit." };
  const contentType = responseHeaders["content-type"]?.toLowerCase() ?? "";
  if (response && contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) failure = { code: "UNSUPPORTED_CONTENT_TYPE", message: "ALT QR only evaluates HTML documents." };
  const browserUrl = response?.url() || page.url();
  const inspectedUrl = browserUrl?.startsWith("http:") || browserUrl?.startsWith("https:") ? browserUrl : url;
  try {
    const finalUrl = inspectedUrl;
    if (finalUrl.startsWith("http:" ) || finalUrl.startsWith("https:")) await assertSafeTarget(finalUrl);
    if (allowedOrigin && new URL(finalUrl).origin !== allowedOrigin) throw new TargetUrlError("CROSS_ORIGIN_REDIRECT", "A crawled page redirected outside the selected site origin.");
  } catch (error) {
    failure = { code: error instanceof TargetUrlError ? error.code : "UNSAFE_REDIRECT", message: error instanceof Error ? error.message : "The final URL failed security validation." };
  }
  if (abuseFailure) failure = abuseFailure;

  let facts = emptyFacts();
  if (!failure) {
    try {
      facts = await page.evaluate(`(() => {
        function selectorFor(element) {
          if (element.id) return '#' + CSS.escape(element.id);
          var parts = [];
          var current = element;
          while (current && current.nodeType === 1 && parts.length < 5) {
            var name = current.tagName.toLowerCase();
            var parent = current.parentElement;
            if (parent) {
              var siblings = Array.from(parent.children).filter(function (child) { return child.tagName === current.tagName; });
              if (siblings.length > 1) name += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
            }
            parts.unshift(name);
            current = parent;
          }
          return parts.join(' > ');
        }
        function boxFor(element) {
          var rect = element.getBoundingClientRect();
          return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
        }
        var maxEvidence = ${scannerConfig.maxDomEvidenceItems};
        var controls = Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea, button')).slice(0, maxEvidence);
        var unlabeledControls = controls.filter(function (control) {
          var labels = 'labels' in control && control.labels ? control.labels.length : 0;
          return !labels && !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby') && !(control.textContent || '').trim() && !control.title;
        }).map(function (control) { return { selector: selectorFor(control), type: control.type || control.tagName.toLowerCase(), boundingBox: boxFor(control) }; });
        var description = document.querySelector('meta[name="description"]');
        var viewport = document.querySelector('meta[name="viewport"]');
        var canonical = document.querySelector('link[rel="canonical"]');
        var viewportWidth = document.documentElement.clientWidth;
        var widestElement;
        for (var element of Array.from(document.body ? document.body.querySelectorAll('*') : [])) {
          var rect = element.getBoundingClientRect();
          if (rect.right <= viewportWidth + 2 && rect.width <= viewportWidth + 2) continue;
          if (!widestElement || rect.right > widestElement.right) widestElement = { selector: selectorFor(element), width: Math.round(rect.width), right: rect.right, boundingBox: boxFor(element) };
        }
        var headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, maxEvidence);
        var headingFacts = headings.map(function (heading) { return { level: Number(heading.tagName[1]), text: (heading.textContent || '').trim().slice(0, 180) }; });
        var headingSkips = [];
        var previousLevel = null;
        for (var heading of headings) {
          var level = Number(heading.tagName[1]);
          if (previousLevel !== null && level > previousLevel + 1) headingSkips.push({ from: previousLevel, to: level, text: (heading.textContent || '').trim().slice(0, 180), selector: selectorFor(heading) });
          previousLevel = level;
        }
        var ids = new Map();
        for (var identified of Array.from(document.querySelectorAll('[id]')).slice(0, maxEvidence)) {
          var id = identified.id;
          if (!id) continue;
          var currentId = ids.get(id);
          if (currentId) currentId.count += 1;
          else ids.set(id, { id: id.slice(0, 180), count: 1, selector: selectorFor(identified) });
        }
        return {
          title: document.title,
          metaDescription: description ? description.content : '',
          lang: document.documentElement.lang,
          viewport: viewport ? viewport.content : '',
          canonical: canonical ? canonical.href : '',
          headings: headingFacts,
          headingSkips: headingSkips.slice(0, maxEvidence),
          duplicateIds: Array.from(ids.values()).filter(function (entry) { return entry.count > 1; }).slice(0, maxEvidence),
          images: Array.from(document.images).slice(0, maxEvidence).map(function (image) { return { src: (image.currentSrc || image.src).slice(0, ${scannerConfig.maxResourceUrlChars}), alt: image.hasAttribute('alt') ? image.alt.slice(0, 500) : null, selector: selectorFor(image), boundingBox: boxFor(image) }; }),
          links: Array.from(document.querySelectorAll('a[href]')).slice(0, maxEvidence).map(function (link) { return { href: link.href.slice(0, ${scannerConfig.maxResourceUrlChars}), text: (link.textContent || '').trim().slice(0, 120), download: link.hasAttribute('download') }; }),
          unlabeledControls: unlabeledControls,
          widestElement: widestElement ? { selector: widestElement.selector, width: widestElement.width, boundingBox: widestElement.boundingBox } : undefined,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: viewportWidth,
          htmlBytes: new TextEncoder().encode(document.documentElement.outerHTML).length
        };
      })()`);
      if (facts.htmlBytes > scannerConfig.maxResponseBytes) failure = { code: "RESPONSE_TOO_LARGE", message: "The rendered document exceeds the configured response-size limit." };
    } catch (error) {
      throwIfCancelled(signal);
      const message = conciseText(`DOM inspection failed — ${error instanceof Error ? error.message : "unknown error"}`);
      pageErrors.push(message);
      failure ??= { code: "DOM_INSPECTION_FAILED", message };
    }
  }

  let axeViolations: AxeViolation[] = [];
  if (!failure) {
    try {
      const result = await new AxeBuilder({ page }).analyze();
      axeViolations = result.violations.slice(0, scannerConfig.maxDomEvidenceItems).map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? null,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.slice(0, 20).map((node) => ({ target: node.target.map((part) => String(part)).slice(0, 10), html: node.html.slice(0, scannerConfig.maxEventTextChars), failureSummary: node.failureSummary ? conciseText(node.failureSummary) : undefined })),
      }));
    } catch (error) {
      throwIfCancelled(signal);
      const reason = conciseText(`axe audit failed — ${error instanceof Error ? error.message : "unknown error"}`);
      auditFailures.push({ system: "axe", message: reason });
    }
  }

  const consoleEvents = [...consoleByKey.values()];
  const networkFailures = [...networkByKey.values()];
  return {
    id: randomUUID(),
    // Chromium replaces a failed navigation with chrome-error://chromewebdata/.
    // Preserve the requested URL so page evidence and issue fingerprints remain
    // distinct and actionable across multiple failed destinations.
    url: inspectedUrl,
    status: response?.status() ?? 0,
    contentType: responseHeaders["content-type"] ?? "",
    durationMs,
    redirects,
    headers: responseHeaders,
    facts,
    consoleErrors: consoleEvents.filter((event) => event.level === "error").map((event) => event.message),
    consoleWarnings: consoleEvents.filter((event) => event.level === "warning").map((event) => event.message),
    consoleEvents,
    pageErrors,
    requestFailures: networkFailures.map((item) => `${item.method} ${item.url} — ${item.reason}`),
    networkFailures,
    axeViolations,
    auditFailures,
    eventLimits,
    failure,
  };
}

async function stabilizeForCapture(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}" }).catch(() => undefined);
  await page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()").catch(() => undefined);
  await page.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))").catch(() => undefined);
}

async function captureScreenshot(page: Page, scanId: string, pageId: string, name: string, viewport: "desktop" | "mobile") {
  const directory = getAssetDirectory(scanId);
  await mkdir(directory, { recursive: true });
  await stabilizeForCapture(page);
  const relativePath = `${scanId}/${name}.png`;
  const absolutePath = resolveAssetPath(relativePath);
  const dimensions = await page.evaluate("({ width: Math.max(1, document.documentElement.clientWidth), height: Math.max(1, document.documentElement.scrollHeight) })") as { width: number; height: number };
  const boundedHeight = Math.max(1, Math.min(dimensions.height, scannerConfig.maxScreenshotHeight, Math.floor(scannerConfig.maxScreenshotPixels / dimensions.width)));
  const fullPage = boundedHeight >= dimensions.height;
  const buffer = await page.screenshot({
    path: absolutePath,
    fullPage,
    clip: fullPage ? undefined : { x: 0, y: 0, width: dimensions.width, height: boundedHeight },
    animations: "disabled",
    scale: "css",
  });
  const png = PNG.sync.read(buffer);
  return { id: randomUUID(), pageId, viewport, relativePath, width: png.width, height: png.height } satisfies ScreenshotAsset;
}

export async function runBrowserAudit(input: {
  scanId: string;
  url: string;
  references: ComparisonReference[];
  signal?: AbortSignal;
  onProgress: Progress;
}): Promise<BrowserAuditResult> {
  const auditStarted = performance.now();
  let screenshotMs = 0;
  let browser: Browser | undefined;
  let desktop: BrowserContext | undefined;
  let mobile: BrowserContext | undefined;
  let timeout: NodeJS.Timeout | undefined;
  let timedOut = false;
  const deadline = new AbortController();
  const runSignal = input.signal ? AbortSignal.any([input.signal, deadline.signal]) : deadline.signal;
  const pages: PageAudit[] = [];
  const screenshots: ScreenshotAsset[] = [];
  const visualComparisons: VisualComparison[] = [];
  let lighthouse: BrowserAuditResult["lighthouse"] = { available: false, error: "Lighthouse did not start." };
  let discoveredCount = 0;
  let selectedCount = 0;
  let skippedCount = 0;
  let robotsExcludedCount = 0;
  let unverified: string[] = [];
  const abortBrowser = () => { void browser?.close().catch(() => undefined); };
  runSignal.addEventListener("abort", abortBrowser, { once: true });
  try {
    throwIfCancelled(runSignal);
    timeout = setTimeout(() => {
      timedOut = true;
      deadline.abort();
      void browser?.close();
    }, scannerConfig.scanTimeoutMs);
    browser = await chromium.launch({ headless: true });
    throwIfCancelled(runSignal);
    desktop = await browser.newContext({
      viewport: { width: DESKTOP_VIEWPORT.width, height: DESKTOP_VIEWPORT.height },
      deviceScaleFactor: DESKTOP_VIEWPORT.deviceScaleFactor,
      acceptDownloads: false,
      userAgent: scannerConfig.userAgent,
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const desktopRouting = await installSafeBrowserRouting(desktop, runSignal);
    const target = new URL(input.url);
    await input.onProgress("DISCOVERING", "Reading robots policy and primary document", 0, null, input.url);
    let policy = await loadRobotsPolicy(target, runSignal);
    throwIfCancelled(runSignal);
    if (!isAllowedByRobots(input.url, policy)) throw new TargetUrlError("ROBOTS_DISALLOWED", "The target is disallowed by robots.txt.");
    const primaryPage = await desktop.newPage();
    let primary: PageAudit;
    try {
      primary = await inspectPage(primaryPage, input.url, runSignal);
    } catch (error) {
      throwIfCancelled(runSignal);
      primary = failedPage(input.url, "PRIMARY_INSPECTION_FAILED", conciseText(error instanceof Error ? error.message : "Primary inspection failed"));
    }
    pages.push(primary);
    if (primary.status === 0 || primary.failure) {
      throw new TargetUrlError("PRIMARY_NAVIGATION_FAILED", "ALT QR could not inspect the target's primary document. Confirm that the public URL is reachable and try again.");
    }
    const crawlOrigin = new URL(primary.url || input.url).origin;
    desktopRouting.setDocumentOrigin(crawlOrigin);
    if (crawlOrigin !== policy.origin) {
      policy = await loadRobotsPolicy(new URL(crawlOrigin), runSignal);
      if (!isAllowedByRobots(primary.url, policy)) throw new TargetUrlError("ROBOTS_DISALLOWED", "The redirected target is disallowed by robots.txt.");
    }
    const targets = [normalizeUrl(primary.url || input.url)];
    const discovered = new Set(targets);
    const pathQueryCounts = new Map<string, number>([[new URL(targets[0]).pathname, 1]]);
    const unverifiedUrls: string[] = [];
    let robotsExcluded = 0;
    let skippedByLimit = 0;
    const enqueueLinks = (audit: PageAudit) => {
      let acceptedFromPage = 0;
      for (const link of audit.facts.links) {
        if (link.download) continue;
        if (!isCrawlableUrl(link.href, crawlOrigin)) continue;
        const candidate = normalizeUrl(link.href);
        if (discovered.has(candidate)) continue;
        const candidatePath = new URL(candidate).pathname;
        const variantCount = pathQueryCounts.get(candidatePath) ?? 0;
        if (variantCount >= 2) continue;
        acceptedFromPage += 1;
        if (acceptedFromPage > scannerConfig.maxLinksPerPage) break;
        discovered.add(candidate);
        pathQueryCounts.set(candidatePath, variantCount + 1);
        if (!isAllowedByRobots(candidate, policy)) { robotsExcluded += 1; continue; }
        if (targets.length < scannerConfig.maxPages) targets.push(candidate);
        else { skippedByLimit += 1; if (unverifiedUrls.length < 10) unverifiedUrls.push(candidate); }
      }
    };
    enqueueLinks(primary);
    discoveredCount = discovered.size;
    selectedCount = targets.length;
    skippedCount = skippedByLimit;
    robotsExcludedCount = robotsExcluded;
    unverified = [...unverifiedUrls];
    await input.onProgress("INSPECTING", `Inspecting up to ${scannerConfig.maxPages} safe same-origin pages`, 1, targets.length, input.url);
    for (let cursor = 1; cursor < targets.length; cursor += scannerConfig.crawlConcurrency) {
      throwIfCancelled(runSignal);
      const batch = targets.slice(cursor, cursor + scannerConfig.crawlConcurrency);
      const audited = await Promise.all(batch.map(async (url) => {
        const page = await desktop!.newPage();
        try {
          return await inspectPage(page, url, runSignal, crawlOrigin);
        } catch (error) {
          throwIfCancelled(runSignal);
          return failedPage(url, "PAGE_INSPECTION_FAILED", conciseText(error instanceof Error ? error.message : "Page inspection failed"));
        } finally {
          await page.close().catch(() => undefined);
        }
      }));
      pages.push(...audited);
      for (const audit of audited) enqueueLinks(audit);
      discoveredCount = discovered.size;
      selectedCount = targets.length;
      skippedCount = skippedByLimit;
      robotsExcludedCount = robotsExcluded;
      unverified = [...unverifiedUrls];
      await input.onProgress("INSPECTING", `Inspected ${pages.length} of ${targets.length} pages`, pages.length, targets.length, batch.at(-1));
    }
    throwIfCancelled(runSignal);
    await input.onProgress("AUDITING", "Axe evidence collected per page; running Lighthouse", 1, 2);
    lighthouse = await runLighthouseAudit(input.url, runSignal);
    throwIfCancelled(runSignal);
    await input.onProgress("AUDITING", lighthouse.available ? "Accessibility and Lighthouse audits complete" : "axe complete; Lighthouse unavailable", 2, 2);
    await input.onProgress("CAPTURING", "Stabilizing layouts and capturing desktop/mobile evidence", 0, pages.length + 2);
    const desktopCaptureStarted = performance.now();
    try {
      screenshots.push(await captureScreenshot(primaryPage, input.scanId, primary.id, "primary-desktop", "desktop"));
    } catch (error) {
      primary.auditFailures.push({ system: "screenshot", message: conciseText(`Desktop capture failed — ${error instanceof Error ? error.message : "unknown error"}`) });
    }
    screenshotMs += performance.now() - desktopCaptureStarted;
    mobile = await browser.newContext({
      viewport: { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: MOBILE_VIEWPORT.deviceScaleFactor,
      acceptDownloads: false,
      userAgent: scannerConfig.mobileUserAgent,
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const mobileRouting = await installSafeBrowserRouting(mobile, runSignal);
    mobileRouting.setDocumentOrigin(crawlOrigin);
    const mobilePage = await mobile.newPage();
    try {
      await mobilePage.goto(primary.url || input.url, { waitUntil: "domcontentloaded", timeout: scannerConfig.pageTimeoutMs });
      await mobilePage.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
    } catch (error) {
      throwIfCancelled(runSignal);
      primary.auditFailures.push({ system: "mobile", message: conciseText(`Mobile navigation failed — ${error instanceof Error ? error.message : "unknown error"}`) });
      primary.failure ??= { code: "MOBILE_AUDIT_PARTIAL", message: "Mobile layout inspection did not complete." };
    }
    for (let index = 0; index < pages.length; index += 1) {
      throwIfCancelled(runSignal);
      const responsivePage = index === 0 ? mobilePage : await mobile.newPage();
      try {
        if (index > 0) await responsivePage.goto(pages[index].url, { waitUntil: "domcontentloaded", timeout: scannerConfig.pageTimeoutMs });
        const dimensions = await responsivePage.evaluate("({ documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth })") as { documentWidth: number; viewportWidth: number };
        pages[index].facts.documentWidth = dimensions.documentWidth;
        pages[index].facts.viewportWidth = dimensions.viewportWidth;
      } catch (error) {
        throwIfCancelled(runSignal);
        pages[index].auditFailures.push({ system: "mobile", message: conciseText(`Mobile layout audit failed — ${error instanceof Error ? error.message : "unknown error"}`) });
        pages[index].failure ??= { code: "MOBILE_AUDIT_PARTIAL", message: "Mobile layout inspection did not complete." };
      } finally {
        if (index > 0) await responsivePage.close().catch(() => undefined);
      }
      await input.onProgress("CAPTURING", `Measured mobile layout ${index + 1} of ${pages.length}`, index + 1, pages.length + 2, pages[index].url);
    }
    const mobileCaptureStarted = performance.now();
    try {
      screenshots.push(await captureScreenshot(mobilePage, input.scanId, primary.id, "primary-mobile", "mobile"));
    } catch (error) {
      primary.auditFailures.push({ system: "screenshot", message: conciseText(`Mobile capture failed — ${error instanceof Error ? error.message : "unknown error"}`) });
    }
    screenshotMs += performance.now() - mobileCaptureStarted;
    await mobile.close().catch(() => undefined);
    mobile = undefined;
    await input.onProgress("CAPTURING", "Desktop and mobile evidence captured", pages.length + 2, pages.length + 2);
    const references = input.references.filter((reference, index, all) => all.findIndex((candidate) => candidate.scanId === reference.scanId && candidate.target === reference.target) === index);
    const comparisonUnits = Math.max(1, references.length * 2);
    await input.onProgress("COMPARING", references.length ? "Comparing previous and project-baseline captures" : "No comparison target; current capture can become a baseline", 0, comparisonUnits);
    let completedComparisons = 0;
    for (const reference of references) {
      for (const viewport of ["desktop", "mobile"] as const) {
        throwIfCancelled(runSignal);
        const baselineAsset = reference[viewport];
        const currentAsset = screenshots.find((asset) => asset.viewport === viewport);
        if (!baselineAsset || !currentAsset) {
          completedComparisons += 1;
          continue;
        }
        try {
          const baseline = await readFile(resolveAssetPath(baselineAsset.relativePath));
          const current = await readFile(resolveAssetPath(currentAsset.relativePath));
          const comparison = comparePngBuffers(baseline, current);
          const relativePath = `${input.scanId}/${reference.target}-${viewport}-diff.png`;
          await writeFile(resolveAssetPath(relativePath), comparison.png);
          const diffAsset: ScreenshotAsset = {
            id: randomUUID(), pageId: primary.id, viewport: "diff", relativePath, width: comparison.width, height: comparison.height,
            sourceViewport: viewport, comparisonTarget: reference.target,
          };
          screenshots.push(diffAsset);
          visualComparisons.push({
            id: randomUUID(), baselineScanId: reference.scanId, currentScanId: input.scanId,
            baselineScreenshotId: baselineAsset.id, currentScreenshotId: currentAsset.id, diffScreenshotId: diffAsset.id,
            viewport, comparisonTarget: reference.target,
            changedPixels: comparison.changedPixels, totalPixels: comparison.totalPixels, diffPercentage: comparison.diffPercentage,
            rating: classifyVisualChange(comparison.diffPercentage),
          });
        } catch (error) {
          primary.auditFailures.push({ system: "visual", message: conciseText(`Visual comparison unavailable — ${error instanceof Error ? error.message : "invalid comparison asset"}`) });
        }
        completedComparisons += 1;
        await input.onProgress("COMPARING", `Compared ${reference.target} ${viewport}`, completedComparisons, comparisonUnits);
      }
    }
    if (!references.length) completedComparisons = 1;
    await input.onProgress("COMPARING", "Visual comparison complete", completedComparisons, comparisonUnits);
    await primaryPage.close().catch(() => undefined);
    await desktop.close().catch(() => undefined);
    desktop = undefined;
    const coverage: ScanCoverage = {
      discoveredPages: discovered.size,
      selectedPages: targets.length,
      inspectedPages: pages.length,
      failedPages: pages.filter(documentInspectionFailed).length,
      partialPages: pages.filter((page) => !documentInspectionFailed(page) && Boolean(page.failure || page.auditFailures.length)).length,
      skippedByLimit,
      robotsExcluded,
      unverifiedUrls,
    };
    return {
      pages,
      screenshots,
      lighthouse,
      visualComparisons,
      coverage,
      timings: { browserAuditMs: Math.round(performance.now() - auditStarted), lighthouseMs: lighthouse.durationMs ?? 0, screenshotMs: Math.round(screenshotMs) },
    };
  } catch (error) {
    if (input.signal?.aborted) throw new ScanCancelledError();
    if (timedOut) {
      if (!pages.length) throw new TargetUrlError("SCAN_TIMEOUT", "The scan exceeded the configured total timeout before any page evidence was captured.");
      const partial = pages[0];
      partial.auditFailures.push({ system: "timeout", message: "The total scan budget ended after partial evidence was captured." });
      return {
        pages,
        screenshots,
        lighthouse: { ...lighthouse, available: false, error: lighthouse.error ?? "Lighthouse did not complete before the total scan timeout." },
        visualComparisons,
        coverage: {
          discoveredPages: Math.max(discoveredCount, pages.length),
          selectedPages: Math.max(selectedCount, pages.length),
          inspectedPages: pages.length,
          failedPages: pages.filter(documentInspectionFailed).length,
          partialPages: pages.filter((page) => !documentInspectionFailed(page) && Boolean(page.failure || page.auditFailures.length)).length,
          skippedByLimit: skippedCount,
          robotsExcluded: robotsExcludedCount,
          unverifiedUrls: unverified,
        },
        timings: { browserAuditMs: Math.round(performance.now() - auditStarted), lighthouseMs: lighthouse.durationMs ?? 0, screenshotMs: Math.round(screenshotMs) },
      };
    }
    throw error;
  } finally {
    runSignal.removeEventListener("abort", abortBrowser);
    if (timeout) clearTimeout(timeout);
    await mobile?.close().catch(() => undefined);
    await desktop?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
