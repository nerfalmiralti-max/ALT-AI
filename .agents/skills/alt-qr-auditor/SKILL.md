---
name: alt-qr-auditor
description: Independent audit workflow for ALT Quality Radar. Use after substantial ALT QR scanner, security, storage, scoring, baseline, comparison, release-gate, evidence, report UI, responsive, print, or test changes; also use to verify implementation claims against actual code, persisted records, live browser behavior, deterministic fixtures, and production builds before declaring a release complete.
---

# ALT QR auditor

Audit as an independent release reviewer. Read `references/audit-matrix.md`, then inspect raw code and artifacts without trusting completion reports.

## Two-pass audit

1. Build an `IMPLEMENTED / PARTIAL / MISSING` matrix tied to exact files, runtime output, tests, or screenshots.
2. Run the real product and fixtures. Probe failure, cancellation, comparison, keyboard, narrow viewport, print, and security paths—not only the happy path.
3. Report only reproducible findings. Rank them by user/security impact and identify the violated contract.
4. Fix meaningful in-scope findings without weakening tests, deleting evidence, hiding failures, or broadening network access.
5. Re-run the smallest relevant checks plus the complete validation gate, then audit again from the resulting artifacts.

Reject fake progress, fabricated evidence, score-only release verdicts, ID-based issue comparison, placeholder screenshots, generic dashboard composition, inaccessible controls, silent Lighthouse skips, and claims unsupported by code or runtime proof.
