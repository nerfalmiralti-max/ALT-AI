# ALT QR Adversarial QA Engine — Phase 2

## Architecture

Phase 2 extends the existing Beat Your Stack Challenge. It does not replace the bounded browser scanner, Phase 1 comparison, deterministic issue identities, local canonical records, or optional Supabase mirror. It adds a persisted `SwarmRun` inside each immutable Challenge run.

The execution order is factual and bounded:

1. scan production and candidate through the normal worker;
2. let six independent role adapters inspect isolated persisted evidence exactly once;
3. normalize equivalent observations while retaining every role and raw-finding ID;
4. independently reproduce qualifying candidate-only findings when required;
5. let the Evidence Judge classify observations and derive a preliminary verdict;
6. only after a preliminary `READY`, run a bounded Red Team comparison on an uncovered safe route;
7. derive and persist the final `READY`, `HOLD`, or `INCOMPLETE` verdict.

No stage calls a language model. Page text is inert evidence, never executable instructions.

## QA Roles

| Role | Primary evidence boundary |
| --- | --- |
| Explorer | coverage, navigation, document structure, crawl omissions |
| Breaker | failed resources, runtime breakage, candidate-only release failures |
| Network | response status, transport failure, request/resource evidence |
| State | baseline/candidate lifecycle and state-sensitive deltas |
| Responsive | mobile facts, viewport evidence, responsive audit failures |
| Runtime | console exceptions, page errors, browser audit integrity |

Each adapter receives an isolated immutable context, has its own timeout/status/failure record, and cannot mutate another role's output. One failed role does not erase completed evidence; it makes the overall proof incomplete when the missing role matters.

## Evidence Judge

The Judge uses Phase 1 route mapping, stable issue identity, production evidence, candidate evidence, and fresh reproduction evidence. It classifies observations as `CONFIRMED`, `REJECTED`, `DUPLICATE`, `BASELINE_ISSUE`, `UNVERIFIED`, or `ENVIRONMENTAL`. Equivalent reports retain provenance from all observing roles. Contradictory primary and Red Team evidence is downgraded to unverified instead of being forced into a release claim.

Only confirmed candidate-only warning/critical findings with complete evidence can block release. Baseline issues, duplicates, rejected observations, and environment-only noise never become candidate regressions.

## Red Team and verdicts

The primary verdict is deliberately preliminary:

- `PRELIMINARY_HOLD`: confirmed release blocker; skip Red Team to conserve browser work.
- `PRELIMINARY_INCOMPLETE`: required evidence is incomplete; never report ready.
- `PRELIMINARY_READY`: run Red Team before a final claim.

Red Team targets a bounded, same-origin, non-destructive route not covered by the primary one-page Challenge scan. It performs fresh production/candidate scans and an independent candidate reproduction. A confirmed blocker persists `readyRevoked: true` and changes the final verdict to `HOLD`. A completed clear pass produces `READY` with `adversariallyVerified: true`. Timeout, cancellation, restart interruption, or insufficient evidence produces `INCOMPLETE`.

## Persistence and safety

Challenge JSON remains canonical local storage. Role runs, raw observations, normalized findings, Judge decisions, Red Team scan IDs, stage events, final verdict, and READY revocation are stored with each immutable run. Public presentation is separately bounded and sanitized; credentials, authorization headers, cookies, raw Playwright call logs, query secrets, local paths, and internal error details are not exposed.

Red Team reuses the existing URL policy, DNS/network guards, passive HTTP methods, crawler limits, browser event limits, timeouts, and cancellation. It never submits forms, activates destructive routes, performs credentialed actions, or claims offensive security coverage.

## Validation scenarios

The deterministic Challenge fixture proves:

- primary clean evidence followed by a Red Team-only route regression revokes READY;
- rerunning the fixed candidate reaches adversarially verified READY without overwriting history;
- a primary request regression is independently observed by multiple roles and skips Red Team;
- production/candidate shared evidence is classified as baseline, not a regression;
- incomplete candidate evidence stays incomplete;
- role failure and timeout preserve other role results;
- equivalent observations merge with provenance while unrelated findings stay separate;
- prompt-like page text has no control effect;
- unsafe, cross-origin, logout, and destructive routes are excluded from Red Team targets.

Run the complete repository gate from `README.md` before release.
