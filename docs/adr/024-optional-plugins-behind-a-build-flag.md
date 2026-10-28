---
status: accepted
date: 2026-10-27
---

# Leave optional plugins out of a build with one flag

## Context and Problem Statement

Some parts of the kit are optional: keyboard shortcuts, the tab timer, Pop out, the AI second opinion and sync. v0.10 had a sync-only switch, `VITE_SYNC`, with its own scripts and its own output folder, and every other extra was always in. A team that does not want live sync, or any other extra, should be able to build without it and be sure no byte of it ships. How does a build leave a plugin out?

## Considered Options

* One mechanism for every plugin: `interview-kit build --without <name>[,<name>]` or `"plugins": { "<name>": false }` in `pack.json`, served to the app as the generated module `virtual:plugins`.
* Keep `VITE_SYNC` for sync and add an environment variable per plugin. Rejected: a switch per plugin, each with its own scripts and its own way to be wrong.
* A runtime setting that hides a plugin. Rejected: the code would still ship, and the point for sync is that a build without it holds none of its code.

## Decision Outcome

Chosen option: "`--without` and `pack.json` plugins, through `virtual:plugins`", because a plugin left out is never in the module graph, so the bundler cannot include it.

* Plugins are the folders under `src/plugins/`, found by listing it. Each has an `index.js` entry and reaches the app only through the plugin API in `src/ui/session.js`.
* A plugin is out if either the flag or `pack.json` says so; neither can switch one on. An unknown name fails with the list of plugins.
* `test/build/plugins.test.js` builds everything, `--without sync`, and a copy with the sync folder deleted. Each plugin's marker is in the full build; the `--without sync` file has no sync code and is byte-identical to the deleted-folder build, so leaving sync out costs nothing.

This replaces the `VITE_SYNC` flag, `dev:sync` and `build:sync` from ADR 013.

### Consequences

* Good, because one rule covers every plugin, and the size test proves a left-out plugin adds 0 bytes.
* Good, because the core never names a plugin, so adding one edits no core file.
* Bad, because a plugin cannot reach anything the plugin API does not offer, so a new plugin may need the API to grow first.
