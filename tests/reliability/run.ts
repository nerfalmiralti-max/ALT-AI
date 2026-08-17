import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { BENCHMARK_VERSION, PROFILES, SCENARIOS } from "./catalog";
import { evaluateBenchmarkProfile, semanticScanSignature } from "./evaluate";
import { startReliabilityFixture } from "./fixture-server";
import { aggregateEvaluations, evaluateDeterminism } from "./report";
import type { BenchmarkProfile, BenchmarkRun } from "./types";

type Suite = "smoke" | "full";

function argument(name: string) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  return process.argv.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
}

function percent(value: number) {
  return Number((value * 100).toFixed(2));
}

function profileSummary(run: BenchmarkRun) {
  return {
    profileId: run.profileId,
    stage: run.scan.progress.stage,
    inspectedPages: run.scan.coverage.inspectedPages,
    score: run.scan.score?.overall,
    gate: run.scan.releaseGate?.status,
    verdict: run.scan.verdict,
    lighthouse: { available: run.scan.lighthouse.available, error: run.scan.lighthouse.error },
    evaluation: run.evaluation,
  };
}

async function main() {
  const suite = (argument("--suite") ?? "full") as Suite;
  if (suite !== "smoke" && suite !== "full") throw new Error(`Unknown reliability suite: ${suite}`);
  const reportOnly = process.argv.includes("--report-only");
  const requestedRuns = Number.parseInt(argument("--determinism-runs") ?? (suite === "full" ? "5" : "1"), 10);
  const determinismRuns = Math.max(1, Math.min(10, Number.isFinite(requestedRuns) ? requestedRuns : 1));
  const selectedProfiles = PROFILES.filter((profile) => suite === "full" || profile.smoke);
  const selectedIds = new Set(selectedProfiles.map((profile) => profile.id));
  const selectedScenarios = SCENARIOS.filter((scenario) => selectedIds.has(scenario.profileId));
  const testData = path.resolve(process.cwd(), ".alt-qr-data", "reliability", suite);
  const dataRoot = path.resolve(process.cwd(), ".alt-qr-data", "reliability");
  if (!testData.startsWith(`${dataRoot}${path.sep}`)) throw new Error("Refusing to clear reliability data outside the ALT QR test store.");
  await rm(testData, { recursive: true, force: true });
  process.env.ALT_QR_DATA_DIR = path.relative(process.cwd(), testData).replaceAll("\\", "/");
  process.env.ALT_QR_ALLOW_PRIVATE_TARGETS = "true";
  process.env.ALT_QR_MAX_PAGES = "10";

  // These imports intentionally occur after the isolated scanner environment
  // is configured because scannerConfig and store paths are immutable modules.
  const [{ createScan }, { normalizeUrl }, { runScanAndWait }] = await Promise.all([
    import("../../lib/qr/store"),
    import("../../lib/qr/url"),
    import("../../lib/qr/worker"),
  ]);

  async function scanProfile(profile: BenchmarkProfile, origin: string) {
    const target = `${origin}${profile.entryPath}`;
    const seed = await createScan(target, normalizeUrl(target));
    return runScanAndWait(seed.id);
  }

  const runs: BenchmarkRun[] = [];
  const determinism = [];
  for (const profile of selectedProfiles) {
    const fixture = await startReliabilityFixture(profile.id);
    try {
      const scan = await scanProfile(profile, fixture.origin);
      const scenarios = selectedScenarios.filter((scenario) => scenario.profileId === profile.id);
      const evaluation = evaluateBenchmarkProfile({ profileId: profile.id, origin: fixture.origin, scenarios, scan });
      const signature = semanticScanSignature(scan, fixture.origin);
      runs.push({ profileId: profile.id, scan, evaluation, semanticSignature: signature });
      const signatures: unknown[] = [signature];
      const repeat = suite === "full" && (profile.id === "clean" || profile.id === "navigation") ? determinismRuns : 1;
      for (let index = 1; index < repeat; index += 1) {
        const repeated = await scanProfile(profile, fixture.origin);
        signatures.push(semanticScanSignature(repeated, fixture.origin));
      }
      if (repeat > 1) determinism.push(evaluateDeterminism(profile.id, signatures));
      console.log(`[reliability] ${profile.id}: ${evaluation.passed ? "PASS" : "FAIL"} TP=${evaluation.truePositives} FP=${evaluation.falsePositives} FN=${evaluation.falseNegatives} gate=${scan.releaseGate?.status ?? "n/a"} verdict=${scan.verdict ?? scan.progress.stage}`);
    } finally {
      await fixture.close();
    }
  }

  const aggregate = aggregateEvaluations(runs.map((run) => run.evaluation));
  const determinismRunsTotal = determinism.reduce((sum, entry) => sum + entry.runs, 0);
  const stableRuns = determinism.reduce((sum, entry) => sum + entry.stableRuns, 0);
  const report = {
    benchmarkVersion: BENCHMARK_VERSION,
    scannerVersion: runs[0]?.scan.scannerVersion,
    rulesVersion: runs[0]?.scan.rulesVersion,
    suite,
    generatedAt: new Date().toISOString(),
    dataset: {
      totalScenarios: selectedScenarios.length,
      cleanScenarios: selectedScenarios.filter((entry) => entry.category === "clean" && entry.expectedFindings.length === 0).length,
      faultyScenarios: selectedScenarios.filter((entry) => entry.expectedFindings.length > 0).length,
      invariantScenarios: selectedScenarios.filter((entry) => entry.category !== "clean" && entry.expectedFindings.length === 0).length,
      deterministicScenarios: selectedScenarios.filter((entry) => entry.classification === "deterministic").length,
      environmentalScenarios: selectedScenarios.filter((entry) => entry.classification === "environmental").length,
      profiles: selectedProfiles.map((profile) => profile.id),
      categories: [...new Set(selectedScenarios.map((entry) => entry.category))].sort(),
    },
    accuracy: {
      truePositives: aggregate.truePositives,
      falsePositives: aggregate.falsePositives,
      falseNegatives: aggregate.falseNegatives,
      precision: aggregate.precision,
      precisionPercent: percent(aggregate.precision),
      recall: aggregate.recall,
      recallPercent: percent(aggregate.recall),
      severityAccuracy: aggregate.severityAccuracy,
      severityAccuracyPercent: percent(aggregate.severityAccuracy),
      severityConfusion: aggregate.severityConfusion,
      verdictAccuracy: aggregate.verdictAccuracy,
      verdictAccuracyPercent: percent(aggregate.verdictAccuracy),
      gateAccuracy: aggregate.gateAccuracy,
      gateAccuracyPercent: percent(aggregate.gateAccuracy),
      passedProfiles: aggregate.passedProfiles,
      totalProfiles: aggregate.totalProfiles,
    },
    evidence: {
      accuracy: aggregate.evidenceAccuracy,
      accuracyPercent: percent(aggregate.evidenceAccuracy),
      failures: runs.flatMap((run) => run.evaluation.evidenceFailures.map((failure) => ({ profileId: run.profileId, ...failure }))),
    },
    determinism: {
      profiles: determinism,
      runs: determinismRunsTotal,
      stableRuns,
      rate: determinismRunsTotal ? stableRuns / determinismRunsTotal : 1,
      ratePercent: percent(determinismRunsTotal ? stableRuns / determinismRunsTotal : 1),
    },
    profiles: runs.map(profileSummary),
  };
  const defaultOutput = path.join(dataRoot, "reports", `${suite}-latest.json`);
  const output = path.resolve(process.cwd(), argument("--output") ?? defaultOutput);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[reliability] precision=${report.accuracy.precisionPercent}% recall=${report.accuracy.recallPercent}% severity=${report.accuracy.severityAccuracyPercent}% verdict=${report.accuracy.verdictAccuracyPercent}% evidence=${report.evidence.accuracyPercent}% determinism=${report.determinism.ratePercent}%`);
  console.log(`[reliability] report=${output}`);

  const passed = aggregate.passedProfiles === aggregate.totalProfiles && report.determinism.rate === 1;
  if (!passed && !reportOnly) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
