---
name: alt-qr-product-design
description: Product and interface design workflow for ALT Quality Radar. Use whenever changing or reviewing the live ALT QR home, scan progress, release verdict, comparison mode, issue ledger, page health, evidence viewer, project history, print report, responsive behavior, accessibility, keyboard interaction, typography, motion, or the graphite/off-white Quality Grid visual system.
---

# ALT QR product design

Design ALT QR as an evidence-dense quality-control instrument. Read `references/visual-contract.md` before material interface work.

## Work from the live product

Open the actual app and complete three explicit passes:

1. **Structure:** make verdict, gate, regressions, blockers, score movement, and evidence discoverable without dashboard-card sprawl.
2. **Hierarchy:** tune condensed display type, monospace metadata, spacing, dividers, registration marks, and semantic status colors.
3. **Behavior:** verify focus, keyboard flow, reduced motion, loading/cancellation, evidence controls, print, and responsive layouts at 320, 375, 390, 430, 768, 1024, and 1440 px.

Record concrete weaknesses before editing and inspect the browser again after every pass. Never approve design from code alone.

## Preserve ALT QR identity

Use the Quality Grid, ruled ledgers, report numbering, alignment ticks, restrained scan-line motion, graphite ink, off-white paper, and signal orange/red only for meaning. Prefer one strong composition over nested cards. Avoid gradients, glass, glow, generic admin dashboards, decorative charts, fake terminals, and novelty command palettes.

Treat mobile as a separate composition. Prioritize verdict, gate, regressions, blockers, screenshots, and issue navigation. Keep print/PDF legible without app chrome.

Add Cmd/Ctrl+K only when it reduces repeated navigation and every command has an equivalent visible, keyboard-accessible control.
