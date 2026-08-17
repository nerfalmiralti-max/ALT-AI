# ALT QR Railway Deployment Implementation Plan

> **For agentic workers:** Execute these steps inline against the current working tree. Do not commit, push, migrate the database, or upload local secrets/data.

**Goal:** Publish ALT QR as a functional single-instance Railway service with persistent scan storage.

**Architecture:** Build a Node 22 Docker image that installs the exact Playwright Chromium runtime, runs Next.js as an unprivileged user, and stores canonical ALT QR data on a Railway volume mounted at `/app/.alt-qr-data`. Railway provides the HTTPS domain and injects `PORT`.

**Tech Stack:** Next.js 15, Node.js 22, Playwright 1.62.1, Docker, Railway persistent service and volume.

## Global Constraints

- Preserve scanner, scoring, persistence, API, report UI, and Supabase contracts.
- Keep exactly one service replica and one active scanner job.
- Never upload `.env.local`, `.alt-qr-data`, Git metadata, logs, test output, or secrets.
- Keep production private-target scanning disabled.
- Do not commit or push the working tree.

---

### Task 1: Containerize the existing production runtime

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `scripts/docker-entrypoint.sh`
- Create: `railway.json`
- Modify: `package.json`

- [ ] Bind `next start` to `0.0.0.0` while retaining Railway's injected `PORT`.
- [ ] Install exact Playwright Chromium and Linux dependencies during the Docker build.
- [ ] Run the service through `tini` and drop to the unprivileged `altqr` user after preparing the volume mount.
- [ ] Configure Dockerfile builder, root health check, bounded restart policy, and deployment draining.
- [ ] Verify deployment exclusions contain all local data and secret paths.

### Task 2: Validate the exact source tree

**Files:** No application changes.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run test:scanner`.
- [ ] Run `npm run test:e2e`.
- [ ] Run `npm run build`.

### Task 3: Create the persistent Railway service

**Files:** Railway project resources only.

- [ ] Authenticate the Railway CLI as the repository owner.
- [ ] Create the `alt-quality-radar` project/service from the current local tree.
- [ ] Attach one volume at `/app/.alt-qr-data` before public use.
- [ ] Set `ALT_QR_STORAGE=local`, `ALT_QR_ALLOW_PRIVATE_TARGETS=false`, `ALT_QR_MAX_CONCURRENT_SCANS=1`, `NEXT_TELEMETRY_DISABLED=1`, and `RAILWAY_SHM_SIZE_BYTES=268435456`.
- [ ] Deploy and require successful build, startup, and `/` health check.
- [ ] Generate a Railway HTTPS domain.

### Task 4: Production smoke test and persistence proof

**Files:** Railway runtime data only.

- [ ] Verify `/`, `/dashboard`, `/scan/new`, and API error handling over HTTPS.
- [ ] Start one bounded scan of `https://example.com` and wait for a terminal report.
- [ ] Verify the report, evidence assets, and navigation are accessible.
- [ ] Restart the service and verify the same report remains accessible from the mounted volume.
- [ ] Inspect runtime logs for secrets, absolute local paths, crashes, and silent Lighthouse failure.

### Task 5: Final audit and handoff

**Files:** No new application changes unless a reproduced deployment defect requires a scoped fix.

- [ ] Re-run the smallest relevant verification after any deployment fix.
- [ ] Record the production URL, provider/project, persistence path, verification evidence, and honest residual limitations.
- [ ] Confirm no commit or push occurred and local secrets/data remain untracked and unuploaded.
