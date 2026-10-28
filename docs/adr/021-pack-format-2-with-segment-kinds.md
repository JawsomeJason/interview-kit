---
status: accepted
date: 2026-10-27
---

# Describe an interview process as pack format 2, run by segment kinds

## Context and Problem Statement

Format 1 knew one interview shape: an intro, a round script, a deep dive of question cards, then an outro. Every card had exactly three Look for bullets and no levels, and the browser parsed raw Markdown with regular expressions at run time. A team that hires at several levels, runs a take-home style exercise, or interviews designers or SREs had to bend its content into that shape. How should a pack describe its process so the app runs it with no code written for that pack?

## Considered Options

* Format 2: YAML frontmatter and a small heading grammar, a ladder of levels, competencies, roles and rounds as pack data, and each round a list of segments run by a segment kind (`script`, `questions`, `exercise`).
* Keep format 1 and add optional fields. Rejected: the fixed round shape, `parts/` as a special folder and the three-bullet rule are in the format itself, and every new field was one more special case in the parser.
* JSON or YAML files for everything. Rejected: authors write and review prose, and the grammar keeps a card readable as a document.
* Parse Markdown in the browser as before. Rejected: a typo surfaced as a missing row in the middle of an interview instead of a line-numbered error before the build.

## Decision Outcome

Chosen option: "Format 2 with segment kinds", because one grammar covers cards, exercises and scripts, and the app learns a new kind of segment by adding a folder under `src/kinds/`, not by changing the core.

* `pack.json` holds `{ "format": 2 }` and options. `ladder.md` lists the levels lowest first. `competencies.md` names what the evidence is about. `roles/` give each role its hiring level, rounds and decision options, so a pack writes its own Hire and No hire wording.
* A round is YAML frontmatter only, with a `run:` list. Each entry names one segment kind and what it runs, with its minutes.
* Under `## Look for`, each `### <level>` heading holds bullets, each an observable with optional `#competency` tags and nested `- Label: text` lines (`Nudge:`, `Show it:`, `Fallback:`). `## Stretch` holds prompts by level the same way. Every non-blank line lands in a field, or the check names its file and line and the nearest shape that would pass.
* `src/pack/` reads the pack once, in Node, and ships the result to the browser as JSON through `virtual:pack`. `interview-kit check` runs the same reader and reports every problem; `--strict` turns a pack's house rules into errors.
* `interview-kit migrate` moves a format 1 pack to format 2 and proves that no author's words changed. A format 1 pack opened by this app gets one message that says to run it.

This amends ADR 002: questions still live one per Markdown file, but frontmatter is YAML, `pool` and `poolName` move to the pool folder, and Look for follows the level grammar instead of exactly three bullets.

### Consequences

* Good, because a pack for designers, SREs or any ladder runs with no app change, and the sample pack shows three levels.
* Good, because a broken pack fails the build with a line number, before anyone opens it in an interview.
* Bad, because the reader, the schemas and the migration are more code than the old regular expressions.
* Bad, because every existing pack has to run `interview-kit migrate` once.
