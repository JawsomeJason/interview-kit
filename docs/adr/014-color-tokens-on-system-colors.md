---
status: accepted
date: 2026-10-23
---

# Build color tokens on browser system colors

Supersedes ADR 012.

## Context and Problem Statement

ADR 012 gave every color token a hand-picked light and dark value in a `light-dark()` pair. Each pair needed its own contrast check, and the kit looked like no browser in particular. CSS system colors such as `Canvas` and `CanvasText` already follow `color-scheme`, so the browser could supply both schemes. Do system colors reach 4.5:1 contrast in every engine, and where they don't, what replaces them?

## Considered Options

* System colors for every token, with a measured fallback wherever a system color falls short.
* Hand-picked `light-dark()` pairs for every token. Rejected: this was ADR 012's approach. Every value is chosen and contrast-checked by hand, and none of it matches the browser.
* Pure system colors with no fallback. Rejected: measured below 4.5:1 for muted text and for text on the accent color (see below).
* A runtime JavaScript contrast check that adjusts colors on load. Rejected: code and a flash of wrong colors to fix something CSS can settle once.
* `color-contrast()` to pick a readable color from a list. Rejected: no browser ships it.

## Decision Outcome

Chosen option: "System colors with measured fallbacks", because the kit takes the browser's own look in both schemes, and only two tokens need anything else.

The color tokens live in `src/themes/system.css`, in `@layer theme.system` (ADR 016):

* Background, text and links use `Canvas`, `CanvasText`, `LinkText` and `VisitedText`.
* The accent and the focus ring use `AccentColor`.
* Borders use `GrayText`, because `ButtonBorder` is invisible on light `Canvas` in WebKit.
* Muted text is `color-mix(in oklab, CanvasText 55%, Canvas)`. `GrayText` measured 3.95:1 in Chromium light and 3.69:1 in Firefox dark, and WebKit renders it as full black or white. The mix measured 5.19:1 at worst.
* Text on the accent is `contrast-color(AccentColor)`. `AccentColorText` measured 4.21:1 in Chromium. `contrast-color()` measured 4.99:1 at worst.
* Warn is the only hand-picked `light-dark()` pair, since no system color means "warning".
* Code syntax colors (added later) follow the same rule. Code text, keywords and comments use `CanvasText`, `LinkText` and a `CanvasText` mix. String, number, function, tag, attribute and property are hand-picked `light-dark()` pairs, since no system color names a syntax hue. `src/themes/system.css` records their measured contrast.

The measurements ran in Chromium 156, Firefox 157 and WebKit 27.2, in light and dark. The Light, Dark and Auto toggle from ADR 012 stays as it was: it sets `color-scheme`, and the system colors follow.

### Consequences

* Good, because the default look matches the browser and the OS accent color.
* Good, because a brand theme overrides the same `--color-*` tokens from a sibling file in `@layer theme.brand` (ADR 016).
* Bad, because colors differ between browsers and between users' accent settings, so a screenshot from one machine won't match another.
* Bad, because the fallbacks rest on measurements of today's engines. A browser that changes its system colors could fall below 4.5:1 again, and nothing tests for it.
