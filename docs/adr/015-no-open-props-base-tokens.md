---
status: superseded by 016
date: 2026-10-23
---

# Keep our own tokens instead of adopting Open Props

## Context and Problem Statement

Open Props is a library of about 600 CSS custom properties: color ramps, sizes, fonts, easings and shadows. It could replace the hand-written tokens in `@layer tokens`. The kit already has about 50 semantic tokens that cover every value it uses, and `test/pack/css.test.js` enforces them. Should Open Props become the base token system?

## Considered Options

* Keep our own semantic tokens. Allow Open Props only as an opt-in palette a brand theme imports.
* Import all of Open Props into `@layer tokens`. Rejected: it adds 7.6 KB gzipped to the single file, almost all of it properties the kit would never use.
* Semantic tokens built on Open Props primitives, trimmed by `postcss-jit-props`. Rejected: cheap in bytes (+0.2 KB gzipped) but costly in parts. The JIT plugin puts `@layer tokens` ahead of our layer order, so `tokens` would sort before `reset`. It also needs two dependencies and a PostCSS config the repo doesn't have.

## Decision Outcome

Chosen option: "Keep our own tokens", because Open Props would rename values we already have and fight two of our decisions.

* Open Props has no `light-dark()` and no system colors. Its dark variants redefine properties under `prefers-color-scheme`, so they follow the OS and ignore the kit's Light, Dark and Auto toggle (ADR 014).
* Its names clash with ours. Our `--text-1` and `--text-2` are font sizes, while Open Props uses them for text colors. `--font-mono` collides too.
* None of our color tokens are Open Props values, and only about 14 of our 40 size and font tokens match one, so switching would change how the kit looks.

A brand theme can still use Open Props. It imports the palette it wants into `@layer theme` and maps those values onto our semantic tokens, such as `--color-accent`. It never overrides an Open Props primitive directly, since that would recolor every token built on it.

If the kit later needs an easing or shadow scale, the few values it uses can be copied into `@layer tokens` by hand, with attribution under Open Props' MIT license.

Measured on this build, importing all of Open Props into the tokens layer added about 29 KB (7.6 KB gzipped) to the single file.

### Consequences

* Good, because the single file, the CSS test and the toggle stay as they are, with no new dependency.
* Bad, because any easing, shadow or color ramp the kit needs later has to be written or copied by hand.
