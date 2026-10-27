import { wallOf } from '../evidence/clock.js';
import { unlock } from '../evidence/gate.js';
import { clockTime } from '../start-time.js';
import { merge, mergeHtml, timeline, timelineHtml } from '../views/debrief.js';
import { bindFileButtons, fileButtons } from './evidence-file.js';

// Everyone who has decided, side by side, and a timeline to replay who saw what when. Opening it with a colleague's
// evidence for the first time logs a peek, so anything I record afterwards says so.
export function debriefPage(main, c) {
  const u = unlock(c.held, c.me);
  const files = fileButtons(c.notice);
  if (!u || u.participants.length < 2) {
    main.innerHTML = `<h1>Debrief</h1><p class="debrief-wait">${u
      ? "Nobody else's evidence is here yet. It opens here once a colleague has decided, through sync or a file they share with you."
      : 'The debrief opens once you have decided. <a href="#/decide">Decide</a>'}</p>${files}`;
    bindFileButtons(main, { share: c.share, add: c.addEvidence });
    return;
  }
  for (const p of u.participants) if (p.author !== c.me && !c.evidence.peeks.has(p.author)) c.peek(p.author);
  const events = timeline(u, c.held);
  const last = events.length - 1;
  const ctx = { pack: c.pack, role: c.role };
  main.innerHTML = `<h1>Debrief</h1>
  <div class="debrief-merge">${mergeHtml(merge(u, c.held, ctx))}</div>
  <section class="debrief-replay" aria-labelledby="debrief-replay-title"><h2 id="debrief-replay-title" class="debrief-head">Timeline</h2>
    <div class="debrief-scrub-label"><label for="debrief-scrub">Replay up to</label> <output class="debrief-at" for="debrief-scrub">${clockTime(wallOf(events[last].e.h))}</output>
      <input type="range" id="debrief-scrub" class="debrief-scrub" min="0" max="${last}" value="${last}" aria-valuetext="${clockTime(wallOf(events[last].e.h))}, the latest event"></div>
    <div class="debrief-events">${timelineHtml(events, last, c.say)}</div></section>
  ${files}`;
  main.querySelector('.debrief-scrub').addEventListener('input', ({ target }) => {
    const i = Number(target.value);
    const at = events[i].e.h;
    main.querySelector('.debrief-merge').innerHTML = mergeHtml(merge(u, c.held, ctx, i === last ? undefined : at));
    main.querySelector('.debrief-events').innerHTML = timelineHtml(events, i, c.say);
    main.querySelector('.debrief-at').textContent = clockTime(wallOf(at));
    target.setAttribute('aria-valuetext', `${clockTime(wallOf(at))}, event ${i + 1} of ${last + 1}`);
  });
  bindFileButtons(main, { share: c.share, add: c.addEvidence });
}
