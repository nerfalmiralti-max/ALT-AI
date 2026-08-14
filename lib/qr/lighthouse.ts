import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium, type BrowserContext } from "playwright";

import { scannerConfig } from "./config";
import { installSafeBrowserRouting } from "./safe-request";
import { sanitizeDiagnosticText } from "./sanitize";
import type { LighthouseMetrics } from "./types";

function score(value: number | null | undefined) {
  return typeof value === "number" ? Math.round(value * 100) : undefined;
}

export function hasUsableLighthouseData(scores: LighthouseMetrics["scores"], metrics: LighthouseMetrics["metrics"]) {
  return [...Object.values(scores ?? {}), ...Object.values(metrics ?? {})].some((value) => typeof value === "number" && Number.isFinite(value));
}

async function reservePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Lighthouse debugging port could not be reserved.");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function publicError(error: unknown) {
  return sanitizeDiagnosticText(error instanceof Error ? error.message : "Lighthouse audit failed.")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function abortPromise(signal: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(new Error("Lighthouse audit was cancelled or timed out."));
    else signal.addEventListener("abort", () => reject(new Error("Lighthouse audit was cancelled or timed out.")), { once: true });
  });
}

export async function runLighthouseAudit(url: string, signal?: AbortSignal): Promise<LighthouseMetrics> {
  let context: BrowserContext | undefined;
  let profileDirectory: string | undefined;
  const started = performance.now();
  if (signal?.aborted) {
    return { available: false, error: "Lighthouse audit was cancelled or timed out.", durationMs: Math.round(performance.now() - started) };
  }
  const deadline = AbortSignal.timeout(30_000);
  const runSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const [{ default: lighthouse }, port] = await Promise.race([Promise.all([import("lighthouse"), reservePort()]), abortPromise(runSignal)]);
    profileDirectory = await mkdtemp(path.join(tmpdir(), "alt-qr-lighthouse-"));
    if (runSignal.aborted) throw new Error("Lighthouse audit was cancelled or timed out.");
    const launch = chromium.launchPersistentContext(profileDirectory, {
      headless: true,
      acceptDownloads: false,
      serviceWorkers: "block",
      userAgent: scannerConfig.userAgent,
      args: [`--remote-debugging-port=${port}`, "--disable-dev-shm-usage"],
    });
    void launch.then((startedContext) => { if (runSignal.aborted) void startedContext.close().catch(() => undefined); }).catch(() => undefined);
    context = await Promise.race([launch, abortPromise(runSignal)]);
    await Promise.race([installSafeBrowserRouting(context, runSignal), abortPromise(runSignal)]);
    const result = await Promise.race([
      lighthouse(url, {
        port,
        hostname: "127.0.0.1",
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
      }),
      abortPromise(runSignal),
    ]);
    if (!result) return { available: false, error: "Lighthouse returned no result.", durationMs: Math.round(performance.now() - started) };
    const audits = result.lhr.audits;
    const scores = {
      performance: score(result.lhr.categories.performance?.score),
      accessibility: score(result.lhr.categories.accessibility?.score),
      seo: score(result.lhr.categories.seo?.score),
      "best-practices": score(result.lhr.categories["best-practices"]?.score),
    };
    const metrics = {
      fcp: audits["first-contentful-paint"]?.numericValue,
      lcp: audits["largest-contentful-paint"]?.numericValue,
      cls: audits["cumulative-layout-shift"]?.numericValue,
      tbt: audits["total-blocking-time"]?.numericValue,
      speedIndex: audits["speed-index"]?.numericValue,
    };
    if (!hasUsableLighthouseData(scores, metrics)) {
      return { available: false, error: publicError(result.lhr.runtimeError?.message || "Lighthouse completed without usable scores or metrics."), durationMs: Math.round(performance.now() - started) };
    }
    return { available: true, durationMs: Math.round(performance.now() - started), scores, metrics };
  } catch (error) {
    return { available: false, error: publicError(error), durationMs: Math.round(performance.now() - started) };
  } finally {
    await context?.close().catch(() => undefined);
    if (profileDirectory) await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => undefined);
  }
}
