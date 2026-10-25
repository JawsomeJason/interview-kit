# Plan: suggest pools from a resume

Status: built 2026-10-23, waiting on the real eval. `npm run suggest` and `npm run suggest:eval` work, tested with no network, and ran once on three synthetic fixture resumes. The cut-offs are still placeholders (score 1.5, confidence 0.5) and the model is still `jev-latest`, until the maintainer runs the eval below on real resumes.

## Goal

Before a deep dive, the interviewer reads the resume and guesses which pools to tick. This plan adds a small command that makes that guess for them:

```sh
npm run suggest -- resumes/jane.txt
```

It asks Jev, TypeSafe's typed-judgment model, how strongly the resume shows work in each pool. It prints the pools in the order to tick them on the Deep dive page, with a confidence for each. The first one printed is the main focus, matching the pick rule (ADR 004).

The command lives in `scripts/`, outside the single HTML file. The API key has to stay on the interviewer's machine, and a key inside a shared HTML file is public. The app itself does not change. Resume input was taken out of the app to keep it simple, and this keeps it out.

The question this answers is "what should I probe with this candidate", not "which keywords appear". A pool listed in a skills line is weaker evidence than a pool the candidate owned work in. The levels below are written to tell those apart.

## Request shape

One request per resume. All field names come from the live docs: the [HTTP API](https://docs.typesafe.ai/api.md), the [Score primitive](https://docs.typesafe.ai/primitives/score.md) and the [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md), plus the SDK's own type definitions (`types.ts`) at v0.7.0.

- `model`: `jev-latest` while tuning. The SDK's `DEFAULT_MODEL` is also `jev-latest`. Once thresholds are tuned, pin the version they were tuned on, such as `jev-1.14.0` (the newest on the [models page](https://docs.typesafe.ai/models.md) today).
- `state`: `{ resume: "<redacted resume text>" }`. Questions refer to it as `` `resume` ``, as the [State page](https://docs.typesafe.ai/concepts/state.md) suggests for named fields.
- `questions`: one Score per technical pool, keyed by pool id (`react`, `css`, and so on). Ids are not sent to the model, so each question carries its full meaning.

Each Score has `instructions` and `criteria`. The instructions name the pool and what it covers:

> How much evidence does the `resume` give that the candidate has done hands-on work in this area? Area: React. Topics this area covers: state updates and batching, effects and their cleanup, ...

The topic list is built by code from the pool's `poolName` and its question titles, so a new question file updates it with no hand edit.

The `criteria` are four levels, low to high. The Score docs say each level is judged on its own and should describe a situation, not a degree:

0. The resume does not mention this area or any work that would need it.
1. The resume names this area only in passing, such as a keyword in a skills list, with no role or project that used it.
2. The resume describes at least one role or project where the candidate did work in this area.
3. Work in this area is central to the candidate's recent roles, with specific results they owned.

In the SDK this is `score(instructions, criteria)` inside `client.systemOne({ state, questions, model })`. Each answer has `score` (0 to 3, probability-weighted), `confidence` (0 to 1), `probabilities` and `legend`. The response carries `usage.input_tokens`, which can be `null`.

**Why Score and not the other two.** A Noul per pool ("does the resume show any CSS work?") saturates. Most frontend resumes say yes to React, CSS and JavaScript, so the top three would tie near 1. A single Choice over all pools picks one winner, and its probabilities compare pools against each other rather than rating each one. A Score per pool gives a graded value per pool that sorts cleanly, which the Score docs name as the shape for graded ranking. The eval below still runs all three side by side once, so this is checked, not assumed.

**Unranked pools.** A behavioral pool fits every candidate, so a resume says nothing about whether to use it. A pack names such pools in `pack.json` `"unrankedPools"`, and the command prints them as "always available" under the ranked list.

## Output

Code sorts by `score`, breaks ties by `confidence`, and applies two cut-offs:

- A pool below the score cut is never suggested, even if it would be in the top 3. A thin resume can produce fewer than three suggestions. That is a real answer, not an error.
- A suggested pool below the confidence cut is marked "unsure", so the interviewer knows to check it against the resume.

Both cut-offs start as placeholders and are set by the eval below. They are not copied from a cookbook.

The output is plain text, in tick order:

```
Tick these on Deep dive, in this order:
  1. react             React                                 2.8  conf 0.86
  2. web-perf          Web performance                       2.3  conf 0.61
  3. css               CSS                                   1.9  conf 0.38  unsure
Below the cut: component-libraries 1.2, testing 1.0, ...
Always available: teamwork
```

`--json` prints the raw answers for the eval. `--dry-run` prints exactly what would be sent and makes no call.

## Code

- `scripts/suggest-pools.mjs`, run by a new `suggest` script in `package.json`.
- `@typesafe-ai/sdk` as a devDependency. It needs Node 22 or newer, and zstd compression needs 22.15 or newer. Add an `engines` field.
- The frontmatter `parse` in `src/content.js` moves to its own small module, so the script and the app share it. `content.js` loads files with `import.meta.glob`, which only works under Vite, so the script reads `pools/` with `fs` and calls the same parser.
- The key comes from `TYPESAFE_API_KEY`, which the SDK reads by itself. Missing key: print how to set it and exit non-zero. Never write the key to a file in the repo.
- Red-green tests, per AGENTS.md, through public functions with literal values and no network:
  - `redact(text)` removes an email, a phone number, a URL and the first line.
  - `poolQuestions(pools)` returns one Score per technical pool, keyed by pool id, with four levels, and leaves out the pack's unranked pools.
  - `suggest(answers, cuts)` returns pool ids in the right order from literal fake answers, drops a pool under the score cut, and marks one under the confidence cut.
  - The built `dist/index.html` contains no `typesafe` string, the same way the sync check works.

## The judge

Jev does not grade itself. The judge is the maintainer's own picks.

1. Take 5 to 10 past resumes from real interviews. Before running anything, the maintainer writes their own ordered top 3 for each into a local file.
2. Run the command on each resume with `--json`, once. Save every answer to a local cache, so tuning the cut-offs reuses the saved answers and makes no new calls.
3. For this one eval run, ask three shapes in the same request per resume: a Score per pool as above, a Noul per pool, and one Choice for the main focus. Questions over the same state run in parallel, so this costs one request per resume. Keep the shape that matches the maintainer's picks best.
4. Score each resume on two things. Does Jev's first pool match the maintainer's first pick? How many of Jev's top 3 are in the maintainer's top 3?
5. Set the score cut and the confidence cut from these cases. Then pin the model version.

**Target.** Jev's first pool matches the maintainer's on every resume, and at least 2 of the top 3 overlap on every resume. The floor for keeping the command at all is 2 of 3 overlap on 4 of 5 resumes. Below the floor, try a hand-written one-line description per pool in place of the title-derived topic list before giving up. Question titles are written as scenarios ("Two clicks, one count"), so they may describe the pool poorly.

Five resumes is a small sample. Treat the cut-offs as a first setting and revisit them after the next few real interviews.

## Privacy

A resume is personal data, and this sends it to an outside vendor.

- Code strips, before sending: email addresses, phone numbers, URLs (LinkedIn, GitHub, portfolio), and the first non-empty line, which is usually the name. Employers, job titles and dates stay, because "recent" and "central to the role" depend on them.
- `--dry-run` shows the exact redacted text, so the interviewer can check it before the first real call.
- Resumes, the picks file and the answer cache live in a git-ignored `resumes/` folder. Add it to `.gitignore` before the first resume lands there.
- Only the redacted text and the pool questions leave the machine. Nothing is written back to the app or its localStorage.

## Cost

Jev bills input tokens only, at $0.042 per million on Jev 1.13 and 1.14 ([models page](https://docs.typesafe.ai/models.md)). The docs say Jev ingests the state once per request. A two-page resume is roughly 1,500 tokens and ten pool questions roughly 2,000 more. Measured 2026-10-23 on synthetic fixtures: 2,669 input tokens for one short resume with the ten Scores, and 14,354 for three eval requests (about 4,800 each with Scores, Nouls and the Choice). Even if the state were billed once per question, one resume would cost well under a tenth of a cent. The eval's three-shape request is about three times that, once.

Both commands print the request count and input tokens of every real call, so the spend is visible as it happens.

## Order

1. Move `parse` into its own module. Run `npm test` and `npm run build`.
2. Write the failing tests for `redact`, `poolQuestions`, `suggest` and the clean build. Then make them pass.
3. Add the command, `--dry-run` and `--json`. Check the redacted text by eye on one resume.
4. Run the eval. Set the cut-offs, pick the question shape, pin the model.
5. Add a line to the README on how to run it and where the key comes from.

## Running the real eval

The harness is `scripts/suggest-eval.mjs`. It asks a Score and a Noul per pool and one Choice for the main focus in a single request per resume, caches the answers, and grades every shape against your picks. Three synthetic resumes in `test/fixtures/resumes/` show the file layout; they are easy cases and are not the judge.

1. Put 5 to 10 past resumes as plain text in `resumes/` at the repo root (git-ignored), for example `resumes/a.txt`. Convert PDFs with `pdftotext`.
2. Before running anything, write `resumes/picks.json` with your own ordered top 3 per file, using the pool ids from your pack's `pools/` folder: `{ "a.txt": ["react", "web-perf", "css"] }`. The harness refuses to run while any resume has no picks.
3. Check the redaction by eye on one resume: `npm run suggest -- resumes/a.txt --dry-run`.
4. Run `npm run suggest:eval`. It makes one request per resume, prints each resume's rankings, a target and floor table per shape, a score-cut sweep, and the confidence of hits and misses. It ends with the request count and input tokens for the calls it made.
5. Re-grade with other cuts for free: `npm run suggest:eval -- --score-cut 2 --conf-cut 0.6`. Answers come from `resumes/.jev-cache/`.
6. Set `CUTS` and pin `MODEL` in `scripts/suggest-pools.mjs` to the model the table header names (for example `jev-1.14.0`). If Noul or Choice beat Score, say so here before changing the shape.

## Open questions

- Answered 2026-10-23: yes, per pack. A pack setting allows sending resumes to TypeSafe. It defaults to no for any plugged-in pack, and a pack that wants it turns it on. Data retention still needs checking with TypeSafe.
- Setting: `"allowResumeToTypeSafe": true` in `pack.json`. Missing or anything but `true` means off, so `sample-pack/` is off and a pack that sets it is on. With it off, `npm run suggest` sends nothing and says how to turn it on; `--dry-run` still works, since it sends nothing.
- Default chosen 2026-10-23: unranked pools stay out of the ranking and print as "always available". Revisit if the maintainer's own picks in the eval put one first for a mentoring-heavy resume.
- Default chosen 2026-10-23: the topic list comes from question titles, with no content change. A pool description field waits for the eval to fall below the floor.
- Default chosen 2026-10-23: the eval harness takes any number of resumes, and the target and floor scale to the count. Use 5 to 10 resumes, and only ones where the picks can be written without hindsight from the interview. Fewer than 5 is a smoke test, not a tuning set.
- Default chosen 2026-10-23: `@typesafe-ai/sdk` is pinned at 0.6.0, the newest release at least two weeks old (0.7.0 came out 2026-10-14). Its `ScoreQuestion`, `ScoreResponse` and `Usage` types have the fields this plan names.
- Still open: data retention for resumes sent to TypeSafe.

## Out of scope

- Opening the Deep dive page with the pools already ticked, for example through a URL hash the command prints. It would save a step, but it changes the app. Revisit if the command proves useful.
- Suggesting individual questions inside a pool that match claims on the resume. That is a second judgment (rank question titles against resume claims), worth trying only after pool suggestions earn their keep.
- PDF and Word resumes. Convert them to text first, for example with `pdftotext`.
- Any resume or brief input inside the app.
