// A stand-in for the session (U11) that runs one round of a pack through the kinds' views and the Assess panel, with
// an in-memory log, so a real browser can walk every segment. It builds the view ctx and routes the way
// src/ui/session.js does. window.events is the log in append order.
import '../../src/style.css';
import '../../src/themes/system.css';
// The dev server's review CSS, so a test can place its Questions for you link over a real page.
import '../../src/dev/review/review.css';
import { STREAM_OF } from '../../src/evidence/events.js';
import { createClock } from '../../src/evidence/clock.js';
import { foldEvidence, foldShared } from '../../src/evidence/reduce.js';
import { layerOf } from '../../src/model/layers.js';
import { itemsOf, observables, planned } from '../../src/model/observables.js';
import { runOfShow } from '../../src/model/timeline.js';
import { ASSESS_KEYS } from '../../src/ui/assess.js';

const views = import.meta.glob('../../src/kinds/*/view.js', { eager: true, import: 'default' });
const viewOf = (kind) => views[`../../src/kinds/${kind}/view.js`];

window.startKit = (pack, roleId) => {
  const role = pack.roles.find((r) => r.id === roleId);
  const round = pack.rounds.find((r) => r.id === role.rounds[0]);
  const clock = createClock();
  const log = { pub: [], prv: [] };
  window.events = [];
  let looking = null;
  const api = {
    evidence: () => foldEvidence(log.prv),
    plan: () => foldShared({ me: log.pub }),
    log(e) {
      if (['mark', 'prompt', 'note', 'close'].includes(e.t) && looking && !api.plan().segments[looking.seg]?.asked?.includes(looking.id)) {
        api.log({ t: 'member', k: 'segment.asked', seg: looking.seg, id: looking.id, v: true });
      }
      const stream = log[STREAM_OF[e.t]];
      const event = { n: stream.length, h: clock.now(), ...e };
      stream.push(event);
      window.events.push(event);
      drawNav();
    },
    draft() {},
  };
  const items = itemsOf(pack);
  const ctxFor = (segment, item) => {
    const evidence = api.evidence();
    const focus = evidence.focus ?? role.hiring;
    return { pack, role, round, segment, item, plan: api.plan(), evidence, focus, api, route: location.hash,
      layerOf: (level) => layerOf(pack.ladder, focus, level), href: (id) => `#/${segment.seg}${id ? `/${id}` : ''}` };
  };
  const steps = () => runOfShow(round, api.plan()).steps;
  // A step's own row, then the items it puts in play when it holds more than its one referenced item.
  const rows = () => steps().flatMap((step) => [{ href: `#/${step.seg}`, label: step.title, step, item: null },
    ...(step.kind === 'questions' ? planned(pack, [step], api.plan()).map((id) => ({ href: `#/${step.seg}/${id}`, label: items.get(id).title, step, item: id })) : [])]);

  document.body.innerHTML = `<div class="harness"><nav class="harness-nav" aria-label="Run of show"><ol class="harness-rows"></ol></nav>
    <main class="main harness-main" tabindex="-1"></main></div>
    <div id="harness-keys" class="harness-keys" popover><h2>Keyboard shortcuts</h2><dl>${[['j', 'Next'], ['k', 'Previous'], ...ASSESS_KEYS, ['?', 'Show these keys']]
      .map(([k, w]) => `<dt>${k}</dt><dd>${w}</dd>`).join('')}</dl></div>`;
  const nav = document.querySelector('.harness-rows');
  const main = document.querySelector('.harness-main');
  function drawNav() {
    nav.innerHTML = rows().map((r) => `<li><a href="${r.href}"${r.href === location.hash ? ' aria-current="page"' : ''}>${r.label}</a></li>`).join('');
  }
  function render() {
    const all = rows();
    const [, roundId, segId, itemId = null] = location.hash.split('/');
    const step = steps().find((x) => x.seg === `${roundId}/${segId}`);
    if (!step || (itemId && !items.has(itemId))) { location.hash = all[0].href; return; }
    const opened = itemId ?? (step.kind === 'questions' ? null : step.ref);
    looking = opened && observables(items.get(opened)).length ? { seg: step.seg, id: opened } : null;
    const ctx = ctxFor(step, itemId);
    main.innerHTML = viewOf(step.kind).render(ctx);
    viewOf(step.kind).bind(main, ctx);
    main.dataset.route = location.hash;
    drawNav();
    main.focus();
  }
  const typing = (t) => ['TEXTAREA', 'SELECT'].includes(t?.tagName) || (t?.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range'].includes(t.type));
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const all = rows();
    const at = all.findIndex((r) => r.href === location.hash);
    const go = (d) => { const next = all[at + d]; if (next) location.hash = next.href; };
    const act = { j: () => go(1), k: () => go(-1), '?': () => document.getElementById('harness-keys').togglePopover() }[e.key];
    if (act) { e.preventDefault(); act(); }
  });
  window.addEventListener('hashchange', render);
  render();
};
