---
status: accepted
date: 2026-10-23
---

# Adopt Open Props for the non-color scales, with colors in a system theme

Supersedes ADR 015.

## Context and Problem Statement

The hand-written tokens had grown ten spacing steps (0.1, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 1.2, 1.25 and 2rem), several of them a hair apart, and ad hoc type sizes. Open Props offers tested scales for sizes, fonts and borders. ADR 015 turned it down, mainly over its colors and its dark mode, which are separate concerns from the scales. Can the kit take the scales without the parts that conflict with its system colors (ADR 014) and its layer order (ADR 011)?

## Considered Options

* Open Props for sizes, fonts and borders only, with our semantic names mapped onto them, and colors in a system theme.
* Open Props as the whole token system, colors and normalize included. Rejected: it has no `light-dark()` and no system colors. Its dark mode follows the OS through `prefers-color-scheme` and ignores the kit's toggle, and its `postcss-jit-props` plugin puts `tokens` ahead of `reset` in the layer order.
* Keep hand-rolled scales. Rejected: the ten spacing steps had no rule for choosing between neighbors such as 0.25 and 0.3rem.
* No tokens, with values written straight into each component. Rejected: a theme could no longer restyle the kit from one layer, and `test/pack/css.test.js` could not check values.

## Decision Outcome

Chosen option: "Open Props for the non-color scales", because it gives the kit a fixed scale without changing how colors or themes work.

`src/style.css` imports only `open-props/sizes`, `open-props/fonts` and `open-props/borders`, each with `layer(tokens)`. It skips the colors, the normalize sheet and the JIT plugin. The three imports measured at +1.8 KB gzipped in the built file.

Our semantic tokens map onto the scales, and components use only our names:

* Spacing has six steps, `--space-2xs` to `--space-xl`, from half of `--size-1` up to `--size-7`.
* Type and line height use the font scale, as `--type-*` and `--leading-*`. A few type sizes with no match on the scale, such as 0.8rem and 1.17em, stay as written.
* `--radius` and `--border-width` use the border scale.

Three of our names clashed with Open Props, so they were renamed: `--font-mono` became `--font-code`, the `--text-N` sizes became named `--type-*` tokens, and `--line-height` became `--leading-body`.

Colors leave `@layer tokens`. They live in `src/themes/system.css`, in `@layer theme.system`. `src/style.css` declares `@layer theme.system, theme.brand`, so a future brand theme is a sibling file in `@layer theme.brand` and wins over the system colors. Colors never come from Open Props by default. This changes one rule from ADR 011: raw colors now belong in `src/themes/`, not in `@layer tokens`.

`test/pack/css.test.js` checks four things for this decision:

* The built CSS declares the layer order first.
* The Open Props scales land in the tokens layer.
* None of our token names collides with an Open Props name.
* Components and layouts use only our semantic tokens, never an Open Props primitive.

### Consequences

* Good, because spacing went from ten steps to six, each on a shared scale.
* Good, because a theme changes colors in one file and never touches the scales.
* Bad, because the snap to the scale changed the look in places. For example, `--radius` went from 0 to 5px.
* Bad, because the kit now depends on `open-props` 1.7.23, from a project with one maintainer and a stalled 2.0.
