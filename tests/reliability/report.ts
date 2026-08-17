import type { BenchmarkEvaluation, BenchmarkProfileId } from "./types";

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 1;
}

export function aggregateEvaluations(evaluations: BenchmarkEvaluation[]) {
  const truePositives = evaluations.reduce((sum, entry) => sum + entry.truePositives, 0);
  const falsePositives = evaluations.reduce((sum, entry) => sum + entry.falsePositives, 0);
  const falseNegatives = evaluations.reduce((sum, entry) => sum + entry.falseNegatives, 0);
  const severityCorrect = evaluations.reduce((sum, entry) => sum + entry.severity.correct, 0);
  const severityEvaluated = evaluations.reduce((sum, entry) => sum + entry.severity.evaluated, 0);
  const evidenceCorrect = evaluations.reduce((sum, entry) => sum + entry.evidence.correct, 0);
  const evidenceEvaluated = evaluations.reduce((sum, entry) => sum + entry.evidence.evaluated, 0);
  const verdictCorrect = evaluations.reduce((sum, entry) => sum + entry.verdict.correct, 0);
  const verdictEvaluated = evaluations.reduce((sum, entry) => sum + entry.verdict.evaluated, 0);
  const gateCorrect = evaluations.reduce((sum, entry) => sum + entry.gate.correct, 0);
  const gateEvaluated = evaluations.reduce((sum, entry) => sum + entry.gate.evaluated, 0);
  const severityConfusion: Record<string, number> = {};
  for (const evaluation of evaluations) for (const [key, count] of Object.entries(evaluation.severityConfusion)) {
    severityConfusion[key] = (severityConfusion[key] ?? 0) + count;
  }
  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision: ratio(truePositives, truePositives + falsePositives),
    recall: ratio(truePositives, truePositives + falseNegatives),
    severityAccuracy: ratio(severityCorrect, severityEvaluated),
    severityConfusion,
    evidenceAccuracy: ratio(evidenceCorrect, evidenceEvaluated),
    verdictAccuracy: ratio(verdictCorrect, verdictEvaluated),
    gateAccuracy: ratio(gateCorrect, gateEvaluated),
    passedProfiles: evaluations.filter((entry) => entry.passed).length,
    totalProfiles: evaluations.length,
  };
}

export function evaluateDeterminism(profileId: BenchmarkProfileId, signatures: unknown[]) {
  if (!signatures.length) return { profileId, runs: 0, stableRuns: 0, rate: 1, mismatchedRuns: [] as number[] };
  const reference = JSON.stringify(signatures[0]);
  const mismatchedRuns: number[] = [];
  signatures.forEach((signature, index) => { if (JSON.stringify(signature) !== reference) mismatchedRuns.push(index + 1); });
  const stableRuns = signatures.length - mismatchedRuns.length;
  return { profileId, runs: signatures.length, stableRuns, rate: stableRuns / signatures.length, mismatchedRuns };
}
