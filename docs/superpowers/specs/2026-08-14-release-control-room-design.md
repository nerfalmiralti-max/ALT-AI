# ALT QR Release Control Room — Approved Design Specification

## Product outcome

ALT QR becomes a release-control workspace built around one decision: can this project ship now? Every surface uses persisted ALT QR project and scan data. Empty states explain what is missing and offer the next real action; they never fabricate metrics, activity, or integrations.

## Information architecture

- `/` — focused product introduction and first-scan entry, with real recent project context when it exists.
- `/dashboard` — portfolio release state: ready, attention, blocked, or scanning, plus the measured reason for each state.
- `/scan/new` — dedicated, distraction-free scanner entry using the existing scan API.
- `/projects/[id]` — current release state, changes, priority work, and chronological scan history for one real project.
- `/scan/[id]` — engineering report workspace with release decision, priority queue, issues, pages, runtime, visual evidence, comparison, and history.
- `/scan/[id]/compare` — focused real comparison against the stored previous scan and/or project baseline.
- `/projects/[id]/settings` — only the four release-gate controls already supported by ALT QR.

## Experience principles

1. Lead with verdict, gate status, blockers, and the next release action.
2. Distinguish captured site evidence from partial or scanner-limited evidence.
3. Keep comparison and evidence one step away from the decision surface.
4. Preserve deterministic scanner, storage, scoring, history, comparison, baseline, and optional Supabase behavior.
5. Use server rendering for project/index reads and client code only for mutation, polling, filtering, and interactive evidence.

## Visual system

- Near-black canvas with graphite surfaces and visible neutral borders.
- Cool blue only for actions and selection; green, amber, and red only for measured release states.
- Compact system sans typography with monospaced IDs, paths, and measurements.
- Small radii, no gradients, glow, glass, fake terminal decoration, or invented dashboards.
- A consistent left release-state rail is the signature element: color and copy together identify the current measured state.
- Dense desktop information design adapts to stacked, touch-safe mobile layouts without horizontal document overflow.
- Motion is limited to focus, disclosure, progress, filtering, and state feedback, and is removed under reduced motion.

## Real-data and truth boundaries

- Portfolio totals derive from each project's persisted latest scan.
- Explanations derive from failed release-gate checks, active critical groups, scan terminal state, or missing scans.
- Score and change summaries appear only when those persisted values exist.
- “Ready” is shown only when the stored verdict is `READY TO SHIP` and the release gate passes.
- Partial pages and audit failures are labeled as incomplete evidence rather than site defects.
- Comparison panels render only persisted `previous` or `baseline` deltas.

## Accessibility and responsiveness

- Landmarks, skip links, descriptive labels, native controls, visible focus, and status live regions are required.
- Interactive targets are at least 44px tall where practical.
- Desktop workspace navigation becomes horizontally scrollable within its own region or stacked on narrow screens; the document itself must not overflow.
- Empty, loading, failed, cancelled, and partial states remain actionable and understandable without color.
- Premium quality must remain intact when motion is disabled.
