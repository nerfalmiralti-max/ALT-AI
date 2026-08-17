# Release Control Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing ALT QR application into a real-data Release Control Room without changing scanner or database architecture.

**Architecture:** Add pure presentation helpers over existing `ProjectRecord` and `ScanRecord` data, server-render the new index/project/comparison/settings routes, keep existing API mutations, and reshape the client report into a compact workspace. A shared product shell and token-driven CSS provide consistent navigation and responsive behavior.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, existing local-first store/API, Playwright, Node test runner, CSS custom properties.

**Status:** Implemented and validated on 2026-08-14. The checklists below preserve the executed build sequence as a maintenance reference.

## Global Constraints

- Do not change scanner, scoring, URL security, persistence schema, or Supabase migrations.
- Never synthesize product data.
- Preserve existing report capabilities and API contracts.
- Maintain visible evidence uncertainty and partial-audit labeling.
- Keep route reads parallel and client bundles narrow.

---

## Task 1: Real-data presentation model

**Files:**
- Create: `lib/qr/presentation.ts`
- Create: `tests/unit/presentation.test.ts`

- [ ] Write failing tests for ready, blocked, in-progress, failed, and unscanned project summaries.
- [ ] Implement deterministic release-state and reason helpers from persisted records.
- [ ] Add comparison target helpers without recomputing scanner results.
- [ ] Run the focused unit test.

## Task 2: Shared SaaS shell and design tokens

**Files:**
- Create: `components/qr/product-shell.tsx`
- Create: `components/qr/icons.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] Add semantic landmarks, desktop/mobile navigation, skip target, and contextual actions.
- [ ] Replace visual primitives with restrained dark semantic tokens and shared control/surface patterns.
- [ ] Preserve printable report behavior and reduced-motion support.

## Task 3: Dashboard and scan entry

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `components/qr/dashboard.tsx`
- Create: `app/scan/new/page.tsx`
- Create: `components/qr/new-scan.tsx`
- Modify: `components/qr/scan-form.tsx`

- [ ] Render portfolio states and reasons from each real project's latest scan.
- [ ] Add honest empty state and route actions.
- [ ] Move focused scanning to `/scan/new` while keeping the existing POST flow.

## Task 4: Project overview, comparison, and settings

**Files:**
- Create: `app/projects/[id]/page.tsx`
- Create: `components/qr/project-overview.tsx`
- Create: `app/scan/[id]/compare/page.tsx`
- Create: `components/qr/comparison-workspace.tsx`
- Create: `app/projects/[id]/settings/page.tsx`
- Create: `components/qr/project-settings.tsx`

- [ ] Load project scans in parallel and handle not-found/empty states.
- [ ] Show current verdict, failed gate reasons, measured change, priority queue, and real history.
- [ ] Render previous/baseline comparison deltas and evidence links from stored data.
- [ ] Bind the existing gate PATCH API to the four existing controls only.

## Task 5: Report engineering workspace and evidence

**Files:**
- Modify: `components/qr/scan-report.tsx`
- Modify: `components/qr/report-overview.tsx`
- Modify: `components/qr/report-sections.tsx`
- Modify: `components/qr/visual-inspector.tsx`
- Modify: `components/qr/scan-progress.tsx`

- [ ] Place release decision and action loop above the fold.
- [ ] Turn section navigation into a sticky workspace rail.
- [ ] Retain issue search/filter/lifecycle, page details, runtime, screenshots, export, baseline, print, and rescan.
- [ ] Label captured versus partial evidence from existing page audit state.
- [ ] Link comparison to the focused comparison route.

## Task 6: Landing integration and responsive polish

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/qr/home.tsx`
- Modify: `app/globals.css`
- Modify/Create: Playwright specs under `tests/e2e/`

- [ ] Integrate the shell and `/scan/new` CTA while retaining real recent scan context.
- [ ] Add route and keyboard/accessibility smoke coverage.
- [ ] Verify 320, 375, 390, 430, 768, 1024, 1280, and 1440px layouts.

## Task 7: Release validation

- [ ] Review the UI against the current Web Interface Guidelines.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run test:scanner`.
- [ ] Run `npm run test:e2e`.
- [ ] Run `npm run build`.
- [ ] Execute the repository-local ALT QR audit matrix and report any residual honestly.
