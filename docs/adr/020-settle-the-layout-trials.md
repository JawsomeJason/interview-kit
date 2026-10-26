---
status: accepted
date: 2026-10-26
---

# Settle the layout trials on one setup page, header, sidebar and question layout

## Context and Problem Statement

Supersedes ADR 008.

ADR 008 put the question layout on trial, and the setup page, header and sidebar joined it, each with up to four variants behind a Try layouts panel. The maintainer has now run real interviews on them and picked. What does the kit keep?

## Considered Options

* Keep one of each, taking the best part of a loser into the winner where it earned it.
* Keep every variant as a user preference. Rejected for the reason ADR 008 gave: more code and tests for a choice that only needs making once.

## Decision Outcome

Chosen option: "Keep one of each".

* Setup page: the calm form (A), with the Your hour plan from the plan preview (C) under the round.
* Header: the cockpit (B), with the quiet bar's menu (A) as its Menu.
* Question page: the dock (B), its dock only as tall as its content, and the page centered: the question column in the middle of the window, the sidebar beside it.
* Sidebar: Now and next (C), with the rest of the plan open and drawn as a run of show (B), and All questions as a search dialog.

The Try layouts panel, its feedback notes, the Setup line in Copy summary and `npm run tally` go with the trials. Saved prefs drop the trial picks and notes on load and keep the scheme, theme and phone tab. The theme switch moves into the header's Menu.

### Consequences

* Good, because one layout means one set of styles and tests.
* Bad, because a pick made on a few interviews may still miss a case; a new trial would need the panel back.
