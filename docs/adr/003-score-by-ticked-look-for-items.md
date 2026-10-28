---
status: superseded by 022
date: 2026-10-22
---

# Score by ticking three Look-for items, and hide the score until review

## Context and Problem Statement

The first kit scored each answer against 1, 3 and 5 rubric anchors. Reading and weighing those during a live answer was too much. A score that shows during the interview can also sway the interviewer's next questions. How should an interviewer record what they saw, and when should the kit turn that into a score?

## Considered Options

* Tick boxes on exactly three Look-for items, with a score word derived from the ticks and shown only in review.
* Rubric anchors at 1, 3 and 5. Rejected: the first kit's approach, and too much to read mid-answer.
* Show the score word on the card as items are ticked. Rejected: it nudges the interviewer while the answer is still coming.
* Allow one to three Look-for items per card. Rejected: scores came out uneven, since one tick out of two already read as Solid.
* Four or more items per card. Rejected: it brings back the overload.
* A "needed a follow-up" checkbox. Rejected: it says more about the interviewer than the candidate, and notes cover it.

## Decision Outcome

Chosen option: "Three ticked Look-for items, scored only in review", because ticking is fast during a live answer and three items give every card the same scale.

The word comes from the ticks. No ticks gives no word, all three give Strong, two give Solid and one gives Weak. The word is hidden on the question card and in the sidebar. It shows only in the Deep dive review list and in Copy summary.

`content.test.js` requires exactly three Look-for bullets on every question. It also requires exactly two follow-ups.

### Consequences

* Good, because a score means the same thing on every card.
* Bad, because the scale is coarse. Nuance lives in the notes.
* Bad, because every question has to fit into exactly three observable items.
