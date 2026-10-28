import { esc } from '../esc.js';
import { md } from '../markdown.js';
import { nudgesBefore, press } from '../evidence/reduce.js';
import { focusOf, isRequired, layerOf } from '../model/layers.js';
import { observables, prompts } from '../model/observables.js';
import { optionRow } from '../components/option-row.js';
import './assess.css';

const panelKeys = new WeakMap();
const panelLeave = new WeakMap();

// The keys the panel owns, for the shortcuts list.
export const ASSESS_KEYS = [['1 to 9', 'Mark a row seen, or clear it'], ['Shift + number', 'Give the row its next nudge'],
  ['Alt + number', 'Mark the row not seen'], ['h', 'Show or hide the nudges'], ['n', 'Go to Notes'], ['d', 'Mark done'], ['Esc', 'Leave Notes']];

// Open layers first, in the order an interviewer reads them; the folded ones come last.
const LAYERS = { main: '', placement: 'to place below the bar', above: 'headroom', basics: 'basics' };
const FOLDED = new Set(['above', 'basics']);
const MAX_KEY = 9;
const NOTE_IDLE_MS = 2000;

const inline = (text) => md.parseInline(text);
const nudgeRef = (o, k) => `${o.ref}~nudge.${k}`;
const givenOf = (ev, o) => o.nudges.map((_, i) => i + 1).filter((k) => ev.prompts.has(nudgeRef(o, k)));
const numberWords = (ks) => (ks.length === 1 ? `nudge ${ks[0]}` : `nudges ${ks.slice(0, -1).join(', ')} and ${ks.at(-1)}`);
const sentence = (s) => s[0].toUpperCase() + s.slice(1);

// Everything one item's panel shows, derived from my evidence, the plan and my focus. Read live rather than from the
// ctx snapshot, because the panel redraws in place after each gesture, Evaluating at included.
function model(ctx, item, seg) {
  const ev = ctx.api.evidence();
  const focus = focusOf(ctx.role, ev);
  const fallback = Boolean(ctx.api.plan().segments[seg]?.fallback);
  const levelName = (id) => ctx.pack.ladder.find((l) => l.id === id)?.name ?? id;
  // An observable carries no "Why:" or "Good answer:" lines, so they come from its bullet, which is in the same place.
  const rows = observables(item).map((o, i) => ({ o, details: item.lookFor[i].details ?? [] })).filter(({ o }) => !(fallback && o.fallback === false))
    .map((r) => ({ ...r, layer: layerOf(ctx.pack.ladder, focus, r.o.level), mark: ev.marks.get(r.o.ref), given: givenOf(ev, r.o), before: nudgesBefore(ev, r.o.ref) }));
  let key = 0;
  for (const r of rows) if (r.layer === 'main' && key < MAX_KEY) r.key = ++key;
  const groups = Object.keys(LAYERS).flatMap((layer) => ctx.pack.ladder.map((l) => l.id)
    .map((level) => ({ layer, level, name: levelName(level), rows: rows.filter((r) => r.layer === layer && r.o.level === level) }))
    .filter((g) => g.rows.length));
  const stretch = prompts(item).map((p) => ({ ...p, required: isRequired(ctx.pack.ladder, focus, p), asked: ev.prompts.has(p.ref), name: levelName(p.level) }));
  return { ev, rows, groups, stretch, fallback, focus, closed: ev.closed.has(item.id), note: ev.notes.get(item.id) ?? '' };
}

const status = (r) => {
  if (r.mark?.s === 'unseen') return 'Not seen';
  if (r.mark && r.before.length) return `Seen after ${numberWords(r.before.map((p) => Number(p.split('.').at(-1))))}`;
  return r.given.length ? `${sentence(numberWords(r.given))} given` : '';
};

function more(r, fallback) {
  const { o } = r;
  const show = fallback && typeof o.fallback === 'string' ? ['In the fallback', o.fallback] : o.show ? ['Show it', o.show] : null;
  const details = [...(show ? [show] : []), ...r.details.map((d) => [d.label, d.text])];
  if (!details.length && !o.nudges.length) return '';
  const label = [...details.map(([l]) => l), ...(o.nudges.length ? [`${o.nudges.length} nudge${o.nudges.length > 1 ? 's' : ''}`] : [])].join(', ');
  return `<details class="assess-more" data-key="more:${esc(o.ref)}"><summary class="assess-more-summary">${esc(label)}</summary>${
    details.map(([l, t]) => `<p class="assess-detail"><span class="assess-detail-label">${esc(l)}:</span> ${inline(t)}</p>`).join('')}${
    o.nudges.length ? `<ol class="assess-nudges">${o.nudges.map((text, i) => `<li class="assess-nudge">${inline(text)} ${r.given.includes(i + 1)
      ? '<span class="assess-given">Given</span>'
      : `<button type="button" class="assess-button" data-give="${i + 1}" data-key="give:${esc(o.ref)}:${i + 1}">Gave it</button>`}</li>`).join('')}</ol>` : ''}</details>`;
}

function row(r, i, fallback) {
  const { o } = r;
  const state = r.mark?.s ?? '';
  const words = status(r);
  if (r.layer === 'basics') {
    return `<li class="assess-row" data-ref="${esc(o.ref)}" data-state="${state}"><span class="assess-text">${inline(o.text)}</span>
      <button type="button" class="assess-button" data-missing aria-pressed="${state === 'unseen'}" data-key="missing:${esc(o.ref)}">Missing</button></li>`;
  }
  const keyed = r.key ? `<span class="assess-key" aria-hidden="true">${r.key}</span>` : '';
  return `<li class="assess-row" data-ref="${esc(o.ref)}" data-state="${state}">
    ${optionRow({ type: 'checkbox', checked: state === 'seen', key: `press:${o.ref}` }, `${keyed}${inline(o.text)}`, 'assess-press')}
    <button type="button" class="assess-menu-button" popovertarget="assess-menu-${i}" aria-label="More for this row" data-key="menu:${esc(o.ref)}">…</button>
    <div class="assess-menu" id="assess-menu-${i}" popover><button type="button" class="assess-button" data-unseen data-key="unseen:${esc(o.ref)}">${
      state === 'unseen' ? 'Clear not seen' : 'Not seen'}</button></div>
    <p class="assess-status" ${words ? '' : 'hidden'}>${esc(words)}${r.given.length
      ? ` <button type="button" class="assess-button" data-take-back data-key="back:${esc(o.ref)}">Take back</button>` : ''}</p>
    ${more(r, fallback)}</li>`;
}

const group = (g, rows, fallback) => {
  const title = `${esc(g.name)}${LAYERS[g.layer] ? `, ${LAYERS[g.layer]}` : ''}`;
  const list = `<ul class="assess-rows">${g.rows.map((r) => row(r, rows.indexOf(r), fallback)).join('')}</ul>`;
  if (!FOLDED.has(g.layer)) return `<section class="assess-group"><h3 class="assess-group-title">${title}</h3>${list}</section>`;
  const seen = g.rows.filter((r) => r.mark?.s === 'seen').length;
  const missing = g.layer === 'basics' ? g.rows.filter((r) => r.mark?.s === 'unseen').length : 0;
  return `<details class="assess-group" data-key="group:${g.layer}:${g.level}"><summary class="assess-group-title">${title}${
    seen ? ` <span class="assess-count">${seen} of ${g.rows.length} seen</span>` : ''}${
    missing ? ` <span class="assess-flag">${missing} missing</span>` : ''}</summary>${list}</details>`;
};

const promptItem = (p) => `<li class="assess-prompt">${p.required ? '<strong class="assess-ask">Ask this</strong> ' : ''}${inline(p.text)}
  <button type="button" class="assess-button" data-ask="${esc(p.ref)}" aria-pressed="${p.asked}" data-key="ask:${esc(p.ref)}">Asked</button></li>`;

function stretch(m) {
  if (!m.stretch.length) return '';
  const required = m.stretch.filter((p) => p.required);
  const rest = m.stretch.filter((p) => !p.required);
  return `<section class="assess-stretch"><h3 class="assess-group-title">Stretch</h3>${
    required.length ? `<ul class="assess-prompts">${required.map(promptItem).join('')}</ul>` : ''}${
    rest.length ? `<details class="assess-group" data-key="stretch-rest"><summary class="assess-group-title">Other levels</summary><ul class="assess-prompts">${
      rest.map((p) => promptItem({ ...p, text: `${p.name}: ${p.text}` })).join('')}</ul></details>` : ''}</section>`;
}

const body = (ctx, m) => `<label class="assess-focus">Evaluating at <select class="assess-focus-select" data-key="focus">${ctx.pack.ladder.map((l) =>
  `<option value="${esc(l.id)}"${l.id === m.focus ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
  ${m.groups.map((g) => group(g, m.rows, m.fallback)).join('')}${stretch(m)}`;

const doneLabel = (closed) => (closed ? 'Done ✓' : 'Mark done');

// The Assess panel for one item: my Look for rows laid out by layer, the stretch prompts, Notes and Done.
export function assess(ctx, item, seg) {
  const m = model(ctx, item, seg);
  return `<aside class="assess" data-item="${esc(item.id)}" data-seg="${esc(seg)}"><h2 class="panel-title">Look for</h2>
    <div class="assess-body">${body(ctx, m)}</div>
    <section class="assess-notes"><h2 class="panel-title">Notes</h2>
      <textarea class="assess-notes-text" rows="4" aria-label="Notes" maxlength="8000">${esc(m.note)}</textarea>
      <p class="assess-done-line"><button type="button" class="assess-done" aria-pressed="${m.closed}">${doneLabel(m.closed)}</button>
        <span class="assess-done-warn" role="status"></span></p></section></aside>`;
}

// The Run panel beside the Assess panel, the page shape every kind with an item uses.
export const itemPage = (run, panel) => `<div class="item-page"><article class="item-run">${run}</article>${panel}</div>`;

// Replaces box's HTML and puts focus back on the control with the same data-key, keeping open disclosures open.
// Returns the key of a focused control that no longer exists, so the caller can pick where focus goes.
export function draw(box, html) {
  const active = box.ownerDocument.activeElement;
  const focused = box.contains(active) ? active.closest('[data-key]')?.dataset.key : undefined;
  const open = new Set([...box.querySelectorAll('details[open]')].map((d) => d.dataset.key));
  box.innerHTML = html;
  for (const d of box.querySelectorAll('details[data-key]')) d.open = open.has(d.dataset.key);
  if (!focused) return undefined;
  const target = box.querySelector(`[data-key="${CSS.escape(focused)}"]`);
  (target?.matches('details') ? target.querySelector('summary') : target)?.focus();
  return target ? undefined : focused;
}

const typing = (t) => t?.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t?.tagName)
  || (t?.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(t.type));

// Wires the panel: every gesture appends one event, then the rows redraw from the fold with focus kept in place.
export function bindAssess(panel, ctx, item) {
  const seg = panel.dataset.seg;
  const doc = panel.ownerDocument;
  const rowsOf = () => model(ctx, item, seg).rows;
  const find = (ref) => rowsOf().find((r) => r.o.ref === ref);
  const log = async (e) => { await ctx.api.log(e); redraw(); };

  const rowEl = (ref) => panel.querySelector(`.assess-row[data-ref="${CSS.escape(ref)}"]`);
  // A control that left with the redraw (a nudge now given) hands focus to its row.
  function redraw() {
    const lost = draw(panel.querySelector('.assess-body'), body(ctx, model(ctx, item, seg)));
    rowEl(lost?.split(':')[1] ?? '')?.querySelector('[data-key^="press:"], [data-missing]')?.focus();
  }

  const gestures = {
    press: async (r) => {
      await log(press(model(ctx, item, seg).ev, r.o.ref, r.o.digest));
      // The same small pop and buzz as v0.10.0 on every row marked seen, so it says nothing about the candidate.
      if (find(r.o.ref)?.mark?.s === 'seen') { rowEl(r.o.ref)?.classList.add('assess-pop'); doc.defaultView.navigator.vibrate?.(10); }
    },
    nudge: (r) => {
      const k = r.o.nudges.map((_, i) => i + 1).find((n) => !r.given.includes(n));
      if (k) log({ t: 'prompt', p: nudgeRef(r.o, k) });
    },
    unseen: (r) => log({ t: 'mark', o: r.o.ref, d: r.o.digest, s: r.mark?.s === 'unseen' ? 'clear' : 'unseen' }),
  };

  panel.addEventListener('input', ({ target }) => {
    const r = target.matches('.option-row-control') && find(target.closest('.assess-row').dataset.ref);
    if (r) gestures.press(r);
  });
  panel.addEventListener('animationend', ({ target }) => target.closest('.assess-row')?.classList.remove('assess-pop'));
  panel.addEventListener('change', ({ target }) => {
    if (target.matches('.assess-focus-select')) log({ t: 'focus', level: target.value });
  });
  panel.addEventListener('click', ({ target }) => {
    const button = target.closest('button');
    const r = button?.closest('.assess-row') && find(button.closest('.assess-row').dataset.ref);
    if (button?.dataset.give && r) log({ t: 'prompt', p: nudgeRef(r.o, Number(button.dataset.give)) });
    else if (button?.hasAttribute('data-take-back') && r) log({ t: 'prompt', p: nudgeRef(r.o, r.given.at(-1)), given: false });
    else if ((button?.hasAttribute('data-unseen') || button?.hasAttribute('data-missing')) && r) {
      button.closest('[popover]')?.hidePopover();
      gestures.unseen(r);
    } else if (button?.dataset.ask) {
      log({ t: 'prompt', p: button.dataset.ask, ...(button.getAttribute('aria-pressed') === 'true' && { given: false }) });
    }
  });

  const notes = panel.querySelector('.assess-notes-text');
  let timer = null;
  const saveNote = () => {
    clearTimeout(timer);
    if (notes.value !== (ctx.api.evidence().notes.get(item.id) ?? '')) ctx.api.log({ t: 'note', scope: item.id, text: notes.value });
  };
  notes.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(saveNote, NOTE_IDLE_MS); ctx.api.draft(item.id, notes.value); });
  notes.addEventListener('blur', saveNote);
  // Switching away may be the last chance to save; a reload gives none, so the core also keeps the text as a draft.
  const leave = () => { if (panel.isConnected && doc.visibilityState === 'hidden') saveNote(); };
  doc.removeEventListener('visibilitychange', panelLeave.get(doc));
  panelLeave.set(doc, leave);
  doc.addEventListener('visibilitychange', leave);
  // Focus scrolls a textarea only until its caret shows, which can leave the rest of the box and its ring off the edge.
  notes.addEventListener('focus', () => notes.scrollIntoView({ block: 'nearest' }));

  const done = panel.querySelector('.assess-done');
  const warn = panel.querySelector('.assess-done-warn');
  done.addEventListener('click', async () => {
    const m = model(ctx, item, seg);
    await ctx.api.log({ t: 'close', item: item.id, closed: !m.closed });
    done.textContent = doneLabel(!m.closed);
    done.setAttribute('aria-pressed', String(!m.closed));
    warn.textContent = !m.closed && m.stretch.some((p) => p.required && !p.asked) ? 'Stretch not asked' : '';
  });

  // The panel's own keys, live while it is on the page. One panel is on a page at a time, so it takes over from the last.
  const onKey = (e) => {
    if (!panel.isConnected) return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    if (typing(e.target)) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const digit = e.code.match(/^Digit([1-9])$/)?.[1];
    const r = digit && rowsOf().find((x) => x.key === Number(digit));
    let act = null;
    if (r && e.altKey) act = () => gestures.unseen(r);
    else if (r && e.shiftKey) act = () => gestures.nudge(r);
    else if (r) act = () => rowEl(r.o.ref).querySelector('.option-row-control').click();
    else if (!e.altKey && !e.shiftKey) {
      act = {
        h: () => {
          const all = [...panel.querySelectorAll('.assess-more')];
          const open = all.some((d) => !d.open);
          for (const d of all) d.open = open;
        },
        n: () => notes.focus(),
        d: () => done.click(),
      }[e.key];
    }
    if (!act) return;
    e.preventDefault();
    act();
  };
  doc.removeEventListener('keydown', panelKeys.get(doc));
  panelKeys.set(doc, onKey);
  doc.addEventListener('keydown', onKey);
  return { redraw };
}
