import { itemsOf } from '../model/observables.js';
import { floorText, floorWarning } from './floor-warning.js';
import './segment-minutes.css';

const MAX = 180;
const itemOf = (ctx) => itemsOf(ctx.pack).get(ctx.segment.ref);

// How long this part of the interview gets, shared with the room. 0 turns an activity off once you leave its page.
export const segmentMinutes = (ctx) => `<p class="segment-minutes"><label class="segment-minutes-label">Minutes
  <input class="segment-minutes-input" type="number" min="0" max="${MAX}" step="1" value="${ctx.segment.minutes}"></label> ${floorWarning(itemOf(ctx), ctx.segment.minutes)}</p>`;

// Returns refresh, which brings the page up to the plan's minutes after an edit, mine or a colleague's, and leaves a
// box being typed in alone. onChange redraws what hangs on them.
export function bindSegmentMinutes(root, ctx, onChange = () => {}) {
  const input = root.querySelector('.segment-minutes-input');
  let drawn = ctx.segment.minutes;
  const refresh = () => {
    const minutes = ctx.api.plan().segments[ctx.segment.seg]?.minutes ?? ctx.segment.minutes;
    if (minutes === drawn) return;
    drawn = minutes;
    if (input !== input.ownerDocument.activeElement) input.value = minutes;
    root.querySelector('.segment-minutes .floor-warning').textContent = floorText(itemOf(ctx), minutes);
    onChange();
  };
  input.addEventListener('change', async ({ target }) => {
    const v = Number(target.value);
    if (!Number.isInteger(v) || v < 0 || v > MAX) return;
    await ctx.api.log({ t: 'put', k: 'segment.minutes', seg: ctx.segment.seg, v });
    refresh();
  });
  return refresh;
}
