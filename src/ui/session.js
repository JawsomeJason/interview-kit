import { esc } from '../esc.js';
import { elapsed } from '../elapsed.js';
import { checkPrv, checkPub } from '../evidence/check.js';
import { createClock } from '../evidence/clock.js';
import { STREAM_OF } from '../evidence/events.js';
import { serve, unlock, vector } from '../evidence/gate.js';
import { foldEvidence, foldShared, hasDecided, nameOf, roomOf } from '../evidence/reduce.js';
import { openStore } from '../evidence/store.js';
import { exportBundle } from '../evidence/bundle.js';
import { focusOf, layerOf } from '../model/layers.js';
import { itemsOf, observables, planned } from '../model/observables.js';
import { runOfShow } from '../model/timeline.js';
import { onRoute } from '../router.js';
import { bindSessionList, sessionList } from '../components/session-list.js';
import { mountStatus } from '../components/store-status.js';
import { startPage } from '../components/start-page.js';
import { oldInterview } from '../components/old-interview.js';
import { decidePage } from '../components/decide-page.js';
import { debriefPage } from '../components/debrief-page.js';
import { evidenceFile } from '../components/evidence-file.js';
import { helpEntry, helpHint, helpPage, showHelpEntry } from '../components/help.js';
import { markSeen, whatsNewPage } from '../components/whats-new.js';
import { applyScheme, bindSchemeToggle, schemeToggle } from '../components/scheme-toggle.js';
import { bindQuestionSearch, questionSearch } from '../components/question-search.js';
import './session.css';

// Each kind's browser side, found by listing src/kinds/ like the pack loader does: { render, bind }.
const VIEWS = Object.fromEntries(Object.entries(import.meta.glob('../kinds/*/view.js', { eager: true, import: 'default' }))
  .map(([path, view]) => [path.split('/').at(-2), view]));

// What a kind's view may log through ctx.api. Opening, naming, deciding and peeking belong to the core.
const KIND_EVENTS = new Set(['mark', 'prompt', 'note', 'close', 'focus', 'put', 'member']);
const CHECK = { pub: checkPub, prv: checkPrv };
const SLOTS = ['setup.join', 'setup.test', 'header.presence', 'menu.invite', 'menu.relink', 'menu.test', 'banner', 'decide.recorded'];
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const hex12 = (ms) => ms.toString(16).padStart(12, '0');

// The composition root. Owns the open session (one per tab), its logs, the clock and the routes, and hands plugins
// one API, including the Host seam sync uses. Kinds get a ctx with my evidence and the plan, never a peer's.
export async function startSession(root, { pack, plugins = {}, views = VIEWS, stamp = { version: '0', sha: 'unknown' }, now = Date.now }) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  applyScheme();
  const items = itemsOf(pack);
  const byItem = new Map([...items.values()].map((it) => [it.id, observables(it)]));
  const levelName = (id) => pack.ladder.find((l) => l.id === id)?.name ?? id;
  const say = {
    ref: (ref) => byItem.get(ref.slice(0, ref.indexOf('#')))?.find((o) => o.ref === ref)?.text.replace(/\*\*(.+?)\*\*/g, '$1') ?? ref,
    item: (id) => items.get(id)?.title ?? id,
    level: levelName,
    choice: (id) => current?.role.decisions.find((d) => d.id === id)?.label ?? id,
    who: (author) => nameOf(current?.held[author]?.pub ?? []) ?? 'a colleague',
  };

  const bar = doc.createElement('div');
  bar.className = 'session-bar';
  bar.hidden = true;
  const list = doc.createElement('div');
  let store;
  let storeError = '';
  try {
    store = await openStore(pack.id, { retentionDays: pack.options.retentionDays, now });
  } catch (e) {
    // A browser that refuses storage outright (a DOMException) gets the private window advice; the store's own errors
    // already read as a next step.
    storeError = e instanceof DOMException ? '' : e.message;
  }
  const saving = (async () => {
    const [wrote, persisted] = await Promise.all([store ? store.check() : false, win.navigator.storage?.persist?.().catch(() => false) ?? false]);
    if (!wrote) return { ok: false, text: storeError || "This browser won't save notes, often because of a private window. Open the kit in a normal window before the interview." };
    return { ok: true, text: persisted ? 'Notes save on this laptop.'
      : "Notes save on this laptop. This browser hasn't promised to keep them if the disk fills up, so share your evidence after the interview." };
  })();

  // The open session: { sid, me, held: { [author]: { pub, prv } }, clock, role, round }, or null on the setup page.
  let current = null;
  let wantsName = false;
  let previous = null;
  const appended = new Set();
  const unsent = [];
  const updated = [];
  const navigated = new Set();
  const fills = new Map();
  const headerButtons = [];

  const mine = () => current.held[current.me] ??= { pub: [], prv: [] };
  const pubs = () => Object.fromEntries(Object.entries(current.held).map(([a, log]) => [a, log.pub]));
  const derived = () => {
    const evidence = foldEvidence(mine().prv);
    return { plan: foldShared(roomOf(pubs(), current.sid)), evidence, focus: focusOf(current.role, evidence) };
  };

  // My own stream is the outbox: an event is in the log the moment it is stamped, and the store writes it in order.
  function append(body) {
    if (!current || !['ok', 'unsaved'].includes(store.status)) return false;
    const ch = STREAM_OF[body.t];
    const log = mine();
    const e = { n: log[ch].length, h: current.clock.now(), ...body };
    if (!CHECK[ch](e)) throw new TypeError(`Not a valid ${body.t} event`);
    log[ch].push(e);
    // Sync hears of an event once it is on disk, so a reload between the two cannot leave colleagues holding what
    // this laptop lost. One the browser could not save yet waits in the store's tail and is announced when it lands.
    store.append(current.sid, current.me, ch, e).then((outcome) => {
      if (outcome === 'saved' || outcome === 'same') {
        if (e.t === 'note') draft.landed(e);
        for (const fn of appended) fn(ch, e);
      }
      else if (outcome === 'held') unsent.push([ch, e]);
      else if (log[ch].includes(e)) { log[ch].splice(log[ch].indexOf(e)); render(); }
    });
    return true;
  }
  store?.onStatus((k) => { if (k === 'ok') for (const [ch, e] of unsent.splice(0)) for (const fn of appended) fn(ch, e); });
  // Taking over, or the other window closing: what that window wrote meanwhile is on disk, and the next event must
  // number and stamp after it.
  store?.onPromoted(async () => {
    const open = current;
    const held = open && await store.read(open.sid);
    if (!held || current !== open) return;
    open.held = held;
    for (const log of Object.values(held)) for (const e of [...log.pub, ...log.prv]) open.clock.receive(e.h);
    render();
  });

  // A colleague's events, from sync or a file: in order, each checked against its stream. A repeat must match what
  // is held; a gap asks the caller to pull again from where this log ends.
  function receive(author, ch, events) {
    if (!current || !events.every(CHECK[ch])) return null;
    const log = current.held[author] ??= { pub: [], prv: [] };
    for (const e of events) {
      const have = log[ch].length;
      if (e.n > have) return { gapFrom: have };
      if (e.n < have) {
        if (canon(log[ch][e.n]) !== canon(e)) return { mismatch: e.n };
        continue;
      }
      log[ch].push(e);
      current.clock.receive(e.h);
      store.append(current.sid, author, ch, e);
    }
    return null;
  }

  const sessionKey = `interview-kit:${pack.id}:open`;
  const remember = (sid) => { try { if (sid) win.sessionStorage.setItem(sessionKey, sid); else win.sessionStorage.removeItem(sessionKey); } catch {} };
  // A note typed inside its save pause: IndexedDB drops a write begun while the page unloads, so a reload would lose
  // it. The text waits in this tab's sessionStorage until it is on disk, and is logged when the interview opens again.
  const draftKey = `${sessionKey}:note`;
  const draft = {
    keep: (scope, text) => { try { win.sessionStorage.setItem(draftKey, JSON.stringify({ sid: current.sid, scope, text })); } catch {} },
    // Once the note it holds is on disk.
    landed: (e) => {
      const d = draft.take();
      try { if (d?.scope === e.scope && d.text === e.text) win.sessionStorage.removeItem(draftKey); } catch {}
    },
    take: () => { try { return JSON.parse(win.sessionStorage.getItem(draftKey)); } catch { return null; } },
  };

  async function openSession(sid) {
    const record = await store.session(sid);
    if (!record) return false;
    await store.claim(sid, record.author);
    const held = await store.read(sid);
    const first = Object.values(held).flatMap((log) => log.pub).find((e) => e.t === 'open');
    const role = pack.roles.find((r) => r.id === first?.role);
    const round = pack.rounds.find((r) => r.id === first?.round);
    if (!role || !round) return false;
    const clock = createClock(now);
    for (const log of Object.values(held)) for (const e of [...log.pub, ...log.prv]) clock.receive(e.h);
    current = { sid, me: record.author, held, clock, role, round };
    remember(sid);
    const d = draft.take();
    if (d?.sid === sid && d.text !== (derived().evidence.notes.get(d.scope) ?? '')) append({ t: 'note', scope: d.scope, text: d.text });
    return true;
  }

  async function newSession({ roleId, roundId, candidate, name, startedAt = now(), ...ids }) {
    const joining = Boolean(ids.sid);
    const role = pack.roles.find((r) => r.id === roleId);
    const { sid, author } = await store.create(ids);
    await store.claim(sid, author);
    current = { sid, me: author, held: {}, clock: createClock(now), role, round: pack.rounds.find((r) => r.id === roundId) };
    remember(sid);
    append({ t: 'open', v: 2, sid, author, role: roleId, round: roundId, pack: { id: pack.id, ...stamp } });
    if (name) append({ t: 'name', name });
    if (candidate) append({ t: 'put', k: 'session.candidate', v: candidate });
    if (!joining) append({ t: 'put', k: 'session.startedAt', v: hex12(startedAt) });
  }

  // Routes: #/<round>/<segment> and #/<round>/<segment>/<item>, #/decide and #/debrief. The setup page has none.
  const steps = () => runOfShow(current.round, derived().plan).steps;
  const singleItem = (step) => (typeof step.ref === 'string' && items.has(step.ref) ? step.ref : null);
  function routes() {
    const plan = derived().plan;
    return steps().flatMap((step) => {
      const ids = singleItem(step) ? [] : planned(pack, [step], plan);
      return [`#/${step.seg}`, ...ids.map((id) => `#/${step.seg}/${id}`)];
    });
  }
  const hash = () => win.location.hash;
  let byCode = false;
  const navigate = (route) => { byCode = true; win.location.hash = route; };
  const go = (d) => {
    const all = routes();
    const next = all[all.indexOf(hash()) + d];
    if (next) navigate(next);
  };

  // ---- Rendering ----
  const fill = (scope, ctx) => {
    for (const el of scope.querySelectorAll('[data-slot]')) for (const fn of fills.get(el.dataset.slot) ?? []) fn(el, ctx);
  };
  const slot = (name) => `<div class="session-slot" data-slot="${name}"></div>`;

  // What's new and Help, linked from the setup page and from each help popup's More in Help.
  function infoPage(route) {
    if (route === '#/whats-new') { markSeen(); return whatsNewPage(); }
    return route === '#/help' || helpEntry(route) ? helpPage() : null;
  }

  // The setup page's start choices follow the clock.
  let refreshStart = null;
  win.setInterval(() => { if (!current) refreshStart?.(now()); }, 30_000);

  async function setup() {
    refreshStart = null;
    const info = infoPage(hash());
    if (info) {
      root.innerHTML = `<main class="main info-page" tabindex="-1"><p><a class="info-back" href="#/">Back to setup</a></p>${info}</main>`;
      showHelpEntry(root.firstElementChild, hash());
      return;
    }
    const rows = store ? await store.sessions() : [];
    root.innerHTML = startPage.render({ pack, wantsName, name: '', previous: Boolean(previous), slot, now: now() });
    root.querySelector('.start-bar').replaceWith(bar);
    list.innerHTML = sessionList(rows);
    root.querySelector('.start-sessions').replaceWith(list);
    root.querySelector('.start-go').disabled = !store;
    oldInterview(root.querySelector('.start-check'));
    saving.then(({ ok, text }) => {
      const el = root.querySelector('.start-saving');
      if (el) { el.textContent = text; el.classList.toggle('is-failed', !ok); }
    });
    refreshStart = startPage.bind(root.firstElementChild, {
      pack,
      now,
      start: async (choice) => { await newSession(choice); previous = null; navigate(`#/${steps()[0].seg}`); render(); },
      undo: async () => { const sid = previous; previous = null; if (await openSession(sid)) render(); },
    });
    fill(root, { setup: true });
  }

  function shell() {
    root.innerHTML = `<button type="button" class="skip-link">Skip to content</button>
  <header class="app-header session-header"></header>
  <div class="app-cols"><nav class="sidebar session-nav" aria-label="Run of show"></nav><main class="main" tabindex="-1"></main></div>${questionSearch()}`;
    root.querySelector('.skip-link').onclick = () => root.querySelector('.main').focus();
    const search = bindQuestionSearch(root.querySelector('.question-search'));
    root.querySelector('.session-nav').addEventListener('click', ({ target }) => {
      const button = target.closest('.session-browse');
      if (button) search.open({ groups: allQuestions(), route: hash() }, button);
    });
    bindSchemeToggle(root.querySelector('.session-header'));
    root.dataset.sid = current.sid;
  }

  // Redrawn only when the markup changes: a note saved on blur redraws the chrome between the mousedown and the mouseup
  // of the click that blurred it, and a replaced link never gets the click.
  const drawn = new WeakMap();
  const draw = (el, html) => {
    if (drawn.get(el) === html) return;
    el.innerHTML = html;
    drawn.set(el, html);
  };

  function header(plan) {
    const el = root.querySelector('.session-header');
    draw(el, `<div class="session-title"><b class="session-candidate">${esc(plan.candidate || 'No name yet')}</b>
      <span class="session-round">${esc(current.role.name)}, ${esc(current.round.name)}</span>
      <span class="session-clock" data-clock></span></div>
    ${slot('header.presence')}
    <div class="session-tools">${headerButtons.map((b, i) => `<button type="button" class="session-tool" data-tool="${i}">${esc(b.label)}</button>`).join('')}
      <details class="session-menu"><summary>Menu</summary><div class="session-menu-items">
        <div class="session-menu-choice"><span class="session-menu-label" aria-hidden="true">Colors</span>${schemeToggle()}</div>${slot('menu.invite')}${slot('menu.relink')}${slot('menu.test')}
        <button type="button" class="session-new">New interview</button></div></details></div>${slot('banner')}`);
    el.append(bar);
    el.onclick = ({ target }) => {
      if (target.closest('.session-new')) { previous = current.sid; current = null; remember(null); win.history.pushState(null, '', win.location.pathname); render(); }
      const tool = target.closest('.session-tool');
      if (tool) headerButtons[tool.dataset.tool].onClick();
    };
  }

  const tick = () => { for (const el of root.querySelectorAll('[data-clock]')) el.textContent = current && derived().plan.startedAt ? elapsed(derived().plan.startedAt, now()) : ''; };
  win.setInterval(tick, 1000);

  // All questions, by pool. A card opens in the round's questions segment that covers its pool, else the first one,
  // and the first thing recorded on it adds it to that segment's plan as asked.
  const questionSteps = () => steps().filter((step) => step.kind === 'questions');
  function allQuestions() {
    const { plan, evidence } = derived();
    const inPlan = new Set(planned(pack, steps(), plan));
    const segFor = (card) => (questionSteps().find((step) => step.ref === 'all' || [step.ref].flat().includes(card.pool)) ?? questionSteps()[0]).seg;
    const { pools, cards } = pack.libs.questions;
    return pools.map((pool) => ({ id: pool.id, name: pool.name, options: cards.filter((c) => c.pool === pool.id).map((c) => ({
      id: c.id, title: c.title, minutes: c.minutes, href: `#/${segFor(c)}/${c.id}`, inPlan: inPlan.has(c.id), done: evidence.closed.has(c.id) })) }));
  }

  // Going over the round's own minutes is allowed; the total only warns, and the browser marks the meter bad.
  function timeMeter(plan) {
    const minutes = runOfShow(current.round, plan).minutes;
    const limit = current.round.segments.reduce((sum, s) => sum + s.minutes, 0);
    const over = minutes - limit;
    return `<p class="session-run-total${over > 0 ? ' is-over' : ''}">${minutes} of ${limit} min${over > 0 ? ` · ${over} over` : ''}</p>
      <div class="session-run-meter"><meter class="time-meter" aria-label="Planned minutes" min="0" max="${Math.max(minutes, limit)}" low="${limit}" high="${limit}" optimum="0" value="${minutes}"></meter>${helpHint('time-meter')}</div>`;
  }

  function nav(plan, route) {
    const link = (href, text, extra = '') => `<a class="session-run-link" href="${href}"${href === route ? ' aria-current="page"' : ''}>${text}${extra}</a>`;
    const rows = steps().map((step) => {
      const ids = singleItem(step) ? [] : planned(pack, [step], plan);
      return `<li class="session-run-step">${link(`#/${step.seg}`, esc(step.title), ` <span class="session-run-min">${step.minutes} min</span>`)}${ids.length
        ? `<ol class="session-run-items">${ids.map((id) => `<li>${link(`#/${step.seg}/${id}`, esc(items.get(id).title))}</li>`).join('')}</ol>` : ''}</li>`;
    }).join('');
    const decided = hasDecided(mine().pub);
    draw(root.querySelector('.session-nav'), `<ol class="session-run">${rows}</ol>${timeMeter(plan)}${questionSteps().length ? '<button type="button" class="session-browse">Browse all questions</button>' : ''}
      <ol class="session-run session-run-end"><li>${link('#/decide', decided ? 'Your decision' : 'Decide')}</li><li>${link('#/debrief', 'Debrief')}</li></ol>`);
  }

  // The item on screen. Opening it only to look, by a link, the pager or Follow, records nothing; the first mark,
  // prompt, note or Done on it adds it to the room's plan as asked, so "Not asked" still means nobody probed it.
  let looking = null;
  const RECORDS = new Set(['mark', 'prompt', 'note', 'close']);

  // A view redraws itself after its own events, keeping focus and the note caret, so only the chrome follows.
  const api = {
    evidence: () => derived().evidence,
    plan: () => derived().plan,
    log(body) {
      if (!KIND_EVENTS.has(body?.t)) throw new TypeError(`A view may not log ${body?.t}`);
      if (RECORDS.has(body.t) && looking && !derived().plan.segments[looking.seg]?.asked?.includes(looking.id)) {
        append({ t: 'member', k: 'segment.asked', seg: looking.seg, id: looking.id, v: true });
      }
      const ok = append(body);
      if (ok) chrome();
      return ok;
    },
    draft: (scope, text) => draft.keep(scope, text),
  };

  function viewCtx(step, item) {
    const { plan, evidence, focus } = derived();
    return { pack, role: current.role, round: current.round, segment: step, item, plan, evidence, focus, api,
      layerOf: (level) => layerOf(pack.ladder, focus, level), href: (id) => `#/${step.seg}${id ? `/${id}` : ''}`, route: hash() };
  }

  function segmentPage(main, route) {
    const [seg, item = null] = (() => {
      const parts = route.slice(2).split('/');
      return [`${parts[0]}/${parts[1]}`, parts[2] ?? null];
    })();
    const step = steps().find((s) => s.seg === seg) ?? steps()[0];
    const opened = item ?? singleItem(step);
    looking = opened && byItem.get(opened)?.length ? { seg: step.seg, id: opened } : null;
    const view = views[step.kind];
    const ctx = viewCtx(step, item);
    main.innerHTML = view.render(ctx);
    view.bind?.(main, ctx);
  }

  const share = () => current && evidenceFile.share(doc, {
    candidate: derived().plan.candidate, name: nameOf(mine().pub), decided: hasDecided(mine().pub),
    setName: (name) => append({ t: 'name', name }),
    bundle: () => exportBundle(mine(), current.me),
  });
  let notice = '';
  const addEvidence = async (file) => {
    notice = await evidenceFile.add(file, {
      open: mine().pub[0], me: current.me, candidate: derived().plan.candidate, receive,
      after: (author) => `Added ${nameOf(current.held[author].pub) ?? 'a colleague'}'s evidence.${
        hasDecided(mine().pub) && hasDecided(current.held[author].pub) ? '' : ' It opens once you have both decided.'}`,
    });
    await render();
  };

  // Logs a peek at each decided colleague whose evidence I had not seen yet, so what I record afterwards says so.
  const peek = () => {
    for (const p of unlock(current.held, current.me)?.participants ?? []) {
      if (p.author !== current.me && !derived().evidence.peeks.has(p.author)) append({ t: 'peek', from: p.author });
    }
  };

  // What a slot's fn gets: the pack, the plan and my evidence, the gate's Unlocked (null before my decision), and peek
  // for a slot that shows colleagues' evidence.
  const slotCtx = (plan, evidence) => ({ pack, role: current.role, round: current.round, plan, evidence, unlocked: unlock(current.held, current.me), peek });

  // The header and the run of show, with their slots, redrawn whenever the logs change.
  function chrome() {
    const { plan, evidence } = derived();
    header(plan);
    nav(plan, hash());
    for (const part of root.querySelectorAll('.session-header, .session-nav')) fill(part, slotCtx(plan, evidence));
    tick();
    for (const fn of updated) fn();
  }

  // The pages that show colleagues' state; a colleague's events redraw them, and only the chrome elsewhere.
  const peerPage = () => hash() === '#/decide' || hash() === '#/debrief';

  function sessionPage() {
    if (!root.querySelector('.session-header') || root.dataset.sid !== current.sid) shell();
    const { plan, evidence } = derived();
    const route = hash();
    header(plan);
    nav(plan, route);
    const main = root.querySelector('main');
    const arrived = main.dataset.route !== route;
    const common = { pack, role: current.role, round: current.round, plan, evidence, me: current.me, held: current.held, say, share, addEvidence, slot, notice,
      record: ({ choice, level, why }) => { append({ t: 'decide', choice, ...(level && { level }), why }); if (!hasDecided(mine().pub)) append({ t: 'decided' }); render(); },
      peek };
    notice = '';
    const info = infoPage(route);
    if (route === '#/decide') decidePage(main, common);
    else if (route === '#/debrief') debriefPage(main, common);
    else if (info) { main.innerHTML = info; showHelpEntry(main, route); }
    else if (/^#\/[a-z0-9-]+\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(route)) segmentPage(main, route);
    else { navigate(routes()[0]); return; }
    main.dataset.route = route;
    fill(root, slotCtx(plan, evidence));
    tick();
    if (arrived && !main.contains(doc.activeElement)) main.focus();
  }

  let rendering = Promise.resolve();
  function render() {
    rendering = rendering.then(() => (current ? sessionPage() : setup())).then(() => { for (const fn of updated) fn(); });
    return rendering;
  }

  bindSessionList(list, {
    open: async (sid) => { if (await openSession(sid)) { navigate('#/decide'); render(); } },
    keep: async (sid) => { await store.keep(sid); render(); },
    remove: async (sid) => { await store.remove(sid); render(); },
    share: async (sid) => {
      const record = await store.session(sid);
      const held = await store.read(sid);
      const log = held[record.author];
      evidenceFile.share(doc, { candidate: foldShared({ [record.author]: log.pub }).candidate, name: nameOf(log.pub), decided: hasDecided(log.pub),
        setName: () => {}, bundle: () => exportBundle(log, record.author) });
    },
  });
  if (store) mountStatus(bar, store, { share: () => share() });

  // ---- The plugin API and the Host seam ----
  const host = {
    me: () => current && { sid: current.sid, author: current.me, name: nameOf(mine().pub), pack: { id: pack.id, ...stamp }, role: current.role.id, round: current.round.id },
    vector: (receiver) => vector(current.held, current.me, receiver),
    serve: (pull, requester) => serve(current.held, current.me, pull, requester),
    receive: (author, ch, events) => {
      const out = receive(author, ch, events);
      if (peerPage()) render(); else chrome();
      return out;
    },
    onAppend: (fn) => { appended.add(fn); return () => appended.delete(fn); },
    route: hash,
    navigate,
    onNavigate: (fn) => { navigated.add(fn); return () => navigated.delete(fn); },
    // A room this browser is already in, opened again from its link in a new tab.
    open: async (sid) => {
      if (!store || !(await openSession(sid))) return false;
      previous = null;
      await render();
      return true;
    },
    join: async ({ sid, author, roleId, roundId, name }) => {
      if (!store || !pack.roles.find((r) => r.id === roleId) || !pack.rounds.find((r) => r.id === roundId)) return false;
      await newSession({ sid, author, roleId, roundId, name });
      previous = null;
      navigate(`#/${steps()[0].seg}`);
      await render();
      return true;
    },
  };
  const pluginApi = {
    host,
    pack,
    stamp,
    route: hash,
    navigate,
    next: () => go(1),
    prev: () => go(-1),
    session: () => (current ? { round: current.round.name, elapsed: derived().plan.startedAt ? elapsed(derived().plan.startedAt, now()) : '' } : { round: null, elapsed: '' }),
    onUpdate: (fn) => { updated.push(fn); },
    headerButton: (label, onClick) => { headerButtons.push({ label, onClick }); },
    // fn(el, ctx) runs on every render that shows the slot. 'decide.recorded' shows only once I have decided, with
    // ctx.unlocked from the gate.
    slot: (name, fn) => {
      if (!SLOTS.includes(name)) throw new TypeError(`No slot named "${name}". Slots: ${SLOTS.join(', ')}.`);
      fills.set(name, [...fills.get(name) ?? [], fn]);
    },
    askName: () => { wantsName = true; },
    doc: () => root.ownerDocument,
    moveApp: (parent, before = null) => { parent.insertBefore(root, before); render(); },
  };
  for (const plugin of Object.values(plugins)) plugin(pluginApi);

  onRoute(() => {
    const byUser = !byCode;
    byCode = false;
    for (const fn of navigated) fn(hash(), byUser);
    return render();
  }, win);

  let reopen = null;
  try { reopen = win.sessionStorage.getItem(sessionKey); } catch {}
  if (store && reopen && !(await openSession(reopen))) remember(null);
  await render();
  return { host, plugin: pluginApi, view: api };
}
