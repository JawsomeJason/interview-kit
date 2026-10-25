---
status: accepted
date: 2026-10-22
---

# Organize CSS in cascade layers with tokens and class-only components

## Context and Problem Statement

The kit should be able to take a brand theme later without rewriting its styles. A theme has to override colors, type and shapes cleanly. Agents edit the CSS too, so the rules have to be checkable by a test. How is the CSS organized?

## Considered Options

* Cascade layers, design tokens and class-only component selectors, enforced by a test.
* One unlayered global stylesheet. Rejected: a theme would need `!important` to win.
* CSS-in-JS. Rejected: runtime code and tooling for styles that do not change at runtime.
* A utility class framework. Rejected: a new dependency and a second styling vocabulary.

## Decision Outcome

Chosen option: "Cascade layers with tokens", because a later layer wins over an earlier one without any specificity tricks.

`src/style.css` declares the layers in order: `reset, tokens, base, layout, components, utilities, theme`.

* Every color and size comes from a token in `@layer tokens`.
* Element selectors appear only in `reset` and `base`. Everywhere else, selectors use classes.
* Component CSS sits next to its JavaScript in `@layer components`. Layouts go in `@layer layout`.
* `theme` comes last and is kept for a brand theme that a content pack can ship in its `theme/` folder (ADR 019).

`test/pack/css.test.js` enforces these rules. It fails on any rule outside a layer, a raw color outside `tokens`, or an element or ID selector outside `reset` and `base`. It also fails if the company name appears in the code, `README.md` or `AGENTS.md`.

### Consequences

* Good, because a theme overrides tokens in one layer and needs no `!important`.
* Bad, because the guard test parses CSS with a small hand-written scanner, which assumes no braces or semicolons inside strings.
