# ALT QR architecture

- `app/api/scans`: create/read/cancel jobs, baseline and ignored-finding mutations, and release receipts; `app/api/projects`: project/gate mutations; `app/api/assets`: sanitized PNG delivery.
- `lib/qr/worker.ts`: abortable job boundary, persisted stages, V2 analysis, gate, and reanalysis.
- `lib/qr/browser-audit.ts`: bounded partial-failure crawl, structured runtime evidence, axe, Lighthouse, stable mobile/desktop captures, and previous/baseline diffs.
- `lib/qr/security.ts`, `url.ts`, `robots.ts`, `config.ts`: the safety envelope.
- `lib/qr/rules/`: scoped rule registry and stable evidence fingerprints; `scoring.ts`: fixed weighted score; `diff.ts`/`visual.ts`: numeric comparison and semantic bands.
- `comparison.ts`, `release.ts`, `analysis.ts`, `performance.ts`, and `receipt.ts`: issue movement, release gate/verdict, page/group/fix analysis, metric bands, and client receipt.
- `lib/qr/store.ts`: backward-compatible atomic local JSON/assets under `.alt-qr-data`; `persistence.ts`: batched optional Supabase mirror.
- `supabase/migrations/20260808201156_alt_qr_quality_radar.sql` is V1; `20260809190913_alt_qr_v2_release_intelligence.sql` is additive V2. Never rewrite historical migrations.
- `tests/fixtures`: deterministic defect site; `tests/unit`, `tests/scanner`, `tests/e2e`: confidence layers.

Default limits: 10 pages, concurrency 2, 15s page timeout, 120s scan timeout, 5 redirects, 2MB document, 5MB declared resource, 40 links/page, and bounded console/network/dialog/popup events. Environment overrides remain bounded in `config.ts`; private targets require an explicit local-only opt-in.

Score weights: performance 20, accessibility 20, SEO 15, mobile 15, links 10, browser 10, infrastructure 10. Status thresholds: Ready 90, Almost Ready 75, Needs Work 50, otherwise Not Ready.

V2 adds a separate configurable release gate and verdict; do not collapse either into the legacy weighted score status. The local worker runs in the persistent Next.js Node process. A multi-instance/serverless deployment needs an external queue, object storage for PNGs, and a worker service.
