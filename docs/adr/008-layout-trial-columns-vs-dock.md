---
status: superseded by 020
date: 2026-10-22
---

# Trial two question layouts before picking one

## Context and Problem Statement

The question page holds the Ask, Notes, Look for and Follow-ups. Which arrangement works best can't be judged from a mockup; it shows only in a real interview. A first attempt to keep one layout and delete the others was reverted minutes later. How does the kit settle on a layout?

## Considered Options

* Ship swappable layouts behind a switcher in the header, and pick one after real interviews.
* Pick one layout now. Rejected: tried once and reverted, before any real interview had run.
* Keep every layout for good as a user preference. Rejected: more CSS and tests to maintain for a choice that only needs making once.

## Decision Outcome

Chosen option: "A trial behind a header switcher", because the right layout depends on how the page feels during a real interview.

The trial started with three layouts: A Columns, B Dock and C Drawer. C was dropped. B was reworked so the question sits above a dock of fixed height that holds Notes, Look for and Follow-ups side by side, sized to the tallest content.

B won after real interviews; ADR 020 records the pick.

### Consequences

* Good, because the choice will rest on real use.
* Bad, because until then the repo carries two layout stylesheets, a switcher and their tests.
