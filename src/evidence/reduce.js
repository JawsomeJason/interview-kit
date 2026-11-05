const later = (a, b) => (a.h === b.h ? a.author > b.author : a.h > b.h);
const byStamp = (a, b) => (later(a, b) ? 1 : -1);
const segment = (plan, seg) => (plan.segments[seg] ??= {});

// Where each shared key lands in the plan. Registers hold one winner; set members arrive in add order.
const PLACE = {
  'session.candidate': (plan, w) => { plan.candidate = w.v; },
  'session.startedAt': (plan, w) => { plan.startedAt = parseInt(w.v, 16); },
  'session.length': (plan, w) => { plan.length = w.v; },
  'session.passions': (plan, w) => plan.passions.push({ id: w.id, label: w.v }),
  'segment.minutes': (plan, w) => { segment(plan, w.seg).minutes = w.v; },
  'segment.fallback': (plan, w) => { segment(plan, w.seg).fallback = w.v; },
  'segment.pools': (plan, w) => (segment(plan, w.seg).pools ??= []).push(w.id),
  'segment.asked': (plan, w) => (segment(plan, w.seg).asked ??= []).push(w.id),
};

// A course step is a card, by its id, or a segment with no cards, by its <round>/<segment>.
export const stepKey = (e) => e.id ?? e.seg;

export function foldShared(streams) {
  const winners = new Map();
  const starts = new Map();
  const finished = new Map();
  for (const [author, events] of Object.entries(streams)) {
    for (const e of events) {
      const w = { ...e, author };
      // The first start wins: the list it froze is the one every member already saw.
      if (e.t === 'segment.start' && !(starts.has(e.seg) && later(w, starts.get(e.seg)))) starts.set(e.seg, w);
      // The latest Done or Skip for a step, by anyone in the room, is its state.
      if (e.t === 'segment.done' || e.t === 'skip') {
        const key = `${e.seg}|${stepKey(e)}`;
        if (!finished.has(key) || later(w, finished.get(key))) finished.set(key, w);
      }
      if (e.t !== 'put' && e.t !== 'member') continue;
      const key = `${e.k}|${e.seg ?? ''}|${e.id ?? ''}`;
      if (!winners.has(key) || later(w, winners.get(key))) winners.set(key, w);
    }
  }
  const plan = { passions: [], segments: {} };
  // A key from a newer version has no place here, and must not keep this version from listing the interview.
  for (const w of [...winners.values()].sort(byStamp)) if (w.v !== null && Object.hasOwn(PLACE, w.k)) PLACE[w.k](plan, w);
  for (const s of starts.values()) segment(plan, s.seg).started = s.cards;
  for (const w of [...finished.values()].sort(byStamp)) {
    (segment(plan, w.seg).finished ??= {})[stepKey(w)] = w.t === 'skip' ? { s: 'skipped', reason: w.reason, h: w.h } : { s: 'done', h: w.h };
  }
  return plan;
}

// The streams that shape a session's live plan: its own room's. A colleague's file from a session of their own still
// shows in the debrief, but never renames the candidate or edits the plan.
export const roomOf = (streams, sid) => Object.fromEntries(Object.entries(streams).filter(([, pub]) => pub[0]?.t !== 'open' || pub[0].sid === sid));

export const hasDecided = (pub) => pub.some((e) => e.t === 'decided');
export const nameOf = (pub) => pub.findLast((e) => e.t === 'name')?.name;

const APPLY = {
  mark: (ev, e) => (e.s === 'clear' ? ev.marks.delete(e.o) : ev.marks.set(e.o, { s: e.s, d: e.d, h: e.h, src: e.src ?? 'self', ...(e.quote && { quote: e.quote }), ...(e.at && { at: e.at }) })),
  prompt: (ev, e) => (e.given === false ? ev.prompts.delete(e.p) : ev.prompts.set(e.p, e.h)),
  note: (ev, e) => ev.notes.set(e.scope, e.text),
  close: (ev, e) => (e.closed ? ev.closed.add(e.item) : ev.closed.delete(e.item)),
  focus: (ev, e) => { ev.focus = e.level; },
  decide: (ev, e) => {
    const d = { choice: e.choice, level: e.level, why: e.why, h: e.h };
    if (ev.decision) ev.amendments.push(d); else ev.decision = d;
  },
  peek: (ev, e) => { if (!ev.peeks.has(e.from)) ev.peeks.set(e.from, e.h); },
  amend: (ev, e) => { ev.amends.set(stepKey(e), [...ev.amends.get(stepKey(e)) ?? [], e.h]); },
  bookmark: (ev, e) => { ev.bookmarks.push({ id: e.id, word: e.word, h: e.h }); },
  marking: (ev, e) => { ev.marking = e.by; },
};

export function foldEvidence(events) {
  const ev = { marks: new Map(), prompts: new Map(), notes: new Map(), closed: new Set(), amendments: [], peeks: new Map(), amends: new Map(), bookmarks: [], marking: 'self' };
  // A type from a newer kit stays in the log and changes no row.
  for (const e of events) if (Object.hasOwn(APPLY, e.t)) APPLY[e.t](ev, e);
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
