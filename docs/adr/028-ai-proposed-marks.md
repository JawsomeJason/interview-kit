---
status: accepted
date: 2026-11-05
---

# Let a second opinion propose marks after the interviewer's own read, and keep each accepted one marked as such

## Context and Problem Statement

ADR 003 had the interviewer tick Look-for rows during the call, and ADR 022 kept those marks blind until everyone decided. Some interviewers would rather listen than tick. They still want the Look-fors in view, as prompts for the conversation, and they want a complete record afterwards. A second opinion can now read the call's transcript and mark every row with a quote and a time: the pack's `/second-opinion` skill writes that as an evidence file (ADR 027 gave marks `src`, `quote` and `at`). The interviewer will lean on that read. How do those marks reach the record without replacing the interviewer's own judgment, and without the kit ever talking to an AI?

## Considered Options

* The second opinion arrives as a colleague's evidence file whose marks carry `src: ai`. It opens only after the interviewer's own decision, as proposals the interviewer accepts, changes or rejects one by one, each answer a mark of their own.
* The kit calls an AI service itself with the transcript. Rejected: the kit is one offline file that sends nothing anywhere (ADR 001), and a call would need keys, a network and consent the kit cannot check.
* Import the AI's marks straight into the interviewer's own log. Rejected: nobody can then tell the interviewer's read from the AI's, and nobody writes anyone else's log (ADR 022).
* Show the proposals before the interviewer decides, to help them decide. Rejected: the decision would anchor on the AI's read, which is the bias ADR 022's blindness exists to stop.
* Put the AI's hire call and level in the file next to its marks. Rejected: a decision in the file would show the interviewer what to decide; the skill gives its call in its own report, outside the kit.

## Decision Outcome

Chosen option: "A colleague's file, opened after the interviewer's own decision, as proposals answered one by one", because the interviewer's read is recorded first and stays in the log, and every mark still says who made it.

* **Marks mode.** The start page asks who fills the marks: "AI fills from the transcript" (Listen mode) or "I'll tick". The choice is logged as a `marking` event (`by: ai` or `self`), the latest one wins, and the start page remembers it on that laptop. In Listen mode the Look-for rows show as prompts under Steer toward, with no checkboxes and no number keys; the interviewer moves along the course, bookmarks moments and writes notes.
* **Your read first.** Decide is three steps: record your read, get a second opinion, review its marks. The first decide is the blind decision. Nothing from the AI shows until it is in the log, and the gate (ADR 022) opens the file's private events only then, since the file carries `decided` with no `decide`.
* **The kit never connects to an AI.** Get a second opinion copies the run info (role, round, candidate, start time, cards asked). The interviewer runs `/second-opinion` outside the kit with it and the transcript, then adds the file it writes with Add a colleague's evidence.
* **Proposals.** Each AI mark shows with the row's words, its quote and transcript time, and the interviewer's bookmarks on that card. Accept logs the AI's state as the interviewer's mark with `src: accepted`, keeping the quote and time. Change logs the other state with `src: self`. Reject logs what the row held at the decision, or a clear, with `src: self`, so the original read stands. Every answer comes after the first decide, so the decision always precedes any accepted mark. An answer is not an `amend`: it changes no finished step.
* **Revision.** Showing the proposals logs a `peek` at the second opinion. A later decide is a revision that keeps the first, and the debrief labels it "revised after the second opinion".
* **Provenance.** The summary, the debrief and Copy summary say "accepted from the second opinion" beside an accepted mark, and "proposed by a second opinion" beside the AI's own. A mark with no `src` is the interviewer's.

This amends ADR 003: a mark is no longer only a tick the interviewer makes during the call; in Listen mode it can be the interviewer's acceptance, after the call, of a reading of the transcript. It amends ADR 022: the interviewer's own decision gates every AI mark as well as colleagues' evidence, and it is always logged before any accepted mark.

### Consequences

* Good, because an interviewer can listen during the call and still end with a complete record, with their own read recorded first and kept.
* Good, because a colleague can see which marks were accepted from a second opinion, and whether the decision was revised after it.
* Bad, because the review is a second sitting after the call, one tap per row.
* Bad, because the kit cannot check how good the transcript or the second opinion was; it shows the quote and time so the interviewer can.
