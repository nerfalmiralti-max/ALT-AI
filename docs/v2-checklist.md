# ALT QR V2 implementation checklist

Verified against the working V1 source before V2 edits. This document is updated as features land; a status is not upgraded without code and test evidence.

| # | Capability | Initial status | V1 evidence / gap | V2 proof required |
|---|---|---|---|---|
| 1 | Baseline system | PARTIAL | `getPreviousCompletedScan` supplies an implicit previous screenshot; projects have no persisted baseline choice. | Persist baseline scan ID, set/clear API, previous vs baseline comparison selection, tests. |
| 2 | Issue delta engine | PARTIAL | SHA-256 fingerprints exist and are independent of issue IDs; no cross-scan classification. | NEW/FIXED/UNCHANGED/REGRESSION delta with stable normalization and tests. |
| 3 | What Changed mode | MISSING | No comparison model or dedicated UI. | Score, issue, performance, and visual movement view. |
| 4 | Release gate | MISSING | Only score status exists. | Independent PASS/FAIL with blocker, page/link, and minimum-score rules plus project config. |
| 5 | Ship verdict V2 | PARTIAL | `READY/ALMOST READY/NEEDS WORK/NOT READY` is score-only. | Blocker-aware READY TO SHIP / READY WITH WARNINGS / NEEDS ATTENTION / BLOCKED. |
| 6 | Evidence-first issues | PARTIAL | URL, selector, value, excerpt, axe node text exist. | Typed status/request/console/viewport/bounds/dimensions/resource/Lighthouse evidence and concise renderer. |
| 7 | Page health | MISSING | Raw `PageAudit` exists; no page score or page UI. | Per-page score, blocker/warning counts, runtime/network summaries, screenshots/comparison where captured. |
| 8 | Network health | PARTIAL | Failed requests are raw strings. | Structured resource type, URL, method, reason, dedupe and repetition count. |
| 9 | Console health | PARTIAL | Console errors and page errors are raw arrays; warnings are not captured. | Structured level/message/location, dedupe and repetition count. |
| 10 | Performance V2 | PARTIAL | Lighthouse FCP/LCP/CLS/TBT/Speed Index are persisted; UI exposes only LCP/CLS and no rating. | Documented GOOD/NEEDS ATTENTION/POOR thresholds and complete readings. |
| 11 | Visual regression V2 | PARTIAL | Fixed viewports, disabled screenshot animations, desktop previous-scan diff. | Stable DPR/font/settling, baseline selection, desktop/mobile comparisons, semantic thresholds and numeric percentages. |
| 12 | Screenshot comparison UX | PARTIAL | Desktop/mobile/baseline/diff tabs exist. | Baseline/current/diff clarity and accessible stable comparison control if warranted. |
| 13 | Scan cancellation | MISSING | No CANCELLED stage, abort signal, endpoint, or UI. | Real abort, pending-page stop, resource cleanup, persisted CANCELLED state and tests. |
| 14 | Partial failure resilience | PARTIAL | Navigation/DOM/axe errors may be recorded, but batch exceptions can fail the whole scan. | Per-page isolation, honest completed/failed page counts and test fixture. |
| 15 | Scan metadata | PARTIAL | `scannerVersion` exists. | `rulesVersion`, immutable config snapshot and timing diagnostics. |
| 16 | Duplicate issue grouping | PARTIAL | Same-fingerprint dedupe exists. | SITE/PAGE scope and grouped affected-page counts without hiding evidence. |
| 17 | Issue lifecycle | MISSING | No project-specific ignored fingerprints. | Persisted IGNORED state, inspectable UI and scoring/gate behavior. |
| 18 | Project activity ledger | PARTIAL | Home has a basic scan table. | Baseline marker, score/gate/verdict and new/fixed delta history. |
| 19 | Report summary | PARTIAL | Score/category plate only. | Verdict, gate, blockers, warnings, pages, new/fixed, score delta and visual delta immediately visible. |
| 20 | Client report | MISSING | No print-specific CSS. | Purpose-built print/PDF layout without new PDF dependency. |
| 21 | Product design revolution | PARTIAL | Distinctive V1 graphite report and registration motif exist. | Three browser-verified passes with V2 hierarchy and reduced card/noise pressure. |
| 22 | Responsive redesign | PARTIAL | 900/620 breakpoints and mobile composition exist. | Verify and tune 320/375/390/430/768/1024/1440 with no horizontal overflow. |
| 23 | Command / power UX | PARTIAL | Skip links and semantic controls exist; no shortcuts. | Evaluate Cmd/Ctrl+K utility; prefer visible quick navigation if command palette adds little value. |
| 24 | Three original deterministic features | MISSING | None beyond specified V1 features. | Implement three useful, evidence-backed pre-ship tools. |
| 25 | Security second pass | PARTIAL | Protocol, credentials, DNS private ranges, browser request guard, redirects and size/time limits exist. | Redirect/final URL, popup/dialog/flood bounds, resource limits, adversarial IPv4/IPv6 and production/local tests. |
| 26 | Scanner performance diagnostics | MISSING | Page duration only. | Total/browser/Lighthouse/rules/screenshot timings, measured bottleneck review. |
| 27 | Database review | PARTIAL | Additive indexed/RLS-denied V1 schema and optional batch mirror exist. | V2 additive migration, baseline/config/metadata/ignore/delta fields and lookup/index review. |
| 28 | V2 tests | MISSING | Seven V1 units, one fixture scan and one E2E exist. | Baseline, delta, fixed/new/regression, gate, visual threshold, cancellation, partial failure, fingerprint, grouping and metadata tests. |
| 29 | Two-scan mutation validation | MISSING | E2E rescans the unchanged fixture. | Scan A, mutate fixture, scan B, verify fixed/new/regression/score/gate/visual/baseline with real output. |
| 30 | Independent audit | MISSING | No separate V2 audit yet. | Run `alt-qr-auditor` independently, fix findings, then re-audit. |

## Preserved V1 contracts

- Real Playwright, Lighthouse, axe, bounded same-origin crawl, screenshots and pixel comparison.
- Deterministic registry/evidence/scoring; no AI providers or fabricated output.
- Canonical local persistence with optional server-only Supabase mirror.
- Production private-target rejection and explicit local fixture policy.
- Additive database history; no destructive legacy-table cleanup.

## Final verified status

The independent two-pass auditor rechecked code, persisted scan A/B records, scanner output, E2E behavior, and the production build. `PARTIAL` means the core feature exists but the named deployment proof or coverage boundary remains open.

| # | Final | Runtime/code proof |
|---|---|---|
| 1 | IMPLEMENTED | Persisted project baseline, set/clear API, previous/baseline selectors, scanner and E2E assertions. |
| 2 | IMPLEMENTED | Stable normalized fingerprints and NEW/FIXED/UNCHANGED/CHANGED/REGRESSION classification without database IDs. |
| 3 | IMPLEMENTED | Dedicated score/issue/performance/visual movement sheet with meaningful-only ledger. |
| 4 | IMPLEMENTED | Configurable deterministic PASS/FAIL gate independent of score. |
| 5 | IMPLEMENTED | Blocker-aware READY TO SHIP / READY WITH WARNINGS / NEEDS ATTENTION / BLOCKED verdict. |
| 6 | IMPLEMENTED | Typed URL/status/request/resource/console/axe/viewport/bounds/dimensions evidence plus page capture links where captured. |
| 7 | PARTIAL | Every page has health/issues/runtime; screenshots and visual comparison are intentionally primary-page-only. |
| 8 | IMPLEMENTED | Structured, typed, deduplicated transport failures and HTTP 4xx/5xx responses with repetition counts. |
| 9 | IMPLEMENTED | Bounded structured console warning/error capture and dedupe. |
| 10 | IMPLEMENTED | FCP/LCP/CLS/TBT/Speed Index with documented GOOD/NEEDS ATTENTION/POOR bands. |
| 11 | IMPLEMENTED | DPR 1, fixed viewports, reduced motion, font/RAF settling, desktop/mobile previous/baseline diffs and numeric semantic bands. |
| 12 | IMPLEMENTED | Accessible desktop/mobile current/compare/diff viewer; scrubber rejected because it added risk without evidence value. |
| 13 | IMPLEMENTED | AbortController cancellation reaches Playwright and Lighthouse, releases resources, and persists CANCELLED. |
| 14 | IMPLEMENTED | Per-page isolation, failed-page requested URL preservation, and honest coverage/partial state. |
| 15 | IMPLEMENTED | Scanner/rules versions, bounded immutable config snapshot, stage history, and timings persist. |
| 16 | IMPLEMENTED | SITE/PAGE grouping, occurrences, affected pages, and regression tests. |
| 17 | IMPLEMENTED | Project-specific IGNORED lifecycle remains inspectable and triggers deterministic reanalysis. |
| 18 | IMPLEMENTED | Release ledger shows baseline, decision, score and delta. |
| 19 | IMPLEMENTED | Verdict/gate/score/delta/blockers/warnings/pages/fixed/new/visual summary appears first. |
| 20 | IMPLEMENTED | Print/PDF-specific light layout, page breaks, expanded evidence, and hidden app controls. |
| 21 | IMPLEMENTED | Three live visual passes produced the V2 Quality Grid and fixed unstable anchor navigation. |
| 22 | IMPLEMENTED | E2E verifies no document overflow at 320/375/390/430/768/1024/1440. |
| 23 | IMPLEMENTED | Visible report index and keyboard flow selected; Cmd/Ctrl+K rejected as novelty. |
| 24 | IMPLEMENTED | Coverage Ledger, deterministic Fix Queue, and downloadable Release Receipt. |
| 25 | PARTIAL | Layered SSRF, redirect/final-request checks, explicit private policy and hard bounds are tested; DNS TOCTOU and chunked/blob byte enforcement require network isolation. |
| 26 | IMPLEMENTED | Total/page/browser/Lighthouse/rules/screenshot timings expose the measured Lighthouse/crawl cost; unsafe contention-based parallelization was rejected. |
| 27 | PARTIAL | Additive indexed/RLS migration and batched mirror reviewed; no connected live Supabase was available to apply/EXPLAIN it. |
| 28 | IMPLEMENTED | 14 units plus scanner and E2E cover the requested V2 contracts. |
| 29 | IMPLEMENTED | Real A→B mutation proves 7 fixed, 6 new, 1 regression, +3 score, 3.712% visual, gate FAIL/BLOCKED. |
| 30 | IMPLEMENTED | Independent auditor found/fixed failed-page identity, Windows atomic persistence, timeout/redirect/evidence/network/status/touch issues, then re-audited. |

No requested V2 capability is `MISSING`. Residual deployment boundaries are listed explicitly rather than hidden behind completion language.
