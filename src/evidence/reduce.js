const later = (a, b) => (a.h === b.h ? a.author > b.author : a.h > b.h);
const byStamp = (a, b) => (later(a, b) ? 1 : -1);
const segment = (plan, seg) => (plan.segments[seg] ??= {});

// Where each shared key lands in the plan. Registers hold one winner; set members arrive in add order.
const PLACE = {
  'session.candidate': (plan, w) => { plan.candidate = w.v; },
  'session.startedAt': (plan, w) => { plan.startedAt = parseInt(w.v, 16); },
  'session.passions': (plan, w) => plan.passions.push({ id: w.id, label: w.v }),
  'segment.minutes': (plan, w) => { segment(plan, w.seg).minutes = w.v; },
  'segment.fallback': (plan, w) => { segment(plan, w.seg).fallback = w.v; },
  'segment.pools': (plan, w) => (segment(plan, w.seg).pools ??= []).push(w.id),
  'segment.asked': (plan, w) => (segment(plan, w.seg).asked ??= []).push(w.id),
};

export function foldShared(streams) {
  const winners = new Map();
  for (const [author, events] of Object.entries(streams)) {
    for (const e of events) {
      if (e.t !== 'put' && e.t !== 'member') continue;
      const key = `${e.k}|${e.seg ?? ''}|${e.id ?? ''}`;
      const w = { ...e, author };
      if (!winners.has(key) || later(w, winners.get(key))) winners.set(key, w);
    }
  }
  const plan = { passions: [], segments: {} };
  for (const w of [...winners.values()].sort(byStamp)) if (w.v !== null) PLACE[w.k](plan, w);
  return plan;
}

// The streams that shape a session's live plan: its own room's. A colleague's file from a session of their own still
// shows in the debrief, but never renames the candidate or edits the plan.
export const roomOf = (streams, sid) => Object.fromEntries(Object.entries(streams).filter(([, pub]) => pub[0]?.t !== 'open' || pub[0].sid === sid));

export const hasDecided = (pub) => pub.some((e) => e.t === 'decided');
export const nameOf = (pub) => pub.findLast((e) => e.t === 'name')?.name;

const APPLY = {
  mark: (ev, e) => (e.s === 'clear' ? ev.marks.delete(e.o) : ev.marks.set(e.o, { s: e.s, d: e.d, h: e.h })),
  prompt: (ev, e) => (e.given === false ? ev.prompts.delete(e.p) : ev.prompts.set(e.p, e.h)),
  note: (ev, e) => ev.notes.set(e.scope, e.text),
  close: (ev, e) => (e.closed ? ev.closed.add(e.item) : ev.closed.delete(e.item)),
  focus: (ev, e) => { ev.focus = e.level; },
  decide: (ev, e) => {
    const d = { choice: e.choice, level: e.level, why: e.why, h: e.h };
    if (ev.decision) ev.amendments.push(d); else ev.decision = d;
  },
  peek: (ev, e) => { if (!ev.peeks.has(e.from)) ev.peeks.set(e.from, e.h); },
};

export function foldEvidence(events) {
  const ev = { marks: new Map(), prompts: new Map(), notes: new Map(), closed: new Set(), amendments: [], peeks: new Map() };
  for (const e of events) APPLY[e.t](ev, e);
  return ev;
}

export const press = (ev, ref, digest) => ({ t: 'mark', o: ref, d: digest, s: ev.marks.has(ref) ? 'clear' : 'seen' });

export function nudgesBefore(ev, ref) {
  const mark = ev.marks.get(ref);
  return [...ev.prompts].filter(([p, h]) => p.startsWith(`${ref}~nudge.`) && (!mark || h < mark.h)).map(([p]) => p);
}

export function rowState(ev, ref, opened) {
  const mark = ev.marks.get(ref);
  if (!mark) return opened ? 'not-marked' : 'not-asked';
  if (mark.s === 'unseen') return 'unseen';
  return nudgesBefore(ev, ref).length ? 'seen-after-nudge' : 'seen';
}
