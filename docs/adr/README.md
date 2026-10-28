# Architecture decision log

Each record follows the MADR minimal format, as ADR 000 explains. A record names the options that lost and why. Statuses are `proposed`, `accepted`, `experimental` and `superseded by NNN`.

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [000](000-record-architecture-decisions.md) | Record architecture decisions in the MADR minimal format | Accepted | 2026-10-22 |
| [001](001-plain-js-single-file-build.md) | Build one offline HTML file from plain JavaScript | Accepted | 2026-10-22 |
| [002](002-questions-as-markdown-files.md) | Keep each question in its own Markdown file | Accepted | 2026-10-22 |
| [003](003-score-by-ticked-look-for-items.md) | Score by ticking three Look-for items, and hide the score until review | Superseded by 022 | 2026-10-22 |
| [004](004-deep-dive-pick-rule.md) | Pick deep dive questions with a greedy rule weighted to the main pool | Accepted | 2026-10-22 |
| [005](005-interview-state-in-local-storage.md) | Keep one interview's state in localStorage | Superseded by 022 | 2026-10-22 |
| [006](006-test-acceptance-criteria-with-vitest.md) | Test each acceptance criterion with Vitest, red first | Accepted | 2026-10-22 |
| [007](007-stable-question-layout.md) | Hold every control in a fixed place with an app-shell grid | Accepted | 2026-10-22 |
| [008](008-layout-trial-columns-vs-dock.md) | Trial two question layouts before picking one | Superseded by 020 | 2026-10-22 |
| [009](009-one-phone-layout.md) | Use one phone layout below 760px for every desktop layout | Superseded by 018 | 2026-10-22 |
| [010](010-hints-with-invoker-popovers.md) | Show hints as popovers opened by invoker buttons | Accepted | 2026-10-22 |
| [011](011-css-cascade-layers-and-tokens.md) | Organize CSS in cascade layers with tokens and class-only components | Accepted | 2026-10-22 |
| [012](012-light-and-dark-color-schemes.md) | Support light and dark with `light-dark()` tokens | Superseded by 014 | 2026-10-22 |
| [013](013-shadow-sync-over-webrtc.md) | Try live shadow sync over a WebRTC data channel, behind a build flag | Superseded by 025 | 2026-10-22 |
| [014](014-color-tokens-on-system-colors.md) | Build color tokens on browser system colors | Accepted | 2026-10-23 |
| [015](015-no-open-props-base-tokens.md) | Keep our own tokens instead of adopting Open Props | Superseded by 016 | 2026-10-23 |
| [016](016-open-props-for-non-color-scales.md) | Adopt Open Props for the non-color scales, with colors in a system theme | Accepted | 2026-10-23 |
| [017](017-no-left-accent-stripes.md) | No colored left-border accent stripes | Accepted | 2026-10-23 |
| [018](018-breakpoints-in-ch.md) | Set page breakpoints in ch from a measured width sweep | Accepted | 2026-10-23 |
| [019](019-content-pack-depends-on-the-app.md) | Keep a private content pack in its own repo that builds through the app's CLI | Accepted | 2026-10-24 |
| [020](020-settle-the-layout-trials.md) | Settle the layout trials on one setup page, header, sidebar and question layout | Accepted | 2026-10-26 |
| [021](021-pack-format-2-with-segment-kinds.md) | Describe an interview process as pack format 2, run by segment kinds | Accepted | 2026-10-27 |
| [022](022-evidence-log-blind-until-decided.md) | Record evidence as an append-only log per interviewer, blind until both have decided | Accepted | 2026-10-27 |
| [023](023-layer-look-for-by-hiring-level.md) | Lay out Look for rows by their level against the role's hiring level | Accepted | 2026-10-27 |
| [024](024-optional-plugins-behind-a-build-flag.md) | Leave optional plugins out of a build with one flag | Accepted | 2026-10-27 |
| [025](025-sync-over-a-relay-with-admission.md) | Sync a room's logs over public relays, upgrading to direct links, with admission and sealed messages | Experimental | 2026-10-27 |

Plans for work not yet decided or started live in [`docs/plans/`](../plans/).
