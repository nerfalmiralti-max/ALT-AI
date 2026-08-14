# ALT QR threat model

Primary boundaries: `lib/qr/security.ts`, `config.ts`, `url.ts`, `robots.ts`, `browser-audit.ts`, `lighthouse.ts`, `app/api/scans`, and `app/api/assets`.

Required probes:

- Schemes: `file:`, `javascript:`, `data:` targets, embedded credentials, malformed and encoded hosts.
- Addresses: localhost, IPv4/IPv6 loopback, RFC1918, link-local, CGNAT, unspecified, multicast, reserved, IPv4-mapped IPv6, and `169.254.169.254`.
- Redirects and rebinding: public-to-private redirect, hostname address changes, every Playwright resource, and final response URL.
- Browser abuse: popup/window creation, dialog loops, downloads, form submission, console floods, infinite requests, slow responses, large HTML/assets, and unsupported protocols.
- Persistence/API: path traversal, oversized JSON, rate limiting, cancellation authorization boundary, asset MIME, and no browser exposure of service-role configuration.

Production must reject private targets. Local mode may scan them only through an explicit development policy.
