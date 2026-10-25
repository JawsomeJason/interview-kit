---
status: superseded by 018
date: 2026-10-22
---

# Use one phone layout below 760px for every desktop layout

## Context and Problem Statement

On a phone, the desktop columns do not fit side by side. The page still has to keep its controls in fixed places (ADR 007). What does the kit show on a narrow screen?

## Considered Options

* One shared phone layout, whatever desktop layout is chosen.
* Plain stacking of the desktop layout. Rejected: things move with each question's length.
* A phone version of each desktop layout. Rejected: it doubles the layouts on trial in ADR 008.

## Decision Outcome

Chosen option: "One shared phone layout", because the desktop layouts differ in how they use width, which a phone does not have.

Below 760px the phone layout replaces whichever desktop layout is selected:

* A top bar is pinned with a ☰ button that opens the timeline in a popover, next to the pager.
* A bottom tab bar is pinned with two tabs, Question and Assess.
* One panel shows at a time. The selected tab stays selected when moving to the next question.

### Consequences

* Good, because the phone view does not change when the desktop trial ends.
* Bad, because a phone shows the question and the assessment one at a time, never together.
