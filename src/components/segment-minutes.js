import { itemsOf } from '../model/observables.js';
import { floorText, floorWarning } from './floor-warning.js';
import './segment-minutes.css';

const MAX = 180;
const itemOf = (ctx) => itemsOf(ctx.pack).get(ctx.segment.ref);
const liveMinutes = (ctx) => ctx.api.plan().segments[ctx.segment.seg]?.minutes ?? ctx.segment.minutes;
const isOff = (ctx, minutes) => Boolean(ctx.segment.optional) && minutes === 0;

// Off is 0 minutes, and a card or a link can still open an off activity, so its page says so and offers the way back.
export const segmentOff = (ctx) => `<p class="segment-off"${isOff(ctx, liveMinutes(ctx)) ? '' : ' hidden'}>This activity is off.${
  ctx.segment.full ? ` <button type="button" class="segment-off-on">Turn on at ${ctx.segment.full} min</button>` : ''}</p>`;

// How long this part of the interview gets, shared with the room. 0 turns an activity off once you leave its page.
export const segmentMinutes = (ctx) => `${segmentOff(ctx)}<p class="segment-minutes"><label class="segment-minutes-label">Minutes
  <input class="segment-minutes-input" type="number" min="0" max="${MAX}" step="1" value="${liveMinutes(ctx)}"></label> ${floorWarning(itemOf(ctx), liveMinutes(ctx))}</p>`;

// Returns refresh, which brings the page up to the plan's minutes after an edit, mine or a colleague's, and leaves a
// box being typed in alone. onChange redraws what hangs on them. A question card shows only the off notice, so no box.
export function bindSegmentMinutes(root, ctx, onChange = () => {}) {
  const input = root.querySelector('.segment-minutes-input');
  const off = root.querySelector('.segment-off');
  let drawn = liveMinutes(ctx);
  const refresh = () => {
    const minutes = liveMinutes(ctx);
    if (minutes === drawn) return;
    drawn = minutes;
    if (input && input !== input.ownerDocument.activeElement) input.value = minutes;
    if (input) root.querySelector('.segment-minutes .floor-warning').textContent = floorText(itemOf(ctx), minutes);
    off.hidden = !isOff(ctx, minutes);
    onChange();
  };
  input?.addEventListener('change', async ({ target }) => {
    const v = Number(target.value);
    if (!Number.isInteger(v) || v < 0 || v > MAX) return;
    await ctx.api.log({ t: 'put', k: 'segment.minutes', seg: ctx.segment.seg, v });
    refresh();
  });
  off.querySelector('.segment-off-on')?.addEventListener('click', async () => {
    await ctx.api.log({ t: 'put', k: 'segment.minutes', seg: ctx.segment.seg, v: ctx.segment.full });
    refresh();
    (input ?? root).focus();
  });
  return refresh;
}
