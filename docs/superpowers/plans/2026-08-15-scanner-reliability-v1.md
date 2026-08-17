# Scanner Reliability v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure and improve the existing ALT QR scanner with a deterministic, versioned, real-pipeline benchmark containing 30–50 focused scenarios.

**Architecture:** Five isolated local fixture profiles exercise clean, document/accessibility, runtime/network, navigation, and security/deduplication behavior through `createScan()` and `runScanAndWait()`. A typed manifest defines independent ground truth, an evaluator calculates accuracy/evidence/verdict metrics, and semantic signatures measure repeatability without hiding meaningful differences.

**Tech Stack:** Node 22, TypeScript, `node:test`, local HTTP servers, existing Playwright/axe/Lighthouse worker, canonical local ALT QR persistence.

## Global Constraints

- Preserve the Release Control Room work and do not redesign UI.
- Do not change scanner behavior before recording the current benchmark result.
- Every scanner fix requires a benchmark or regression test that fails for the intended reason first.
- Do not special-case fixture URLs or weaken security, rules, or expectations to improve metrics.
- Keep Lighthouse/timing/rendering results separate from deterministic accuracy.
- Do not change Supabase schema/backend, commit, push, or merge.

---

### Task 1: Reliability contracts and evaluator

**Files:**
- Create: `tests/reliability/types.ts`
- Create: `tests/reliability/catalog.ts`
- Create: `tests/reliability/evaluate.ts`
- Create: `tests/unit/reliability.test.ts`

**Interfaces:**
- Produces: `BENCHMARK_VERSION`, `PROFILES`, `SCENARIOS`, `evaluateBenchmarkProfile()`, `semanticScanSignature()`, and aggregate reliability metric types.

- [ ] Write unit tests that fail because the reliability modules do not exist.
- [ ] Prove matching counts TP/FP/FN independently from severity and evidence accuracy.
- [ ] Prove semantic signatures ignore IDs/timestamps/durations but retain meaningful evidence, gate, and verdict changes.
- [ ] Prove the catalog contains 30–50 unique, classified scenarios and every scenario has explicit expected/forbidden arrays.
- [ ] Implement the minimal typed contracts, matcher, evidence validation, metrics, and semantic signature.
- [ ] Run `npm test` and keep the existing unit suite green.

### Task 2: Deterministic fixture lab

**Files:**
- Create: `tests/reliability/fixture-server.ts`
- Extend tests in: `tests/unit/reliability.test.ts`

**Interfaces:**
- Produces: `startReliabilityFixture(profileId)` returning an isolated origin and close function.

- [ ] Add failing route-contract tests for clean, document, runtime, navigation, and security/dedupe profiles.
- [ ] Implement bounded local pages for the catalog only; use controlled status, redirects, DOM, headers, console, axe, and resource failures.
- [ ] Assert no external requests, destructive actions, or production systems are used.
- [ ] Run the focused unit tests.

### Task 3: Real-pipeline runner and reports

**Files:**
- Create: `tests/reliability/run.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run test:reliability:smoke` and `npm run test:reliability`; supports report-only measurement and normalized JSON output.

- [ ] Add a failing evaluator/CLI contract test for exit behavior and aggregate metrics.
- [ ] Start each profile on a separate local origin, set an isolated data directory before dynamic production imports, and run the real worker sequentially.
- [ ] Evaluate findings, severity, evidence, gate, verdict, page invariants, environmental observations, and determinism.
- [ ] Emit a human summary plus versioned-shape JSON under `.alt-qr-data/reliability/reports`.
- [ ] Add smoke/full package scripts and concise developer documentation.
- [ ] Run smoke in report-only mode and inspect raw stored evidence.

### Task 4: Record the before benchmark

**Files:**
- Create from measured output: `docs/reliability/scanner-reliability-v1-before.json`

- [ ] Run the full catalog against unchanged scanner `2.1.0` in report-only mode.
- [ ] Record exact TP, FP, FN, severity, verdict, evidence, and determinism results.
- [ ] Identify each mismatch from the raw scan JSON; do not infer root cause from percentages alone.

### Task 5: Minimal benchmark-proven scanner fixes

**Files:**
- Modify only the specific `lib/qr` files implicated by reproduced benchmark failures.
- Extend: `tests/unit/core.test.ts` and/or `tests/unit/reliability.test.ts`.

- [ ] For the highest-confidence failure, state one root-cause hypothesis and write a minimal failing regression test.
- [ ] Implement one correction, run the targeted test, the affected profile, and the full benchmark.
- [ ] Repeat only for remaining high-confidence critical/high false positives, missed blockers, wrong evidence, nondeterminism, duplicates, severity, or scoring defects.
- [ ] Do not change rule scope/severity unless ground truth and release-gate philosophy justify it.

### Task 6: Final measurement, evidence inspection, and audit

**Files:**
- Create from measured output: `docs/reliability/scanner-reliability-v1-after.json`
- Create: `docs/reliability/scanner-reliability-v1.md`

- [ ] Run five repeated scans for two representative deterministic profiles and compare semantic signatures.
- [ ] Manually inspect stored HTTP, DOM selector, network resource, console/page-error, header, and failed-navigation evidence; check for local paths or internal call logs.
- [ ] Run safe public exploratory scans only if network access is available and respectful; reproduce any suspected bug locally before changing code.
- [ ] Run typecheck, lint, unit, scanner, smoke/full reliability, E2E, production build, and inspect `git diff`/status.
- [ ] Apply the repo-local ALT QR auditor matrix to code and generated artifacts; report all residual environmental, authenticated-app, network, and browser limitations.
