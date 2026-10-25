---
status: accepted
date: 2026-10-22
---

# Keep one interview's state in localStorage

## Context and Problem Statement

One interviewer runs one interview at a time from a local file. The kit has to remember the round, the deep dive setup, ticks, notes and done flags across a reload. Afterwards the results need to reach the interviewer's own notes document. Where does state live, and how does it leave the kit?

## Considered Options

* One localStorage key for one interview, with a plain-text Copy summary for export.
* IndexedDB. Rejected: an async API and more code for a few hundred bytes.
* Restore an interview from a pasted summary. Rejected: parsing titles back out of text is fragile, and the first kit needed hidden encoded blocks to make it work.
* Several saved sessions. Rejected: not needed while one interviewer runs one interview at a time.

## Decision Outcome

Chosen option: "One localStorage key and a plain-text summary", because it needs no server and no format beyond what a person reads.

`src/store.js` saves `{ round, deepDive, ticks, notes, done }` under the key `interview-kit`. Layout and color scheme preferences live under a separate key, `interview-kit-layout`, so starting a new interview keeps them.

New candidate clears ticks, notes and done flags and keeps the setup. New candidate and Change round both offer Undo for 10 seconds. The undo snapshot lives in memory only.

### Consequences

* Good, because state survives a reload with no setup.
* Bad, because state lives in one browser profile. A private window loses it on close.
* Bad, because Chrome gives every page opened from `file://` the same localStorage, so another local HTML file can read the notes. A test that opened three local files in one Chrome profile measured this: all three shared one localStorage.
