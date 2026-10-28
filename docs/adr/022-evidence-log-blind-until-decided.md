---
status: accepted
date: 2026-10-27
---

# Record evidence as an append-only log per interviewer, blind until both have decided

## Context and Problem Statement

v0.10 kept one interview as a mutable blob in localStorage and turned ticks into a score word: Weak, Solid or Strong. A score invites anchoring and adding up, and a live view of a colleague's ticks sways the other interviewer while the answer is still coming. Several interviewers now share one interview, sometimes across laptops. How should the kit record what each person saw, keep each judgment independent, and still merge everyone's evidence for the debrief?

## Considered Options

* One append-only log per interviewer per session, with a public stream for plan facts and a private stream for judgment, kept in IndexedDB, and private events released only once both sides have recorded a decision.
* Keep the localStorage blob and the score word (ADRs 003 and 005). Rejected: the score is a number the kit should not compute, and one mutable blob cannot merge two people's work.
* A shared document that everyone edits, such as a CRDT library. Rejected: it shows everyone's marks to everyone as they happen, and the per-author logs already merge with a deterministic fold, with no library.
* Release evidence after the call on a timer or a button. Rejected: it relies on people remembering to wait, where a decision is a fact the log already holds.

## Decision Outcome

Chosen option: "An append-only log per interviewer, blind until decided", because nobody writes anyone else's log, so there is nothing to lock or reconcile, and blindness becomes a rule about events rather than a promise in the UI.

* A press on a Look for row marks it seen, or clears it. Nudges given, Not seen and stretch prompts asked are their own gestures. A row's state (seen, seen after a nudge, not seen, not marked, not asked) is derived from the order of events, never stored, and never added up. There is no score, ratio or computed placement anywhere.
* Each event carries its position in its stream and a hybrid logical clock stamp, so the logs merge in order even when laptop clocks disagree.
* `src/evidence/store.js` is the only code that touches storage. Appends never overwrite. One window writes an author's log at a time through a Web Lock; a second window opens read-only, can take over, and becomes the writer by itself once the first window closes. A write the browser refuses carries on in memory with a warning bar until it can be saved.
* `src/evidence/gate.js` holds all of blindness: a colleague's private events are served, merged or shown only when I have decided and they have decided. Kinds and plugins never see the store or the gate; a lint rule enforces it.
* Share my evidence writes a file of my events, the private ones only after my decision, so a debrief merges without sync. Decided sessions are deleted from the laptop after `retentionDays` (30 by default), with a warning and Keep first.

Supersedes ADR 003, the score word. Supersedes ADR 005, the one localStorage blob.

### Consequences

* Good, because each interviewer decides on their own evidence before seeing anyone else's, and the merge shows where they saw different things.
* Good, because the debrief can replay who saw what and when from the logs alone.
* Bad, because a reader has to learn the row states, where a score word was one glance.
* Bad, because the file exchange can only require the sender's decision; the recipient's laptop holds the file before its gate lets them read it.
