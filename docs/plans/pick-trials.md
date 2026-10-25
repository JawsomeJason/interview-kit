# Plan: pick one variant in each trial after real interviews

Status: in trial. Question layout, Sidebar and Theme are live; the Setup page and Header variants are being built. Decide each trial after at least two real interviews in each of its variants.

## Goal

The kit runs several trials at once, all switched from the Try layouts control in the corner (`src/components/trials.js`). Each trial ends with one variant: the maintainer picks it after real interviews, the rest are deleted, and an ADR records the pick. The layout ADR supersedes ADR 008.

| Trial      | Variants                                                         | Code                                                                     |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Question layout | A Columns, B Dock                                                | `src/layouts/a.css` and `b.css`, `LAYOUTS` in `src/components/layout-switcher.js` |
| Sidebar    | A Timeline, B Run of show, C Now and next, D Outline with search | `src/components/sidebar-variants/`                                       |
| Setup page | A Calm form, B One step at a time, C Plan preview, D Quick start | `src/components/setup-variants/`                                         |
| Header     | A Quiet bar, B Cockpit, C Two clusters, D Contextual             | `src/components/header-variants/`                                        |
| Theme      | Default, the pack's theme (only when the pack has one)           | the pack's `theme/` folder, `src/components/theme-toggle.js`             |

## Collect the evidence

Interviewers report through Copy summary. At the end of each real interview they copy it and send it to the maintainer. Two parts of it count:

- **The Setup line** names the variant used in each trial, such as `Setup: Question layout B · Sidebar C · Setup page A · Theme Default · Scheme Dark (auto)`.
- **Feedback notes**, typed in the Try layouts panel, one per variant, such as `Question layout B: header crowds the pager`.

The Setup line shows the variants in use when the summary was copied. Interviewers set their variants before the interview and leave them alone; if they switch partway, the summary counts only for its notes.

Summaries hold candidate names, scores and notes, so they never go in this repo. The maintainer saves each one as a text file in a private folder, one file per interview.

`npm run tally -- <folder>` does the tally. It reads each `.txt` or `.md` file's Setup line and the feedback notes after it, and prints, per trial and variant, the number of interviews and every note about it (quoted, with its file name), a verdict, and which header and sidebar pairs have not yet run with each layout. It prints nothing else from a summary. The verdict is `needs more interviews` until every variant has two, then `ready to pick`. Whether two variants are close is your call: pass `--close Layout,Header` and those trials need a third interview per variant, showing `close call` until they have it. The script cannot see a must-pass failure or whether interviewers differ, so judge those yourself. A note that spans several lines is read only to its first line, and a note's own text is printed as typed.

## How many interviews are enough

One interview counts toward every trial at once. A trial is ready to decide when each of its variants has two real interviews, from two different interviewers where possible. Two exceptions:

- A variant that fails a must-pass test in a real interview is out at once, without waiting for its second interview.
- If two variants are still close after two interviews each, give each one more. If they're still close, keep the one with less code.

## Trials interact

A header may suit one layout and not the other, and the sidebar sits beside both. Testing every combination would take 256 setups (2 × 4 × 4 × 4 × 2). Instead, the maintainer rotates the variants so each trial's variants meet both layouts. Eight interviews cover every variant twice:

| Interview | Question layout | Header | Sidebar | Setup page | Theme   |
| --------- | ------ | ------ | ------- | ---------- | ------- |
| 1         | A      | A      | A       | C          | Default |
| 2         | B      | A      | B       | D          | Pack    |
| 3         | A      | B      | D       | A          | Pack    |
| 4         | B      | B      | A       | B          | Default |
| 5         | A      | C      | C       | C          | Default |
| 6         | B      | C      | D       | D          | Pack    |
| 7         | A      | D      | B       | A          | Pack    |
| 8         | B      | D      | C       | B          | Default |

Every header and every sidebar runs once with each layout, and each theme runs twice with each. Then decide in order:

1. **Question layout first**, since the header and sidebar are built around the question page.
2. **Header and Sidebar next.** Weigh interviews under the winning layout above the rest. A note that names a pair, such as `Header B: crowds the pager in Dock`, counts against that pair, not the header alone. A variant that only worked with the losing layout loses with it.
3. **Setup page and Theme whenever they're ready.** Neither sits on the question page, so neither waits on the others.

## How to judge each trial

Judge in real interviews, not in a click-through. After each one, note what got in the way. The first test in each list must pass: a variant that fails it loses, however it does on the rest.

**Question layout:**

- **Controls never move.** The pager, Done and the Look-for ticks stay in the same spot on every question, short or long (ADR 007).
- **Long code stays readable.** A question with a long code block reads without scrolling sideways or squinting, and the ticks stay in reach while reading it.
- **Notes have room.** Notes can grow during an answer without covering the Ask or pushing the ticks out of view.

**Header:**

- **Nothing shifts.** The header keeps its height and its controls keep their places from question to question, so the page under it never jumps (ADR 007).
- **Clock and place read at a glance.** Mid-answer, one look tells the time left and where the round stands.
- **It fits.** At the narrowest desktop width, nothing wraps and nothing crowds the pager.

**Setup page:**

- **No wrong start.** The interviewer sets the candidate, the round and the start time without a wrong pick reaching the interview.
- **Fast on the day.** A returning interviewer starts in a few clicks, and a first-timer starts without asking for help.

**Sidebar:**

- **The next question is one click away.** Mid-answer, the interviewer finds the next or any picked question in one look.
- **Progress shows.** What's done and what's left in the round reads without opening anything.

**Theme:**

- **Readable in both schemes.** Text, links, ticks and focus rings keep their contrast in Light and Dark.
- **Nothing harder to find.** Every control and state reads as clearly as in Default.

## Deleting the losers

Before the first deletion, two changes make every later one shorter:

- `trialId` in `src/components/layout-switcher.js` falls back to `'a'` for a saved pick that no longer exists. Make it fall back to the registry's first entry, so a winner other than A still catches old saved picks.
- The Try layouts panel shows the Setup group only when there is more than one setup page. Apply that rule to every group, so a trial with one variant left hides its switcher.

**Sidebar, Setup page and Header**, each with a registry in its folder's `index.js`:

1. Delete each loser's files (`<letter>.js`, `<letter>.css`) and its entry in `index.js`.
2. Delete each loser's tests, such as `test/sidebar-b.test.js`, and any case in a shared test that names it.
3. With one entry left, import the winner directly and delete `index.js`.
4. Drop the trial from the Setup line in `src/components/copy-summary.js`, and its feedback note, with their tests.

**Question layout:**

1. Remove the loser's stylesheet from `src/layouts/` (`a.css` or `b.css`).
2. Remove its letter from `LAYOUTS`, and make the winner the default and the fallback for a saved layout that no longer exists.
3. Remove the Question layout group and the parts of `test/layout-switcher.test.js` that cover switching.
4. Keep the prefs code in `layout-switcher.js`: every trial, the color scheme and the phone tab are saved under its `interview-kit-layout` key. Move it to its own small module once the file holds nothing about layouts.
5. Check the phone layout, which doesn't depend on the desktop choice (ADR 009).

**Theme:**

- If the pack's theme wins, remove the Theme group, `theme-toggle.js` and its CSS and test, and apply the pack's theme whenever the pack has one. The build already writes its id onto `<html data-default-theme>`.
- If Default wins, remove the pack's `theme/` folder and the `theme` entry in its `pack.json`, then the toggle code as above, and drop the brand theme plan.

After each trial, run `npm test` and `npm run build`, then write its ADR. For the layout, mark ADR 008 `superseded`.

When the last trial is decided, delete the Try layouts control (`trials.js`, `trials.css`, `test/trials.test.js`), `layout-switcher.css`, which styles every switcher group, and the Setup line.

## Open questions

- Should the winner keep the dock's fixed height, or the columns' separate scrolling, if the other layout had one feature that worked better?
- Who else uses the kit before the picks? A shadow interviewer's view of each trial counts too.
