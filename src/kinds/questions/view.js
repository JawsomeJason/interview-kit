import { esc } from '../../esc.js';
import { md } from '../../markdown.js';
import { digest, itemsOf } from '../../model/observables.js';
import { questionList } from '../../model/timeline.js';
import { assess, bindAssess, draw, itemPage } from '../../ui/assess.js';
import { helpHint } from '../../components/help.js';
import { hint } from '../../components/hint.js';
import { circleCheck } from '../../components/icons.js';
import { reviewAlert } from '../../components/review-mark.js';
import { bindSegmentMinutes, segmentMinutes, segmentOff } from '../../components/segment-minutes.js';
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
  const minutes = own.minutes ?? step.minutes;
  const picked = { pools: own.pools ?? [], minutes };
  return { lib, pools, cards, plan, picked, minutes, list: questionList(cards, own, minutes, lib.cards), closed: ctx.api.evidence().closed, started: own.started };
}

const poolName = (lib, id) => lib.pools.find((p) => p.id === id)?.name ?? id;
const link = (ctx, card, text = esc(card.title)) => `<a href="${esc(ctx.href(card.id))}" class="question-link">${text}</a>`;
const meta = (lib, card) => `${esc(poolName(lib, card.pool))} · ${card.minutes} min`;
const done = (s, card) => (s.closed.has(card.id) ? ' <span class="picker-done">Done ✓</span>' : '');

// One row per pool, with two separate facts: what the candidate claims (They named it, recorded only for the summary and
// the AI packet) and where questions come from (Ask from it, in pick order). A claim the pools lack gets a row of its own.
const NTH = ['1st', '2nd', '3rd'];
const nth = (n) => NTH[n - 1] ?? `${n}th`;
const chip = (cls, pool, label, on, extra = '') => `<button type="button" class="picker-chip ${cls}" data-pool="${esc(pool.id)}" aria-pressed="${on}"
  aria-label="${esc(`${pool.name}: ${label}`)}"${extra}>${on ? circleCheck : ''}${esc(label)}</button>`;

const statusNote = (st, id) => {
  if (!st.noRoom) return '';
  return hint(`room-${id}`, 'no room', st.minutesNeeded ? `${st.minutesNeeded} minutes required to include` : "Doesn't fit even at 60 minutes");
};

function pools(s) {
  const byPool = new Map(s.pools.map((p) => [p.id, s.cards.filter((c) => c.pool === p.id)]));
  const named = new Set(s.plan.passions.map((p) => p.id));
  const full = s.plan.passions.length >= MAX_PASSIONS;
  const free = s.plan.passions.filter((p) => !s.pools.some((pool) => pool.id === p.id));
  const rows = s.pools.map((p) => {
    const st = poolStatus(s.picked, byPool, p.id);
    return `<li class="picker-row"><b class="picker-name">${esc(p.name)}</b><span class="picker-chips">${
      chip('picker-named', p, 'They named it', named.has(p.id), full && !named.has(p.id) ? ' disabled' : '')}${
      chip('picker-ask', p, st.order ? `Ask from it · ${nth(st.order)}` : 'Ask from it', Boolean(st.order), st.noRoom ? ' disabled' : '')}${statusNote(st, p.id)}</span></li>`;
  });
  const claims = free.map((p) => `<li class="picker-row"><b class="picker-name">${esc(p.label)}</b><span class="picker-chips">${
    chip('picker-named', { id: p.id, name: p.label }, 'They named it', true)}<span class="picker-badge">No questions</span></span></li>`);
  return `<ul class="picker-pools">${[...rows, ...claims].join('')}</ul>
    <p class="picker-add"><label class="picker-add-label">They named something else <input class="picker-add-text" maxlength="${MAX_LABEL}" placeholder="Svelte" data-key="add-text"${full ? ' disabled' : ''}></label>
      <button type="button" class="picker-add-button" data-key="add"${full ? ' disabled' : ''}>Add</button> <small class="picker-add-note" role="status"></small></p>`;
}

// Before the segment starts, what the pools pick; after, that a change only adds.
const lead = (ctx, s) => (s.started
  ? `<p class="picker-lead">The ${esc(ctx.segment.title.toLowerCase())} has started. A change now only adds cards at the end.</p>`
  : `<p class="picker-lead"><b>${s.list.length} cards</b>, ${s.list.reduce((sum, c) => sum + c.minutes, 0)} of ${s.minutes} min. "They named it" records what they claim; "Ask from it" picks questions.${helpHint('pick')}</p>`);

const minutesControl = (s) => `<p class="picker-minutes"><label class="picker-minutes-label">Minutes
  <input class="picker-minutes-range" type="range" min="${MINUTES.min}" max="${MINUTES.max}" step="1" value="${s.minutes}" data-key="minutes-range"></label>
  <input class="picker-minutes-number" type="number" min="${MINUTES.min}" max="${MINUTES.max}" step="1" value="${s.minutes}" aria-label="Minutes, type a number" data-key="minutes-number"></p>`;

const pickedList = (ctx, s) => `<ol class="picker-list">${s.list.map((c) => `<li>${link(ctx, c)} · ${meta(s.lib, c)}${done(s, c)}</li>`).join('')}</ol>
  <p class="picker-total">${s.list.reduce((sum, c) => sum + c.minutes, 0)} min of ${s.minutes}</p>`;

const picker = (ctx, s, toast = '') => `${lead(ctx, s)}<p class="picker-toast" role="status">${esc(toast)}</p>${pools(s)}${minutesControl(s)}${pickedList(ctx, s)}`;

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function bindPicker(root, ctx) {
  const box = root.querySelector('.picker-body');
  const s = () => segment(ctx, ctx.segment);
  const seg = ctx.segment.seg;
  const title = ctx.segment.title.toLowerCase();
  const write = (toast, ...events) => {
    for (const e of events) ctx.api.log(e);
    draw(box, picker(ctx, s(), toast));
  };
  box.addEventListener('click', ({ target }) => {
    if (target.matches('.picker-add-button')) return add();
    const b = target.closest('.picker-chip');
    if (!b) return;
    const now = s();
    const on = b.getAttribute('aria-pressed') === 'true';
    const id = b.dataset.pool;
    if (b.matches('.picker-named')) {
      const label = now.pools.find((p) => p.id === id)?.name ?? now.plan.passions.find((p) => p.id === id)?.label;
      return write('', { t: 'member', k: 'session.passions', id, v: on ? null : label });
    }
    const pick = { t: 'member', k: 'segment.pools', seg, id, v: on ? null : true };
    if (!now.started) return write('', pick);
    // Once the segment has started, the cards it listed stay put: a new pool adds after them, an untick drops none.
    ctx.api.log(pick);
    const added = s().list.length - now.list.length;
    write(on ? `The ${title} has started, so nothing is dropped. Untick only stops new cards.`
      : added > 0 ? `Added ${added} cards at the end. Nothing you opened moved.` : 'No minutes left for new cards.');
  });
  box.addEventListener('change', ({ target }) => {
    if (!target.matches('.picker-minutes-range, .picker-minutes-number')) return;
    const v = Number(target.value);
    if (!(target.value !== '' && Number.isInteger(v) && v >= MINUTES.min && v <= MINUTES.max)) { target.value = s().minutes; return; }
    const was = s();
    ctx.api.log({ t: 'put', k: 'segment.minutes', seg, v });
    const added = s().list.length - was.list.length;
    write(was.started && added > 0 ? `Added ${added} cards at the end. Nothing you opened moved.` : '');
  });
  function add() {
    const field = box.querySelector('.picker-add-text');
    const label = field.value.trim().slice(0, MAX_LABEL);
    if (!label) return;
    const now = s();
    const same = (text) => text.toLowerCase() === label.toLowerCase();
    if (now.plan.passions.some((p) => same(p.label)) || now.pools.some((p) => same(p.name))) {
      box.querySelector('.picker-add-note').textContent = `"${label}" is already there.`;
      return;
    }
    // A label with no ASCII letter or digit, or one that slugs like another (C# and C++), is told apart by its digest.
    const taken = (id) => !slug(label) || now.plan.passions.some((p) => p.id === id);
    const id = taken(`x-${slug(label)}`) ? `x-${digest(label)}` : `x-${slug(label)}`;
    write('', { t: 'member', k: 'session.passions', id, v: label });
    box.querySelector('.picker-add-text')?.focus();
  }
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.picker-add-text')) { e.preventDefault(); add(); } });
  return bindSegmentMinutes(root, ctx, () => draw(box, picker(ctx, s())));
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
  const run = `${segmentOff(ctx)}<div class="pager">${step(ctx, list[i - 1], '← <span class="pager-word">Previous</span>')}${pagerMeta(s.lib, card)}${
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
    return card ? cardPage(ctx, s, card) : `<section class="picker"><h1>${esc(ctx.segment.title)}</h1>${segmentMinutes(ctx)}<div class="picker-body">${picker(ctx, s)}</div></section>`;
  },
  bind(root, ctx) {
    const card = cardOf(ctx);
    if (!card) return bindPicker(root, ctx);
    bindAssess(root.querySelector('.assess'), ctx, itemsOf(ctx.pack).get(card.id));
    return bindSegmentMinutes(root, ctx);
  },
};
