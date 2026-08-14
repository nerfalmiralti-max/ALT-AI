# ALT Quality Radar agent routing

ALT Quality Radar is a deterministic Next.js release scanner. Preserve its browser evidence, bounded crawl, SSRF protections, deterministic scoring, comparison/history, optional Supabase mirror, report UI, and graphite/off-white visual identity. Do not reintroduce ALT AI chat, Gemini, RAG, or Memory architecture.

## Choose tools intentionally

- Use at most the few tools that materially improve the task; do not invoke the entire stack by default.
- Use the repo-local `alt-qr-engineer` skill for scanner, persistence, scoring, report, or Next.js work. Add `alt-qr-security` for URL/network/browser boundaries, `alt-qr-product-design` for UX/visual changes, and `alt-qr-auditor` for final independent verification.
- Use Context7 for version-sensitive framework or library documentation, and prefer primary documentation.
- Use the project `playwright-cli` skill for browser inspection and meaningful UI-flow validation.
- Use the connected GitHub integration for repository/PR/issue operations. Direct pushes require explicit user authorization.
- Use the connected Supabase integration only for actual Supabase work. Default to the project-scoped, read-only path; confirm before production writes, schema changes, migrations, or destructive actions.
- Use Superpowers only when its structured workflow is useful for substantial implementation or debugging.
- Use UI/UX Pro Max or Frontend Design for significant interface work, while preserving ALT QR's established design system.
- Use Codex Security for sensitive changes or release security review.
- Use Firecrawl for current public-web research or extraction. Use Context7 instead for library/API documentation when available.
- Use Skill Creator only for durable, repeated workflows that deserve a reusable skill.

## Validation

Run checks proportionate to the change. The full release gate is:

```powershell
npm run typecheck
npm run lint
npm test
npm run test:scanner
npm run test:e2e
npm run build
```

Never commit `.env*`, API keys, auth tokens, `.alt-qr-data`, browser output, logs, or local backups. Do not change Supabase schema/backend merely to satisfy a local UI or deterministic scanner task.
