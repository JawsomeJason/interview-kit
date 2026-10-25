---
status: superseded by 014
date: 2026-10-22
---

# Support light and dark with `light-dark()` tokens

## Context and Problem Statement

The kit showed a light page only. Its first rule had been "no theming", to keep it small. Can it offer light and dark without a theme system?

## Considered Options

* Color tokens written with `light-dark()`, and a Light, Dark and Auto toggle.
* Light only, as the old "no theming" rule said. Rejected: `light-dark()` gives a dark scheme without any theme machinery, so the rule was narrowed instead.
* A second set of token values under a `prefers-color-scheme` media query. Rejected: every color would be written twice in two places, and an override would need a third.

## Decision Outcome

Chosen option: "`light-dark()` tokens with a toggle", because each color is defined once, in one place, for both schemes.

Each color token in `src/style.css` holds its light and dark values in one `light-dark()` call. The toggle sets `color-scheme` on the root element: `light dark` for Auto, the default, or `light` or `dark` to force one. Its icons (sun, moon and monitor) are inline SVG from Lucide, under the ISC License. The choice is saved with the layout preference under `interview-kit-layout`, apart from interview state.

`AGENTS.md` now reads: light and dark through `light-dark()` tokens only, with any other theming in the `theme` layer.

### Consequences

* Good, because adding a color means writing one token, not two.
* Good, because a brand theme can override the same tokens in its own layer (ADR 011).
* Bad, because `light-dark()` covers colors only. An image or other non-color value that should differ by scheme would need another approach.
