# Plan: item analysis of Look-for items

Status: not started.

## Goal

Find the Look-for items that carry no signal, so the content owner can rewrite them. An item every candidate gets ticked for tells you nothing. Neither does one nobody gets ticked for, or one that strong and weak candidates get ticked for at the same rate. Psychometrics checks this with two numbers per item:

- **Difficulty:** the share of interviews where the item was ticked.
- **Discrimination:** whether candidates who got this item ticked also did well on the rest of the interview.

This plan is about item quality. Whether two interviewers tick the same things for the same answer is rater agreement, which the calibration-loop plan covers. The two meet in one place: a lenient interviewer pushes every item toward "always ticked". Item analysis pools all interviewers, so read its flags next to the calibration numbers, not alone.

## Data it needs

Per interview, for each question marked done: the question id and which of its three items were ticked. Nothing else.

- **Done only.** No ticks reads the same as "not asked" in today's state. Only questions in `done` count, so an unticked item means "asked, not seen", never "skipped".
- **Item text fingerprint.** Items are identified by question id and index. If someone edits a bullet, old ticks no longer describe the new item. Each record carries a short hash of the question's three Look-for lines, and records with an old hash are counted separately.
- **No names, notes, dates, round or interviewer.** None of them are needed to compute either number.

## How it leaves the browser

The kit stays offline and keeps one interview in localStorage (ADR 005). Export rides on the "Copy ticks" button from `compare-after.md`, so one button serves both plans.

1. After the interview, the interviewer clicks Copy ticks. It copies one line, for example `IKT1 react-hooks:9f2a:101 css-grid:31c0:000`, where each digit is one item.
2. They paste that line into a shared text file kept with the team's hiring records, one line per interview.
3. Someone runs a new `item-analysis.mjs <path>` script in `scripts/`. It prints one row per item with its count, difficulty and discrimination, and a flag where one applies.

The script runs outside the build, so nothing new ships in `dist/index.html`. The pooled file never goes in the repo.

## The two numbers

- **Difficulty** is ticked count over done count, shown with a 95% Wilson interval. Flag "too easy" when the whole interval sits above 0.9, and "too hard" when it sits below 0.1.
- **Discrimination** is the corrected item-total correlation. For each interview, the rest score is the share of items ticked on the other done questions, leaving out every item of this item's own question. Correlate the item's 0 or 1 with that rest score. Flag "no signal" when it is below 0.2, and "backwards" when it is negative. An interview with fewer than two other done questions is left out for that item.

Flags are prompts for a person. An always-ticked item may be a deliberate floor. The script never edits a pool file.

## Minimum sample sizes

The deep dive picks different questions for different candidates, so each question's count is lower than the interview count. Every threshold below counts interviews where that question was done.

- **Under 20:** show counts only, no flags. At 10 of 10 ticked, the 95% interval still reaches down to 0.72.
- **20 or more:** difficulty flags. At 20 of 20, the interval's floor is 0.84. That is enough to say "nearly always".
- **50 or more:** discrimination flags. Below about 50, a correlation has to pass roughly 0.28 to be told apart from zero, so a 0.2 cutoff would flag noise.

The script prints the count beside every number, and prints a dash where the count is under the threshold.

## Steps

1. Write failing tests through a public `analyzeItems(lines, questions)` with literal records: an item ticked in all 20 interviews is flagged too easy; an item ticked in none is flagged too hard; an item ticked at random across 60 interviews is flagged no signal; nothing is flagged at 19; a question not marked done is not counted; a record with an old hash is counted apart.
2. Add the pure `analyzeItems` and make the tests pass.
3. Add Copy ticks (shared with `compare-after.md`) with a test that its line holds only done questions and no note text.
4. Add a thin `item-analysis.mjs` in `scripts/` that reads the file and prints the table.
5. Run it on the first real batch. The content owner reads every flagged item and decides keep, rewrite or drop.

## The judge

The tests in step 1 are the first judge: planted items with known answers must come out flagged, and nothing must be flagged below the thresholds. The real judge comes later. After a flagged item is rewritten, its new hash starts a fresh count. Once that count passes the threshold again, the flag should be gone. If it isn't, the rewrite didn't help.

## Privacy

This is hiring data, so the export carries as little as it can. No candidate name, notes, date, round or interviewer, and no id that links a line back to a person. Keep the pooled file in the same restricted place as other hiring records, never in the repo, and delete it once a review cycle's flags are handled. With only ticks and question ids, a line can still be tied to a candidate by someone who knows who was interviewed that week. Treat the file as personal data anyway.

## Open questions

- Who collects the lines and runs the script: each interviewer, or one content owner?
- When two interviewers sat in on one interview, which line goes in? Both would count the candidate twice. One line per candidate, from the lead interviewer, is the simplest rule.
- Should the analysis also run inside the kit, on a page where the pooled lines are pasted, for people who don't run Node? That adds UI to the single file for a task done a few times a year.
- Do 20 and 50 per question arrive in a reasonable time? With today's pools and interview volume, some stretch questions may never get there.

## Out of scope

- Rater agreement and interviewer leniency. See the calibration-loop plan.
- Whether ticks predict who does well after hiring. That needs outcome data the kit doesn't have and shouldn't hold.
- Whether an item behaves differently across groups of candidates. That needs demographic data, which this export must never carry.
- Item response theory models such as Rasch. They need hundreds of interviews per question, and the two numbers above answer the question at this scale.
- Editing pool files automatically.
