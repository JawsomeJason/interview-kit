---
id: checkout-latency
name: Checkout latency incident
minutes: 45
competencies: [diagnosis]
---

## Brief

A staged incident. Checkout p95 latency tripled at 02:14, shortly after a deploy, and the error budget is burning. The candidate asks for dashboards and logs; you reveal what they ask for from the snapshots. The findings are what a good responder notices, by level.

## Paste to the candidate

You are on call. The pager says: "checkout p95 above 2s for 5 minutes". It is 02:19. What do you do first?

## Run

1. **Paste the alert text** from the candidate panel and start the clock.
2. **Reveal only what they ask for.** If they ask for the deploy log, show that the deploy finished at 02:11.
3. **At about 15 minutes, reveal:** the database CPU graph is flat, and one queue is growing.
4. **At about 30 minutes, reveal:** the growing queue belongs to a batch job another team started at 02:12.
5. **Ask:** "What do you tell the checkout team, and what do you tell leadership?"

## Look for

### associate

- **Asks what changed before the alert fired.** A deploy, a config flip, another team's job. #triage
  - Nudge: What would you want to know about the minutes before the alert?
  - Nudge: Is there a log of recent changes you would open?

### engineer

- **Follows the growing queue to another team's job.** Uses the flat database graph to rule out the deploy.
  - Why: The deploy is the obvious suspect and the wrong one.
  - Fallback: hide
  - Nudge: What does the database graph rule out?
  - Nudge: Which line on that page is moving?
  - Nudge: Who owns that queue?
- **Sizes the impact before diagnosing.** Asks how many customers hurt, and how badly. #triage #communication
  - Nudge: Who is hurting right now, and how badly?
  - Nudge: How would that change how fast you act?

### senior

- **Proposes a guard so shared capacity cannot be starved again.** A limit, a quota or isolation, and who must agree.
  - Nudge: What would stop this happening next month?

## Fallback

No snapshots to hand? Describe each graph in a sentence and let them ask follow-ups. Findings that need the graphs are hidden while the fallback is on.

## Stretch

### engineer

- You cannot reach the batch job's owner. What do you do in the next ten minutes?

### senior

- How would you stop another team's job from degrading checkout again?
