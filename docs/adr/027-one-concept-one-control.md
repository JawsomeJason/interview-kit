---
status: proposed
date: 2026-11-13
---

# One concept, one control, and an interview length the plan must fit

## Context and Problem Statement

Each release added its feature as another box on the page. By 1.1.0 the start page showed 28 controls in six bordered boxes, and four of them (the round, the activity ticks, the minute boxes and Your plan) edited or restated one allocation. A Minutes box on every activity page edited it a third way. The kit had no interview length: the time meter's limit was the plan's own total, so a 95 minute plan read "95 of 95". Removing every border left the start page the same height with the same controls, so the cause is structure, not styling. How should a screen be put together so that it reads in five seconds, and stays that way when the next feature arrives?

## Considered Options

* Rules for what may appear on a screen, a length the model enforces, and a test that fails when a screen breaks its budget.
* Restyle only: drop the fieldset borders and tighten the spacing. Rejected: measured on the start page, it changed nothing but the borders.
* A design review before each release. Rejected: this is how the page reached 28 controls, and a rule nobody runs is forgotten.
* Keep the length a warning, as ADR 026 chose. Rejected: the warning fires against the plan's own total, so it cannot say an interview is too long, and the interviewer does the arithmetic during the call.

## Decision Outcome

Chosen option: "Rules, an enforced length and a test", because the first two fix what is on screen today and the test keeps a later feature from undoing them.

* **One concept, one control.** A decision has one control on a screen. Anything else that shows it is read-only.
* **The model enforces what it knows.** A role has a length in minutes, 60 unless the pack says otherwise. `fit` makes every plan fit it: the activity just changed keeps its minutes, the others absorb the difference in proportion, and none goes below its `floor`. A plan whose floors cannot fit says how many minutes short it is. The interviewer can choose a longer interview, and that is the only way past the length. This supersedes the warn-only meter in ADR 026.
* **A surface needs a role.** A border or fill marks the screen's one working surface, or an input. Everything else is grouped by space and type.
* **Three tiers of disclosure.** What an interviewer decides every time is visible. What they decide sometimes is one step away, in a native `details` or popover. What they decide rarely lives on another screen.
* **One button hierarchy.** Primary, secondary and quiet. No button keeps the browser's default look.
* **Primitives, then compositions.** Layout comes from a few composable classes (stack, cluster, sidebar, grid) on the existing tokens, with no JavaScript. A screen is a composition of them.

### Consequences

* Good, because an interviewer no longer adds minutes up, and a plan cannot pass the length without a visible choice.
* Good, because a new feature has to say which decision it adds and how often it is made before it gets a place on a screen.
* Bad, because a role's length is a new pack field, so the pack format and its schema change.
* Bad, because the Minutes box on each activity page goes, and interviewers who used it change minutes in the run of show instead.
* Neutral: `test/pack/css.test.js` or a new browser test gains a budget per screen for visible controls and bordered surfaces, and fails on a decision with two controls.
