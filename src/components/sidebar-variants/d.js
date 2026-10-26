import { esc } from '../../esc.js';
import { overlapIndex } from '../../pick.js';
import { helpHint } from '../help.js';
import { runOfShow, timelineTotal, totalMeter } from '../nav.js';
import { doneText } from '../question-notes.js';
import { isFlagged, reviewDot } from '../review-mark.js';
import './d.css';

// Kept across nav updates: the filter text, the caret while the box has focus, and which pools are open.
let filter = '';
let caret = null;
// The last filter box bound, to find the document the app lives in (the tab, or the Pop out window).
let filterBox = null;
const openPools = new Set();

const terms = (text) => text.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (title, words) => words.every((w) => title.toLowerCase().includes(w));

// Bolds each filter word inside the escaped title.
function hit(title, words) {
  if (!words.length) return esc(title);
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return title.split(re).map((part, i) => (i % 2 ? `<mark class="sb-d-hit">${esc(part)}</mark>` : esc(part))).join('');
}

const current = (href, route) => (href === route ? ' aria-current="page"' : '');
const mins = (n) => `<small class="sb-d-mins">${n} min</small>`;

const partRow = (href, name, minutes, { route }, words, extra = '') =>
  `<a href="${href}" class="sb-d-row"${current(href, route)}><span class="sb-d-title">${hit(name, words)}${extra}</span>${mins(minutes)}</a>`;

// One question: title with its markers, minutes on the right, muted with a check once done.
function questionRow(q, ctx, words, clashes, inPlan = false) {
  const href = `#/q/${q.id}`;
  const others = clashes.get(q.id) ?? [];
  const overlap = others.length ? ` <span class="sb-d-overlap" role="img" aria-label="Overlaps a picked question"
    title="Covers the same ground as ${esc(others.map((p) => p.title).join(', '))}, already picked">⇄</span>` : '';
  const tag = inPlan || !ctx.picked.includes(q) ? '' : ' <small class="sb-d-tag">picked</small>';
  return `<li class="sb-d-item">${doneText(`<a href="${esc(href)}" class="sb-d-row"${current(href, ctx.route)}><span class="sb-d-title">${hit(q.title, words)}${reviewDot(q)}${overlap}${tag}</span>${mins(q.minutes)}</a>`, ctx.done.includes(q.id))}</li>`;
}

// For each question, the picked questions it covers the same ground as.
function clashMap(questions, picked) {
  const index = overlapIndex(questions);
  return new Map(questions.map((q) => [q.id, picked.filter((p) => p !== q && index.get(q.id)?.has(p.id))]));
}

const byPool = (qs) => [...Map.groupBy(qs, (q) => q.pool).values()];

// Pool counts read done / picked / total; the hidden text says it in words.
function count(qs, { picked, done }) {
  const p = qs.filter((q) => picked.includes(q)).length;
  const d = qs.filter((q) => done.includes(q.id) && picked.includes(q)).length;
  const words = `${d} done, ${p} picked, ${qs.length} questions`;
  return `<small class="sb-d-count" title="${words}"><span aria-hidden="true">${d}/${p}/${qs.length}</span><span class="visually-hidden">: ${words}</span></small>`;
}

function parts(ctx) {
  const { picked, done } = ctx;
  const ddNote = picked.length ? ` <small class="sb-d-tag">${picked.filter((q) => done.includes(q.id)).length} of ${picked.length} done</small>` : '';
  return Object.fromEntries(runOfShow(ctx.round, ctx.parts, ctx.dd).map((s) => [s.id, [s.name, s.minutes, s.id === 'deep-dive' ? ddNote : '']]));
}

// The whole plan in order, the picked questions nested under the deep dive, then every pool folded.
function outline(ctx) {
  const clashes = clashMap(ctx.questions, ctx.picked);
  const p = parts(ctx);
  const row = (id) => partRow(`#/${id}`, p[id][0], p[id][1], ctx, [], p[id][2]);
  const total = timelineTotal(ctx.round, ctx.parts, ctx.dd);
  const picked = byPool(ctx.picked).map((qs) => `<li class="sb-d-group"><span class="sb-d-group-name">${esc(qs[0].poolName)}</span>
    <ul class="sb-d-list">${qs.map((q) => questionRow(q, ctx, [], clashes, true)).join('')}</ul></li>`).join('');
  const flagged = ctx.questions.filter(isFlagged).length;
  return `<h2 class="sb-d-heading">Plan</h2>
    <ol class="sb-d-list sb-d-plan">
      <li class="sb-d-item">${row('intro')}</li>
      <li class="sb-d-item">${row('round')}</li>
      <li class="sb-d-item">${row('deep-dive')}${picked ? `<ul class="sb-d-list sb-d-nested">${picked}</ul>` : ''}</li>
      <li class="sb-d-item">${row('outro')}</li>
    </ol>
    <p class="sb-d-total${total.over ? ' is-over' : ''}">${total.text}${helpHint('time-meter')}${totalMeter(total)}</p>
    <h2 class="sb-d-heading">All pools</h2>
    ${[...ctx.pools].map(([id, qs]) => `<details id="d-pool-${esc(id)}" class="sb-d-pool"${openPools.has(id) ? ' open' : ''}>
      <summary class="sb-d-pool-summary"><span class="sb-d-pool-name">${esc(qs[0].poolName)}</span>${count(qs, ctx)}</summary>
      <ul class="sb-d-list">${qs.map((q) => questionRow(q, ctx, [], clashes)).join('')}</ul></details>`).join('')}
    <p class="sb-d-legend">Counts are done / picked / total.
      <span class="sb-d-legend-mark"><span class="review-dot" aria-hidden="true">●</span> needs check${flagged ? ` (${flagged})` : ''}</span>
      <span class="sb-d-legend-mark"><span class="sb-d-overlap" aria-hidden="true">⇄</span> overlaps a picked question</span></p>`;
}

// Flat matches while filtering: plan parts first, then each pool's matching questions.
function results(ctx, words) {
  const clashes = clashMap(ctx.questions, ctx.picked);
  const p = parts(ctx);
  const partHits = Object.entries(p).filter(([, [name]]) => matches(name, words));
  const pools = [...ctx.pools].map(([, qs]) => qs.filter((q) => matches(q.title, words))).filter((qs) => qs.length);
  const n = partHits.length + pools.reduce((sum, qs) => sum + qs.length, 0);
  const html = (partHits.length ? `<h2 class="sb-d-heading">Plan</h2><ul class="sb-d-list">${partHits.map(([id, [name, minutes]]) =>
    `<li class="sb-d-item">${partRow(`#/${id}`, name, minutes, ctx, words)}</li>`).join('')}</ul>` : '')
    + pools.map((qs) => `<h2 class="sb-d-heading">${esc(qs[0].poolName)}</h2>
      <ul class="sb-d-list">${qs.map((q) => questionRow(q, ctx, words, clashes)).join('')}</ul>`).join('')
    + (n ? '' : '<p class="sb-d-empty">Nothing matches.</p>');
  return { html, status: `${n} ${n === 1 ? 'match' : 'matches'}` };
}

const view = (ctx) => {
  const words = terms(filter);
  return words.length ? results(ctx, words) : { html: outline(ctx), status: '' };
};

export default {
  label: 'Outline with search',
  render(ctx) {
    // Runs before main.js swaps the markup, so a focused filter box still holds its caret here.
    const box = filterBox?.ownerDocument.activeElement;
    caret = box?.classList.contains('sb-d-filter') ? [box.selectionStart, box.selectionEnd] : null;
    const { html, status } = view(ctx);
    return `<input type="search" class="sb-d-filter" value="${esc(filter)}" placeholder="Filter plan and pools"
      aria-label="Filter questions and parts" aria-controls="sb-d-results" autocomplete="off" spellcheck="false">
      <p class="sb-d-status" role="status">${status}</p>
      <div id="sb-d-results" class="sb-d-results">${html}</div>`;
  },
  bind(el, ctx) {
    const box = el.querySelector('.sb-d-filter');
    filterBox = box;
    const status = el.querySelector('.sb-d-status');
    const list = el.querySelector('.sb-d-results');
    const links = () => [...list.querySelectorAll('a')];
    const update = () => {
      for (const pool of list.querySelectorAll('.sb-d-pool')) if (pool.open) openPools.add(pool.id.slice(7)); else openPools.delete(pool.id.slice(7));
      const { html, status: text } = view(ctx);
      list.innerHTML = html;
      status.textContent = text;
    };
    if (ctx.question && !ctx.picked.includes(ctx.question)) el.querySelector(`#d-pool-${CSS.escape(ctx.question.pool)}`)?.setAttribute('open', '');
    if (caret) { box.focus(); box.setSelectionRange(...caret); }
    box.addEventListener('input', () => { filter = box.value; update(); });
    // While filtering, Enter opens the first match and the arrow keys walk the matches.
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && box.value) {
        e.preventDefault();
        e.stopPropagation();
        box.value = '';
        filter = '';
        update();
      } else if (e.key === 'Enter' && filter.trim() && links()[0]) {
        e.preventDefault();
        ctx.navigate(links()[0].getAttribute('href'));
      } else if (e.key === 'ArrowDown' && links()[0]) {
        e.preventDefault();
        links()[0].focus();
      }
    });
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const all = links();
      const i = all.indexOf(el.ownerDocument.activeElement);
      if (i < 0) return;
      e.preventDefault();
      (e.key === 'ArrowDown' ? all[i + 1] ?? all[i] : all[i - 1] ?? box).focus();
    });
  },
};
