---
status: accepted
date: 2026-10-22
---

# Pick deep dive questions with a greedy rule weighted to the main pool

## Context and Problem Statement

The deep dive has a fixed number of minutes. The interviewer checks question pools in order of focus. The kit should fill the time without manual picking, and say why a pool cannot be added. How should it choose questions?

## Considered Options

* A greedy rule that gives the main pool most of the time.
* Manual question picking only. Rejected: slow during setup, and the picks can overrun the time.
* An equal split across pools. Rejected: the main focus would get no more time than a side topic.
* A recursive search or optimizer for the best fit. Rejected: more code for no visible gain at about 120 questions.

## Decision Outcome

Chosen option: "A greedy rule weighted to the main pool", because it is predictable and fits in one paragraph of the README.

`pickQuestions` in `src/pick.js` works like this:

1. The first checked pool is the main focus and gets `round(minutes × 0.6)`. The other pools split the rest evenly.
2. Each pool takes core questions, then stretch, in file order. The scan skips a question that does not fit and moves on.
3. A last pass adds any remaining question from the checked pools that still fits the total.

The page disables a pool that cannot place any question and marks it "no room". Its hint names the smallest total, up to 60 minutes, that would include it. The kit finds that number by trying each minute value in turn, which is instant at this size.

### Consequences

* Good, because file order is the author's priority order, so the author controls what gets picked first.
* Bad, because a greedy pass can leave minutes unused that a better combination would fill.
