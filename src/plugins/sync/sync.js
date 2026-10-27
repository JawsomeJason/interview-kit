// Shadow sync (experimental): ticks travel peer to peer over a
// WebRTC data channel, paired by pasting one code each way. Notes and done never leave the page.
import { decodeCode, encodeCode, peerMarks, peerMessage } from './core.js';
import './sync.css';

const PEER_MARK = '<span class="look-for-mark" title="Shadow ticked this">•</span>';

const CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const PANEL = `<div id="shadow-sync" class="sync-panel" popover="auto"><h2>Shadow sync</h2>
  <p class="sync-status">Not connected</p>
  <p><button type="button" data-act="host">Start</button> <button type="button" data-act="stop">Stop</button></p>
  <div data-show="offer" hidden><p>Send this code to your shadow:</p><textarea class="sync-panel-code" rows="4" readonly></textarea>
    <p><button type="button" data-act="copy">Copy code</button></p>
    <label>Paste their reply <textarea class="sync-panel-code" rows="3" data-in="reply"></textarea></label>
    <p><button type="button" data-act="connect">Connect</button></p></div>
  <hr><label>Joining? Paste their code <textarea class="sync-panel-code" rows="3" data-in="offer"></textarea></label>
  <p><button type="button" data-act="join">Join</button></p>
  <div data-show="answer" hidden><p>Send this reply back:</p><textarea class="sync-panel-code" rows="4" readonly></textarea>
    <p><button type="button" data-act="copy">Copy reply</button></p></div>
  <p class="sync-error"></p></div>`;
const LINK = '<button type="button" class="sync-link" commandfor="shadow-sync" command="toggle-popover">Shadow sync</button>';

// Non-trickle ICE: wait for every candidate so one pasted code is enough.
const gathered = (pc) => new Promise((resolve) => {
  if (pc.iceGatheringState === 'complete') return resolve();
  pc.addEventListener('icegatheringstatechange', () => pc.iceGatheringState === 'complete' && resolve());
});

export function startSync(getState) {
  let pc = null;
  let channel = null;
  let peer = {};
  document.body.insertAdjacentHTML('beforeend', PANEL);
  const panel = document.getElementById('shadow-sync');
  const $ = (sel) => panel.querySelector(sel);
  const status = (text) => { $('.sync-status').textContent = text; };
  const error = (text = '') => { $('.sync-error').textContent = text; };
  const show = (step, code) => {
    for (const box of panel.querySelectorAll('[data-show]')) box.hidden = box.dataset.show !== step;
    if (step) $(`[data-show="${step}"] textarea`).value = code;
  };

  const marks = (id) => peerMarks(getState().ticks ?? {}, peer, id);
  function refreshMarks() {
    const el = document.querySelector('.look-for');
    if (!el) return;
    const m = marks(el.dataset.q);
    el.querySelectorAll('label').forEach((label, i) => {
      label.querySelector('.look-for-mark')?.remove();
      if (m.includes(i)) label.insertAdjacentHTML('beforeend', PEER_MARK);
    });
  }
  function send() {
    if (channel?.readyState === 'open') channel.send(peerMessage(getState()));
    refreshMarks();
  }
  function wire(ch) {
    channel = ch;
    ch.onopen = () => { status('Connected'); send(); };
    ch.onclose = () => { status('Disconnected'); peer = {}; refreshMarks(); };
    ch.onmessage = ({ data }) => { peer = JSON.parse(data).ticks ?? {}; refreshMarks(); };
  }
  function stop() {
    if (channel) channel.onclose = null; // a deliberate stop is not a dropped connection
    pc?.close();
    pc = channel = null;
    peer = {};
    refreshMarks();
    show(null);
    status('Not connected');
  }
  async function host() {
    stop();
    pc = new RTCPeerConnection(CONFIG);
    wire(pc.createDataChannel('ticks'));
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    show('offer', encodeCode(pc.localDescription));
    status('Waiting for reply');
  }
  async function join(code) {
    const offer = decodeCode(code);
    stop();
    pc = new RTCPeerConnection(CONFIG);
    pc.ondatachannel = ({ channel: ch }) => wire(ch);
    await pc.setRemoteDescription(offer);
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    show('answer', encodeCode(pc.localDescription));
    status('Waiting for reply');
  }
  const actions = {
    host,
    stop,
    join: () => join($('[data-in="offer"]').value),
    connect: () => pc.setRemoteDescription(decodeCode($('[data-in="reply"]').value)),
  };
  panel.addEventListener('click', ({ target }) => {
    const act = target.dataset.act;
    if (act === 'copy') {
      const label = target.textContent;
      return navigator.clipboard.writeText(target.closest('[data-show]').querySelector('textarea').value)
        .then(() => { target.textContent = 'Copied'; setTimeout(() => { target.textContent = label; }, 1500); });
    }
    if (!actions[act]) return;
    error();
    Promise.resolve().then(actions[act]).catch((e) => error(e.message));
  });

  return {
    // The shell is redrawn per round, so the links are added again each time.
    mount(root) {
      for (const spot of root.querySelectorAll('.app-header, .sidebar-round')) {
        if (!spot.querySelector('.sync-link')) spot.insertAdjacentHTML('beforeend', ` ${LINK}`);
      }
    },
    send,
    marks,
  };
}
