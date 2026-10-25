# Plan: calibration loop for Look-for items

Status: not started. Depends on compare-after (`compare-after.md`), which is not decided yet.

## Goal

Find the Look-for items that two interviewers watching the same answer tick differently, and rewrite them. An item that two careful people read two ways measures the interviewer, not the candidate. Over time every item should mean the same thing to everyone who ticks it.

The measure is agreement per Look-for item across many interviewer pairs, scored with Cohen's kappa. Kappa is the standard inter-rater measure. It discounts the agreement two people would reach by chance, which raw percent agreement does not.

## What it builds on

- **Three ticks per question (ADR 003).** Each Look-for item is a yes or no judgment. That makes every item a two-category rating, which is the simplest case for kappa.
- **Compare-after.** After the call, one interviewer pastes the other's ticks into the Deep dive review. At that moment the kit holds both people's ticks for every question asked. Calibration needs nothing more than that pair.
- **Content as Markdown (ADR 002).** A rewrite is an edit to one bullet in `pools/`.

Compare-after's open question on paste format is settled here in favor of a code keyed by question id, since the calibration line needs ids, not titles.

## How it works

1. **Each interview gets a random id.** New candidate creates it and saves it with the rest of the state. Copy ticks puts it in the code. It identifies nothing; it only lets two copies of the same pair be counted once.
2. **Ticks freeze at paste.** When one interviewer pastes the other's code, the kit records both tick sets as they stand right then. Ticks changed after seeing the comparison never reach the calibration data. Otherwise talking it over would make every item look agreed.
3. **Copy calibration line.** The review page gets one more button. It copies one line for the pair: the two interview ids, sorted, and for each question asked, the question id, a short hash of each Look-for item's text, and two bits per item (mine, theirs). No names, no notes, no date, no round, no candidate.
4. **Lines collect in one private file.** Whoever owns the content keeps a plain text file of these lines outside the repo. Anyone who ran a comparison sends theirs.
5. **A script scores the items.** A new `calibration.mjs <file>` in `scripts/` reads the lines and the current pools, then prints one row per Look-for item: question, item text, pairs seen, percent agreement, tick rate and kappa. It drops duplicate pairs by their id key. It drops ratings whose hash no longer matches the item's current text, so a rewritten item starts counting from zero.
6. **Flag and rewrite.** An item is flagged once it has at least 10 pairs and kappa below 0.4. A separate flag marks an item ticked in over 90% or under 10% of ratings: it barely separates candidates, and its kappa is unreliable for that reason (the prevalence paradox). The content owner rewrites flagged items, then the item earns a fresh count.

### The formula

For one item, with n pairs: observed agreement `po` is the share of pairs where both ticked or neither did. `p` is the tick rate across both raters pooled. Chance agreement is `pe = p² + (1 - p)²`. Kappa is `(po - pe) / (1 - pe)`.

The chance term uses the pooled tick rate rather than each rater's own. In plain Cohen's kappa the two raters are fixed people. Here "me" and "them" are whoever pasted and whoever sent, and the pair changes every interview, so neither role has its own base rate. Pooling is the two-rater form of Fleiss's kappa (also called Scott's pi). When `pe` is 1, every rating was the same, and kappa is reported as "no variation" instead of a number.

The script, not a person, does all of this. The app ships only the id, the frozen ticks and the copy button.

## Order

1. Ship compare-after with the paste code keyed by question id.
2. Write failing tests for the scorer through its public function, with literal inputs and outputs:
   - The worked 2x2 table from the Wikipedia article on Cohen's kappa (20 both yes, 5 and 10 split, 15 both no) gives `po` 0.7 and pooled kappa 0.394, to three places.
   - All pairs agree on "ticked": reported as no variation, not a division by zero.
   - Two copies of the same pair count once.
   - A rating whose item hash is stale is dropped.
3. Write `calibration.mjs` in `scripts/` until those pass.
4. Add the interview id, the freeze at paste and Copy calibration line. Test the line's format with literal ticks.
5. Add the calibration file name to `.gitignore`, so a copy dropped into the repo by mistake is never committed.
6. Run the script on a hand-made file of 20 lines to see the table read well, then hand it to the content owner.

## How we'll know it works

- **The math.** The scorer matches the published worked example above. That table is an outside answer key, not one the scorer's author picked.
- **The data.** The calibration line, pasted into the script, round-trips: the script's per-item counts equal the ticks on the review page for that interview.
- **The loop.** The real judge is slow. A rewritten item's kappa over its next 10 pairs should beat the old item's. If rewrites do not raise agreement after a few rounds, the problem is not wording, and the loop should stop rather than churn content.

## Data and privacy

This is hiring data. A line is one candidate's evaluation, even without a name.

- Nothing leaves a laptop except a line a person chooses to copy, as with compare-after.
- The line has no candidate name, interviewer name, date or round. A random interview id is the only key. Notes never appear.
- The collected file lives outside the repo and is gitignored. The repo is public, and hiring records never belong in git history.
- Only the per-item table is shared. Raw lines can be deleted once an item has been rewritten or has passed.
- Interviewers are not identified, so the data cannot rate interviewers. That is deliberate.
- Before collecting real lines, check with whoever owns hiring data whether anonymous tick pairs count as candidate records and how long they may be kept.

## Open questions

- Volume. A question gets two raters only when a shadow sits in. How many months until a typical item reaches 10 pairs? If the answer is "most never do", report percent agreement and talk through the splits instead of waiting on kappa.
- Thresholds. 0.4 and 10 pairs are starting points from the usual kappa bands. Tune them once real lines exist.
- Who owns the file and the rewrites? Probably the content owner of `pools/`.
- If interviewers mostly pair in fixed duos, plain Cohen's kappa per duo becomes possible. Is that worth it, given it starts to describe the interviewers?

## Out of scope

- Any per-interviewer statistic, such as who ticks most often. It would turn a content tool into a review of people.
- Agreement on the score word (Weak, Solid, Strong). It follows from the ticks, and item-level agreement is what drives a rewrite.
- A calibration view inside the app, a server that gathers lines, or any automatic upload.
- Confidence intervals and alternative coefficients such as Gwet's AC1. The tick-rate flag covers the case they exist for.
- Checking whether items predict hiring outcomes. That needs outcome data the kit does not have.
- Suggesting rewrites automatically. A person rewrites the item.
