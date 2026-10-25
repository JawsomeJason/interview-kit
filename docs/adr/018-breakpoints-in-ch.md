---
status: accepted
date: 2026-10-23
---

# Set page breakpoints in ch from a measured width sweep

Supersedes ADR 009.

## Context and Problem Statement

ADR 009 switched to the phone layout below 760px. Other rules switched at 700px and 1000px. The three values were picked without measurement and contradicted each other. All were in pixels, so a reader who raised the browser's default font size got a cramped question column at the same widths as everyone else. Where should the page change shape, and in what unit?

## Considered Options

* Two breakpoints in `ch`, taken from a measured width sweep, with column widths in `rch`.
* Pixel breakpoints. Rejected: they ignore text-only zoom and the reader's default font size.
* Keep 700, 760 and 1000px. Rejected: they contradicted each other and none was measured.
* Container queries for the page layout. Rejected: the columns depend on the width of the page, not of any one component.

## Decision Outcome

Chosen option: "Two `ch` breakpoints from a sweep", because in a media query `ch` follows the reader's default font size, so a larger font switches layouts sooner.

The sweep ran layouts A and B from 480 to 1400px wide. The rule it applied: the question column never drops below 45 characters.

* **Below 108ch** (864px at a 16px default font): phone tabs. Narrower than this, the question column beside the sidebar would fall under 45 characters. The phone layout keeps ADR 009's shape: a pinned top bar with the timeline popover and pager, pinned Question and Assess tabs, and one panel at a time.
* **From 108ch to 154ch:** sidebar and question side by side, with Notes, Look for and Follow-ups stacked under the question.
* **From 154ch** (1232px at 16px): layout A's side column, or layout B's dock. This is the narrowest width that keeps 45 characters in the question column beside them.

Column widths use `rch`, which follows the root font: the sidebar is 28rch and the side column 32rch. These are the narrowest widths that keep every Look-for item to two lines. The page font moved to the root element so `rch` tracks it.

Only the pager uses a container query. Below 40ch it hides the words Previous and Next and keeps the arrows, which fits it into the phone top bar.

Media queries can't read custom properties, so the two values are written out in each layout file. `test/pack/css.test.js` fails if any media query uses a width other than 108ch or 154ch, or if a container query names a container no stylesheet declares.

### Consequences

* Good, because a reader with a larger default font gets the narrower layout at the width where they need it.
* Good, because the breakpoints rest on one measured rule instead of three guesses.
* Bad, because the two values are repeated across layout files. The test, not a variable, keeps them in step.
* Bad, because a change to the sidebar or side column width moves the right breakpoint, and the sweep has to run again.
