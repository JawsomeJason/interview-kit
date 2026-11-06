import { esc } from '../esc.js';
import { bookmark, circleCheck, externalLink, pause, play, skipForward } from '../components/icons.js';
import { courseStates, coursePath, finishedOf, moveOnTarget, nextAfter, REASONS, stateLabel, stepName } from '../model/course.js';
import './course.css';

// The keys the course owns, for the shortcuts list. They avoid the Look for panel's 1 to 9, h and n.
export const COURSE_KEYS = [['d', 'Done, and go to the next step'], ['s, then 1, 2 or 3', 'Skip with No time, Already asked or Not relevant'],
  ['b, then a word and Enter', 'Bookmark this moment; Esc keeps the bare stamp'], ['[ and ]', 'Back and forward along the path'], ['Esc', 'Close the Skip or Bookmark row']];

const WORDS = ['strong', 'missed', 'nudged'];
const REASON = Object.fromEntries(REASONS);
const ICON = { current: play, done: circleCheck, skipped: skipForward, resume: pause, off: externalLink };
const kbd = (k) => ` <kbd class="course-kbd" aria-hidden="true">${k}</kbd>`;
const typing = (t) => t?.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t?.tagName)
  || (t?.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range'].includes(t.type));

// The guided course on screen: the rail's steps, the dock under each step's page, its keys, and the page's own memory
// of where the path is (home) and which steps were left unfinished. Every fact it records goes through host.append;
// host.ask(seg, id) records a card as asked, freezing its segment's list the first time.
export function createCourse(host) {
  const { pack, at } = host;
  let home = null;
  let here = null;
  let off = null;
  let last = null;
  let ui = {};
  let after = null;
  let toast = '';
  let focus = null;
  const left = new Map();
  const amended = new Set();

  const plan = () => host.derived().plan;
  const path = () => coursePath(pack, host.round(), plan());
  const states = () => courseStates(path(), { plan: plan(), evidence: host.derived().evidence, here, home, left });
  const stepOf = (key) => path().find((s) => s.key === key);
  const routeOf = (step) => (step.kind === 'card' ? `#/${step.seg}/${step.id}` : `#/${step.seg}`);
  const done = (step) => Boolean(step && finishedOf(plan(), step));
  const begun = () => home !== null || path().some(done);
  const questions = () => host.steps().filter((s) => s.kind === 'questions');

  // What a route shows: a step on the path, a card off it, or a questions segment's Pools page.
  function where(route) {
    const [seg, id] = (() => { const p = route.slice(2).split('/'); return [`${p[0]}/${p[1]}`, p[2]]; })();
    if (id) return stepOf(id) ? { key: id } : pack.libs.questions.cards.some((c) => c.id === id) ? { off: id } : {};
    if (questions().some((s) => s.seg === seg)) return { pools: seg };
    return stepOf(seg) ? { key: seg } : {};
  }

  // Called before every draw. Leaving a step the path had reached, unfinished, gives it a resume dot. Once the call
  // has begun, arriving at a card on the path asks it, however the interviewer got there; before, a card only looks.
  function arrived(route) {
    const w = where(route);
    const key = w.key ?? null;
    if (key === here && (w.off ?? null) === off) return;
    if (here && here !== key && begun() && !done(stepOf(here))) left.set(here, host.now());
    if (here) last = here;
    here = key;
    off = w.off ?? null;
    ui = after ?? {};
    after = null;
    const step = stepOf(key);
    if (!step) return;
    left.delete(key);
    amended.delete(key);
    if (step.kind === 'card' && begun()) host.ask(step.seg, step.id);
  }

  function go(key, { forward = false, then = null } = {}) {
    const step = stepOf(key);
    if (!step) return;
    if (forward) home = key;
    else toast = '';
    after = then;
    host.navigate(routeOf(step));
  }

  function moveOn(from) {
    const target = moveOnTarget(path(), plan(), { from, home, jump: ui.jump });
    ui = {};
    if (target) return go(target, { forward: true });
    home = null;
    host.navigate('#/decide');
  }

  const finish = (body, words) => {
    const step = stepOf(here);
    host.append({ ...body, seg: step.seg, ...(step.id && { id: step.id }) });
    toast = words(step);
    moveOn(step.key);
  };
  const complete = () => finish({ t: 'segment.done' }, (s) => `${s.label} done at ${at(host.now())}.`);
  const skip = (reason) => finish({ t: 'skip', reason }, (s) => `Skipped ${s.label} · ${REASON[reason]}.`);

  // Only the dock redraws for its own rows, so the page around it keeps its scroll, folds and caret.
  function redraw(want) {
    focus = want;
    if (!host.doc().querySelector('.course-dock')) return host.render();
    host.chrome();
  }
  // Brings the dock up to the logs in place, keeping focus on the same control when it is still there.
  function refresh() {
    const el = host.doc().querySelector('.course-dock');
    if (!el) return;
    const html = dock();
    if (el.dataset.drawn === html && !focus) return;
    const a = host.doc().activeElement;
    focus ??= el.contains(a) ? a.dataset.focus ?? a.dataset.course : null;
    el.outerHTML = html;
    host.doc().querySelector('.course-dock').dataset.drawn = html;
    bind(host.doc());
  }
  const openSkip = (jump) => { ui = { skip: true, jump }; redraw('skip-1'); };
  const openBookmark = () => { ui = { bm: { at: host.now() } }; redraw('bm-word'); };
  function saveBookmark(word) {
    const w = String(word ?? '').trim().split(/\s+/)[0].slice(0, 32);
    const id = off ?? stepOf(here)?.id;
    host.append({ t: 'bookmark', ...(id && { id }), ...(w && { word: w }) });
    toast = `Bookmarked ${at(ui.bm.at)}${w ? ` · ${w}` : ''}.`;
    ui = {};
    redraw('main');
  }
  const back = () => {
    if (off) return go(last ?? home);
    const steps = path();
    const i = steps.findIndex((s) => s.key === here);
    if (i > 0) go(steps[i - 1].key);
  };
  function forward() {
    if (off) return go(last ?? home);
    const steps = path();
    const i = steps.findIndex((s) => s.key === here);
    if (i < 0) return;
    if (!done(steps[i])) return openSkip(steps[i + 1]?.key);
    if (here === home) return moveOn(here);
    const h = steps.findIndex((s) => s.key === home);
    if (steps[i + 1]) go(h >= 0 && i + 1 > h ? home : steps[i + 1].key);
  }
  const main = () => {
    if (off) return go(last ?? home);
    if (!done(stepOf(here))) return complete();
    if (home && home !== here) return go(home);
    host.navigate('#/decide');
  };

  // A rail link. Back is free; forward past where the path has reached goes through Skip. Before the call starts,
  // a link only looks.
  function railClick(key) {
    if (!begun() || !here) return false;
    const steps = path();
    const [t, c, h] = [key, here, home].map((k) => steps.findIndex((s) => s.key === k));
    if (t <= Math.max(c, h) || done(stepOf(key)) || left.has(key)) go(key);
    else if (here !== home && h >= 0) go(home, { then: { skip: true, jump: key } });
    else openSkip(key);
    return true;
  }

  // The first edit to a finished step on each visit logs an amend before it, so the original stays in the log.
  function beforeRecord(item) {
    const step = path().find((s) => s.key === item || (s.kind !== 'card' && s.ref === item));
    if (!step || off || !done(step) || amended.has(step.key)) return;
    host.append({ t: 'amend', seg: step.seg, ...(step.id && { id: step.id }) });
    amended.add(step.key);
  }

  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || (!here && !off)) return;
    const fin = !off && done(stepOf(here));
    const act = ui.skip && ['1', '2', '3'].includes(e.key) ? () => skip(REASONS[Number(e.key) - 1][0])
      : e.key === 'Escape' && ui.bm ? () => saveBookmark('')
        : e.key === 'Escape' && ui.skip ? () => { ui = {}; redraw('main'); }
          : { d: main, s: !off && !fin ? () => openSkip() : null, b: openBookmark, '[': back, ']': forward }[e.key];
    if (!act) return;
    e.preventDefault();
    act();
  }

  // ---- Markup ----
  const nameAt = (st) => stepName(st, at);
  const stepLink = (st) => {
    const icon = ICON[st.state === 'current' && st.fin ? st.fin.s : st.state];
    return `<li><a class="course-step is-${st.state}" href="${esc(routeOf(st))}" data-step="${esc(st.key)}" data-title="${esc(st.title)}" aria-label="${esc(nameAt(st))}"${st.state === 'current' ? ' aria-current="step"' : ''}>
      <span class="course-icon" aria-hidden="true">${icon ?? ''}</span><span class="course-label">${esc(st.label)}${st.kind === 'card' ? ` <span class="course-title">${esc(st.title)}</span>` : ''}</span>
      <span class="course-state">${esc(stateLabel(st, at))}</span>${st.appended || st.amended.length ? `<span class="course-badges">${st.appended ? '<span class="course-badge">Added</span>' : ''}${
  st.amended.length ? '<span class="course-badge">Amended</span>' : ''}</span>` : ''}</a></li>`;
  };
  const offLink = (id) => {
    const card = pack.libs.questions.cards.find((c) => c.id === id);
    return `<li><a class="course-step is-off" href="${esc(host.hash())}" aria-current="step" aria-label="Off path, ${esc(card.title)}, opened from Browse all questions">
      <span class="course-icon" aria-hidden="true">${ICON.off}</span><span class="course-label">Off path <span class="course-title">${esc(card.title)}</span></span>
      <span class="course-state">From Browse</span></a></li>`;
  };
  // Named by its label alone, with its state as the description.
  const extra = (href, label, sub, route) => {
    const id = `course-sub-${href.slice(2).replace(/[^a-z0-9]+/g, '-')}`;
    return `<li><a class="course-step is-extra" href="${href}" data-title="${label}" aria-label="${label}" aria-describedby="${id}"${href === route ? ' aria-current="page"' : ''}>
    <span class="course-label">${label}</span>
    <span class="course-state" id="${id}">${sub}</span></a></li>`;
  };

  // The rail: the questions segment's Pools page under its own title, every step on the path, then Decide and Debrief.
  function rail(route, decided) {
    const q = questions()[0];
    const picked = q ? plan().segments[q.seg]?.pools?.length ?? 0 : 0;
    const list = states();
    const cards = list.findLastIndex((s) => s.kind === 'card');
    const items = list.map((st, i) => stepLink(st) + (off && i === cards ? offLink(off) : '')).join('');
    return `${q ? `<ol class="course">${extra(`#/${q.seg}`, esc(q.title), `Pools · ${picked} picked · ${q.minutes} min`, route)}</ol>` : ''}
      <ol class="course course-path">${items}${off && cards < 0 ? offLink(off) : ''}</ol>
      <ol class="course course-end">${extra('#/decide', decided ? 'Your decision' : 'Decide', decided ? 'Recorded' : 'After call', route)}${extra('#/debrief', 'Debrief', 'Course log', route)}</ol>`;
  }

  const toastLine = () => `<p class="course-toast" role="status">${esc(toast)}</p>`;
  const button = (act, label, cls = '', attrs = '') => `<button type="button" class="course-button${cls}" data-course="${act}"${attrs}>${label}</button>`;
  const bookmarkButton = () => button('bm', `${bookmark} Bookmark${kbd('B')}`, '', ' aria-keyshortcuts="b"');
  const bookmarkRow = () => (ui.bm ? `<div class="course-row" role="group" aria-label="Bookmark word"><span class="course-row-lead">${bookmark} Bookmark ${esc(at(ui.bm.at))}</span>
    <input class="course-bm-word" data-focus="bm-word" aria-label="One word for this bookmark, optional" placeholder="one word, optional" maxlength="32">
    ${WORDS.map((w) => button(`bmw:${w}`, w, ' is-chip')).join('')}<span class="course-hint">Enter saves · Esc keeps the bare stamp</span></div>` : '');
  // This card's bookmarks, so a stamp shows it landed. A bookmark off a card names no step.
  const marksLine = () => {
    const id = off ?? stepOf(here)?.id;
    const list = id ? host.derived().evidence.bookmarks.filter((b) => b.id === id) : [];
    return list.length ? `<p class="course-marks">${bookmark} ${list.map((b) => `Bookmark ${esc(at(b.h))}${b.word ? ` · ${esc(b.word)}` : ''}`).join(', ')}</p>` : '';
  };
  const line = (step) => (step ? `${esc(step.label)}${step.kind === 'card' ? ` · ${esc(step.title)}` : ''} <small class="course-min">${step.minutes} min</small>` : 'Decide, after the call');

  // The dock under a step's page: what is on now, what comes next, and the one button that moves on.
  function dock() {
    if (off) {
      const from = stepOf(last ?? home);
      return `<section class="course-dock" aria-label="Next up"><p class="course-where">${ICON.off} Off path · from Browse</p>
        <div class="course-buttons">${button('main', `Back to ${esc(from?.label ?? 'the path')}${kbd('D')}`, ' is-main', ' data-focus="main" aria-keyshortcuts="d"')}${bookmarkButton()}</div>
        ${marksLine()}${bookmarkRow()}${toastLine()}</section>`;
    }
    const step = stepOf(here);
    if (!step) return '';
    const fin = finishedOf(plan(), step);
    if (fin) {
      const back = home && home !== here ? stepOf(home) : null;
      return `<section class="course-dock" aria-label="Next up"><div class="course-revisit" role="note"><b>${fin.s === 'done' ? 'Done' : 'Skipped'} ${esc(at(fin.h))}. Edits become amendments.</b>
        <span>${amended.has(here) ? 'Amendment logged. The original stays in the log.' : 'Notes and marks you change here are logged as an amend.'}</span></div>
        <div class="course-buttons">${button('main', back ? `Back to ${esc(back.label)}${kbd('D')}` : `Go to Decide${kbd('D')}`, ' is-main', ' data-focus="main" aria-keyshortcuts="d"')}${bookmarkButton()}</div>
        ${back ? `<p class="course-next">Back to ${esc(back.label)}: <b>${esc(back.title)}</b></p>` : ''}${marksLine()}${bookmarkRow()}${toastLine()}</section>`;
    }
    const steps = path();
    const isLast = steps.at(-1).key === here;
    const next = ui.jump ? stepOf(ui.jump) : isLast ? null : stepOf(nextAfter(steps, plan(), here));
    const mainLabel = step.kind === 'card' ? 'Complete, next question' : isLast ? 'Done, go to Decide' : 'Done, next';
    const skipRow = ui.skip ? `<div class="course-row" role="group" aria-label="Skip reason"><span class="course-row-lead">${ui.jump
      ? `Skip ${esc(step.label)} to jump to ${esc(stepOf(ui.jump)?.label ?? '')}. Why?` : `Skip ${esc(step.label)}. Why?`}</span>
      ${REASONS.map(([r, l], j) => button(`skip:${r}`, `<kbd class="course-kbd" aria-hidden="true">${j + 1}</kbd> ${l}`, ' is-chip', ` data-focus="skip-${j + 1}" aria-keyshortcuts="${j + 1}"`)).join('')}
      ${button('skip-cancel', `Cancel${kbd('Esc')}`, '', ' aria-keyshortcuts="Escape"')}</div>` : '';
    return `<section class="course-dock" aria-label="Next up"><dl class="course-now"><dt class="course-now-key">Now</dt><dd class="course-now-value is-now">${line(step)}</dd>
      <dt class="course-now-key">${ui.jump ? 'Jump' : 'Next'}</dt><dd class="course-now-value">${line(next)}</dd></dl>
      <div class="course-buttons">${button('main', `${mainLabel}${kbd('D')}`, ' is-main', ' data-focus="main" aria-keyshortcuts="d"')}${bookmarkButton()}${
  button('skip', `${skipForward} Skip${kbd('S')}`, '', ` aria-expanded="${Boolean(ui.skip)}" aria-keyshortcuts="s"`)}</div>${skipRow}${marksLine()}${bookmarkRow()}${toastLine()}</section>`;
  }

  // On a step before the questions start, which pools they come from, a tap from changing them.
  function poolsLine() {
    const q = questions()[0];
    const at = path().findIndex((s) => s.key === here);
    const first = path().findIndex((s) => s.seg === q?.seg);
    if (!q || at < 0 || plan().segments[q.seg]?.started || (first >= 0 && at > first)) return '';
    const names = (plan().segments[q.seg]?.pools ?? []).map((id) => pack.libs.questions.pools.find((p) => p.id === id)?.name ?? id);
    return `<p class="course-pools">Pools: ${names.length ? esc(names.join(', ')) : 'none picked yet'}. <a class="course-pools-link" href="#/${esc(q.seg)}">Edit pools</a></p>`;
  }

  // Under the Pools list: start the path, or go back to where it is.
  function poolsGo() {
    const first = path()[0];
    if (!first) return '';
    if (!begun()) return `<p class="course-pools-go">${button('begin', `Start ${esc(first.label)}`, ' is-main')}</p>`;
    const back = stepOf(home ?? last);
    return back ? `<p class="course-pools-go">${button('resume', `Back to ${esc(back.label)}`, ' is-main')}</p>` : '';
  }

  const onClick = ({ target }) => {
    const b = target.closest('[data-course]');
    if (!b) return;
    const act = b.dataset.course;
    if (act !== 'bm' && !act.startsWith('bmw:')) toast = '';
    if (act === 'main') main();
    else if (act === 'skip') { if (ui.skip) { ui = {}; redraw('skip'); } else openSkip(); }
    else if (act === 'skip-cancel') { ui = {}; redraw('main'); }
    else if (act.startsWith('skip:')) skip(act.slice(5));
    else if (act === 'bm') openBookmark();
    else if (act.startsWith('bmw:')) saveBookmark(act.slice(4));
    else if (act === 'begin') go(path()[0].key, { forward: true });
    else if (act === 'resume') go(home ?? last);
  };
  const onWord = (e) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    saveBookmark(e.key === 'Enter' ? e.target.value : '');
  };

  // Wires the dock and the Pools page's button in a freshly drawn page, and puts focus where the last action wants it.
  // Returns whether it moved focus.
  function bind(scope) {
    for (const el of scope.querySelectorAll('.course-dock, .course-pools-go')) el.addEventListener('click', onClick);
    scope.querySelector('.course-bm-word')?.addEventListener('keydown', onWord);
    const want = focus && scope.querySelector(`[data-focus="${focus}"], [data-course="${focus}"]`);
    focus = null;
    want?.focus();
    return Boolean(want);
  }

  function reset() {
    home = null; here = null; off = null; last = null; ui = {}; after = null; toast = ''; left.clear(); amended.clear();
    const steps = path();
    if (steps.some(done)) home = steps.find((s) => !done(s))?.key ?? null;
  }

  return { arrived, rail, dock, poolsGo, poolsLine, bind, refresh, railClick, beforeRecord, onKey, reset };
}
