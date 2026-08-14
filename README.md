# ALT QR — Release Quality Radar

ALT QR is a deterministic, local-first website release scanner. It uses real Chromium, axe, Lighthouse, stable desktop/mobile captures, exact pixel comparison, and fixed rules—never generative AI—to answer two questions: what changed, and is this release ready to ship?

## V2 capabilities

- bounded same-origin crawl with partial-page failure isolation
- HTTP, DOM, accessibility, SEO, mobile, link, runtime, and infrastructure evidence
- structured console/network events with dedupe and safety limits
- Lighthouse FCP, LCP, CLS, TBT, and Speed Index with documented ratings
- stable 1440 × 1000 desktop and 390 × 844 mobile captures at DPR 1
- explicit project baseline plus automatic previous-scan comparison
- stable issue fingerprints and `NEW`, `FIXED`, `UNCHANGED`, `CHANGED`, and `REGRESSION` deltas
- per-page health, grouped findings, ignored-finding lifecycle, and a deterministic fix queue
- configurable project release gate and blocker-aware ship verdict
- release receipt download and print/PDF report layout
- real scan cancellation with a persisted `CANCELLED` state

The original V1 browser, crawl, evidence, scoring, screenshots, local records, and optional Supabase mirror remain intact.

## Local setup

Requirements: Node.js 22.19 or newer.

```powershell
npm install
npx playwright install chromium
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Public website scans need no API keys. Local/private targets are disabled unless development explicitly sets:

```powershell
$env:ALT_QR_ALLOW_PRIVATE_TARGETS="true"
```

Run a scan without the UI:

```powershell
npm run scan -- https://example.com
```

Canonical scan JSON and PNG evidence are written atomically under `.alt-qr-data/`.

## Safety envelope

The scanner accepts HTTP/HTTPS URLs without embedded credentials. It validates initial/final URLs and browser resources, blocks non-public DNS results unless the local-only override is explicitly enabled, refuses executable/archive resources, stays same-origin, observes `robots.txt`, avoids destructive/action/download routes, never submits forms, and bounds pages, query variants, concurrency, redirects, HTML/resource size, browser events, dialogs, popups, page time, and total scan time.

Default limits:

| Limit | Value |
| --- | ---: |
| Pages | 10 |
| Crawl concurrency | 2 |
| Page timeout | 15 seconds |
| Total scan timeout | 120 seconds |
| Lighthouse budget | 30 seconds |
| Redirects | 5 |
| Rendered document | 2 MB |
| Resource declaration | 5 MB |
| Links considered per page | 40 |

## Deterministic decisions

Category scoring remains fixed and weighted. V2 adds a separate release gate with a default minimum score of 80, zero critical findings, zero broken pages, and zero broken links. The verdict is derived from the gate and change set: `READY TO SHIP`, `READY WITH WARNINGS`, `NEEDS ATTENTION`, or `BLOCKED`.

Performance bands are defined in `lib/qr/performance.ts`; visual change bands are defined in `lib/qr/visual.ts`; rule metadata and score impact remain in `lib/qr/rules/registry.ts`.

## Optional Supabase mirror

Local files remain canonical. To mirror completed V2 reports:

1. Apply `supabase/migrations/20260808201156_alt_qr_quality_radar.sql`.
2. Apply `supabase/migrations/20260809190913_alt_qr_v2_release_intelligence.sql`.
3. Set `ALT_QR_STORAGE=supabase`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` on the server.

Both migrations are additive. RLS is enabled, browser roles receive no table privileges, and the service-role key must never enter client code or logs. PNG assets remain local.

## Validation

```powershell
npm run typecheck
npm run lint
npm test
npm run test:scanner
npm run test:e2e
npm run build
```

`test:scanner` performs scan A, sets it as baseline, mutates the fixture, performs scan B, and proves fixed/new/regression classifications, visual change, gate/verdict output, partial failure resilience, and cancellation. The E2E test drives the V2 report, baseline, rescan, diff, mobile layout, and print stylesheet.

## Deployment boundary

V2 still launches scans inside a persistent local Next.js Node process. A multi-instance or serverless deployment needs a durable external queue, a dedicated Chromium worker, shared object storage, and a canonical database adapter. Do not deploy the in-process launcher as if it were durable.
