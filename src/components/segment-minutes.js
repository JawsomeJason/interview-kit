import './segment-minutes.css';

const MAX = 180;

// How long this part of the interview gets, shared with the room. 0 turns an activity off once you leave its page.
export const segmentMinutes = (ctx) => `<p class="segment-minutes"><label class="segment-minutes-label">Minutes
  <input class="segment-minutes-input" type="number" min="0" max="${MAX}" step="1" value="${ctx.segment.minutes}"></label></p>`;

export function bindSegmentMinutes(root, ctx) {
  root.querySelector('.segment-minutes-input').addEventListener('change', ({ target }) => {
    const v = Number(target.value);
    if (Number.isInteger(v) && v >= 0 && v <= MAX) ctx.api.log({ t: 'put', k: 'segment.minutes', seg: ctx.segment.seg, v });
  });
}
