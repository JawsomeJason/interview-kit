// Trial setup pages (the page where the interviewer names the candidate, picks the start and the round), switched in
// Try layouts. After the maintainer picks one, delete the other letters here and their files. Each variant default-exports
// { label, render(ctx), bind(el, ctx) }: render returns the whole page as one element (a <main class="main"> with an <h1>,
// where the undo toast lands) and bind wires up that element and returns refresh(now), which main.js calls every
// 30 seconds to bring the start choices up to the clock without touching what's typed or picked. Both run on every
// setup page render with
// ctx = { rounds, round, candidate, startOptions, start({ roundId, candidate, startedAt }) }.
// - rounds: [{ id, name, minutes, deepDiveMinutes }] from the pack.
// - round: the id of the round the last interview used, to pick by default after New interview, or null.
// - candidate: the name typed so far. Any .candidate-field input saves as it's typed; the page itself keeps its
//   start control off until start-field.js's startProblem has nothing to say.
// - startOptions: [{ label, value }] from start-time.js, Now first (value null) then quarter-hour slots as epoch ms;
//   fromLocalInput there reads a datetime-local value.
// - start: picks the round and opens the interview. candidate defaults to the name typed so far and startedAt
//   (epoch ms) to now; a start in the future shows as a countdown.
import a from './a.js';
import b from './b.js';
import c from './c.js';
import d from './d.js';

export const SETUPS = { a, b, c, d };

// The interview clock runs from startedAt, which defaults to the moment the round is picked.
export const pickRound = (id, candidate, startedAt = Date.now()) => ({ state: { round: id, candidate, startedAt }, route: '#/intro' });
