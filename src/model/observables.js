import { questionList } from './timeline.js';

// 8 hex chars of FNV-1a over the bullet's text, written into every mark so a reordered list moves no evidence.
export function digest(text) {
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

// Each kind's items as the core reads them: id, title, Look for, stretch, and the competencies an untagged bullet
// inherits. Kept here rather than on kind.js because kind.js pulls in the Node-only pack parser.
const ITEMS = {
  questions: (lib) => lib.cards.map((c) => ({ id: c.id, title: c.title, lookFor: c.lookFor, stretch: c.stretch,
    competencies: c.competencies ?? lib.pools.find((p) => p.id === c.pool)?.competencies ?? [] })),
  exercise: (lib) => lib.map((e) => ({ id: e.id, title: e.name, lookFor: e.lookFor, stretch: e.stretch, competencies: e.competencies ?? [] })),
  script: (lib) => lib.map((s) => ({ id: s.id, title: s.name, lookFor: s.lookFor ?? [], stretch: [], competencies: s.competencies ?? [] })),
};

// The item ids a run-of-show step puts in play under the shared plan.
const PLANNED = {
  questions: (lib, step, plan) => {
    const pools = step.ref === 'all' ? null : [step.ref].flat();
    return questionList(lib.cards.filter((c) => !pools || pools.includes(c.pool)), plan.segments[step.seg], step.minutes, lib.cards).map((c) => c.id);
  },
  exercise: (lib, step) => [step.ref],
  script: (lib, step) => [step.ref],
};

export const itemsOf = (pack) => new Map(Object.entries(ITEMS).flatMap(([kind, items]) => items(pack.libs[kind]).map((it) => [it.id, it])));

// `<item>#<pin>` for a pinned bullet, else `<item>#<level>.<position in that level from 1>`.
export function observables(item) {
  const at = {};
  return item.lookFor.map((b) => {
    at[b.level] = (at[b.level] ?? 0) + 1;
    return { ref: `${item.id}#${b.pin ?? `${b.level}.${at[b.level]}`}`, item: item.id, level: b.level,
      competencies: b.competencies ?? item.competencies, text: b.text, digest: digest(b.text), nudges: b.nudges ?? [],
      ...(b.show !== undefined && { show: b.show }), ...(b.fallback !== undefined && { fallback: b.fallback }) };
  });
}

export function prompts(item) {
  const at = {};
  return item.stretch.map((p) => {
    at[p.level] = (at[p.level] ?? 0) + 1;
    return { ref: `${item.id}#stretch.${p.level}.${at[p.level]}`, item: item.id, level: p.level, text: p.text };
  });
}

export const planned = (pack, steps, plan) => [...new Set(steps.flatMap((step) => PLANNED[step.kind](pack.libs[step.kind], step, plan)))];
