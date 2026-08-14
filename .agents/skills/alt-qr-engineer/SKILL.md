---
name: alt-qr-engineer
description: Specialized senior-engineering workflow for ALT Quality Radar. Use whenever working on this repository's ALT QR product, scanning, crawling, Playwright, Lighthouse, axe accessibility, SEO, mobile inspection, browser health, screenshot capture or visual comparison, deterministic issues and scoring, projects/history, local workers, optional Supabase persistence, SSRF protection, the Next.js report UI, fixtures, tests, or ALT QR's visual system. Do not apply ALT AI, Gemini, RAG, Memory, chat, or generative-AI patterns to the current application.
---

# ALT QR engineer

Treat ALT QR as a deterministic website-quality instrument. Read `references/architecture.md` before changing scanner, storage, routes, or schema.

## Preserve these contracts

- Keep the scan real: bounded same-origin crawl, Playwright browser inspection, axe, Lighthouse when available, desktop/mobile screenshots, and pixel diff.
- Keep outputs explainable. Findings come from rule metadata and captured evidence; scores come only from fixed weights and penalties.
- Keep stages factual: `QUEUED → DISCOVERING → INSPECTING → AUDITING → CAPTURING → COMPARING → SCORING → COMPLETE`, or `CANCELLED` / `FAILED`. Show completion ratios only when work units are known.
- Keep local mode self-contained. `.alt-qr-data` is canonical; Supabase is an optional service-role mirror.
- Preserve V2 release truth: explicit project baseline, automatic previous scan, stable non-ID fingerprints, issue deltas, page health, release gate, blocker-aware verdict, ignored lifecycle, version/config snapshots, and numeric visual comparisons.
- Preserve historical migrations and user data. New database work is additive unless the user explicitly authorizes a migration strategy.
- Do not introduce AI providers, AI keys, LLM classification, text generation, chat abstractions, or hidden network services.

## Safe scanner changes

Validate HTTP/HTTPS before launching a browser. Preserve credential rejection, DNS/private-range checks, browser request interception, robots handling, redirect/size/time/concurrency limits, same-origin page selection, destructive-path/download avoidance, and no form submission. Close browser, contexts, Lighthouse Chrome, and fixture servers in failure paths.

Add or change a check through `lib/qr/rules/registry.ts`, return normalized evidence in `evaluate.ts`, update scoring only deliberately, and cover the behavior with a deterministic fixture and test. Never derive a score from UI state.

## Interface direction

ALT QR is a graphite/off-white engineering report with signal orange/red, exact rules, hard hierarchy, generous negative space, condensed display type, and restrained registration-axis/tick motifs. Prefer ruled sheets and dense evidence registers over generic cards. Avoid gradients, glass, glow, decorative charts, fake HUDs, and marketing-dashboard patterns. Keep keyboard focus, semantic controls, readable contrast, independent mobile composition, and reduced motion.

## Validation

Run `scripts/validate.ps1` from this skill, then perform the two-release fixture scan and inspect home, progress/cancellation, completed report, previous/baseline change mode, page health, grouped evidence, desktop/mobile before/after/diff, gate configuration, print, responsive widths, and keyboard flow. Do not report success when Lighthouse is silently skipped or screenshots are placeholders.

## Database boundary

Do not change schema for presentation-only work, new in-process rules, or local scanner behavior. Modify the database only when persisted contracts change; use a new Supabase CLI migration, index every foreign key, enable RLS, deny browser roles by default, and keep service-role secrets server-only.
