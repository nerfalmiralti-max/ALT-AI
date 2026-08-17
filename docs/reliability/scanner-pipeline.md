# ALT QR scanner pipeline

This map describes the production execution path in scanner/rules version `2.2.0`; it is not a test-only architecture. The pre-fix reliability baseline in `scanner-reliability-v1-before.json` records version `2.1.0`.

## Execution path

1. `app/api/scans/route.ts` bounds JSON input, normalizes bare domains, applies rate/capacity admission, validates the target, and persists a queued scan.
2. `lib/qr/security.ts`, `safe-request.ts`, `url.ts`, and `robots.ts` enforce HTTP(S), credential rejection, DNS/address policy, pinned passive requests, redirect/request/byte budgets, WebSocket denial, robots policy, same-origin selection, and destructive/download avoidance.
3. `lib/qr/worker.ts` owns cancellation, factual stages, comparison references, browser execution, rule analysis, persistence, and terminal state.
4. `lib/qr/browser-audit.ts` launches Chromium, discovers and breadth-crawls bounded same-origin pages, captures response/DOM/runtime/network/axe observations, runs mobile inspection, screenshots the primary page, invokes Lighthouse, and compares prior/baseline PNGs.
5. `lib/qr/rules/evaluate.ts` converts captured `PageAudit` observations and Lighthouse readings into evidence-backed findings using metadata from `rules/registry.ts`.
6. `lib/qr/dedupe.ts` merges identical fingerprints; `scoring.ts` applies fixed category weights; `release.ts` evaluates the project gate and derives the release verdict; `analysis.ts` creates groups, page health, and the fix queue; `comparison.ts` computes previous/baseline movement.
7. `lib/qr/store.ts` atomically persists canonical local JSON/assets and normalizes older records; `persistence.ts` optionally mirrors a completed record to Supabase without replacing local truth.
8. `app/api/scans/[id]/route.ts` returns the stored scan/project/history/reference payload; `components/qr/scan-report.tsx` and its report sections present the stored verdict, gate reasons, findings, evidence, pages, runtime, screenshots, and history.

## Sensitivity boundaries

| Step | Classification | Reason |
| --- | --- | --- |
| Input parsing, URL normalization, crawl URL filtering | Deterministic | Pure bounded transforms for an identical input. |
| DNS resolution and production target validation | Network-sensitive | Resolver answers and rebinding can vary; local fixture policy is explicit. |
| Pinned HTTP fetch, redirects, robots, navigation | Network/timing-sensitive | Response availability, redirect behavior, and timeouts depend on transport. Local fixtures make the intended response deterministic. |
| DOM facts, headers, status, link discovery | Deterministic for a fixed fixture/browser version | The fixture controls markup and response facts; browser-version changes remain a compatibility boundary. |
| Console, page exceptions, request failures | Browser/timing-sensitive | Event order is normalized, but asynchronous page behavior can affect observation. Fixtures use bounded deterministic events. |
| axe results | Browser/library-sensitive | Semantics are deterministic for a pinned axe/browser pair; upgrades may legitimately change rule output. |
| Lighthouse scores and paint timings | Environment-sensitive | CPU scheduling and browser timing vary. They are reported separately from deterministic accuracy. |
| Screenshots and pixel comparison | Browser/rendering-sensitive | Fonts, rendering, and capture timing can vary; animation and viewport stabilization reduce but do not remove this boundary. |
| Rule identity, severity metadata, fingerprints, dedupe | Deterministic | Fixed registry and normalized evidence produce stable semantic findings. |
| Weighted score, release gate, verdict, comparison | Deterministic | Pure functions over normalized scan evidence and project configuration. |
| Local persistence and report projection | Deterministic with I/O failure modes | Stored values are stable; filesystem locking/corruption are operational boundaries. |

## Reliability benchmark boundary

Scanner Reliability v1 drives `createScan()` and `runScanAndWait()` against local HTTP fixture servers, so it exercises the real worker, Chromium, axe, Lighthouse, screenshots, rule engine, dedupe, score, gate, verdict, and local persistence. Deterministic accuracy excludes only declared environmental rules/readings (`poor-lighthouse`, duration-derived performance readings) while still reporting them. Semantic determinism removes generated IDs, timestamps, durations, and asset paths, but retains rule identity, severity, target path, selector/resource/status meaning, gate, and verdict.
