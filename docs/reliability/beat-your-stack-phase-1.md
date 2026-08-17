# Beat Your Stack Phase 1

## Product claim

ALT QR answers one bounded question: did the candidate introduce a reproducible, evidence-backed release-quality regression that was absent from the inspected production baseline?

It does not claim exhaustive functional coverage, competitor benchmark superiority, economic impact, or autonomous testing.

## Execution

Each Challenge run uses the production scanner worker and persists its scan records and PNG evidence:

1. Scan production to establish successfully inspected routes and existing findings.
2. Scan the candidate with the same deterministic rule registry.
3. Classify cross-origin findings by normalized route, rule, and rule-specific evidence identity.
4. Re-scan the candidate when an eligible candidate-only finding requires confirmation.
5. Derive the verdict from submitted QA state, confirmed regression count, and evidence completeness.

A run uses two scans when there is nothing eligible to verify and three when a suspected qualifying regression exists.

## Qualifying standard

A finding qualifies only when all of the following are true:

- it is present in the candidate;
- the equivalent route was successfully inspected in production;
- no equivalent production finding exists;
- it is supported by the explicit qualifying rule allowlist;
- the scanner stored bounded, relevant evidence;
- a fresh candidate scan reproduces the same challenge identity;
- it is not only visual variance, timing variance, infrastructure noise, or a low-confidence notice.

Categorical confidence is `CONFIRMED` or `UNVERIFIED`. ALT QR does not invent percentages.

## Fail-closed behavior

Failed primary navigation, interruption, cancellation, worker restart, inaccessible targets, incomplete required verification, and uncovered candidate routes cannot produce `ALT_QR_WON` or a pass. They remain partial and can result in `INSUFFICIENT_EVIDENCE`.

An unverified difference can coexist with a confirmed regression. In that case the confirmed claim is limited to the reproduced finding; the unverified item remains explicitly separate.

## Persistence and reruns

Challenge metadata and immutable run arrays are written atomically under `.alt-qr-data/challenges/`, with a bounded recent index at `.alt-qr-data/challenges.json`. Each run keeps its production, candidate, and optional verification scan IDs. A rerun appends and never rewrites earlier evidence.

Challenge evidence scans use the normal scan store but do not replace a release project's ordinary `latestScanId` or appear as normal project history. They are intentionally not mirrored to the optional Supabase V2 tables in Phase 1 because no Challenge schema was introduced.

## Report safety

The Challenge API exposes a dedicated presentation model, not raw `ScanRecord` objects. It includes intended target URLs, progress, coverage, scores, bounded finding evidence, and screenshot references. It excludes page headers, cookies, authorization material, request payloads, browser call logs, and local paths.

Phase 1 `/challenge/[id]/report` is suitable for a local or access-controlled deployment and print/PDF export. It is not a public signed sharing system. Public multi-user access requires owner authorization, tenant isolation, and signed report links.

## Known limits

- ALT QR is passive and does not submit forms or execute destructive flows.
- Authentication-gated coverage is incomplete without a future secure session architecture.
- Different production/candidate route graphs can leave candidate-only routes unverified.
- Browser, Lighthouse, and network evidence remain bounded by the documented scanner safety envelope.
- Challenge Phase 1 uses an in-process orchestrator; durable multi-instance execution needs an external queue and worker.
