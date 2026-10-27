import { esc } from '../../esc.js';
import { md } from '../../markdown.js';
import { itemsOf } from '../../model/observables.js';
import { questionList } from '../../model/timeline.js';
import { assess, bindAssess, draw, itemPage } from '../../ui/assess.js';
import { helpHint } from '../../components/help.js';
import { hint } from '../../components/hint.js';
import { optionRow } from '../../components/option-row.js';
import { reviewAlert } from '../../components/review-mark.js';
import { overlapsIn, poolStatus } from './pick.js';
import './view.css';

const MAX_PASSIONS = 12;
const MAX_LABEL = 60;
const MINUTES = { min: 5, max: 60 };

// Everything a questions segment derives from the pack and the shared plan.
function segment(ctx, step) {
  const lib = ctx.pack.libs.questions;
  const pools = step.ref === 'all' ? lib.pools : lib.pools.filter((p) => [step.ref].flat().includes(p.id));
  const cards = lib.cards.filter((c) => pools.some((p) => p.id === c.pool));
  const plan = ctx.api.plan();
  const own = plan.segments[step.seg] ?? {};
  const minutes = own.minutes ?? ctx.round.segments.find((s) => s.id === step.id).minutes;
  const picked = { pools: own.pools ?? [], minutes };
  return { lib, pools, cards, plan, picked, minutes, list: questionList(cards, own, minutes), closed: ctx.api.evidence().closed };
}

const poolName = (lib, id) => lib.pools.find((p) => p.id === id)?.name ?? id;
const link = (ctx, card, text = esc(card.title)) => `<a href="${esc(ctx.href(card.id))}" class="question-link">${text}</a>`;
const meta = (lib, card) => `${esc(poolName(lib, card.pool))} · ${card.minutes} min`;
const done = (s, card) => (s.closed.has(card.id) ? ' <span class="picker-done">Done ✓</span>' : '');

const passions = (s) => {
  const ticked = new Set(s.plan.passions.map((p) => p.id));
  const free = s.plan.passions.filter((p) => !s.pools.some((pool) => pool.id === p.id));
  const full = s.plan.passions.length >= MAX_PASSIONS;
  return `<fieldset class="picker-passions"><legend class="picker-legend">What do you specialize in, or what excites you?</legend>
    ${s.pools.map((p) => optionRow({ type: 'checkbox', value: p.id, checked: ticked.has(p.id), disabled: full && !ticked.has(p.id), key: `passion:${p.id}` }, esc(p.name), 'picker-passion')).join('')}
    ${free.map((p) => `<div class="picker-row">${optionRow({ type: 'checkbox', value: p.id, checked: true, key: `passion:${p.id}` }, esc(p.label), 'picker-passion')}
      <small class="picker-note">No questions for this one. Search All questions.</small></div>`).join('')}
    <p class="picker-add"><label class="picker-add-label">Add another… <input class="picker-add-text" maxlength="${MAX_LABEL}" data-key="add-text"${full ? ' disabled' : ''}></label>
      <button type="button" class="picker-add-button" data-key="add"${full ? ' disabled' : ''}>Add</button></p></fieldset>`;
};

const statusNote = (st, id) => {
  if (st.order) return st.order === 1 ? 'main focus' : String(st.order);
  if (!st.noRoom) return '';
  return hint(`room-${id}`, 'no room', st.minutesNeeded ? `${st.minutesNeeded} minutes required to include` : "Doesn't fit even at 60 minutes");
};

const pools = (s) => {
  const byPool = new Map(s.pools.map((p) => [p.id, s.cards.filter((c) => c.pool === p.id)]));
  return `<fieldset class="picker-pools"><legend class="picker-legend">Pools${helpHint('pick')}</legend>${s.pools.map((p) => {
    const st = poolStatus(s.picked, byPool, p.id);
    return `<div class="picker-row">${optionRow({ type: 'checkbox', value: p.id, checked: Boolean(st.order), disabled: st.noRoom, key: `pool:${p.id}` }, esc(p.name), 'picker-pool')}`
      + ` <small class="picker-note">${statusNote(st, p.id)}</small></div>`;
  }).join('')}</fieldset>`;
};

const minutesControl = (s) => `<p class="picker-minutes"><label class="picker-minutes-label">Minutes
  <input class="picker-minutes-range" type="range" min="${MINUTES.min}" max="${MINUTES.max}" step="1" value="${s.minutes}" data-key="minutes-range"></label>
  <input class="picker-minutes-number" type="number" min="${MINUTES.min}" max="${MINUTES.max}" step="1" value="${s.minutes}" aria-label="Minutes, type a number" data-key="minutes-number"></p>`;

const pickedList = (ctx, s) => `<ol class="picker-list">${s.list.map((c) => `<li>${link(ctx, c)} · ${meta(s.lib, c)}${done(s, c)}</li>`).join('')}</ol>
  <p class="picker-total">${s.list.reduce((sum, c) => sum + c.minutes, 0)} min of ${s.minutes}</p>`;

const picker = (ctx, s) => `<h1>${esc(ctx.segment.title)}</h1>${passions(s)}${pools(s)}${minutesControl(s)}${pickedList(ctx, s)}`;

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function bindPicker(root, ctx) {
  const box = root.querySelector('.picker');
  const s = () => segment(ctx, ctx.segment);
  const seg = ctx.segment.seg;
  const write = async (...events) => {
    for (const e of events) await ctx.api.log(e);
    draw(box, picker(ctx, s()));
  };
  box.addEventListener('input', ({ target }) => {
    if (target.closest('.picker-passion')) {
      const now = s();
      const pool = now.pools.find((p) => p.id === target.value);
      // A tick also picks the passion's pool, so the deep dive starts from what the candidate loves. An untick
      // leaves the pool picked; pools untick on their own.
      const pick = target.checked && pool && !now.picked.pools.includes(pool.id);
      write({ t: 'member', k: 'session.passions', id: target.value, v: target.checked ? pool.name : null },
        ...(pick ? [{ t: 'member', k: 'segment.pools', seg, id: pool.id, v: true }] : []));
    } else if (target.closest('.picker-pool')) {
      write({ t: 'member', k: 'segment.pools', seg, id: target.value, v: target.checked ? true : null });
    }
  });
  box.addEventListener('change', ({ target }) => {
    const v = Number(target.value);
    if (target.matches('.picker-minutes-range, .picker-minutes-number') && Number.isInteger(v) && v >= MINUTES.min && v <= MINUTES.max) {
      write({ t: 'put', k: 'segment.minutes', seg, v });
    }
  });
  const add = () => {
    const field = box.querySelector('.picker-add-text');
    const label = field.value.trim().slice(0, MAX_LABEL);
    const id = `x-${slug(label)}`;
    if (!slug(label) || s().plan.passions.some((p) => p.id === id)) return;
    write({ t: 'member', k: 'session.passions', id, v: label }).then(() => box.querySelector('.picker-add-text')?.focus());
  };
  box.addEventListener('click', ({ target }) => { if (target.matches('.picker-add-button')) add(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.picker-add-text')) { e.preventDefault(); add(); } });
}

// The card's place in the segment's list when it is there, else among its pool, as when opened from All questions.
const pagerList = (s, card) => (s.list.includes(card) ? s.list : s.lib.cards.filter((c) => c.pool === card.pool));
// The pool shortens with an ellipsis (its full name in the title) so the minutes and the arrows keep their room.
const pagerMeta = (lib, card) => {
  const name = esc(poolName(lib, card.pool));
  return `<span class="pager-meta"><span class="pager-pool" title="${name}">${name}</span><span class="pager-sep">·</span><span class="pager-minutes">${card.minutes} min</span></span>`;
};
const step = (ctx, card, label) => (card ? link(ctx, card, label) : `<span class="pager-off">${label}</span>`);

function cardPage(ctx, s, card) {
  const list = pagerList(s, card);
  const i = list.indexOf(card);
  const clashes = overlapsIn(s.lib.cards, card, s.list.filter((c) => c !== card));
  const run = `<div class="pager">${step(ctx, list[i - 1], '← <span class="pager-word">Previous</span>')}${pagerMeta(s.lib, card)}${
    step(ctx, list[i + 1], '<span class="pager-word">Next</span> →')}</div>
    ${reviewAlert(card)}<h1>${esc(card.title)}</h1>${clashes.length ? `<p class="picker-note">Overlaps with ${clashes.map((c) => link(ctx, c)).join(', ')}${helpHint('overlaps')}</p>` : ''}
    <div class="question-ask">${md.parse(card.ask)}</div>
    ${card.followUps.length ? `<section class="follow-ups"><h2 class="panel-title">Follow-ups</h2><ul class="follow-ups-list">${
      card.followUps.map((text) => `<li>${md.parseInline(text)}</li>`).join('')}</ul></section>` : ''}`;
  return itemPage(run, assess(ctx, itemsOf(ctx.pack).get(card.id), ctx.segment.seg));
}

const cardOf = (ctx) => ctx.pack.libs.questions.cards.find((c) => c.id === ctx.item);

export default {
  render(ctx) {
    const s = segment(ctx, ctx.segment);
    const card = cardOf(ctx);
    return card ? cardPage(ctx, s, card) : `<section class="picker">${picker(ctx, s)}</section>`;
  },
  bind(root, ctx) {
    const card = cardOf(ctx);
    if (card) bindAssess(root.querySelector('.assess'), ctx, itemsOf(ctx.pack).get(card.id));
    else bindPicker(root, ctx);
  },
};
