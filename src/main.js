import './style.css';
import './themes/system.css';
import './themes/pack.js';
import { packTheme, parts, questions, rounds, pools } from './content.js';
import { load, save } from './store.js';
import { canUndo, commit, commitUndoable, newInterview, undo } from './undo.js';
import { overlapsIn, pickQuestions } from './pick.js';
import { elapsed } from './elapsed.js';
import { md } from './markdown.js';
import { runOfShow, shell } from './components/nav.js';
import { SIDEBARS } from './components/sidebar-variants/index.js';
import { SETUPS, pickRound } from './components/setup-variants/index.js';
import { HEADERS } from './components/header-variants/index.js';
import { startOptions } from './start-time.js';
import { partPage, roundPage } from './components/round-page.js';
import { deepDivePage, bindDeepDive } from './components/deep-dive-page.js';
import { bindPhoneTabs, overlapNote, pagerStep, questionPage } from './components/question-page.js';
import { bindLookFor } from './components/look-for.js';
import { bindQuestionNotes, withDone, withNotes } from './components/question-notes.js';
import { bindCopySummary, setupLine, summaryText } from './components/copy-summary.js';
import { undoToast } from './components/undo-toast.js';
import { markSeen, whatsNewPage } from './components/whats-new.js';
import { helpEntry, helpPage, pageLinks, showHelpEntry } from './components/help.js';
import { applyLayout, getPrefs, phoneTab, setPhoneTab, trialId } from './components/layout-switcher.js';
import { applyScheme, bindSchemeToggles, schemeToggle } from './components/scheme-toggle.js';
import { applyTheme } from './components/theme-toggle.js';
import { mountTrials } from './components/trials.js';
import { noteLines } from './components/trial-notes.js';
import { bindCandidateFields } from './components/candidate-field.js';
import './layouts/shell.css';
import './layouts/a.css';
import './layouts/b.css';
import './layouts/phone.css';
import * as plugins from './plugins/index.js';
import { onRoute } from './router.js';

const root = document.getElementById('root');
// The window the app lives in now: the tab, or the Pop out window once the plugin moves it there.
const view = () => root.ownerDocument.defaultView;
bindSchemeToggles(root);
applyTheme(packTheme);
// A name saves without change(), so typing one after New interview leaves its Undo running.
bindCandidateFields(root, (name) => {
  state.candidate = name;
  save(state);
  notify();
});
applyScheme();
let state = load();

// Shadow sync exists only in VITE_SYNC=1 builds; a normal build drops this import entirely.
let sync = null;
// Dev tools (src/dev/) exist only on the dev server; builds drop this import. Tests skip them too, since they fetch
// the dev server's own endpoints.
let devTools = [];
if (import.meta.env.DEV && import.meta.env.MODE !== 'test') import('./dev/index.js').then((tools) => { devTools = Object.values(tools); render(); });
if (import.meta.env.VITE_SYNC === '1') {
  import('./sync/sync.js').then(({ startSync }) => { sync = startSync(() => state); render(); });
}

// Re-renders the chosen sidebar variant, keeping open <details> and keyboard focus where they were.
function updateNav(picked) {
  const round = rounds.find((r) => r.id === state.round);
  const route = location.hash;
  const ctx = { round, parts, dd: state.deepDive, picked, done: state.done, pools, questions, route,
    question: questions.find((q) => route === `#/q/${q.id}`), navigate: (hash) => { location.hash = hash; } };
  const body = root.querySelector('.sidebar-body');
  const open = new Map([...body.querySelectorAll('details[id]')].map((d) => [d.id, d.open]));
  const active = root.ownerDocument.activeElement;
  const focused = body.contains(active) ? active.getAttribute('href') : null;
  const sidebar = SIDEBARS[trialId('sidebar', SIDEBARS)];
  body.innerHTML = sidebar.render(ctx);
  for (const d of body.querySelectorAll('details[id]')) if (open.has(d.id)) d.open = open.get(d.id);
  sidebar.bind?.(body, ctx);
  if (focused) body.querySelector(`[href="${CSS.escape(focused)}"]`)?.focus();
  return picked;
}

// Hidden rather than removed, so the toast can fade out; the next render replaces it.
const dropUndoBar = () => root.querySelector('.undo-toast')?.setAttribute('hidden', '');

// Plugins that follow the state (api.onUpdate) hear about every change and render.
const listeners = [];
const headerButtons = [];
const notify = () => { for (const fn of listeners) fn(); };

function change(next = state) {
  state = next;
  commit(state);
  dropUndoBar();
  notify();
}

// Clears state with a 10 second Undo that returns to `route`.
function reset(next, route) {
  commitUndoable(state, next, route, dropUndoBar);
  state = next;
}

function showUndo() {
  if (!canUndo()) return;
  root.querySelector('h1').insertAdjacentHTML('afterend', undoToast());
  root.querySelector('.undo-toast-button').onclick = () => {
    const restored = undo();
    state = restored.state;
    location.hash = restored.route;
    render();
  };
}

const clock = () => (state.startedAt ? elapsed(state.startedAt, Date.now()) : '');

// Every [data-clock] shows the interview clock, on a timer owned by the window the app is in now, so in the Pop out
// window it keeps ticking while the tab behind the call is throttled.
let clockTimer = null;
function tickClocks() {
  if (clockTimer) clockTimer.win.clearInterval(clockTimer.id);
  const win = view();
  const tick = () => { for (const el of root.querySelectorAll('[data-clock]')) el.textContent = clock(); };
  clockTimer = { win, id: win.setInterval(tick, 1000) };
  tick();
}

// Fills the header variant's two spots, the header bar and the top of the phone drawer, in place. It runs again
// when the deep dive minutes change, which the header shows.
let headerMinutes = null;
// The mounted header's route subscriptions (ctx.onRoute); each mount starts them afresh.
let headerRoutes = [];
function mountHeader(round) {
  const header = HEADERS[trialId('header', HEADERS)];
  headerMinutes = state.deepDive.minutes;
  headerRoutes = [];
  for (const spot of ['header', 'drawer']) {
    const ctx = { spot, round, parts, deepDiveMinutes: headerMinutes, candidate: state.candidate ?? '', startedAt: state.startedAt, clock,
      schemeToggle: schemeToggle(), links: pageLinks(), buttons: headerButtons,
      plan: () => runOfShow(round, parts, state.deepDive),
      route: location.hash, onRoute: (fn) => { headerRoutes.push(fn); },
      // Back to the setup page with this round picked; the name is the next thing to fill in.
      newInterview: () => {
        reset(newInterview(state), location.hash);
        history.pushState(null, '', location.pathname);
        render();
        root.querySelector('.candidate-field')?.focus();
      } };
    const old = root.querySelector(spot === 'header' ? '.app-header' : '.sidebar-round');
    old.insertAdjacentHTML('afterend', header.render(ctx));
    const el = old.nextElementSibling;
    old.remove();
    header.bind(el, ctx);
  }
  tickClocks();
  sync?.mount(root);
}

// What's new and Help, linked from the header and, before a round is picked, from the setup page's corner.
function infoPage(route) {
  if (route === '#/whats-new') {
    markSeen();
    for (const dot of root.querySelectorAll('.whats-new-dot')) dot.remove();
    return whatsNewPage();
  }
  return route === '#/help' || helpEntry(route) ? helpPage() : null;
}

// Both the app shell and the setup page carry the Try layouts corner control.
const mountTrialsIn = () => mountTrials(root, [
  { name: 'header', label: 'Header', variants: HEADERS, onPick: () => {
    const round = root.querySelector('nav') && rounds.find((r) => r.id === state.round);
    if (round) mountHeader(round);
  } },
  { name: 'sidebar', label: 'Sidebar', variants: SIDEBARS,
    onPick: () => root.querySelector('nav') && updateNav(pickQuestions(questions, state.deepDive.pools, state.deepDive.minutes)) },
  { name: 'setup', label: 'Setup page', variants: SETUPS, onPick: () => root.querySelector('nav') || render() },
], packTheme);

// Replaces the chosen setup variant's page and leaves the Try layouts control (and its open panel) in place. While the
// page is up, its start choices follow the clock every half minute.
let setupTimer = null;
function setupPage() {
  const setup = SETUPS[trialId('setup', SETUPS)];
  const ctx = { rounds, round: state.lastRound ?? null, candidate: state.candidate ?? '', startOptions: startOptions(Date.now()),
    start: ({ roundId, candidate = state.candidate, startedAt }) => {
      const picked = pickRound(roundId, candidate, startedAt);
      change(picked.state);
      location.hash = picked.route;
      render();
      // The button that started it is gone with the setup page; the first page takes focus instead of the body.
      root.querySelector('.main').focus();
    } };
  for (const el of [...root.children]) if (!el.matches('.trials-corner, .trials-panel')) el.remove();
  root.insertAdjacentHTML('afterbegin', setup.render(ctx));
  const page = root.firstElementChild;
  const follow = setup.bind(page, ctx);
  clearInterval(setupTimer);
  if (follow) setupTimer = setInterval(() => (page.isConnected ? follow(Date.now()) : clearInterval(setupTimer)), 30_000);
}

function render() {
  const round = rounds.find((r) => r.id === state.round);
  if (!round) {
    if (root.querySelector('nav') || !root.querySelector('.trials-panel')) {
      root.innerHTML = '';
      mountTrialsIn();
      root.querySelector('.trials-corner').insertAdjacentHTML('beforeend', `<div class="trials-corner-links" role="navigation" aria-label="About the kit">${pageLinks()}</div>`);
    }
    const fromInfo = root.querySelector('.kit-back') !== null;
    const info = infoPage(location.hash);
    if (info) {
      for (const el of [...root.children]) if (!el.matches('.trials-corner, .trials-panel')) el.remove();
      root.insertAdjacentHTML('afterbegin', `<main class="main" tabindex="-1"><p><a class="kit-back" href="#/">Back to setup</a></p>${info}</main>`);
      view().scrollTo(0, 0);
      showHelpEntry(root.firstElementChild, location.hash);
    } else {
      // An interview route with no interview (browser Back past New interview) leaves the URL as the setup page's.
      if (location.hash && location.hash !== '#/') history.replaceState(null, '', location.pathname + location.search);
      setupPage();
      // Back to setup took the focused link away: land on the name, or the heading when the name is on a later step.
      if (fromInfo) {
        const field = [...root.querySelectorAll('main .candidate-field')].find((f) => !f.closest('[hidden]'));
        const heading = root.querySelector('main h1');
        if (!field) heading.tabIndex = -1;
        (field ?? heading).focus();
      }
    }
    showUndo();
    return notify();
  }
  const dd = (state.deepDive ??= { minutes: round.deepDiveMinutes, pools: [] });
  state.ticks ??= {};
  state.notes ??= {};
  state.done ??= [];
  const pick = () => pickQuestions(questions, dd.pools, dd.minutes);
  if (!root.querySelector('nav')) {
    root.innerHTML = shell('<header class="app-header"></header>', '<p class="sidebar-round"></p>');
    mountHeader(round);
    mountTrialsIn();
    root.querySelector('.skip-link').onclick = () => root.querySelector('.main').focus();
  }
  const route = location.hash;
  for (const field of root.querySelectorAll('.candidate-field')) if (field !== root.ownerDocument.activeElement) field.value = state.candidate ?? '';
  const focused = root.ownerDocument.activeElement;
  const picked = updateNav(pick());
  const q = questions.find((q) => route === `#/q/${q.id}`);
  const main = root.querySelector('main');
  if (route === '#/deep-dive') {
    main.innerHTML = deepDivePage(dd, pools, rounds, picked, state.ticks, state.done);
    bindDeepDive(main.firstElementChild, dd, pools, state.ticks, state.done, () => {
      change();
      if (dd.minutes !== headerMinutes) mountHeader(round);
      return updateNav(pick());
    });
    bindCopySummary(main.querySelector('.copy-summary'), () => summaryText(round, dd, pick(), state.ticks, state.notes, state.done, state.candidate,
      [setupLine(getPrefs(), packTheme, matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), ...noteLines(getPrefs().notes)].join('\n')));
  } else if (q) {
    main.innerHTML = questionPage(q, picked.includes(q) ? picked : pools.get(q.pool), state.ticks[q.id], state.notes[q.id], state.done.includes(q.id), phoneTab(), sync?.marks(q.id));
    main.querySelector('.question-text h1').insertAdjacentHTML('afterend', overlapNote(overlapsIn(questions, q, picked)));
    for (const tool of devTools) tool.question?.(main, q);
    bindPhoneTabs(main, (tab) => { setPhoneTab(tab); view().scrollTo(0, 0); });
    bindLookFor(main.querySelector('.look-for'), (ticked) => { state.ticks[q.id] = ticked; change(); sync?.send(); });
    bindQuestionNotes(main.querySelector('.question-notes'), {
      onNotes: (text) => change(withNotes(state, q.id, text)),
      onDone: () => { change(withDone(state, q.id)); updateNav(pick()); return state.done.includes(q.id); },
    });
  } else {
    main.innerHTML = infoPage(route) ?? partPage(route, parts) ?? roundPage(round);
  }
  applyLayout();
  const panel = root.querySelector('#timeline-panel');
  if (panel.matches(':popover-open')) panel.hidePopover();
  sync?.mount(root);
  showUndo();
  view().scrollTo(0, 0);
  main.scrollTo(0, 0);
  showHelpEntry(main, route);
  // A pager or sidebar link that had focus is gone: land on the new page's heading, not the body.
  if (focused !== root.ownerDocument.body && !focused.isConnected) {
    const heading = main.querySelector('h1') ?? main;
    heading.tabIndex = -1;
    heading.focus();
  }
  notify();
}

// Plugins get this small API and nothing else.
const click = (selector) => root.querySelector(selector)?.click();
const pluginApi = {
  route: () => location.hash,
  next: () => click('.pager > :last-child[href]'),
  prev: () => click('.pager > :first-child[href]'),
  toggleTick: (i) => root.querySelectorAll('.look-for-item input')[i]?.click(),
  focusNotes: () => {
    if (view().matchMedia('(width < 108ch)').matches) click('.phone-tabs-tab[data-tab="assess"]');
    root.querySelector('.question-notes-text')?.focus();
  },
  toggleDone: () => click('.question-notes-done'),
  // Typing into the page's own Notes keeps one save path for both.
  setNotes: (text) => {
    const notes = root.querySelector('.question-notes-text');
    if (!notes) return;
    notes.value = text;
    notes.dispatchEvent(new Event('input'));
  },
  session: () => {
    const round = rounds.find((r) => r.id === state.round);
    const q = round && questions.find((q) => location.hash === `#/q/${q.id}`);
    return {
      round: round?.name ?? null,
      elapsed: round ? clock() : '',
      question: q ? { id: q.id, title: q.title, lookForHtml: q.lookFor.map((text) => md.parseInline(text)),
        ticked: state.ticks?.[q.id] ?? [], notes: state.notes?.[q.id] ?? '' } : null,
    };
  },
  onUpdate: (fn) => { listeners.push(fn); },
  // Added to the header and the phone drawer, next to the scheme toggle.
  headerButton: (label, onClick) => { headerButtons.push({ label, onClick }); },
  // The document the app lives in now, and a way to move it (with its state and listeners) into another one.
  doc: () => root.ownerDocument,
  moveApp: (parent, before = null) => {
    parent.insertBefore(root, before);
    tickClocks();
    notify();
  },
};
for (const plugin of Object.values(plugins)) plugin(pluginApi);

// Previous and Next slide the question in the step's direction (the motion is in style.css); any other route renders in place.
const slides = () => 'types' in (globalThis.ViewTransition?.prototype ?? {}) && view().matchMedia('(prefers-reduced-motion: no-preference)').matches;
onRoute((hash) => {
  for (const fn of headerRoutes) fn(hash);
  const [prev, , next] = root.querySelector('.pager')?.children ?? [];
  const way = pagerStep(prev?.getAttribute('href'), next?.getAttribute('href'), hash);
  if (!way || !slides()) return render();
  const transition = root.ownerDocument.startViewTransition({ update: render, types: [way] });
  // A quick next step skips this slide and rejects `ready`; the render still runs.
  transition.ready.catch(() => {});
  return transition.updateCallbackDone;
});
render();
