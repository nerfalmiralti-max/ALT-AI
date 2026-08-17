# ALT QR final product completion plan

**Goal:** Converge the existing ALT Quality Radar implementation to an evidence-backed, locally runnable release candidate without changing its deterministic product architecture or pretending deployment capabilities are proven.

**Architecture boundary:** Keep the Next.js application, in-process bounded scanner worker, Playwright/Lighthouse/axe evidence pipeline, deterministic rules/scoring/comparison/gate engine, local durable store, and optional Supabase mirror. Do not introduce AI, a scanner rewrite, or a schema change unless a reproduced correctness defect requires an additive migration.

## 1. Freeze and measure the current state

- Preserve the dirty working tree on a scoped branch and recoverable stash.
- Inventory routes, APIs, storage, scanner boundaries, tests, scripts, environment names, and deployment artifacts without reading secret values.
- Run the complete baseline validation and reliability suites; retain exact outputs and classify environmental failures honestly.

## 2. Reproduce trust defects before editing

- Exercise deterministic fixture, reliability, timeout, cancellation, comparison, persistence, and security cases.
- Dogfood ALT QR against its own locally running production build.
- Inspect real dashboard, new-scan, project, report, comparison, and settings flows across desktop and mobile.
- Record only source-backed or runtime-reproduced findings, with severity and affected invariant.

## 3. Correct the smallest meaningful set

- Add a failing regression test for every accepted scanner, data, security, or lifecycle defect.
- Fix root causes without weakening SSRF boundaries, evidence provenance, deterministic scoring, or existing routes.
- Keep UI work focused on release verdict, blockers, evidence, comparison, recovery, accessibility, and responsive clarity.
- Preserve optional-local Supabase semantics and do not claim a live remote path without credentials and proof.

## 4. Verify the product as a system

- Re-run reliability, scanner, unit, type, lint, E2E, accessibility, responsive, production-build, and dependency checks.
- Repeat dogfood and compare before/after evidence.
- Run one security-focused independent audit and two independent completion audits; validate every candidate finding against the current tree before acting.
- Produce reproducible artifacts and update concise architecture/reliability/operations documentation.

## 5. Prove the final runtime and hand off honestly

- Start the built application locally in production mode and verify its health and primary flows at the reported URL.
- Leave cloud compute stopped unless the user explicitly requests a new deployment.
- Report exact checks, measurements, trust level, known limits, Git state, and only genuinely external manual actions. Do not commit, push, or merge.
