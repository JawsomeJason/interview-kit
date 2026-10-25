---
status: accepted
date: 2026-10-22
---

# Hold every control in a fixed place with an app-shell grid

## Context and Problem Statement

The interviewer moves between questions while listening to the candidate. If buttons move with each question's length, they have to hunt for them mid-answer. An earlier fix sized the content with a `calc()` against the header's height, a magic number that broke whenever the header changed. How should the question page stay steady?

## Considered Options

* An app-shell grid with fixed zones for every control.
* Stack the controls below the content. Rejected: they move with every question's length.
* Size the content from the header's height with `calc()`. Rejected: a magic number that breaks when the header changes.

## Decision Outcome

Chosen option: "An app-shell grid with fixed zones", because the browser does the sizing and nothing depends on a hard-coded height.

* One question per screen.
* The pager is pinned at the top, with labels of fixed width.
* Notes, Look for and Follow-ups each sit in a fixed place.
* The shell is a grid with `grid-template-rows: auto minmax(0, 1fr)` and `height: 100dvh`, so each column scrolls on its own and the page itself does not.
* `scrollbar-gutter: stable` and reserved widths stop sideways jumps when a scrollbar appears.
* Undo shows as a fixed toast, so it never pushes content down.
* The question block is centered vertically with `align-content: safe center`, which falls back to the top when the question is too tall to center.

### Consequences

* Good, because a control is in the same spot on every question.
* Bad, because every layout and the phone view must keep these zones. ADR 008 and ADR 009 build on them.
