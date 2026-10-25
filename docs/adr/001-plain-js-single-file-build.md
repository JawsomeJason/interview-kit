---
status: accepted
date: 2026-10-22
---

# Build one offline HTML file from plain JavaScript

## Context and Problem Statement

An interviewer opens the kit during a call and has no time for setup. The page is small: a round script, a deep dive planner and a question view with ticks and notes. The first kit became hard to change, and the rebuild's top rule is "don't overcomplicate". What should the kit be written in, and what should the build produce?

## Considered Options

* Plain JavaScript modules, built by Vite with `vite-plugin-singlefile` into one `dist/index.html`.
* A UI framework such as React. Rejected: weight and setup the page does not need.
* A server-rendered app. Rejected: an interviewer would need a running server or a hosted URL, where a file is enough.
* A hand-written script that concatenates the sources. Rejected: no dev server and no hot reload while editing questions.

## Decision Outcome

Chosen option: "Plain JavaScript with Vite and `vite-plugin-singlefile`", because it gives hot reload while writing and, at the end, one self-contained file that opens from `file://` with no network.

Views follow the same idea. Each one is a plain function that returns an HTML string, plus a bind function only where the view handles events. A piece of markup moves into its own function in `src/components/` on its second use, not before. Extracting earlier was rejected, since it guesses at reuse that may never come.

### Consequences

* Good, because the build output can be shared as a file and opened from disk.
* Good, because the only runtime dependency is `marked`, so there is no framework to upgrade.
* Bad, because rendering by string means escaping is manual: every interpolated value has to go through `esc()`.
