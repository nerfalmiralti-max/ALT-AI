---
name: alt-qr-security
description: Security engineering workflow for ALT Quality Radar. Use whenever reviewing or changing target URL validation, DNS resolution, redirects, crawler selection, Playwright request interception, SSRF defenses, private IPv4/IPv6 policy, metadata endpoints, downloads, response limits, dialogs, popups, console capture, timeouts, cancellation, scanner concurrency, asset serving, API rate limits, or production-versus-local scan behavior.
---

# ALT QR security

Treat every submitted URL and every discovered resource as hostile. Read `references/threat-model.md` before scanner boundary changes.

## Audit sequence

1. Validate the initial URL before any network or browser work: HTTP/HTTPS only, no credentials, normalized host, and all resolved A/AAAA addresses checked.
2. Revalidate every HTTP redirect and browser request. Block private, loopback, link-local, multicast, unspecified, reserved, carrier-grade NAT, IPv4-mapped IPv6, and cloud metadata destinations in production.
3. Keep local development explicit and separate. Never let a local-target override weaken production defaults.
4. Bound pages, links, redirects, concurrency, document bytes, resource bytes, console events, dialogs, popups, page time, and total scan time. Never submit forms or activate destructive/download routes.
5. Ensure cancellation and failure paths close Playwright pages, contexts, browsers, Lighthouse Chrome, and pending work.
6. Serve only validated PNG assets from the canonical data directory. Keep Supabase service-role credentials server-only and never log secrets or request headers.

Test production and local policy separately with deterministic adversarial fixtures. Report residual DNS-rebinding limitations honestly; layered DNS checks and request interception reduce risk but do not equal network-level egress isolation.
