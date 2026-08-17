# Beat Your Stack Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Challenge workflow that compares production with a candidate through ALT QR's existing scanner, independently verifies candidate-only regressions, and presents an evidence-backed competitive verdict.

**Architecture:** Challenge is an additive domain record in the canonical `.alt-qr-data` store. A small challenge worker orchestrates sequential production, candidate, and conditional verification scans through `createScan()` and `startScan()`; comparison logic uses normalized route/evidence identity because production and preview normally have different origins. Client APIs return challenge-owned summaries and bounded evidence, never raw scan/session internals.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, existing Node/Playwright scanner worker, local atomic JSON/PNG persistence, node:test/tsx, Playwright E2E.

## Global Constraints

- Keep ALT QR deterministic and never add AI/LLM runtime behavior.
- Reuse the real scanner; do not create a challenge-only scanner or a second persistence system.
- Default the existing-QA verdict to `UNKNOWN`; never infer `PASSED`.
- Confirm a qualifying regression only when it is candidate-only, supported, evidence-backed, baseline-covered, and reproduced by a fresh candidate scan.
- Treat weak, partial, environmental, visual-only, or unreproduced differences as `UNVERIFIED`.
- Preserve every challenge run and its scan/evidence references; reruns append history.
- Keep public multi-user sharing intentionally unsupported until owner authorization exists.
- Preserve the graphite/off-white Release Control Room identity; no generic card dashboard, gradients, glow, fake metrics, or celebratory effects.
- Do not commit, push, merge, or modify Supabase schema for this local canonical feature.

---

### Task 1: Challenge truth model

**Files:**
- Create: `lib/qr/challenge.ts`
- Modify: `lib/qr/types.ts`
- Test: `tests/unit/challenge.test.ts`

**Interfaces:**
- Produces `buildChallengeComparison(baseline, candidate, verification?)`, `deriveChallengeVerdict(input)`, `challengeIssueIdentity(issue)`, and persisted Challenge types.

- [ ] Write red verdict tests for `ALT_QR_WON`, `RELEASE_HAS_REGRESSIONS`, `NO_QUALIFYING_MISS`, and `INSUFFICIENT_EVIDENCE`.
- [ ] Write red comparison tests for existing, fixed, confirmed candidate-only, unverified candidate-only, missing baseline-route coverage, and environmental/visual exclusions.
- [ ] Implement route/evidence identity, categorical confidence, evidence sufficiency, reproduction accounting, and verdict derivation.
- [ ] Run `npm test -- --test-name-pattern challenge` and retain the red/green evidence.

### Task 2: Canonical Challenge persistence

**Files:**
- Modify: `lib/qr/store.ts`
- Test: `tests/unit/challenge.test.ts`

**Interfaces:**
- Produces `createChallenge`, `getChallenge`, `saveChallenge`, `listChallenges`, and `appendChallengeRun` using the existing atomic local writer and `.alt-qr-data` root.

- [ ] Write red persistence tests using a process-isolated temporary ALT QR data directory.
- [ ] Persist a lightweight challenge index plus immutable run records and scan references.
- [ ] Prove rerun append behavior, historical evidence identity, and bounded recent-history reads.

### Task 3: Real Challenge orchestration

**Files:**
- Create: `lib/qr/challenge-worker.ts`
- Create: `lib/qr/challenge-presentation.ts`
- Modify: `lib/qr/worker.ts` only if a narrow public helper is required
- Test: `tests/scanner/run-challenge.ts`

**Interfaces:**
- Produces `startChallenge`, `cancelChallenge`, `recoverInterruptedChallenge`, and a client-safe payload builder.
- Consumes the existing scan slot, `createScan`, `startScan`, `cancelScan`, and Task 1 comparison functions.

- [ ] Write a red real-scanner test with separate production/candidate fixture origins.
- [ ] Orchestrate factual stages: preparing baseline, scanning production, scanning candidate, comparing, verifying, building evidence, finalizing.
- [ ] Run a fresh candidate verification scan only for supported candidate-only suspects.
- [ ] Persist failure/interruption/cancellation as insufficient evidence, never PASS.
- [ ] Prove no raw headers, cookies, payloads, local paths, or browser call logs enter the Challenge client payload.

### Task 4: Challenge APIs

**Files:**
- Create: `app/api/challenges/route.ts`
- Create: `app/api/challenges/[id]/route.ts`
- Create: `app/api/challenges/[id]/runs/route.ts`

**Interfaces:**
- `POST /api/challenges` validates both targets and returns `202 { challengeId }`.
- `GET /api/challenges/[id]` returns a safe polling payload.
- `DELETE /api/challenges/[id]` cancels an active run.
- `POST /api/challenges/[id]/runs` appends and starts a fresh run.

- [ ] Add Zod input bounds, passive URL validation, rate/capacity responses, and JSON-only errors.
- [ ] Keep optional PR/stack fields bounded and render-safe.
- [ ] Add API assertions to the scanner/E2E flow.

### Task 5: Evidence-first Challenge interface

**Files:**
- Create: `app/challenge/page.tsx`
- Create: `app/challenge/[id]/page.tsx`
- Create: `app/challenge/[id]/report/page.tsx`
- Create: `components/qr/challenge-form.tsx`
- Create: `components/qr/challenge-workspace.tsx`
- Create: `components/qr/challenge-report.tsx`
- Modify: `components/qr/product-shell.tsx`
- Modify: `components/qr/dashboard.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- `/challenge` creates a challenge with QA verdict defaulting to Unknown.
- `/challenge/[id]` polls factual work and puts `YOUR QA` versus `ALT QR` in the first viewport.
- `/challenge/[id]/report` is a clean authenticated/local print view, not a public signed-link system.

- [ ] Build the one-action entry form and three-step contract using the exact product promise without fake proof.
- [ ] Build real progress with nested scan stage/detail when available and a working cancel control.
- [ ] Build decisive outcomes, production/candidate/delta evidence, reproduction counts, fixed/existing/unverified sections, rerun state, and history.
- [ ] Add Run Challenge Again, Print report, and real dashboard history controls.
- [ ] Audit every new string for concise senior-engineer tone.
- [ ] Verify independent mobile composition at 320/375/390/430 and desktop/tablet through 1440.

### Task 6: Golden, losing, rerun, and failure paths

**Files:**
- Modify: `tests/fixtures/server.ts`
- Modify: `tests/fixtures/standalone.ts`
- Modify: `tests/e2e/scan.spec.ts`
- Modify: `tests/e2e/run.ts` only if the second fixture lifecycle requires it

**Interfaces:**
- Fixture A is production; fixture B is candidate and contains a reproducible candidate-only runtime regression on a production-covered route.

- [ ] Prove `QA PASS → ALT QR HOLD` with a 2/2 reproduced regression and understandable evidence.
- [ ] Switch the candidate to the fixed variant, rerun, prove no qualifying miss, and preserve the first run/evidence.
- [ ] Prove QA Unknown with a regression does not claim ALT QR won.
- [ ] Prove inaccessible/failed evidence produces `INSUFFICIENT_EVIDENCE`.
- [ ] Run axe, keyboard, overflow, evidence disclosure, report print, and responsive checks.

### Task 7: Documentation and final proof

**Files:**
- Modify: `README.md`
- Create: `docs/reliability/beat-your-stack-phase-1.md`

- [ ] Document Challenge methodology, strict qualifying standard, three-scan maximum, persistence, sharing/auth boundary, supported claims, and limitations.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:scanner`, `npm run test:reliability:smoke`, `npm run test:reliability`, `npm run test:e2e`, and `npm run build`.
- [ ] Start the production build, inspect entry/progress/win/no-miss/insufficient/rerun/report/mobile states in a real browser, and inspect console/server output.
- [ ] Run the repo-local independent audit matrix, fix reproducible findings, and re-run the affected plus full gates.

## Self-review

- The plan covers the exact acceptance win, honest no-win, insufficient-evidence, verification, rerun, immutable history, safe report, dashboard history, copy, mobile, and validation requirements.
- No database migration is needed because local JSON/PNG is canonical and Challenge can use the existing atomic store. Supabase mirroring stays unchanged and is explicitly not claimed for Challenge Phase 1.
- Phase 2 integrations, billing, autonomous fixing, public signed sharing, teams, replay, and generated tests remain out of scope.
