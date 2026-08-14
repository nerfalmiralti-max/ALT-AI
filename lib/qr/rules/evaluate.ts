import { createHash, randomUUID } from "node:crypto";

import type { IssueEvidence, IssueScope, LighthouseMetrics, NetworkFailure, PageAudit, ScanIssue } from "../types";
import { RULE_REGISTRY, type RuleId } from "./registry";

function normalizedUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return raw.trim();
  }
}

function normalizedMessage(value: string) {
  return value
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "{uuid}")
    .replace(/\b\d+(?:\.\d+)?\b/g, "{n}")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function stableIssueFingerprint(input: {
  ruleId: string;
  scope: IssueScope;
  url: string;
  selector?: string;
  requestUrl?: string;
  consoleMessage?: string;
  axeNode?: string;
}) {
  const page = input.scope === "SITE" ? "site" : normalizedUrl(input.url);
  const discriminator = input.selector
    || (input.requestUrl ? normalizedUrl(input.requestUrl) : "")
    || (input.consoleMessage ? normalizedMessage(input.consoleMessage) : "")
    || input.axeNode
    || "";
  return createHash("sha256").update(`${input.ruleId}|${input.scope}|${page}|${discriminator}`).digest("hex").slice(0, 24);
}

function issue(ruleId: RuleId, page: PageAudit, overrides?: Omit<Partial<ScanIssue>, "evidence"> & { evidence?: Partial<IssueEvidence> }): ScanIssue {
  const rule = RULE_REGISTRY[ruleId];
  const evidence: IssueEvidence = { url: page.url, ...overrides?.evidence };
  const scope = overrides?.scope ?? rule.scope;
  return {
    id: randomUUID(),
    ruleId,
    category: overrides?.category ?? rule.category,
    severity: overrides?.severity ?? rule.severity,
    title: overrides?.title ?? rule.title,
    description: overrides?.description ?? rule.description,
    recommendation: overrides?.recommendation ?? rule.recommendation,
    scoreImpact: overrides?.scoreImpact ?? rule.scoreImpact,
    evidence,
    scope,
    lifecycle: overrides?.lifecycle ?? "ACTIVE",
    occurrences: overrides?.occurrences ?? 1,
    affectedPageIds: overrides?.affectedPageIds ?? [page.id],
    fingerprint: overrides?.fingerprint ?? stableIssueFingerprint({
      ruleId,
      scope,
      url: page.url,
      selector: evidence.selector,
      requestUrl: evidence.requestUrl,
      consoleMessage: evidence.consoleMessage,
      axeNode: evidence.axeNode,
    }),
  };
}

export function evaluatePages(pages: PageAudit[], lighthouse: LighthouseMetrics) {
  const issues: ScanIssue[] = [];
  const explicitlyCoveredAxeRules = new Set([
    "aria-input-field-name", "button-name", "document-title", "duplicate-id", "duplicate-id-active", "duplicate-id-aria",
    "heading-order", "html-has-lang", "image-alt", "input-button-name", "label", "page-has-heading-one", "select-name",
  ]);
  for (const [pageIndex, page] of pages.entries()) {
    const { facts } = page;
    const documentFailed = page.status >= 400 || page.status === 0 || ["NAVIGATION_FAILED", "PRIMARY_INSPECTION_FAILED", "PAGE_INSPECTION_FAILED", "REDIRECT_LIMIT", "UNSAFE_REDIRECT"].includes(page.failure?.code ?? "");
    if (documentFailed) {
      issues.push(issue("http-status", page, { evidence: { httpStatus: page.status, value: page.status, excerpt: page.failure?.message } }));
      if (pageIndex > 0) issues.push(issue("broken-link", page, { evidence: { httpStatus: page.status, value: page.status, excerpt: page.failure?.message } }));
      // A failed response has no trustworthy document to evaluate. Reporting
      // missing metadata, axe, CSP, and runtime findings from Chromium's error
      // page would multiply one transport failure into unrelated penalties.
      continue;
    }
    if (page.failure?.code === "CROSS_ORIGIN_REDIRECT") {
      continue;
    }
    if (page.failure) {
      issues.push(issue("page-audit-partial", page, { evidence: { excerpt: page.failure.message, value: page.failure.code } }));
      if (page.failure.code !== "MOBILE_AUDIT_PARTIAL") continue;
    }
    if (!facts.title.trim()) issues.push(issue("missing-title", page));
    if (!facts.metaDescription.trim()) issues.push(issue("missing-description", page));
    const h1s = facts.headings.filter((heading) => heading.level === 1);
    if (h1s.length === 0) issues.push(issue("missing-h1", page));
    if (h1s.length > 1) issues.push(issue("multiple-h1", page, { evidence: { value: h1s.length } }));
    for (const skip of facts.headingSkips) {
      issues.push(issue("heading-order", page, { evidence: { selector: skip.selector, value: `${skip.from}→${skip.to}`, excerpt: skip.text } }));
    }
    for (const duplicate of facts.duplicateIds) {
      issues.push(issue("duplicate-id", page, { occurrences: duplicate.count, evidence: { selector: duplicate.selector, value: duplicate.id, excerpt: `${duplicate.count} elements use this ID` } }));
    }
    if (!facts.lang.trim()) issues.push(issue("missing-lang", page));
    for (const image of facts.images.filter((entry) => entry.alt === null)) {
      const selector = image.selector ?? `img[src=\"${image.src.replaceAll('"', '\\"')}\"]`;
      issues.push(issue("missing-alt", page, { evidence: { value: image.src, selector, boundingBox: image.boundingBox } }));
    }
    for (const control of facts.unlabeledControls) {
      issues.push(issue("unlabeled-control", page, { evidence: { selector: control.selector, value: control.type, boundingBox: control.boundingBox } }));
    }
    if (!facts.viewport.trim()) issues.push(issue("missing-viewport", page));
    if (facts.documentWidth > facts.viewportWidth + 2) {
      issues.push(issue("horizontal-overflow", page, { evidence: {
        value: facts.documentWidth - facts.viewportWidth,
        selector: facts.widestElement?.selector,
        boundingBox: facts.widestElement?.boundingBox,
        viewport: { width: facts.viewportWidth, height: 844 },
        dimensions: { documentWidth: facts.documentWidth, viewportWidth: facts.viewportWidth, overflow: facts.documentWidth - facts.viewportWidth },
      } }));
    }
    for (const violation of page.axeViolations) {
      if (explicitlyCoveredAxeRules.has(violation.id)) continue;
      for (const node of violation.nodes.slice(0, 3)) {
        const severity = violation.impact === "critical" ? "CRITICAL" : violation.impact === "minor" ? "NOTICE" : "WARNING";
        const selector = node.target.join(" ");
        issues.push(issue("axe-violation", page, {
          severity,
          title: violation.help,
          description: violation.description,
          recommendation: `Review ${violation.helpUrl}`,
          evidence: { selector, axeNode: node.html.slice(0, 300), excerpt: node.failureSummary ?? node.html.slice(0, 240) },
          fingerprint: stableIssueFingerprint({ ruleId: `axe-violation:${violation.id}`, scope: "PAGE", url: page.url, selector }),
        }));
      }
    }
    const consoleEvents = page.consoleEvents?.length
      ? page.consoleEvents
      : page.consoleErrors.map((message) => ({ level: "error" as const, message, count: 1 }));
    for (const event of consoleEvents) {
      issues.push(issue(event.level === "warning" ? "console-warning" : "console-error", page, { occurrences: event.count, evidence: { consoleMessage: event.message, excerpt: event.message.slice(0, 300), value: event.count } }));
    }
    for (const message of page.pageErrors) {
      issues.push(issue("page-error", page, { evidence: { consoleMessage: message, excerpt: message.slice(0, 300) } }));
    }
    const networkFailures: NetworkFailure[] = page.networkFailures?.length
      ? page.networkFailures
      : page.requestFailures.map((message) => ({ method: "GET", url: page.url, resourceType: "other" as const, reason: message, count: 1 }));
    for (const failure of networkFailures) {
      const duplicatesPageStatus = failure.resourceType === "document"
        && failure.url === page.url
        && typeof failure.status === "number"
        && failure.status >= 400;
      if (duplicatesPageStatus) continue;
      issues.push(issue("request-failure", page, {
        occurrences: failure.count,
        evidence: { requestUrl: failure.url, resourceType: failure.resourceType, excerpt: failure.reason.slice(0, 300), value: failure.count, httpStatus: failure.status },
      }));
    }
    if (!page.headers["content-security-policy"]) issues.push(issue("missing-csp", page));
    if (new URL(page.url).protocol === "https:" && !page.headers["strict-transport-security"]) issues.push(issue("missing-hsts", page));
    if (page.durationMs > 1_500) issues.push(issue("slow-response", page, { evidence: { value: page.durationMs } }));
  }
  const primary = pages[0];
  const performance = lighthouse.scores?.performance;
  if (primary && typeof performance === "number" && performance < 75) {
    issues.push(issue("poor-lighthouse", primary, { evidence: {
      value: performance,
      lighthouseMetric: { key: "performance", value: performance, unit: "score", rating: performance < 50 ? "POOR" : "NEEDS ATTENTION" },
    } }));
  }
  return issues;
}
