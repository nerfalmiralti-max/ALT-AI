# Vercel build and runtime boundary

## What the supplied build log proves

The Vercel log for commit `51d4bd3` completed dependency installation, compilation, type validation, page-data collection, static generation, and page optimization. The excerpt stops at `Collecting build traces` and contains no build error. It therefore does not prove a failed build.

That deployment cloned `main` at `51d4bd3`. The current Release Control Room, scanner reliability, Challenge Phase 1, and Adversarial QA Phase 2 work exists only in the uncommitted local working tree until the repository owner explicitly authorizes a commit and push. The three generated static pages in that log are consistent with the older remote commit, not the current application route set.

## Node version

The root package now pins `engines.node` to `22.x`. This avoids Vercel silently advancing ALT QR to a future Node major while retaining the Node 22 runtime required by the scanner dependencies.

## Why a successful Vercel build is not a working scanner deployment

ALT QR currently starts Playwright/Chromium and Lighthouse from an in-process worker, keeps active cancellation state in process memory, and treats local JSON/PNG evidence as canonical. A serverless request can end, move instances, lose local files, or be terminated while a scan is still running. A green Vercel build can serve the Next.js interface but cannot make that worker durable.

The supported current deployment shape is the checked-in Docker image on a persistent service such as Railway, with a persistent data volume and the required Chromium system libraries. A future Vercel-compatible architecture requires a durable external queue, a dedicated long-running browser worker, shared object storage, and a canonical database adapter. Those are Phase 3 infrastructure changes, not a build-flag workaround.

Do not exclude Playwright, Chromium, or Lighthouse from the production output merely to make tracing smaller; that would create a deployment that builds and then fails when a scan starts.
