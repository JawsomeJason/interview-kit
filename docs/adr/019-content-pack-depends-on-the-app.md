---
status: accepted
date: 2026-10-24
---

# Keep a private content pack in its own repo that builds through the app's CLI

## Context and Problem Statement

The app reads its questions, rounds, intro and outro, and an optional brand theme from a content pack: a folder whose path sits in `KIT_PACK` (ADR 002). A team's real pack is private, since its Look for bullets are an answer key a candidate could study. The app itself should be public and run on its own. Where does a private pack live, and how does it become a built kit?

## Considered Options

* The pack is its own repo. It depends on the app by git tag and runs the app's `interview-kit` CLI with itself as the pack.
* Clone the pack beside the app and point the app's build at it with `KIT_PACK`. Rejected: building a kit takes two clones in fixed places, and nothing records which app version built it.
* Pull the pack into the app as a git submodule. Rejected: the public repo would record the private repo's URL in every commit, and submodules trip up fresh clones and worktrees.
* Publish the app to an npm registry and depend on a version. Rejected: every release becomes a publish with registry credentials, where a git tag pins the app as exactly.
* Give the pack repo its own copy of the Vite config. Rejected: two copies of the build config drift apart, and the app's tests no longer build what the pack builds.
* Layer a private pack over the sample pack. Rejected: a real pack has no use for sample questions, and Vite's globs are static, so layering needs a merge step before every build.
* Have the CLI call Vite's and Vitest's programmatic API instead of spawning their CLIs. Rejected: it needs the same change of working directory plus a hand-written flag table that mirrors Vite's CLI.

## Decision Outcome

Chosen option: "The pack is its own repo", because the build config stays in one place, the app, and each kit builds on an exact app version that the pack repo pins.

A pack repo holds the pack at its root and names the app as a dependency on a tag, for example `"interview-kit": "github:<owner>/interview-kit#v1.0.0"`. Its `dev`, `build` and `test` scripts call the CLI:

* `interview-kit <dev|build|test> [--pack <dir>] [--outDir <dir>]`. Other flags pass through to Vite or Vitest.
* `--pack` defaults to the current folder and must hold a `pack.json`. `--outDir` applies to `build` and defaults to `./dist`.
* The CLI starts Vite or Vitest with the app's folder as the working directory and the pack's absolute path in `KIT_PACK`. The app's own npm scripts already run that way, so nothing in the config, plugins or tests changes shape.
* `test` runs the app's pack-facing checks (content shape, CSS and theme) against the pack.

The CLI wraps the app's own build rather than having the app read a sibling folder, because a sibling folder leaves the pairing to whoever clones what where. A dependency on a tag makes the pairing part of the pack repo: one clone and `npm install` give a pack author the exact app it was built and tested against. `pack.json` carries a `format` integer that `src/content.js` checks, so a pack and an app that disagree fail with a plain message.

The public app ships `sample-pack/`, a generic pack with one round, the intro and outro, and two small pools of web questions. It is the default when `KIT_PACK` is unset, the fixture set for the test suite, and what a fresh clone runs. A private pack replaces it whole.

### Consequences

* Good, because a pack author clones one repo, and upgrading the app is a one-line tag bump.
* Good, because the app stays public and runs alone on its sample pack.
* Good, because `KIT_PACK` remains the one seam. Working on the app and a pack together means `KIT_PACK=<path to the pack> npm run dev` from an app checkout, or `npm link`.
* Bad, because the build tools (Vite, its single-file plugin, Shiki and Vitest) become runtime dependencies, so every pack install pulls them.
* Bad, because Vite writes glob keys relative to `src/`, so the same pack built from a pack repo and from an app checkout differs in those key prefixes. A comparison of two kits has to normalize them.
* Neutral: the supported layout is the pack at its repo's root, where npm's hoisted dependencies fall inside the folders Vite's dev server may serve.
