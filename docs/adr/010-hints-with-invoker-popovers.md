---
status: accepted
date: 2026-10-22
---

# Show hints as popovers opened by invoker buttons

## Context and Problem Statement

A few controls need a short explanation, such as why a pool shows "no room". The hint has to be styled like the rest of the page, work on touch screens and need no tooltip library. How does the kit show hints?

## Considered Options

* A `popover="hint"` element opened by an interest invoker, falling back to a command invoker.
* The native `title` attribute. Rejected: it can't be styled and does not show on touch screens.
* A custom JavaScript tooltip. Rejected: positioning, dismissal and accessibility would all be code to write and maintain.

## Decision Outcome

Chosen option: "Popover hints opened by invoker buttons", because the browser handles opening, closing and the top layer.

`src/components/hint.js` renders a button and a `popover="hint"` element. Where interest invokers exist (Chromium 142 and later), the button gets `interestfor`, so the hint opens on hover or focus. Elsewhere it gets `commandfor` with `command="toggle-popover"`, so the hint opens on click (Chrome 135, Firefox 144 and Safari 26.2 and later). The kit picks one by checking `Object.hasOwn(HTMLButtonElement.prototype, 'interestForElement')`.

### Consequences

* Good, because there is no tooltip code to maintain.
* Bad, because a browser older than those versions shows a button that does nothing.
