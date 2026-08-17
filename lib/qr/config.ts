function boundedInt(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export const SCANNER_VERSION = "2.3.0";
export const RULES_VERSION = "2.2.0";

export const DESKTOP_VIEWPORT = Object.freeze({ width: 1440, height: 1000, deviceScaleFactor: 1 });
export const MOBILE_VIEWPORT = Object.freeze({ width: 390, height: 844, deviceScaleFactor: 1 });

export const scannerConfig = Object.freeze({
  maxPages: boundedInt("ALT_QR_MAX_PAGES", 10, 1, 25),
  challengeMaxPages: boundedInt("ALT_QR_CHALLENGE_MAX_PAGES", 10, 1, 25),
  challengeTimeoutMs: boundedInt("ALT_QR_CHALLENGE_TIMEOUT_MS", 480_000, 60_000, 900_000),
  swarmRoleTimeoutMs: boundedInt("ALT_QR_SWARM_ROLE_TIMEOUT_MS", 10_000, 1_000, 60_000),
  redTeamMaxTargets: boundedInt("ALT_QR_RED_TEAM_MAX_TARGETS", 1, 1, 3),
  crawlConcurrency: boundedInt("ALT_QR_CRAWL_CONCURRENCY", 2, 1, 4),
  maxConcurrentScans: boundedInt("ALT_QR_MAX_CONCURRENT_SCANS", 1, 1, 4),
  pageTimeoutMs: boundedInt("ALT_QR_PAGE_TIMEOUT_MS", 15_000, 2_000, 45_000),
  scanTimeoutMs: boundedInt("ALT_QR_SCAN_TIMEOUT_MS", 120_000, 15_000, 300_000),
  maxRedirects: boundedInt("ALT_QR_MAX_REDIRECTS", 5, 0, 10),
  maxResponseBytes: boundedInt("ALT_QR_MAX_RESPONSE_BYTES", 2_000_000, 100_000, 10_000_000),
  maxResourceBytes: boundedInt("ALT_QR_MAX_RESOURCE_BYTES", 5_000_000, 100_000, 20_000_000),
  maxScanResponseBytes: boundedInt("ALT_QR_MAX_SCAN_RESPONSE_BYTES", 50_000_000, 5_000_000, 250_000_000),
  maxInflightRequests: boundedInt("ALT_QR_MAX_INFLIGHT_REQUESTS", 8, 1, 32),
  maxDomNodes: boundedInt("ALT_QR_MAX_DOM_NODES", 5_000, 500, 20_000),
  maxRenderedDomChars: boundedInt("ALT_QR_MAX_RENDERED_DOM_CHARS", 500_000, 50_000, 2_000_000),
  maxScreenshotPixels: boundedInt("ALT_QR_MAX_SCREENSHOT_PIXELS", 10_000_000, 1_000_000, 25_000_000),
  maxScreenshotHeight: boundedInt("ALT_QR_MAX_SCREENSHOT_HEIGHT", 6_000, 1_000, 12_000),
  maxScreenshotBytes: boundedInt("ALT_QR_MAX_SCREENSHOT_BYTES", 8_000_000, 1_000_000, 32_000_000),
  maxLinksPerPage: boundedInt("ALT_QR_MAX_LINKS_PER_PAGE", 40, 5, 100),
  maxConsoleEvents: boundedInt("ALT_QR_MAX_CONSOLE_EVENTS", 200, 20, 1_000),
  maxNetworkFailures: boundedInt("ALT_QR_MAX_NETWORK_FAILURES", 200, 20, 1_000),
  maxRequestsPerContext: boundedInt("ALT_QR_MAX_REQUESTS_PER_CONTEXT", 600, 50, 2_000),
  maxEventTextChars: boundedInt("ALT_QR_MAX_EVENT_TEXT_CHARS", 2_000, 256, 10_000),
  maxDomEvidenceItems: boundedInt("ALT_QR_MAX_DOM_EVIDENCE_ITEMS", 250, 20, 1_000),
  maxResourceUrlChars: boundedInt("ALT_QR_MAX_RESOURCE_URL_CHARS", 8_192, 2_048, 32_768),
  maxDialogs: boundedInt("ALT_QR_MAX_DIALOGS", 10, 0, 50),
  maxPopups: boundedInt("ALT_QR_MAX_POPUPS", 5, 0, 20),
  maxStoredScans: boundedInt("ALT_QR_MAX_STORED_SCANS", 250, 20, 2_000),
  maxStoredBytes: boundedInt("ALT_QR_MAX_STORED_BYTES", 2_000_000_000, 50_000_000, 20_000_000_000),
  userAgent: "ALT-Quality-Radar/2.0 (+deterministic release QA)",
  mobileUserAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 ALT-Quality-Radar/2.1",
  allowPrivateTargets: process.env.NODE_ENV !== "production" && process.env.ALT_QR_ALLOW_PRIVATE_TARGETS === "true",
  dataDir: process.env.ALT_QR_DATA_DIR?.trim() || ".alt-qr-data",
});

export function scanConfigSnapshot() {
  return {
    maxPages: scannerConfig.maxPages,
    crawlConcurrency: scannerConfig.crawlConcurrency,
    maxConcurrentScans: scannerConfig.maxConcurrentScans,
    pageTimeoutMs: scannerConfig.pageTimeoutMs,
    scanTimeoutMs: scannerConfig.scanTimeoutMs,
    maxRedirects: scannerConfig.maxRedirects,
    maxResponseBytes: scannerConfig.maxResponseBytes,
    maxResourceBytes: scannerConfig.maxResourceBytes,
    maxScanResponseBytes: scannerConfig.maxScanResponseBytes,
    maxInflightRequests: scannerConfig.maxInflightRequests,
    maxDomNodes: scannerConfig.maxDomNodes,
    maxRenderedDomChars: scannerConfig.maxRenderedDomChars,
    maxScreenshotPixels: scannerConfig.maxScreenshotPixels,
    maxScreenshotHeight: scannerConfig.maxScreenshotHeight,
    maxScreenshotBytes: scannerConfig.maxScreenshotBytes,
    maxLinksPerPage: scannerConfig.maxLinksPerPage,
    maxConsoleEvents: scannerConfig.maxConsoleEvents,
    maxNetworkFailures: scannerConfig.maxNetworkFailures,
    maxRequestsPerContext: scannerConfig.maxRequestsPerContext,
    maxEventTextChars: scannerConfig.maxEventTextChars,
    maxDomEvidenceItems: scannerConfig.maxDomEvidenceItems,
    maxResourceUrlChars: scannerConfig.maxResourceUrlChars,
    maxDialogs: scannerConfig.maxDialogs,
    maxPopups: scannerConfig.maxPopups,
    maxStoredScans: scannerConfig.maxStoredScans,
    maxStoredBytes: scannerConfig.maxStoredBytes,
    desktopViewport: DESKTOP_VIEWPORT,
    mobileViewport: MOBILE_VIEWPORT,
  };
}
