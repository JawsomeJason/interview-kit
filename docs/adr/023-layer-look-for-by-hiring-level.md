---
status: accepted
date: 2026-10-27
---

# Lay out Look for rows by their level against the role's hiring level

## Context and Problem Statement

With levels in the pack (ADR 021), one question can hold anchors for every level on the ladder. Showing all of them as one checklist overloads the interviewer mid-answer, and showing only one level loses the evidence that places a candidate above or below the bar. How should the Assess panel decide which rows to show open, which to fold, and which to number for keys?

## Considered Options

* One pure function, `layerOf(ladder, focus, level)`, that puts each row in a layer by its offset from the focus level: the focus level is the checklist, one below is placement, two or more below is basics, above is headroom.
* A per-card setting for which levels to show. Rejected: authors would tune each card by hand, and two cards in one interview could disagree.
* Compute a placement from the marks, such as a median level across cards. Rejected: it is a score by another name, and the kit shows evidence rather than conclusions.
* Show every level open. Rejected: a five-level ladder makes a card five checklists long.

## Decision Outcome

Chosen option: "Layers from the offset to the focus level", because one table of offsets drives every view, and an author places an anchor once under the level whose behavior it describes.

* The focus is the role's hiring level unless I change "Evaluating at". That choice is mine alone, a private event that moves only my rows and my number keys, and the debrief shows it beside my column.
* The checklist is open and numbered 1 to 9. Placement is open beside it and its marks are optional. Basics are folded with one Missing control per row. Headroom is folded and its marks are optional. A folded level says how many of its rows I marked.
* A stretch prompt reads "Ask this" at its own level and at every level above it, since a higher bar includes the lower one's question. Prompts for levels above the focus fold under Other levels. Marking an item done with one unasked says so and does not block, and the summary lists it.
* The app names no level. Levels are pack data, and a test fails if `src` or `bin` contains a level name.

### Consequences

* Good, because the same card serves every role on the ladder, and the hiring level alone decides what an interviewer reads first.
* Good, because evidence above and below the bar is still recorded, folded out of the way.
* Bad, because a role that hires at the lowest level has no placement layer, and a pack with anchors at one level only shows an empty one until more are written.
