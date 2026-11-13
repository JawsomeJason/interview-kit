import { itemsOf } from '../model/observables.js';
import { fitAhead, limitOf } from '../model/timeline.js';
import { floorText, floorWarning } from './floor-warning.js';
import './segment-minutes.css';

export const MAX_MINUTES = 180;
// A whole number in range, or null: an empty box or a typed 12.5 is not a 0.
export const parseMinutes = (text) => (/^\d+$/.test(text) && Number(text) <= MAX_MINUTES ? Number(text) : null);
const itemOf = (ctx) => itemsOf(ctx.pack).get(ctx.segment.ref);
const liveMinutes = (ctx) => ctx.api.plan().segments[ctx.segment.seg]?.minutes ?? ctx.segment.minutes;
const isOff = (ctx, minutes) => Boolean(ctx.segment.optional) && minutes === 0;

// Off is 0 minutes, and a card or a link can still open an off activity, so its page says so and offers the way back.
export const segmentOff = (ctx) => `<p class="segment-off"${isOff(ctx, liveMinutes(ctx)) ? '' : ' hidden'}>This activity is off.${
  ctx.segment.full ? ` <button type="button" class="segment-off-on">Turn on at ${ctx.segment.full} min</button>` : ''}</p>`;

// How long this part of the interview gets, shared with the room. 0 turns an activity off once you leave its page.
export const segmentMinutes = (ctx) => `${segmentOff(ctx)}<p class="segment-minutes"><label class="segment-minutes-label">Minutes
  <input class="segment-minutes-input" type="number" min="0" max="${MAX_MINUTES}" step="1" value="${liveMinutes(ctx)}"></label> ${floorWarning(itemOf(ctx), liveMinutes(ctx))} <span class="segment-minutes-room" role="status"></span></p>`;

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
  // A change is taken from the activities not started yet, so the plan still fits; when they are at their least,
  // this one gets only what fits, and says so.
  const set = async (v) => {
    const plan = ctx.api.plan();
    const items = itemsOf(ctx.pack);
    const changes = fitAhead(ctx.round, plan, (ref) => items.get(ref)?.floor, ctx.segment.seg, v, limitOf(ctx.round, plan), ctx.api.minutesIn());
    for (const [seg, m] of Object.entries(changes)) await ctx.api.log({ t: 'put', k: 'segment.minutes', seg, v: m });
    const given = changes[ctx.segment.seg] ?? liveMinutes(ctx);
    const room = root.querySelector('.segment-minutes-room');
    if (room) room.textContent = given === v ? '' : `Only ${given} min fit: what is still ahead is at its least.`;
    refresh();
    if (input) input.value = liveMinutes(ctx);
  };
  input?.addEventListener('change', () => {
    const v = parseMinutes(input.value);
    if (v === null) { input.value = liveMinutes(ctx); return undefined; }
    return set(v);
  });
  input?.addEventListener('blur', () => { input.value = liveMinutes(ctx); });
  off.querySelector('.segment-off-on')?.addEventListener('click', async () => {
    await set(ctx.segment.full);
    (input ?? root).focus();
  });
  return refresh;
}
