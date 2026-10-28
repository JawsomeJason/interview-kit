export const STUN = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];
export const DEADLINE = 15_000;
export const SCHEDULE = [1000, 2000, 4000, 8000, 15000];
// A peer silent on the relay this long is not offered to until it speaks again (the replica says hello every 10 s).
const SILENCE = 40_000;

// A direct link to each colleague: a WebRTC data channel that carries the same envelopes the relay does, unsealed,
// since DTLS already covers them. The offer, answer and trickled candidates ride the relay link as rtc bodies addressed
// to the peer. The lower author id always offers, so two members never offer each other at once, and every offer and
// candidate carries the offerer's attempt number (gen), so what a dead attempt left on the relay is dropped.
// One pair per peer. Its phase is what it holds: a pc and a timer is an attempt or an ICE restart under its deadline,
// a link is open, a timer alone is the offerer's backoff before the next attempt, and nothing is idle.
export function createRtcLinks({ me, link, envelope, turn = [], win, attach, deadline = DEADLINE, schedule = SCHEDULE }) {
  const pairs = new Map();
  const config = { iceServers: [{ urls: STUN }, ...turn] };
  let closed = false;
  const send = (pair, data) => link.send(envelope({ t: 'rtc', data }, pair.peer));
  const pairOf = (peer) => {
    if (!pairs.has(peer)) pairs.set(peer, { peer, offerer: me < peer, gen: 0, pc: null, channel: null, link: null, tries: 0, timer: null, queued: [], heard: 0 });
    return pairs.get(peer);
  };
  const later = (pair, ms, fn) => { win.clearTimeout(pair.timer); pair.timer = win.setTimeout(() => { pair.timer = null; fn(pair); }, ms); };
  const arm = (pair) => later(pair, deadline, fail);

  function open(pair) {
    if (closed || !pair.offerer || pair.pc || pair.timer || Date.now() - pair.heard > SILENCE) return;
    pair.gen++;
    const pc = connection(pair);
    wire(pair, pc.createDataChannel('ik'));
    arm(pair);
  }
  function connection(pair) {
    const pc = pair.pc = new win.RTCPeerConnection(config);
    const gen = pair.gen;
    pc.onicecandidate = ({ candidate }) => { if (candidate) send(pair, { gen, candidate }); };
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      if (pair.pc !== pc) return;
      await pc.setLocalDescription(offer);
      send(pair, { gen, type: offer.type, sdp: offer.sdp });
    };
    pc.ondatachannel = ({ channel }) => wire(pair, channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { win.clearTimeout(pair.timer); pair.timer = null; }
      if (pc.connectionState === 'failed') pair.link ? restart(pair) : fail(pair);
    };
    return pc;
  }
  function wire(pair, channel) {
    pair.channel = channel;
    channel.onopen = () => {
      if (pair.channel !== channel) return channel.close();
      win.clearTimeout(pair.timer);
      pair.timer = null;
      pair.tries = 0;
      // A channel that replaces another on the pair takes over from its Link.
      pair.link?.down();
      const handlers = new Set();
      let up = true;
      let detach;
      const down = () => { if (up) { up = false; detach(); } };
      channel.onmessage = ({ data }) => { let m; try { m = JSON.parse(data); } catch { return; } for (const fn of handlers) fn(m); };
      const link = pair.link = {
        kind: 'direct',
        peer: pair.peer,
        get state() { return up ? 'open' : 'closed'; },
        // A channel found closing on a send is a dead link: the pair fails now if it is still the pair's channel, and
        // the sender tries another link. One the pair has moved past goes alone, so it can't take the new one down.
        send(m) {
          if (!up) return false;
          if (channel.readyState !== 'open') { if (pair.channel === channel) fail(pair); else down(); return false; }
          channel.send(JSON.stringify(m));
        },
        onMessage(fn) { handlers.add(fn); return () => handlers.delete(fn); },
        close: () => fail(pair),
        down,
      };
      detach = attach(link);
      kindOf(pair.pc).then((kind) => { link.kind = kind; });
    };
    channel.onclose = () => { if (pair.channel === channel) fail(pair); };
  }
  function restart(pair) {
    arm(pair);
    if (pair.offerer) pair.pc.restartIce(); else send(pair, { restart: true });
  }
  function drop(pair) {
    const { pc, link } = pair;
    pair.pc = pair.channel = pair.link = null;
    link?.down();
    if (pc) { pc.onconnectionstatechange = pc.onicecandidate = pc.onnegotiationneeded = pc.ondatachannel = null; pc.close(); }
  }
  function fail(pair) {
    drop(pair);
    pair.queued = [];
    win.clearTimeout(pair.timer);
    pair.timer = null;
    if (pair.offerer) later(pair, schedule[Math.min(pair.tries++, schedule.length - 1)], open);
  }
  function forget(pair) {
    drop(pair);
    win.clearTimeout(pair.timer);
    pairs.delete(pair.peer);
  }
  const addCandidate = (pair, { candidate }) => pair.pc.addIceCandidate(candidate).catch(() => {});
  function flushQueued(pair) {
    for (const d of pair.queued.splice(0)) if (d.gen === pair.gen) addCandidate(pair, d);
  }
  async function signal(pair, data) {
    if (data.restart) {
      if (pair.offerer && pair.link) restart(pair);
    } else if (data.type === 'offer') {
      if (pair.offerer || data.gen < pair.gen) return;
      if (data.gen > pair.gen) { drop(pair); pair.gen = data.gen; connection(pair); arm(pair); }
      const pc = pair.pc;
      if (!pc) return;
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      const answer = await pc.createAnswer();
      if (pair.pc !== pc) return;
      await pc.setLocalDescription(answer);
      send(pair, { gen: pair.gen, type: 'answer', sdp: answer.sdp });
      flushQueued(pair);
    } else if (data.type === 'answer') {
      if (!pair.offerer || data.gen !== pair.gen || !pair.pc) return;
      await pair.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      flushQueued(pair);
    } else if (data.candidate) {
      if (data.gen < pair.gen || (data.gen > pair.gen && pair.offerer)) return;
      if (data.gen === pair.gen && pair.pc?.remoteDescription) addCandidate(pair, data); else pair.queued.push(data);
    }
  }

  const off = link.onMessage((m) => {
    if (closed || !m || typeof m.from !== 'string' || m.from === me) return;
    const pair = pairOf(m.from);
    pair.heard = Date.now();
    const { body } = m;
    if (body?.t === 'bye') forget(pair);
    else if (body?.t === 'rtc' && m.to === me && body.data && typeof body.data === 'object') signal(pair, body.data).catch(() => {});
    else open(pair);
  });
  const now = () => { for (const p of pairs.values()) if (!p.pc && p.timer) { win.clearTimeout(p.timer); p.timer = null; open(p); } };
  const visible = () => { if (win.document.visibilityState === 'visible') now(); };
  win.addEventListener('online', now);
  win.document.addEventListener('visibilitychange', visible);

  return {
    close() {
      closed = true;
      off();
      win.removeEventListener('online', now);
      win.document.removeEventListener('visibilitychange', visible);
      for (const pair of [...pairs.values()]) forget(pair);
    },
  };
}

// turn when either end of the selected candidate pair is a TURN relay, which the status line names a relay server.
async function kindOf(pc) {
  const stats = await pc.getStats();
  const transport = [...stats.values()].find((s) => s.type === 'transport' && s.selectedCandidatePairId);
  const pair = transport && stats.get(transport.selectedCandidatePairId);
  const types = pair ? [stats.get(pair.localCandidateId)?.candidateType, stats.get(pair.remoteCandidateId)?.candidateType] : [];
  return types.includes('relay') ? 'turn' : 'direct';
}
