---
status: accepted
date: 2026-10-22
---

# Keep each question in its own Markdown file

## Context and Problem Statement

Questions are the part of the kit that changes most. The first kit kept them in JSON with rubric anchors, hints and probes, which was hard to edit by hand and kept inviting new fields. Where should questions, round scripts and the shared intro and outro live, and how does the app read them?

## Considered Options

* One Markdown file per question, with a short frontmatter block, read at build time.
* Keep the old JSON as the source. Rejected: hard to edit by hand, and its shape invited the complexity the rebuild dropped.
* A content management system. Rejected: a service and an account for content one person edits in a text editor.
* A frontmatter library such as `gray-matter`. Rejected: it needs Node's `Buffer`, which the browser build does not have.

## Decision Outcome

Chosen option: "One Markdown file per question", because a question is then one file anyone can open, edit and diff.

Each question is `pools/<pool>/<id>-<slug>.md`. Its frontmatter holds `id`, `pool`, `poolName`, `title`, `minutes` and `tier`. Its body has the sections Ask, Look for and Follow-ups. Rounds live in `rounds/*.md`, and the shared intro and outro in `parts/intro.md` and `parts/outro.md`. These folders sit inside a content pack, the folder named in `KIT_PACK` (`sample-pack/` by default), and a private pack lives in its own repo (ADR 019). `src/content.js` loads every file as a raw string with `import.meta.glob` and reads the frontmatter with a parser of about a dozen lines.

The old JSON was converted once by a one-time import script that is not part of this repo. An LLM condensed each question's rubric anchors into three Look-for bullets during that import.

### Consequences

* Good, because adding a question means adding a file, and the dev server reloads on save.
* Good, because the content moves into a pack of its own without changing its format (ADR 019).
* Bad, because the parser reads only flat `key: value` lines. Nested frontmatter would need a real parser.
* Neutral: `test/pack/content.test.js` checks every file's shape, in place of a schema.
