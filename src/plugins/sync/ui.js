import { renderSVG } from 'uqr';
import { esc } from '../../esc.js';
import { createRelays, PREFIX } from './link-relay.js';

const SECOND = 1_000;
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const DOT = { connected: '', 'catching-up': '', away: 'away', lost: 'reconnecting', unreachable: '', left: '' };

// Replaces an element's children only when its markup changes, and puts focus back on the control that had it.
const drawn = new WeakMap();
function patch(el, html) {
  if (!el || drawn.get(el) === html) return;
  const key = el.contains(el.ownerDocument.activeElement) ? el.ownerDocument.activeElement.dataset.key : null;
  el.innerHTML = html;
  drawn.set(el, html);
  if (key) el.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
}
const lineHtml = (line, key) => `<span>${esc(line.text)}</span>${line.action?.retry ? ` <button type="button" class="sync-line-action" data-key="${key}-retry" data-retry>${esc(line.action.retry)}</button>` : ''}${
  line.action?.copy ? ` <button type="button" class="sync-line-action" data-key="${key}-copy" data-copy-join>${esc(line.action.copy)}</button>` : ''}`;
const copy = (win, text, button) => win.navigator.clipboard.writeText(text).then(() => { button.textContent = 'Copied'; }, () => {});

// The meeting point passes when an echo published to a fresh topic comes back.
async function meetingPoint(urls, win) {
  const relays = createRelays(urls, { win, schedule: [60_000] });
  const topic = `${PREFIX}test-${hex(8)}`;
  const echo = crypto.getRandomValues(new Uint8Array(16));
  try {
    return await new Promise((resolve) => {
      win.setTimeout(() => resolve(false), 8 * SECOND);
      relays.subscribe(topic, (payload) => resolve(payload.length === echo.length && payload.every((b, i) => b === echo[i])));
      relays.onReady(topic, () => relays.publish(topic, echo));
    });
  } finally {
    relays.close();
  }
}

// A direct path is only proven once the interview starts; this finds out whether the network hands out addresses.
async function directPath(iceServers, win) {
  if (!win.RTCPeerConnection) return 'blocked';
  const pc = new win.RTCPeerConnection({ iceServers });
  const types = new Set();
  pc.onicecandidate = ({ candidate }) => candidate && types.add(candidate.type);
  pc.createDataChannel('test');
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((resolve) => {
      win.setTimeout(resolve, 5 * SECOND);
      pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && resolve();
    });
  } catch {
    return 'blocked';
  } finally {
    pc.close();
  }
  return types.has('relay') ? 'turn' : types.has('srflx') ? 'found' : 'blocked';
}

const CHECKS = {
  relay: { name: 'Meeting point', words: { true: 'The meeting point is reachable.',
    false: "Can't reach the meeting point from this network. Try another network before the interview, or plan to share evidence as a file." } },
  direct: { name: 'Direct path', words: { found: 'Addresses found. A direct connection is proven only once the interview starts.', turn: 'Relay server ready.',
    blocked: 'This network blocks direct connections. The kit will connect through the meeting point, which is a little slower.' } },
};

function testBlock(el, checks, win) {
  const doc = el.ownerDocument;
  el.innerHTML = `<div class="sync-test"><button type="button" class="sync-test-go">Test connection</button>
    <ul class="sync-checks" hidden>${Object.entries(CHECKS).map(([id, c]) => `<li class="sync-check" data-check="${id}"><b>${c.name}.</b> <span></span></li>`).join('')}</ul>
    <p class="sync-test-result" role="status"></p></div>`;
  const go = el.querySelector('.sync-test-go');
  const result = el.querySelector('.sync-test-result');
  const row = (id, text, failed) => { const li = el.querySelector(`[data-check="${id}"]`); li.lastElementChild.textContent = text; li.classList.toggle('is-failed', failed); };
  async function run() {
    go.disabled = true;
    el.querySelector('.sync-checks').hidden = false;
    result.textContent = 'Testing, this takes up to 10 seconds…';
    for (const id of Object.keys(CHECKS)) row(id, 'Checking…', false);
    const [relay, direct] = await Promise.all([
      meetingPoint(checks.urls, win).then((ok) => { row('relay', CHECKS.relay.words[ok], !ok); return ok; }),
      directPath(checks.iceServers, win).then((how) => { row('direct', CHECKS.direct.words[how], false); return how; }),
    ]);
    // The Saving check is the core's, shown just above on the setup page.
    const saving = doc.querySelector('.start-saving.is-failed');
    const failure = !relay ? CHECKS.relay.words.false : saving?.textContent;
    result.textContent = failure ? `Not ready: ${failure}` : direct === 'blocked' ? 'Ready, through the meeting point.' : 'Ready for the interview.';
    result.classList.toggle('is-failed', Boolean(failure));
    go.disabled = false;
    go.textContent = 'Test again';
  }
  go.onclick = run;
  return run;
}

function dialog(doc, html) {
  const d = doc.createElement('dialog');
  d.className = 'sync-dialog';
  d.innerHTML = `<form method="dialog">${html}</form>`;
  d.onclose = () => d.remove();
  doc.body.append(d);
  d.showModal();
  return d;
}

export function mountUi(api, ctrl) {
  const doc = api.doc();
  const win = doc.defaultView;
  const els = new Map();
  let ticking = null;

  function showInvite(text) {
    const isLink = /^https?:/.test(text);
    // A phone can open the link only when it is not this computer's own address.
    const phone = isLink && !/^(localhost|127\.|\[::1\])/.test(new URL(text).hostname);
    const d = dialog(doc, `<h2 class="sync-dialog-title">Invite colleagues</h2>
      <p>Send this to your colleagues directly, not in a channel. ${isLink ? `They open the link${phone ? ', or scan the code with a phone' : ''}, then type their name and Join.`
        : 'They paste it once into Join an interview on their setup page.'}</p>
      <label class="sync-dialog-field">${isLink ? 'Invite link' : 'Invite code'} <textarea class="sync-code" rows="3" readonly>${esc(text)}</textarea></label>
      ${phone ? `<div class="sync-qr" role="img" aria-label="QR code of the invite link">${renderSVG(text, { border: 2, pixelSize: 1 }).replace('<svg ', '<svg class="sync-qr-code" ')}</div>` : ''}
      <div class="sync-dialog-actions"><button type="button" class="sync-copy">Copy</button><button type="submit">Close</button></div>`);
    d.querySelector('.sync-copy').onclick = ({ target }) => copy(win, text, target);
  }

  function showRelink() {
    const { roster } = ctrl.view().room;
    const d = dialog(doc, `<h2 class="sync-dialog-title">Change the link</h2>
      <p>The old link stops working, so someone who has it can no longer knock.${roster.length ? ' Colleagues ticked here move to the new link. Anyone you untick has to be invited again.' : ''}</p>
      ${roster.length ? `<fieldset class="sync-roster"><legend>Keep in the interview</legend>${roster.map((m) => `<label class="sync-roster-member">
        <input type="checkbox" value="${esc(m.author)}" checked> ${esc(m.name)}</label>`).join('')}</fieldset>` : ''}
      <div class="sync-dialog-actions"><button type="button" class="sync-relink-go">Change the link</button><button type="submit">Cancel</button></div>`);
    d.querySelector('.sync-relink-go').onclick = async ({ target }) => {
      target.disabled = true;
      const keep = new Set([...d.querySelectorAll('.sync-roster input:checked')].map((i) => i.value));
      const text = await ctrl.rotateKeys(keep);
      d.close();
      showInvite(text);
    };
  }

  function presence(el, v) {
    if (!el.querySelector('.sync-presence')) {
      el.innerHTML = `<div class="sync-presence"><ul class="sync-names" aria-label="Colleagues in this interview"></ul>
        <p class="sync-status" role="status"></p><div class="sync-follow" role="status"></div><div class="sync-knocks"></div></div>`;
      drawn.delete(el);
      el.onclick = ({ target }) => {
        const b = target.closest('button');
        if (!b) return;
        if (b.dataset.letIn) ctrl.letIn(b.dataset.letIn);
        if (b.dataset.notNow) ctrl.notNow(b.dataset.notNow);
        if (b.dataset.follow) ctrl.follow(b.dataset.follow);
        if (b.dataset.stop != null) ctrl.stopFollowing();
        if (b.dataset.retry != null) ctrl.retry();
      };
    }
    const r = v.room;
    patch(el.querySelector('.sync-names'), r ? r.members.map((m) => `<li class="sync-name is-${m.status}"><button type="button" class="sync-name-button" data-key="f-${esc(m.author)}"
      data-follow="${esc(m.author)}" aria-pressed="${m.followed}" aria-describedby="sync-detail-${esc(m.author)}" title="Follow ${esc(m.label)}">
      <span class="sync-dot" aria-hidden="true"></span>${esc(m.label)}${m.status === 'unreachable' ? ` <small class="sync-name-state">${esc(m.detail[0][0].toLowerCase() + m.detail[0].slice(1))}</small>`
        : DOT[m.status] ? ` <small class="sync-name-state">${DOT[m.status]}</small>` : ''}</button><span class="sync-detail" id="sync-detail-${esc(m.author)}"></span></li>`).join('') : '');
    if (r) for (const m of r.members) { const d = el.querySelector(`#sync-detail-${CSS.escape(m.author)}`); const t = `${m.detail.join('. ')}.`; if (d && d.textContent !== t) d.textContent = t; }
    const status = el.querySelector('.sync-status');
    patch(status, r ? lineHtml(r.line, 'status') : '');
    status.classList.toggle('is-failed', r?.line.tone === 'fail');
    patch(el.querySelector('.sync-follow'), r?.follow ? `<span>${esc(r.follow)}</span> <button type="button" data-key="stop" data-stop>Stop (Esc)</button>` : '');
    patch(el.querySelector('.sync-knocks'), r ? r.knocks.map((k) => `<p class="sync-knock" role="alert"><span>${esc(k.name)} wants to join.</span>
      <button type="button" data-key="in-${esc(k.author)}" data-let-in="${esc(k.author)}">Let in</button>
      <button type="button" data-key="no-${esc(k.author)}" data-not-now="${esc(k.author)}">Not now</button></p>`).join('') : '');
  }

  function join(el, v) {
    if (!el.querySelector('.sync-join')) {
      el.innerHTML = `<fieldset class="sync-join"><legend class="sync-join-title">Join an interview</legend>
        ${v.invitedBy ? `<p class="sync-join-invite">${esc(v.invitedBy)} invited you. Type your name above, then Join.</p>` : ''}
        <label class="start-field">Invite link or code <input class="start-input sync-join-code" autocomplete="off" spellcheck="false" placeholder="Paste what your colleague sent you" value="${esc(v.pending ?? '')}"></label>
        <button type="button" class="sync-join-go">Join</button>
        <p class="sync-join-status" role="status"></p></fieldset>`;
      drawn.delete(el);
      const form = el.closest('form');
      const go = () => ctrl.join(el.querySelector('.sync-join-code').value, form?.querySelector('.start-name')?.value.trim() ?? '');
      el.querySelector('.sync-join-go').onclick = go;
      // Enter in the name or the code joins once there is a code, instead of starting a new interview.
      form?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('.start-name, .sync-join-code') && el.querySelector('.sync-join-code').value.trim()) { e.preventDefault(); go(); }
      });
      el.querySelector('.sync-join-status').onclick = ({ target }) => target.dataset.copyJoin != null && copy(win, ctrl.view().joinText, target);
    }
    const status = el.querySelector('.sync-join-status');
    patch(status, v.join ? lineHtml(v.join, 'join') : '');
    status.classList.toggle('is-failed', v.join?.tone === 'fail');
  }

  function sidebar(v) {
    for (const s of doc.querySelectorAll('.session-nav .sync-here')) s.remove();
    for (const m of v.room?.members ?? []) {
      const a = m.place && !['lost', 'unreachable'].includes(m.status) && doc.querySelector(`.session-nav a[href="${CSS.escape(m.place)}"]`);
      if (!a) continue;
      const s = doc.createElement('span');
      s.className = 'sync-here';
      s.ariaHidden = 'true';
      s.title = `${m.label} is here`;
      s.textContent = m.label.replace(/^(\S)\S*( \d+)?.*$/, '$1$2').replace(' ', '');
      a.append(' ', s);
    }
  }

  const DRAW = {
    'setup.join': join,
    'header.presence': presence,
    'banner': (el, v) => patch(el, v.room?.banners.length ? `<div class="sync-banner" role="status">${v.room.banners.map((b) => `<p class="sync-banner-line">${esc(b)}</p>`).join('')}</div>` : ''),
    'menu.invite': (el) => patch(el, '<button type="button" class="sync-invite">Invite</button>'),
    'menu.relink': (el, v) => patch(el, v.room?.inviter ? '<button type="button" class="sync-relink">Change the link</button>' : ''),
    'menu.test': (el) => patch(el, '<button type="button" class="sync-test-open">Test connection</button>'),
    'setup.test': (el) => { if (!el.querySelector('.sync-test')) testBlock(el, ctrl.checks, win); },
  };

  function refresh() {
    const v = ctrl.view();
    for (const [el, slot] of els) if (el.isConnected) DRAW[slot](el, v); else els.delete(el);
    sidebar(v);
    // A second-by-second redraw only while a limit can run out.
    if (ctrl.busy() && !ticking) ticking = win.setInterval(refresh, SECOND);
    if (!ctrl.busy() && ticking) { win.clearInterval(ticking); ticking = null; }
  }

  doc.addEventListener('click', async ({ target }) => {
    if (target.closest('.sync-invite')) showInvite(await ctrl.invite());
    if (target.closest('.sync-relink')) showRelink();
    if (target.closest('.sync-test-open')) testBlock(dialog(doc, '<h2 class="sync-dialog-title">Test connection</h2><div class="sync-test-slot"></div><div class="sync-dialog-actions"><button type="submit">Close</button></div>')
      .querySelector('.sync-test-slot'), ctrl.checks, win)();
  });
  for (const slot of Object.keys(DRAW)) api.slot(slot, (el) => { els.set(el, slot); DRAW[slot](el, ctrl.view()); });
  return { refresh };
}
