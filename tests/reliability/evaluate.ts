import type { ScanIssue, ScanRecord } from "../../lib/qr/types";
import type { BenchmarkEvaluation, BenchmarkProfileId, BenchmarkScenario, FindingExpectation, FindingMatcher, FindingSummary } from "./types";

const ENVIRONMENTAL_RULES = new Set(["poor-lighthouse", "slow-response"]);
const INTERNAL_EVIDENCE = /(?:[a-z]:\\(?:users|documents|windows|program files)\\|\/users\/|\/home\/|node_modules|call log:|playwright[^\s]*\.(?:js|ts))/i;

function pathOf(value?: string) {
  if (!value) return "";
  try { return new URL(value).pathname; } catch { return value; }
}

function matches(issue: ScanIssue, matcher: FindingMatcher) {
  if (matcher.ruleId !== undefined && issue.ruleId !== matcher.ruleId) return false;
  if (matcher.severity !== undefined && issue.severity !== matcher.severity) return false;
  if (matcher.category !== undefined && issue.category !== matcher.category) return false;
  if (matcher.pagePath !== undefined && pathOf(issue.evidence.url) !== matcher.pagePath) return false;
  if (matcher.requestPath !== undefined && pathOf(issue.evidence.requestUrl) !== matcher.requestPath) return false;
  if (matcher.selectorIncludes !== undefined) {
    const selector = String(issue.evidence.selector ?? "");
    if (matcher.selectorIncludes === "" ? selector !== "" : !selector.includes(matcher.selectorIncludes)) return false;
  }
  if (matcher.consoleIncludes !== undefined && !String(issue.evidence.consoleMessage ?? "").includes(matcher.consoleIncludes)) return false;
  return true;
}

function summary(issue: ScanIssue): FindingSummary {
  return {
    ruleId: issue.ruleId,
    severity: issue.severity,
    pagePath: pathOf(issue.evidence.url),
    requestPath: issue.evidence.requestUrl ? pathOf(issue.evidence.requestUrl) : undefined,
    selector: issue.evidence.selector,
    occurrences: issue.occurrences,
  };
}

function evidenceReasons(issue: ScanIssue, expectation: FindingExpectation) {
  const reasons: string[] = [];
  for (const field of expectation.evidence.required) {
    const value = issue.evidence[field];
    if (value === undefined || value === null || value === "") reasons.push(`missing ${field}`);
  }
  if (expectation.evidence.httpStatus !== undefined && issue.evidence.httpStatus !== expectation.evidence.httpStatus) reasons.push(`httpStatus ${String(issue.evidence.httpStatus)} != ${expectation.evidence.httpStatus}`);
  if (expectation.evidence.value !== undefined && issue.evidence.value !== expectation.evidence.value) reasons.push(`value ${String(issue.evidence.value)} != ${String(expectation.evidence.value)}`);
  if (expectation.expectedOccurrences !== undefined && issue.occurrences !== expectation.expectedOccurrences) reasons.push(`occurrences ${issue.occurrences} != ${expectation.expectedOccurrences}`);
  if (expectation.expectedAffectedPages !== undefined && issue.affectedPageIds.length !== expectation.expectedAffectedPages) reasons.push(`affected pages ${issue.affectedPageIds.length} != ${expectation.expectedAffectedPages}`);
  if (INTERNAL_EVIDENCE.test(JSON.stringify(issue.evidence))) reasons.push("internal machine or Playwright path leaked");
  return reasons;
}

export function evaluateBenchmarkProfile(input: { profileId: BenchmarkProfileId; origin: string; scenarios: BenchmarkScenario[]; scan: ScanRecord }): BenchmarkEvaluation {
  const deterministic = input.scenarios.filter((entry) => entry.classification === "deterministic");
  const expectations = deterministic.flatMap((entry) => entry.expectedFindings);
  const actual = input.scan.issues.filter((issue) => issue.lifecycle !== "IGNORED");
  const deterministicActual = actual.filter((issue) => !ENVIRONMENTAL_RULES.has(issue.ruleId));
  const environmentalFindings = actual.filter((issue) => ENVIRONMENTAL_RULES.has(issue.ruleId)).map(summary);
  const unmatchedActual = new Set(deterministicActual.map((_issue, index) => index));
  const missingFindings: FindingExpectation[] = [];
  const severityMismatches: BenchmarkEvaluation["severityMismatches"] = [];
  const evidenceFailures: BenchmarkEvaluation["evidenceFailures"] = [];
  let severityCorrect = 0;
  let evidenceCorrect = 0;
  const severityConfusion: Record<string, number> = {};

  for (const expected of expectations) {
    const index = [...unmatchedActual].find((candidate) => matches(deterministicActual[candidate], { ...expected, severity: undefined }));
    if (index === undefined) { missingFindings.push(expected); continue; }
    unmatchedActual.delete(index);
    const found = deterministicActual[index];
    const confusionKey = `${expected.severity}в†’${found.severity}`;
    severityConfusion[confusionKey] = (severityConfusion[confusionKey] ?? 0) + 1;
    if (found.severity === expected.severity) severityCorrect += 1;
    else severityMismatches.push({ expectationId: expected.id, ruleId: expected.ruleId, expected: expected.severity, actual: found.severity });
    const reasons = evidenceReasons(found, expected);
    if (reasons.length) evidenceFailures.push({ expectationId: expected.id, ruleId: expected.ruleId, reasons });
    else evidenceCorrect += 1;
  }

  const unexpectedFindings = [...unmatchedActual].map((index) => summary(deterministicActual[index]));
  const forbiddenViolations: BenchmarkEvaluation["forbiddenViolations"] = [];
  for (const scenario of deterministic) for (const blocked of scenario.forbiddenFindings) {
    for (const finding of deterministicActual.filter((issue) => matches(issue, blocked))) {
      forbiddenViolations.push({ scenarioId: scenario.id, forbiddenId: blocked.id, finding: summary(finding) });
    }
  }

  const pageFailures: BenchmarkEvaluation["pageFailures"] = [];
  for (const scenario of deterministic) {
    const expected = scenario.expectedPage;
    if (!expected) continue;
    const candidates = input.scan.pages.filter((page) => pathOf(page.url) === expected.path);
    const page = expected.redirects === undefined ? candidates[0] : candidates.find((entry) => entry.redirects === expected.redirects);
    if (!page) { pageFailures.push({ scenarioId: scenario.id, reason: `missing page ${expected.path}` }); continue; }
    if (expected.status !== undefined && page.status !== expected.status) pageFailures.push({ scenarioId: scenario.id, reason: `status ${page.status} != ${expected.status}` });
    if (expected.redirects !== undefined && page.redirects !== expected.redirects) pageFailures.push({ scenarioId: scenario.id, reason: `redirects ${page.redirects} != ${expected.redirects}` });
    if (expected.failureCode !== undefined && page.failure?.code !== expected.failureCode) pageFailures.push({ scenarioId: scenario.id, reason: `failure ${String(page.failure?.code)} != ${expected.failureCode}` });
    if (expected.noFindings && deterministicActual.some((issue) => pathOf(issue.evidence.url) === expected.path)) pageFailures.push({ scenarioId: scenario.id, reason: "clean page has deterministic findings" });
  }

  const expectedScan = deterministic.map((entry) => entry.expectedScan).find(Boolean);
  const verdictFailures: BenchmarkEvaluation["verdictFailures"] = [];
  const gateFailures: BenchmarkEvaluation["gateFailures"] = [];
  if (expectedScan?.verdict && input.scan.verdict !== expectedScan.verdict) verdictFailures.push({ expected: expectedScan.verdict, actual: input.scan.verdict });
  if (expectedScan?.gate && input.scan.releaseGate?.status !== expectedScan.gate) gateFailures.push({ expected: expectedScan.gate, actual: input.scan.releaseGate?.status });
  const truePositives = expectations.length - missingFindings.length;
  const result: BenchmarkEvaluation = {
    profileId: input.profileId,
    scenarioCount: input.scenarios.length,
    truePositives,
    falsePositives: unexpectedFindings.length,
    falseNegatives: missingFindings.length,
    severity: { correct: severityCorrect, evaluated: truePositives },
    severityConfusion,
    verdict: { correct: expectedScan?.verdict && !verdictFailures.length ? 1 : 0, evaluated: expectedScan?.verdict ? 1 : 0 },
    gate: { correct: expectedScan?.gate && !gateFailures.length ? 1 : 0, evaluated: expectedScan?.gate ? 1 : 0 },
    evidence: { correct: evidenceCorrect, evaluated: truePositives },
    missingFindings,
    unexpectedFindings,
    severityMismatches,
    evidenceFailures,
    forbiddenViolations,
    pageFailures,
    verdictFailures,
    gateFailures,
    environmentalFindings,
    passed: false,
  };
  result.passed = result.falsePositives === 0 && result.falseNegatives === 0 && !severityMismatches.length && !evidenceFailures.length && !forbiddenViolations.length && !pageFailures.length && !verdictFailures.length && !gateFailures.length;
  return result;
}

function meaningfulEvidence(issue: ScanIssue) {
  return {
    pagePath: pathOf(issue.evidence.url),
    requestPath: issue.evidence.requestUrl ? pathOf(issue.evidence.requestUrl) : undefined,
    selector: issue.evidence.selector,
    value: issue.evidence.value,
    excerpt: issue.evidence.excerpt,
    httpStatus: issue.evidence.httpStatus,
    consoleMessage: issue.evidence.consoleMessage,
    axeNode: issue.evidence.axeNode,
    resourceType: issue.evidence.resourceType,
  };
}

export function semanticScanSignature(scan: ScanRecord, _origin: string) {
  return {
    stage: scan.progress.stage,
    pages: scan.pages.map((page) => ({ path: pathOf(page.url), status: page.status, redirects: page.redirects, failure: page.failure?.code })).sort((a, b) => `${a.path}|${a.status}`.localeCompare(`${b.path}|${b.status}`)),
    findings: scan.issues.filter((issue) => issue.lifecycle !== "IGNORED" && !ENVIRONMENTAL_RULES.has(issue.ruleId)).map((issue) => ({
      ruleId: issue.ruleId, severity: issue.severity, scope: issue.scope, occurrences: issue.occurrences,
      affectedPages: issue.affectedPageIds.length, evidence: meaningfulEvidence(issue),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    gate: scan.releaseGate ? { status: scan.releaseGate.status, checks: scan.releaseGate.checks.map((check) => ({ id: check.id, passed: check.passed })).sort((a, b) => a.id.localeCompare(b.id)) } : undefined,
    verdict: scan.verdict,
  };
}
