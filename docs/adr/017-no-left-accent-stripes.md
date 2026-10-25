---
status: accepted
date: 2026-10-23
---

# No colored left-border accent stripes

## Context and Problem Statement

A thick colored `border-left` or `border-inline-start` on a card, callout, toast or row is a common way to mark state or category. It reads as generic AI-generated UI. With rounded corners it also looks broken, because the stripe curves at both ends where the corner bends it. The maintainer dislikes the look. How should a component show state or category instead?

## Considered Options

* A change to the whole border's color, a subtle background tint, a small badge, or a dot or icon next to the title.
* A colored left accent stripe. Rejected: the look itself is the problem.
* A left stripe on square corners only. Rejected: it avoids the broken curve but is still the same tell.
* A colored top border stripe. Rejected: the same problem, rotated.

## Decision Outcome

Chosen option: "Border color, tint, badge or dot", because each marks state without the stripe.

* **Border color.** Change the color of the whole border, keeping its width.
* **Tint.** Mix a little of the state color into the card's background, such as `color-mix(in oklab, var(--color-warn) 10%, var(--color-bg))`.
* **Badge.** Put a short label next to the title.
* **Dot or icon.** Put a small marker next to the title.

### Consequences

* Good, because state reads the same whether corners are square or round.
* Neutral: `AGENTS.md` gains a line stating the rule. `test/pack/css.test.js` gains a check that fails on any `border-left` or `border-inline-start` wider than 1px in component or theme CSS.
* Neutral: the red-team review page already dropped its stripes in `a55e7ee`.
