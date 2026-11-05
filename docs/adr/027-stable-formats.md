---
status: accepted
date: 2026-11-05
---

# Keep the evidence log, the evidence file and CLI JSON readable across versions by adding, never changing

## Context and Problem Statement

The event schema is `v: 2`, every event type is a fixed `const`, and every type has `additionalProperties: false`. That strictness is what keeps a score out of the log (ADR 022). It also means a kit refuses any file that holds a type or key it does not know: 1.0.2 stalls on 1.1.0's `session.length` (ADR 026). The guided course needs new events, a second opinion will write evidence files, and `simulate --json` will be read by agents. `migrate` upgrades packs only. How do saved interviews keep opening, and how does each new kind of fact arrive, without loosening the no-score rule?

## Considered Options

* Keep every known type strict, accept a type the kit does not know through one catch-all, and grow the log by new types only. A breaking change bumps `v` and is upgraded by `migrate`.
* Drop `additionalProperties: false`, so a known type accepts new fields. Rejected: the strict shapes are what keep a score field out of the log, and `test/evidence/schema.test.js` proves that field by field.
* Also accept unknown keys on `put` and `member`. Rejected: a register's key is exactly where a score would hide (`score.alex.css`), and the check refuses those cases by name.
* Keep refusing what the kit does not know, and ask everyone in a room to upgrade together. Rejected: that is the 1.1.0 stall, at every release.

## Decision Outcome

Chosen option: "Strict known types, a catch-all for unknown ones, growth by new types", because a newer file opens in an older kit, and nothing the older kit reads can carry a score.

This covers three formats: the event log (`src/evidence/event.schema.json`), the evidence file (`src/evidence/bundle.js`: `kit`, `v`, `author`, `pub`, `prv`), and every CLI `--json` output.

* **Additive by default.** Never rename, retype, narrow or reuse a field, key or value. A kit checks each event type it knows exactly, so a new field, key or enum value on a known type makes an older kit refuse the whole file. The log therefore grows by new types only. A fact that needs a field an existing type lacks gets a new type: `skip` is its own type, not a reason on `segment.done`. The evidence file's envelope and CLI JSON may also gain optional fields, since their readers ignore keys they do not know.
* **Tolerant reader.** The schema's top level is `pub`, `prv` or `newer`. `newer` is an event whose type matches `^[a-z][a-z0-9.-]{0,63}$` and is not a known type, so a known type that fails its own shape never slips through. Only its `n` and `h` are checked, and its size: at most 32 KiB of JSON, so like every event this kit writes it fits one 48 KiB sync page whole. A known type is bounded in characters, not bytes, and JSON writes a control character as six bytes, so a note at the schema's limits (a 200-character scope and 8,000 control characters) is 49,263 bytes, past a page. The writer refuses any event over 32 KiB, and the note box drops control characters, so the kit never writes one that size. A file from elsewhere that holds one still opens, but sync may not carry it across a relay. It keeps its position, so the stream stays gap-free; that `n === i` check is the file's chain. Folds skip it, the debrief timeline shows it as "did something from a newer kit", and the summary renders from what the kit knows. Nothing reads its other fields, so a score in one reaches no screen, summary or AI packet. The writer stays strict: `append` writes only types in `STREAM_OF`.
* **Tolerance starts with 1.2.0.** 1.1.0 and earlier refuse a file that holds any type or field added here. A room that shares such a log moves to 1.2.0 together, this last time.
* **Breaking change.** Bump `v` in the `open` event and in the file envelope, and freeze the new schema at `test/fixtures/schemas/event.v<N>.json`. `migrate` learns to upgrade evidence. It reads the old file and writes a new one beside it, and never rewrites the old file in place. The new log opens with an `open` at the new `v`, followed by a `migrated` event that names the old file's `v` and author. Nothing here breaks `v: 2`, so `migrate` has no evidence path yet.
* **Card ids.** A mark's ref is `<card id>#<row>`. A card's id is its frontmatter `id`, so a renamed or moved file keeps it, and `matchId` checks it against the file name. A pack's storage id survives through `earlierId`. A card the pack no longer has shows under "Retired cards" in the summary, by its ref, with its marks kept in the log.
* **CLI JSON.** Each command's `--json` output has a published JSON Schema and a top-level `v`, under the same additive rule. A field may be added, and a removal or change bumps `v`.
* **The check.** `test/evidence/schema.test.js` holds each format to its frozen copy. For events, every frozen branch must stay word for word, a new branch must be a strict shape whose `t` is one new type, nothing outside the branches may change, and `newer`'s list, the branches and `STREAM_OF` must name the same types. For CLI JSON, the schema may only widen. A change that fails either test needs a `v` bump. `test/evidence/corpus.test.js` opens real files saved by v1.0.2 and v1.1.0, which `scripts/evidence-corpus.mjs` made by driving each tag's build in Chromium, and compares each summary with the one committed beside the file.

New events, all under this rule:

* `segment.start` (pub): `seg` and `cards`, the questions listed when a segment started. From then on a pool change only adds cards after these.
* `segment.done` (pub): `seg`, plus `id` for one of its cards. A step is finished.
* `skip` (pub): `seg`, optional `id`, and `reason`: `no-time`, `covered` or `not-relevant`. The latest `segment.done` or `skip` for a step is its state.
* `amend` (prv): `seg` and optional `id`, logged before the first edit to a finished step each time the interviewer comes back to it. The marks and notes on that step that follow it are amendments, and the originals stay in the log.
* `bookmark` (prv): a one-tap stamp, with an optional card `id` and an optional single `word`. Something worth a mark happened here; a second opinion lines the transcript up by it.
* `marking` (prv): `by`, `self` or `ai`, how this interviewer fills their marks, chosen on the start page. `self` ticks them during the call; `ai` leaves the Look-fors as prompts and takes a second opinion's proposals after the decision (ADR 028). The latest wins.
* `mark` gains `src`: `self` (also when absent), `ai` for a second opinion's proposal, or `accepted` for a proposal the interviewer accepted. With `ai` or `accepted`, a mark may carry `quote` and `at`, the transcript time as `m:ss` or `h:mm:ss`. This changes a known type, which is allowed only because it lands in 1.2.0 with the rule itself. `test/fixtures/schemas/event.v2.json` freezes the schema as of 1.2.0.

A decision needs no new event. The first `decide` is the blind decision, and a later one is a revision that keeps it, which the debrief labels before or after the first `peek` at a colleague. A second opinion's file carries `decided` with no `decide`, so the gate releases its marks once the interviewer has decided, and never before.

### Consequences

* Good, because a file from a newer kit opens, merges and summarizes in any kit from 1.2.0 on.
* Good, because the no-score guarantee still holds for everything a kit reads.
* Bad, because a kit can no longer tell a damaged event of an unknown type from a real one. It keeps both and reads neither.
* Bad, because a fact that would fit as one more field becomes a new type, and each reader folds it on its own.
