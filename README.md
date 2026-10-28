# Interview kit

A small page for running an interview. A content pack describes the interview process in plain Markdown: the levels you hire at, the roles, the rounds and what each part of a round runs. The kit runs it as one offline HTML file. Each interviewer marks what they saw against Look for rows laid out by level, records a decision blind, and sees colleagues' evidence only once both have decided. There are no scores anywhere.

- Run `npm install`, then `npm run dev` for a hot-reloading server. Saving any pack file reloads the page. `npm run dev:lan` also serves it on your local network (phones, other machines); it exposes the dev review endpoint to that network too, so use it only on a trusted network.
- Run `npm run build` to write `dist/index.html`, one self-contained file you can open straight from disk.
- Run `npm test` for the unit tests, the pack tests in `test/pack/` and the browser tests. `npm run a11y` builds, serves `dist/` on a free port and scans the main screens with axe-core in light and dark, desktop and phone. `npm run verify` runs both, plus the focus-ring clip audit. CI (`.github/workflows/ci.yml`) runs `npm run verify` on every push.

## Content packs

`KIT_PACK` names the pack folder, for example `KIT_PACK=../my-pack npm run dev`; without it the build uses `examples/sample-pack/`, a small generic pack on a Junior, Mid and Senior engineer ladder. `npm test` runs against it.

A pack (format 2, ADR 021) holds:

- `pack.json`, with `{ "format": 2 }` and options.
- `ladder.md`, one `## Name {#id}` heading per level, lowest first.
- `competencies.md`, one `## Name {#id}` heading per competency, with what each level looks like under it. It may be empty.
- `roles/<id>.md`, each with its hiring level, its rounds and its decision options, each with what it means.
- `rounds/<id>.md`, YAML frontmatter only, whose `run:` list names one segment per entry: `- script: intro`, `- questions: all`, `- exercise: review-a-pr`, with its minutes.
- A folder per segment kind: `scripts/`, `pools/` (a `pool.md` and question cards per pool) and `exercises/`.
- An optional `theme/*.css` brand theme in `@layer theme.brand`, always on: the build writes its id onto `<html data-theme>`.

Every Look for list, on a card, an exercise or a script, uses one grammar: `### <level>` headings holding bullets, each an observable with optional `#competency` tags and nested `- Nudge:`, `- Show it:` and `- Fallback:` lines. `## Stretch` holds prompts by level the same way. The kit lays out the rows by their level against the role's hiring level (ADR 023): that level is the numbered checklist, one level below is open for placement, and the rest fold away.

`interview-kit check` reports every problem in a pack with its file and line; `--strict` makes a pack's house rules errors. `interview-kit migrate` moves a format 1 pack to format 2 and proves no wording changed, and gives a format 2 pack with no `id` the id it has used so far. The build stops on a pack it cannot read. To run the pack-facing tests against another pack, run `KIT_PACK=<folder> npx vitest run test/pack`.

The fields each file takes, generated from the schemas by `node scripts/field-tables.mjs --write`:

<!-- fields:start -->

#### `pack.json`

| Field | Required | What it holds |
| --- | --- | --- |
| `format` | yes | The pack format this app reads. |
| `id` | yes | Names this pack's storage and locks in the browser, so two packs opened from disk never share sessions. Keep it once anyone has used the kit: a new id starts with no saved interviews. |
| `theme` |  | The brand theme in theme/*.css: { "id", "name" }. Its id is written onto <html data-theme>. |
| `allowResumeToTypeSafe` |  | true lets npm run suggest send a resume to TypeSafe to rank pools. |
| `unrankedPools` |  | Pools npm run suggest never ranks, such as behavioral ones a resume says nothing about. |
| `a11yExclude` |  | Selectors whose low contrast the pack theme accepts; npm run a11y skips color contrast on them. |
| `plugins` |  | false leaves a plugin out of the built file. Names are folders under src/plugins/; check rejects an unknown one. The CLI's --without wins over this. |
| `url` |  | Where this pack's built file is served. When set, Invite makes a link and a QR code to it. |
| `sync` |  | turn: TURN servers for the sync plugin; relays: relay URLs in place of the default list. |
| `lint` |  | avoidVerbs: more opening verbs that get a note; allowVerbs: verbs accepted at the levels named. |
| `retentionDays` |  | Days after the last change before a decided session is deleted from this laptop. An undecided session is never deleted without a warning. |

#### `roles/<id>.md`

| Field | Required | What it holds |
| --- | --- | --- |
| `id` | yes | The role id, used by run entries and the evidence log. |
| `name` | yes | What the start page calls the role. |
| `hiring` | yes | A level id from ladder.md. The one level that drives every card's view. |
| `rounds` | yes | Round ids this role runs, in the order the start page offers them. |
| `competencies` |  | Which competencies this role gathers evidence on, in display order. Absent means all. |
| `## About` |  | Shown under the role on the start page. |
| `## Decisions` | yes | At least two "### Label {#id}" headings, each with what it means. Decide offers them in this order. |

#### `rounds/<id>.md`

| Field | Required | What it holds |
| --- | --- | --- |
| `id` | yes | The round id. |
| `name` | yes | What the start page and the run of show call the round. |
| `run:` | yes | One entry per segment, in order, each naming one kind and what it runs, such as "- questions: all" with its minutes. |

#### `pools/<id>/pool.md`

| Field | Required | What it holds |
| --- | --- | --- |
| `id` | yes | The folder name. "all" is taken: a run entry uses questions: all for every pool. |
| `name` | yes | What the picker and the sidebar call the pool. |
| `competencies` |  | Default for cards in this pool that name none. |
| `## About` |  | text |

#### `pools/<pool>/<id>-<slug>.md`, a question card

| Field | Required | What it holds |
| --- | --- | --- |
| `id` | yes | The card id, which evidence refers to. |
| `pool` | yes | The folder name. Not written in the file. |
| `title` | yes | The question as the pager and the run of show name it. |
| `minutes` | yes | How long the question takes, for the pick. |
| `tier` |  | Pick order inside a pool: core cards are offered first (ADR 004). |
| `competencies` |  | Default competencies for Look for bullets that carry no #tag. |
| `overlaps` |  | Card ids that cover the same ground. The pick never puts two of them in one interview. |
| `review` |  | needs-check flags a card whose wording waits for sign-off. |
| `## Review` |  | What changed, for the dev review form. Never in a build. |
| `## Ask` | yes | What the interviewer asks. |
| `## Look for` | yes | Observables under "### <level>" headings, with optional #competency tags and nested Nudge:, Show it: and Fallback: lines. |
| `## Follow-ups` |  | Questions to dig deeper. |
| `## Stretch` |  | Prompts under "### <level>" headings. Each reads Ask this at its level and above. |

#### `exercises/<id>/exercise.md`

| Field | Required | What it holds |
| --- | --- | --- |
| `id` | yes | The exercise id, named by a run entry. |
| `name` | yes | What the run of show calls it. |
| `minutes` | yes | How long it runs. |
| `competencies` |  | Default for findings with no #tag. |
| `## Brief` | yes | What the interviewer reads first. |
| `## Paste to the candidate` |  | Text to paste to the candidate. |
| `## Run` |  | How to run it. |
| `## Fallback` |  | What to do when the live setup is down. Its switch is shared by everyone in the interview. |
| `## Look for` | yes | Findings under "### <level>" headings, with the same grammar as a card. |
| `## Stretch` |  | Prompts under "### <level>" headings, as on a card. |

#### `scripts/<id>.md`

| Field | Required | What it holds |
| --- | --- | --- |
| `id` | yes | The script id, named by a run entry. |
| `name` | yes | What the run of show calls it. |
| `minutes` | yes | How long it runs. |
| `##` blocks | yes | Each "##" section, shown in order. |
| `## Look for` |  | Optional observables, with the same grammar as a card. |

<!-- fields:end -->

## A pack in its own repo

A pack can live in its own repo, with this app installed as a git dependency (`"interview-kit": "github:<owner>/interview-kit#<tag>"`). The pack repo's scripts call `interview-kit dev`, `interview-kit build`, `interview-kit test`, `interview-kit check` and `interview-kit migrate`: the build writes `dist/index.html` in the pack repo, the tests run `test/pack/` against the pack, and the What's new stamp shows the pack repo's commit. `--pack <dir>` names another pack folder, `--outDir <dir>` moves the built file, and any other flag goes to Vite or Vitest. To work on the app against such a pack, run `KIT_PACK=<pack repo> npm run dev` in the app checkout.

## Plugins

`src/plugins/` holds the optional parts, one folder each with an `index.js` entry, all in every build. Leave any out with `--without <name>[,<name>]` on `interview-kit dev` or `build`, or `"plugins": { "<name>": false }` in `pack.json` (ADR 024); `npm test` checks that a build without sync holds none of its code.

- `shortcuts` adds keyboard shortcuts, listed by `?`.
- `tab-timer` puts the time since the interview started in the tab title.
- `popout` adds a Pop out button (Chrome, Edge and Firefox desktop; hidden elsewhere) that moves the kit into a small always-on-top window to keep over a fullscreen call.
- `ai` adds a second opinion on Decide: a packet built from your summary, with no names, decisions or levels, for you to copy into an AI chat. It opens only after you decide.
- `sync` connects colleagues in the same interview (experimental, ADR 025).

## Reviewing questions

1. Flag a new or changed card with `review: needs-check` in its frontmatter and a `## Review` section at the end of its body: one or more `**Changed:**` blocks with `- **Before:**` and `- **After:**` lines, a `**Check:**` line, and `**Options:**` as a list of at least two. The card shows a Being reviewed alert.
2. Run `npm run dev` and open a flagged card. Under the alert, a form (dev server only, never in a build) records your call (clear the flag, change it, or remove the card) and what should change, in the pack's `.review/feedback.jsonl`.
3. `npm run review:pending` prints the feedback not yet applied.
4. Apply each decision to the card and delete its `review` line and `## Review` section; once the flag is gone, its feedback drops off the list. `npm run review:pending -- --done <id>` also marks one applied.

## Tools outside the page

- `npm run suggest -- <resume.txt>` ranks the pools to tick for a candidate through TypeSafe. The key comes from `TYPESAFE_API_KEY` in your shell, and the pack must set `"allowResumeToTypeSafe": true`. `npm run suggest:eval` grades it against your own picks; `docs/plans/pool-suggestions.md` says how.
- `npm run capture` rebuilds the What's new and Help screenshots and clips from `capture/scenes.js`; `capture/README.md` shows how to add one.

## Files

- `docs/adr/` records architecture decisions (log in `docs/adr/README.md`); `docs/plans/` holds plans for work not yet started.
- `src/main.js` starts the session; `src/ui/session.js` is the composition root, the router and the plugin API; `src/ui/assess.js` is the Assess panel every kind shares. `src/style.css` declares the CSS layers and holds the reset, tokens and base styles.
- `src/pack/` reads a pack in Node (the grammar, lowering, validation, cross-file links) and serves it to the browser as `virtual:pack`.
- `src/kinds/` holds the segment kinds, `script`, `questions` and `exercise`, each a `kind.js` data side, a `view.js` and its schemas. `src/kinds/questions/pick.js` is the deep dive pick rule (ADR 004).
- `src/model/` holds the layering rule (`layers.js`), the run of show (`timeline.js`) and the observables.
- `src/evidence/` holds the event log (ADR 022): the event check, the clock, the folds, the blindness gate, the evidence file, and `store.js`, the only code that touches storage.
- `src/views/` builds the summary and the debrief from the evidence; `src/components/` holds each piece of UI as a render function, a bind function where it needs events, and its own CSS. The light/dark scheme pref lives in `src/prefs.js` under its own storage key.
- `src/layouts/` has the app shell, the question page's layout and the phone layout.
- `HELP.md` is the text of the Help page (`#/help`). Each FAQ entry is `### Question? {#id}` followed by a `>` short answer; that short answer is also the text of the ? icon placed with `helpHint('<id>')`, whose More in Help link opens `#/help/<id>`. `npm test` fails on a `helpHint` id the page lacks.
- `src/media/` holds the screenshots and clips for What's new and Help. `CHANGELOG.md` shows them with `![alt](media/<file>)` under a release's `###` headline, and `HELP.md` under an FAQ entry's short answer; both pages render them through `src/components/media.js`, and a file both pages name is inlined once. Capture screenshots at 2x in the default theme with `examples/sample-pack/`, so no real content shows, and save them as WebP. An `.mp4` plays as a silent loop (paused, with controls, under reduced motion), with the `.webp` of the same name as its poster. The build inlines every file, and `npm test` fails on a file neither page names.

Icons are from [Lucide](https://lucide.dev), ISC License; the notice is in `src/components/icons.js`.
Spacing, type, line-height and border scales come from [Open Props](https://open-props.style) 1.7.23 (MIT), imported into the tokens layer; colors come from `src/themes/system.css`, and a brand theme is a sibling file in `@layer theme.brand`.
