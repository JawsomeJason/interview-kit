# Plan: compare ticks after the call

Status: not decided. An alternative to live shadow sync (ADR 013), or a fallback if the two-laptop test fails.

## Goal

After the interview, the two interviewers compare which Look-for items each one ticked, without seeing each other's ticks during the call. Each person judges alone, and the comparison afterwards shows where they agree. That is better for calibrating interviewers than a live view, which can sway the shadow while the answer is still coming.

## How it works

1. After the call, each interviewer copies their ticks with a new "Copy ticks" button. Copy summary can't be reused for this: it includes the notes.
2. One person pastes the other's ticks into a box on the Deep dive review page.
3. For each Look-for item on each question, the review shows one of these states:
   - **Agree:** both ticked it, or neither did.
   - **Only me:** I ticked it, they didn't.
   - **Only them:** they ticked it, I didn't.

Only ticks are pasted, never notes. Nothing leaves either laptop except the text the two people choose to share.

## Size

About 20 lines on top of what exists: copy and parse the ticks, compare them per item and render a marker. It works offline and needs no build flag, since it sends nothing over the network.

## Order

1. Write a failing test for each state (agree, only me, only them) through a public compare function with literal ticks.
2. Add the Copy ticks button, the paste box and the markers to the Deep dive review list.
3. Decide whether the pasted ticks are kept in localStorage or dropped on reload.

## Open questions

- Paste format: readable text, or a compact code like sync's `IK1.` pairing code? Parsing titles back out of text was rejected once before (ADR 005), which points to a code keyed by question id.
- If live sync passes its test, is compare-after still worth having for calibration, or does one feature replace the other?
- Should the review show the other person's score word, or only per-item agreement, to keep the talk on what was observed?
