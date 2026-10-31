---
status: accepted
date: 2026-10-30
---

# Compose rounds from presets, turn an activity off at 0 minutes, and let time change scope, never the bar

## Context and Problem Statement

A round was a fixed list of segments, so an interviewer could not run a mix of the activities a role uses, or give one less time than its author planned. Cutting an activity's time also left the whole checklist on screen, so a blank row read as a miss the time never allowed. How can an interviewer run any mix for any minutes, and see what is fairly expected in that time, without a new pack round per mix, without lowering the bar, and with interviews saved by 1.0.2 still opening as they were?

## Considered Options

* Keep rounds as presets and compose at runtime: the preset's segments, then every other activity in the role's rounds at 0 minutes. Off is 0 minutes, shared through the `segment.minutes` put that already exists.
* A new event that lists the plan's activities. Rejected: every older copy of the kit rejects an unknown event, and a list needs its own merge rule where a register per segment already has one.
* A pack round for every mix. Rejected: four activities make fifteen mixes, and the minutes would still be fixed.
* Lower the expected level when time is short. Rejected: it turns time into a judgment about the candidate, and the kit computes no level.

## Decision Outcome

Chosen option: "Compose at runtime, off as 0 minutes", because the `open` event keeps the preset's id, segment ids stay the preset's, and a session with no plan events reads as it always did.

* `composeRound` adds the role's other activities before the frame that closes a round. A preset of frames alone learns which frame closes from the role's other rounds. A preset's own minutes win as an activity's full minutes, then the first of the role's rounds that gives it some, then its file.
* `runOfShow` returns `steps` and `all`. `steps` leaves out an activity that is off until something is asked in it, and `all` keeps it, so a link or a card still opens it, and next and previous step from it by its place in the round.
* One new put, `session.length`, holds the total the start page planned. It is written only when the plan differs from the preset, since 1.0.2 rejects the key and the time meter reaches the same total without it. `foldShared` now ignores a key it does not know, so a later key cannot blank a start page.
* A plan that differs from its preset is named Custom everywhere the round is named, from one `planName`.
* Scope follows time, not the bar. Below an item's `coreBelow`, only its `core` rows stay on the checklist. The rest fold under Out of scope, stay markable, and a row left blank reads Out of scope, which counts neither way. A marked or nudged row keeps its place. Below `floor` the kit warns and does not block. Levels and decisions do not change with time.

### Consequences

* Good, because a pack author writes presets and row scope, and every mix follows from them.
* Good, because a saved interview needs no migration.
* Bad, because a colleague on 1.0.2 stalls in a room whose plan was changed, since it rejects `session.length`. Everyone sharing such an interview has to move to 1.1.0 together.
* Bad, because a row's state now depends on a shared number that can change after it was read, so a summary can move when a colleague edits the minutes.
