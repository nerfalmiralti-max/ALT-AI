# ALT QR Railway deployment design

## Goal

Deploy the current ALT QR working tree as a functional, persistent production service without changing its scanner, database schema, or Supabase architecture.

## Architecture

- Railway runs one long-lived Docker service; the service is not serverless and never scales beyond one replica.
- The image installs the repository's exact Playwright Chromium revision and Linux browser dependencies, builds Next.js, then runs the app as an unprivileged `altqr` user behind `tini`.
- Railway mounts one volume at `/app/.alt-qr-data`, preserving canonical scan JSON, screenshots, comparisons, projects, and history across restarts and deployments.
- The app binds to Railway's injected `PORT` on `0.0.0.0`. `/` is the deployment health check.
- Production keeps `ALT_QR_ALLOW_PRIVATE_TARGETS=false`, local storage, one concurrent scan, and a larger shared-memory allocation for browser stability.

## Data and security boundaries

- `.env.local`, local scan artifacts, Git data, logs, and browser output are excluded from the image and upload.
- No Supabase keys or other secrets are copied into the image.
- The existing URL validation, pinned safe requests, WebSocket denial, response bounds, rate limit, and scan-capacity guard remain unchanged.
- The public deployment remains a single-user/low-volume scanner. It is not a multi-tenant authorization boundary, and its application-layer network controls do not replace provider-level egress isolation.

## Verification

Run the complete repository gate, require a successful Railway Docker build and health check, verify the public dashboard/new-scan/report flow, run a bounded scan of a safe public site, restart the service, and confirm the report still exists from the volume.
