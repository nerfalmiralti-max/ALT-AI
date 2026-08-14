import type { IssueCategory, IssueScope, IssueSeverity } from "../types";

export type RuleMetadata = {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  scoreImpact: number;
  scope: IssueScope;
};

const rules = [
  ["http-status", "infrastructure", "CRITICAL", "Page request failed", "The page returned an error HTTP status.", "Restore a successful 2xx response and verify redirects.", 16, "PAGE"],
  ["missing-title", "seo", "CRITICAL", "Document title is missing", "Search engines and browser tabs cannot identify this page.", "Add a unique, descriptive title element.", 14, "PAGE"],
  ["missing-description", "seo", "NOTICE", "Meta description is missing", "Search result snippets may be less useful or predictable.", "Add a concise page-specific meta description.", 3, "PAGE"],
  ["missing-h1", "seo", "WARNING", "Primary heading is missing", "The content has no clear top-level heading.", "Add one descriptive h1 that matches the page purpose.", 7, "PAGE"],
  ["multiple-h1", "seo", "NOTICE", "Multiple primary headings", "More than one h1 can weaken the document hierarchy.", "Use one page-level h1 and structure subsections with h2/h3.", 2, "PAGE"],
  ["heading-order", "seo", "WARNING", "Heading levels are skipped", "The heading outline jumps over a level and is harder to navigate.", "Keep heading levels sequential, such as h1 followed by h2.", 5, "PAGE"],
  ["duplicate-id", "accessibility", "WARNING", "Duplicate element ID", "Multiple elements share an ID, which can break labels, fragments, and assistive-technology relationships.", "Give every element ID a unique value.", 6, "PAGE"],
  ["missing-lang", "accessibility", "WARNING", "Document language is missing", "Assistive technology cannot select the correct pronunciation rules.", "Set the html lang attribute to the page language.", 6, "PAGE"],
  ["missing-alt", "accessibility", "WARNING", "Image alternative text is missing", "Informative images are not described to screen-reader users.", "Add meaningful alt text, or alt=\"\" for decorative images.", 5, "PAGE"],
  ["unlabeled-control", "accessibility", "CRITICAL", "Form control has no accessible name", "A form field or control cannot be identified by assistive technology.", "Connect a visible label or provide an accurate accessible name.", 12, "PAGE"],
  ["axe-violation", "accessibility", "WARNING", "Automated accessibility violation", "axe detected a standards-based accessibility failure.", "Inspect the affected node and follow the linked axe guidance.", 6, "PAGE"],
  ["missing-viewport", "mobile", "CRITICAL", "Mobile viewport is not configured", "Mobile browsers may render the page at a desktop layout width.", "Add a responsive viewport meta tag.", 14, "PAGE"],
  ["horizontal-overflow", "mobile", "WARNING", "Page overflows horizontally", "Content extends beyond the available viewport.", "Remove fixed-width overflow and test responsive layout constraints.", 9, "PAGE"],
  ["broken-link", "links", "WARNING", "Internal link is broken", "A same-origin destination returned an error.", "Correct or remove the destination and preserve intentional redirects.", 7, "PAGE"],
  ["console-error", "browser", "WARNING", "Browser console error", "Client-side code emitted an error while the page loaded.", "Resolve the underlying runtime error and add regression coverage.", 6, "PAGE"],
  ["console-warning", "browser", "NOTICE", "Browser console warning", "Client-side code emitted a warning while the page loaded.", "Review the warning, remove obsolete behavior, and deduplicate repeated messages.", 2, "PAGE"],
  ["page-error", "browser", "CRITICAL", "Unhandled page exception", "The browser observed an uncaught JavaScript exception.", "Fix the exception and verify the affected user flow.", 12, "PAGE"],
  ["request-failure", "browser", "NOTICE", "Resource request failed", "A network resource did not complete successfully.", "Check the resource URL, response, CORS policy, and availability.", 3, "PAGE"],
  ["page-audit-partial", "browser", "WARNING", "Page audit is partial", "The page loaded, but one scanner inspection step did not complete.", "Review the recorded scanner evidence and retry after correcting the page or transient condition.", 4, "PAGE"],
  ["missing-csp", "infrastructure", "NOTICE", "Content Security Policy is missing", "The site has pages without a declared browser content policy.", "Introduce a tested Content-Security-Policy header.", 3, "SITE"],
  ["missing-hsts", "infrastructure", "NOTICE", "HSTS is missing", "The HTTPS site does not consistently instruct browsers to stay on HTTPS.", "Add Strict-Transport-Security after confirming complete HTTPS support.", 3, "SITE"],
  ["slow-response", "performance", "WARNING", "Initial response is slow", "Navigation response time exceeded the deterministic threshold.", "Profile server work, caching, and blocking upstream dependencies.", 8, "PAGE"],
  ["poor-lighthouse", "performance", "WARNING", "Lighthouse performance is below target", "The Lighthouse performance category scored below 75.", "Use the Lighthouse opportunities and diagnostics to reduce critical-path cost.", 10, "SITE"],
] as const satisfies readonly (readonly [string, IssueCategory, IssueSeverity, string, string, string, number, IssueScope])[];

export const RULE_REGISTRY = Object.fromEntries(
  rules.map(([id, category, severity, title, description, recommendation, scoreImpact, scope]) => [
    id,
    { id, category, severity, title, description, recommendation, scoreImpact, scope },
  ]),
) as Record<(typeof rules)[number][0], RuleMetadata>;

export type RuleId = keyof typeof RULE_REGISTRY;
