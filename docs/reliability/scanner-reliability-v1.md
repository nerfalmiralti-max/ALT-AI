# ALT QR Scanner Reliability v1

## Architecture

The production path is documented in [`scanner-pipeline.md`](./scanner-pipeline.md). In summary: the scan API bounds and normalizes input, the security/request layer validates and pins passive HTTP(S) requests, the worker owns lifecycle and cancellation, Chromium collects response/DOM/runtime/axe/mobile/screenshot facts, Lighthouse collects environmental performance readings, the rule engine creates stable evidence-backed findings, dedupe/scoring/gate/verdict functions derive release truth, local JSON/PNG storage remains canonical, and the report presents only persisted evidence.

Rule evaluation, fingerprinting, dedupe, scoring, gates, and verdicts are deterministic for normalized input. DNS/network availability, browser event timing, axe/browser versions, Lighthouse timings, and rendering/pixel output are separate sensitivity boundaries. Scanner Reliability v1 excludes only `poor-lighthouse` and duration-derived `slow-response` findings from deterministic precision/recall while still reporting environmental observations.

## Benchmark Suite

- Benchmark version: `1.0.0`
- Scanner/rules after version: `2.2.0`
- 47 focused scenarios: 6 clean controls, 30 known-fault scenarios, and 11 evidence/gate/identity/environmental invariants
- 46 deterministic scenarios and 1 explicitly environmental performance scenario
- 6 isolated profiles: clean, document, accessibility, runtime, navigation, security/deduplication
- 9 logical categories: clean, HTTP/navigation, release reliability, security configuration, accessibility, SEO/document, performance/runtime, finding identity/deduplication, and evidence
- Real path: `createScan()` -> `runScanAndWait()` -> Chromium/axe/Lighthouse/screenshots -> rules/dedupe/score/gate/verdict -> local persistence
- Determinism sample: five clean runs and five navigation runs on stable origins

Each scenario has machine-readable expected findings, forbidden findings, severity, evidence requirements, page facts and/or gate/verdict expectations, plus deterministic/environmental classification. Expected values use rule IDs, paths, selectors, resource types, statuses, counts, and semantic outcomes rather than full UI wording.

## Before

Authoritative scanner `2.1.0` report: [`scanner-reliability-v1-before.json`](./scanner-reliability-v1-before.json).

| Metric | Before |
| --- | ---: |
| True positives | 31 |
| False positives | 9 |
| False negatives | 0 |
| Precision | 77.5% |
| Recall | 100% |
| Severity accuracy | 100% (31/31 detected findings) |
| Verdict accuracy | 100% (6/6 profiles) |
| Gate accuracy | 100% (6/6 profiles) |
| Evidence validation | 87.1% (27/31) |
| Determinism | 100% (10/10 runs) |

Four of six profiles passed exactly. Runtime and security/deduplication failed because the same failed resource was represented as structured network evidence, a browser-generated console error, and in some cases an additional abort observation or page-scoped finding.

## Problems Found

### 1. Network-generated console messages duplicated structured failures

- Symptom: eight false-positive `console-error` findings appeared beside correct `request-failure` findings for image, script, stylesheet, font, fetch, shared-script, and repeated-fetch fixtures.
- Root cause: Chromium emits `Failed to load resource` console events for the same URL already captured by the structured response listener. The rule engine treated those browser messages as independent application errors.
- Affected fixtures: all five runtime resource fixtures plus shared/repeated resource fixtures.
- Fix: remove only generic browser network console events whose event URL matches an existing structured network failure. Explicit application `console.error()` messages remain findings. The same normalization is applied to raw current observations and retained defensively during evaluation of older stored records.

### 2. Completed HTTP failures also retained `net::ERR_ABORTED`

- Symptom: script, stylesheet, and font findings reported two occurrences for one request; evidence validation failed three times and Page Health could overcount raw failures.
- Root cause: Playwright emitted a completed HTTP 404 response followed by `requestfailed/net::ERR_ABORTED` for the same method, URL, and resource type.
- Affected fixtures: runtime script, stylesheet, font, and shared-script fixtures.
- Fix: when a response-backed failure exists, discard only the matching abort artifact. Genuine transport failures without a response remain intact.

### 3. Shared failed resources were page-scoped

- Symptom: the same missing script on `/shared-a` and `/shared-b` produced two scored findings; the matched finding showed one affected page instead of two.
- Root cause: `request-failure` used PAGE scope, so the page URL was part of its stable fingerprint even when the failed request URL was identical.
- Affected fixture: shared-resource identity/deduplication.
- Fix: make `request-failure` site-scoped and retain the failed request URL as the fingerprint discriminator. Dedupe now produces one finding with two occurrences and two affected page IDs; distinct resource URLs remain distinct findings.

### Benchmark defect corrected before authoritative measurement

The first smoke attempt missed the font fixture because the fixture's base `font` shorthand overrode its `@font-face`; Chromium therefore made no font request. The fixture CSS order was corrected and the authoritative before benchmark was rerun against unchanged scanner behavior. This was not counted as a scanner false negative.

## After

Authoritative scanner `2.2.0` report: [`scanner-reliability-v1-after.json`](./scanner-reliability-v1-after.json).

| Metric | After |
| --- | ---: |
| True positives | 31 |
| False positives | 0 |
| False negatives | 0 |
| Precision | 100% on this dataset |
| Recall | 100% on this dataset |
| Severity accuracy | 100% (31/31) |
| Verdict accuracy | 100% (6/6) |
| Gate accuracy | 100% (6/6) |
| Evidence validation | 100% (31/31) |
| Determinism | 100% (10/10 runs) |

Severity confusion contains only correct assignments: 9 Critical -> Critical, 11 Warning -> Warning, and 11 Notice -> Notice. These results apply only to supported, controlled Scanner Reliability v1 scenarios; they are not a claim of universal website, accessibility, performance, or security accuracy.

## Scanner Changes

- `lib/qr/network.ts`: pure normalization for response/abort and structured-network/console duplicates.
- `lib/qr/browser-audit.ts`: store normalized raw network and console observations.
- `lib/qr/rules/evaluate.ts`: use the same normalization for current and legacy page facts.
- `lib/qr/rules/registry.ts`: identify failed resources at SITE scope by failed request URL.
- `lib/qr/config.ts`: bump scanner/rules version from `2.1.0` to `2.2.0`.

No crawler rewrite, database migration, schema change, Supabase change, release-gate redesign, score-weight change, or UI change was made for Scanner Reliability v1.

## Test Infrastructure

- `tests/reliability/catalog.ts`: versioned 47-scenario ground-truth manifest.
- `tests/reliability/fixture-server.ts`: six isolated local controlled site profiles.
- `tests/reliability/evaluate.ts`: finding matching, forbidden-finding checks, severity/evidence/page/gate/verdict validation, and semantic signatures.
- `tests/reliability/report.ts`: exact aggregate precision/recall/confusion/evidence/verdict/determinism metrics.
- `tests/reliability/run.ts`: real-worker smoke/full runner with normalized JSON output and report-only measurement mode.
- `tests/unit/reliability.test.ts`: evaluator, catalog, fixture, matcher, aggregate, and determinism contracts.
- `tests/unit/core.test.ts`: scanner regressions for structured network identity, raw observation normalization, and score/gate invariants.
- `npm run test:reliability:smoke`: clean/document/runtime PR-friendly profile set.
- `npm run test:reliability`: all profiles plus five clean and five navigation repeat runs.

## Remaining Limitations

- The benchmark covers 47 focused scenarios and 31 expected findings, not every browser, framework, CDN, accessibility rule, SEO policy, or security condition.
- Lighthouse scores, load-duration thresholds, and pixel rendering remain machine/browser/environment-sensitive and are not part of deterministic precision/recall.
- axe results are deterministic for the pinned axe/Chromium versions; dependency upgrades can legitimately change findings and require catalog review.
- The local benchmark is HTTP. It validates that HSTS is not demanded on HTTP, but it does not provide a controlled local TLS/HSTS matrix.
- Authenticated applications, session setup, protected routes, consent flows, and user-specific states are unsupported by this anonymous passive scanner benchmark.
- ALT QR intentionally does not submit forms, activate destructive actions, perform offensive vulnerability exploitation, or prove complete security.
- Screenshots and visual diffs are primary-page evidence; per-page screenshot coverage is not complete.
- Application-layer DNS/address validation and IP-pinned requests reduce SSRF/rebinding risk, but they are not a substitute for deployment-level outbound network isolation.
- The worker remains in-process/local-first; multi-instance/serverless durability requires an external queue, worker, and shared object storage.
- Supabase mirroring was not live-tested in this reliability phase.
- Public exploration is not ground truth. `example.com` (1 page) and W3C WAI (3-page cap) completed with real Lighthouse data. `react.dev` was publicly reachable but ALT QR failed primary navigation; this remains an unresolved CDN/framework compatibility case and did not trigger a scanner change because no local deterministic reproduction exists.

## Verification

- Pre-change baseline: typecheck PASS; lint PASS; 33/33 unit PASS; scanner PASS; two-phase E2E PASS; production build PASS.
- Authoritative before benchmark: 47 scenarios; 31 TP / 9 FP / 0 FN; 10/10 semantic repeat runs.
- Targeted red/green tests: resource identity/console duplicate regression and raw observation normalization both failed before their implementation and passed after it.
- Final typecheck: PASS.
- Final lint: PASS with the existing Next.js `next lint` deprecation notice and zero warnings/errors.
- Final unit suite: 42/42 PASS.
- Final scanner suite: PASS; baseline 84/18 findings, current 88/13 findings, clean 100/PASS/READY TO SHIP, cancellation and timeout paths PASS.
- Final reliability smoke: 100% measured accuracy across selected profiles.
- Final full reliability: 47 scenarios, 31 TP / 0 FP / 0 FN, 10/10 repeat runs, all six profiles PASS.
- Final E2E: live scan/report flow PASS and restart-persistence flow PASS.
- Final production build: PASS; report route first-load JS 123 kB.
- Manual evidence: selectors (`#hero`, `#jump`, `#shared`), HTTP 404/500/transport/redirect-loop evidence, valid two-hop redirect, network URL/type/status/counts, cross-page affected IDs, sanitized `[local path]`, desktop PNG, and no `Call log`, `node_modules`, `chrome-error://`, or absolute user path leakage.
- Public exploratory: example.com PASS, W3C WAI PASS under a three-page cap, react.dev primary navigation FAILED cleanly.

## Git State

All Scanner Reliability v1 changes remain uncommitted. The pre-existing Release Control Room working tree is also uncommitted and is preserved in local safety stash `stash@{0}` while remaining applied in the workspace. Nothing was pushed or merged. Generated `.alt-qr-data`, Playwright output, build output, environment files, and keys remain ignored.

## Final Assessment

**Moderate confidence.** A developer can place meaningful trust in `READY TO SHIP` for the deterministic checks and anonymous page states represented by this suite: known supported defects were found, clean controls stayed clean, every expected finding had correct severity/evidence, all six profile verdicts were correct, and 10/10 repeated scans were semantically stable. Confidence is not High because the dataset is intentionally bounded, environmental measurements are separated, authenticated/user-state coverage is absent, public sites have unknown ground truth, visual coverage is primary-page-only, and one reachable modern public site still failed primary navigation.
