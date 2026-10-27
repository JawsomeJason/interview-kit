# Interview kit

A small page for running an interview. Pick a round, then read its script. On the Deep dive page, set the minutes and check pools in order of focus. The kit picks questions that fit and lists them in the sidebar.

- Run `npm install`, then `npm run dev` for a hot-reloading server. Saving any `.md` file reloads the page. `npm run dev:lan` also serves it on your local network (phones, other machines); it exposes the dev review endpoint to that network too, so use it only on a trusted network.
- Run `npm run a11y` to build, serve `dist/` on a free port and scan the main screens with axe-core in light and dark, desktop and phone; it fails on any violation. `npm run verify` runs the tests, then that. CI (`.github/workflows/ci.yml`) runs `npm run verify` on every push.
- Run `npm test` to check the pick rule, the question pager and every pool and round file in `test/`.
- Experimental shadow sync (live ticks between two interviewers over WebRTC, paired by pasting a code each way): `npm run dev:sync` (port 5181) or `npm run build:sync` (writes `dist-sync/`). Plain `dev` and `build` contain no sync code; `npm test` checks that.
- Run `npm run build` to write `dist/index.html`, one self-contained file you can open straight from disk.
- Questions, rounds and the intro and outro live in a content pack, a folder the build reads at build time. `KIT_PACK` names the pack folder, for example `KIT_PACK=../my-pack npm run dev`; without it the build uses `sample-pack/`, a small generic pack. A pack holds `pack.json` (`{ "format": 1 }`), `pools/`, `rounds/`, `parts/` and an optional `theme/*.css` brand theme in `@layer theme.brand`. An optional `"unrankedPools": ["<pool-id>"]` in `pack.json` lists pools that `npm run suggest` never ranks, such as behavioral ones a resume says nothing about. An optional `"a11yExclude": ["<selector>"]` lists elements whose low contrast the pack's theme accepts; `npm run a11y` skips color contrast on them. A pack's theme is always on: the build writes its id onto `<html data-theme>`, and there is no switch. The build stops if the pack's format doesn't match the app's. `npm test` runs against `sample-pack/`. To check another pack's shape, theme CSS and brand name, run `KIT_PACK=<folder> npx vitest run test/pack`, the pack-facing tests in `test/pack/`.
- A pack can also live in its own repo, with this app installed as a git dependency (`"interview-kit": "github:<owner>/interview-kit#<tag>"`). The pack repo's scripts call `interview-kit dev`, `interview-kit build` and `interview-kit test`: the build writes `dist/index.html` in the pack repo, the tests run `test/pack/` against the pack, and the What's new stamp shows the pack repo's commit. `--pack <dir>` names another pack folder, `--outDir <dir>` moves the built file, and any other flag goes to Vite or Vitest. To work on the app against such a pack, run `KIT_PACK=<pack repo> npm run dev` in the app checkout.
- Add or edit a question by dropping `pools/<pool-id>/<id>-<slug>.md` into a pool folder of the pack. Frontmatter: `id`, `pool`, `poolName`, `title`, `minutes`, `tier` (`core` or `stretch`). Body sections: `## Ask`, `## Look for` (exactly 3 bullets), `## Follow-ups`. On the card, the Look for bullets are tick boxes. The score (Weak, Solid or Strong) shows only in the Deep dive list, so it can't bias you mid-interview.
- Edit the shared intro and outro in the pack's `parts/intro.md` and `parts/outro.md`. Frontmatter: `id`, `name`, `minutes`. The sidebar timeline runs Intro, the round, the deep dive, then Outro.
- Edit a round in the pack's `rounds/<id>.md`. Frontmatter: `id`, `name`, `order`, `minutes`, `deepDiveMinutes`. The body is free Markdown. Each round's `deepDiveMinutes` is also a preset button on the Deep dive page.
- The first checked pool is the main focus and gets 60% of the minutes. The other pools split the rest. Each pool takes core questions, then stretch, in file order, while they fit. Leftover minutes go to any remaining question that still fits.

## Reviewing questions

1. Flag a new or changed card with `review: needs-check` in its frontmatter and a `## Review` section at the end of its body: one or more `**Changed:**` blocks with `- **Before:**` and `- **After:**` lines, a `**Check:**` line, and `**Options:**` as a list of at least two. The card shows a Needs check alert and a dot in the sidebar; the sidebar footer lists every flagged card.
2. Run `npm run dev` and open a flagged card. Under the alert, a form (dev server only, never in a build) records your call (clear the flag, change it, or remove the card) and what should change, in the pack's `.review/feedback.jsonl`.
3. `npm run review:pending` prints the feedback not yet applied.
4. Apply each decision to the card and delete its `review` line and `## Review` section; once the flag is gone, its feedback drops off the list. `npm run review:pending -- --done <id>` also marks one applied.

## Tools outside the page

- `npm run suggest -- <resume.txt>` ranks the pools to tick for a candidate through TypeSafe. The key comes from `TYPESAFE_API_KEY` in your shell, and the pack must set `"allowResumeToTypeSafe": true`. `npm run suggest:eval` grades it against your own picks; `docs/plans/pool-suggestions.md` says how.
- `npm run capture` rebuilds the What's new and Help screenshots and clips from `capture/scenes.js`; `capture/README.md` shows how to add one.

## Files

- `docs/adr/` records architecture decisions (log in `docs/adr/README.md`); `docs/plans/` holds plans for work not yet started.
- `src/main.js` renders; `src/router.js` routes on hash changes through the Navigation API, or `hashchange` where it is missing; `src/style.css` declares the CSS layers and holds the reset, tokens and base styles.
- `src/content.js` loads the pack's Markdown through the `@pack` alias set in `vite.config.js` and exports `questions` (with `lookFor` and `followUps` pulled out), `rounds`, `pools` and `parts`.
- `src/store.js` saves `{ round, deepDive: { minutes, pools }, ticks, notes, done, candidate, startedAt }` to localStorage; `src/undo.js` saves through it and keeps the 10-second undo.
- `src/start-time.js` holds `startOptions` (Now and the quarter-hour start slots) for the setup page; `startedAt` is the chosen start, and `src/elapsed.js` counts down to it, then up from it.
- `src/kinds/questions/pick.js` holds `pickQuestions`, `canAdd` and `poolStatus`.
- `src/components/` holds each piece of UI as a render function, a bind function where it needs events, and its own CSS. `setup-page.js`, `header.js` and `sidebar.js` are the setup page, the header and the sidebar; `question-search.js` is the sidebar's All questions dialog. The light/dark scheme and phone tab prefs live in `src/prefs.js` under their own storage key.
- `src/layouts/` has the app shell, the question page's layout and the phone layout.
- `src/plugins/` holds optional extras, one line each in `src/plugins/index.js`; delete a line to drop one. They reach the app only through the small API at the bottom of `src/main.js`. `shortcuts` adds keyboard shortcuts. `tab-timer` puts the interview clock in the tab title: a countdown to the chosen start, then the time since it (New interview stops it until the next start). `popout` adds a Pop out button (Chrome, Edge and Firefox desktop; hidden elsewhere) that moves the whole kit into a small always-on-top window, in the phone layout with that elapsed time pinned top right, to keep over a fullscreen call; closing the window brings it back to the tab.
- `src/sync/` is the experimental shadow sync, only in `dev:sync` and `build:sync`.
- `HELP.md` is the text of the Help page (`#/help`). Each FAQ entry is `### Question? {#id}` followed by a `>` short answer; that short answer is also the text of the ? icon placed with `helpHint('<id>')`, whose More in Help link opens `#/help/<id>`. `npm test` fails on a `helpHint` id the page lacks.
- `src/media/` holds the screenshots and clips for What's new and Help. `CHANGELOG.md` shows them with `![alt](media/<file>)` under a release's `###` headline, and `HELP.md` under an FAQ entry's short answer; both pages render them through `src/components/media.js`, and a file both pages name is inlined once. Capture screenshots at 2x in the default theme with `sample-pack/`, so no real content shows, and save them as WebP. An `.mp4` plays as a silent loop (paused, with controls, under reduced motion), with the `.webp` of the same name as its poster. The build inlines every file, and `npm test` fails on a file neither page names.

Icons (sun, moon, monitor) are from [Lucide](https://lucide.dev), ISC License; the notice is in `src/components/icons.js`.
Spacing, type, line-height and border scales come from [Open Props](https://open-props.style) 1.7.23 (MIT), imported into the tokens layer; colors come from `src/themes/system.css`, and a brand theme is a sibling file in `@layer theme.brand`.
