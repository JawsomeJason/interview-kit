import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importBundle } from '../../src/evidence/bundle.js';
import { checkPrv, checkPub } from '../../src/evidence/check.js';
import { createClock, wallOf } from '../../src/evidence/clock.js';
import { STREAM_OF } from '../../src/evidence/events.js';
import { foldEvidence, foldShared } from '../../src/evidence/reduce.js';
import { focusOf } from '../../src/model/layers.js';
import { itemsOf, observables, planned } from '../../src/model/observables.js';
import { LAYERS, panel } from '../../src/model/panel.js';
import { composeRound, planName } from '../../src/model/plan.js';
import { runOfShow } from '../../src/model/timeline.js';
import { loadPack } from '../../src/pack/load.js';
import { plain, summarize, summaryText } from '../../src/views/summary.js';

export const SCHEMA = resolve(import.meta.dirname, 'simulate.schema.json');
const V = 1;

export const HELP = `Usage: interview-kit simulate <file | -> [--at <step | m:ss>] [--json] [--pack <dir>]
       interview-kit simulate --schema

Shows what the kit would show at one point of an interview, with no browser: the run of show with the questions
listed and their minutes, the Look for rows of each item at the level being evaluated, and the Copy summary text.
It reads the pack and the log with the kit's own code, so its answer is the browser's.

Input, a file path or - for stdin, either:
  An evidence file      the .json "Share my evidence" saves. A file saved before deciding holds no private events,
                        so it shows no marks; simulate warns on stderr.
  An action script      a JSON array of actions, run in order, the first one start. Each action is an object with
                        "do" and the fields below. simulate fills in the event numbers and stamps.

Actions ([ ] marks an optional field):
  {"do": "start", "role": "<role id>", "round": "<round id>", ["candidate": "<name>"]}
  {"do": "minutes", "minutes": <0-180>, ["seg": "<segment>"]}     an activity's minutes; 0 turns it off
  {"do": "pools", "pools": ["<pool id>", ...], ["seg": "<segment>"]}
                                     the pools ticked, in order (the first is the main focus); [] unticks all
  {"do": "open", "id": "<item id>", ["seg": "<segment>"]}          a question asked, as the first mark on it records
  {"do": "mark", "ref": "<item id>#<row>", ["s": "seen" | "unseen" | "clear"]}   s defaults to seen
  {"do": "note", "id": "<item id>", "text": "<text>"}
  {"do": "level", "level": "<level id>"}                         Evaluating at
  {"do": "decide", "choice": "<decision id>", ["level": "<level id>"], ["why": "<text>"]}
  Any action may carry "at": "m:ss", its time into the interview. Without it, an action happens when the last did.
  seg is "<round id>/<segment id>", as the output lists it. It defaults to the first questions segment that is on
  and holds the item's pool, or for an exercise or script, the segment that runs it. A row's ref is in the output,
  as "<item id>#<level id>.<n>" or "<item id>#<pin>". Ids are the pack's: roles/, rounds/, pools/, ladder.md.

Options:
  --at <step>    stop after this many steps: actions in a script, events in an evidence file (default: all)
  --at <m:ss>    stop at this time into the interview, as m:ss or h:mm:ss
  --json         print JSON, every output with "v": ${V}; --schema prints its JSON Schema
  --pack <dir>   the content pack (default: $KIT_PACK, else the current folder)
  -h, --help     print this help

Output: the step it stopped at, the run of show (each activity that is on, with its minutes; for questions, the
cards listed in order with their minutes, and the minutes they add up to), Look for (each item's rows by level as
its panel lays them out: the level evaluated at, the one below to place, then folded headroom and basics), the Copy
summary, and in JSON the history of steps.

Exit status: 0 shown, 1 the input or pack could not be read or simulated, 2 a usage error.

Examples:
  interview-kit simulate evidence.json --pack ../my-pack
  interview-kit simulate script.json --at 3 --json | jq '.lookFor[0].groups'
  echo '[{"do":"start","role":"frontend-engineer","round":"practical"},{"do":"pools","pools":["css"]},
         {"do":"open","id":"css-01"},{"do":"mark","ref":"css-01#mid.1"}]' | interview-kit simulate -`;

class Refusal extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}
const refuse = (message) => { throw new Refusal(message); };

const CHECK = { pub: checkPub, prv: checkPrv };
const START = Date.UTC(2026, 0, 1, 9);
const AUTHOR = 'simulate';
const hex12 = (ms) => ms.toString(16).padStart(12, '0');

// m:ss or h:mm:ss into milliseconds, else null.
function parseTime(text) {
  const m = /^(?:(\d+):)?(\d+):([0-5]\d)$/.exec(String(text));
  return m ? ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 : null;
}
const clockText = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const list = (xs) => xs.join(', ') || 'none';

// The segment an item is asked in: the one given, the one that runs it, or the first questions segment holding its pool.
function segFor(c, a, where, id) {
  const all = runOfShow(c.round, c.plan()).all;
  if (a.seg !== undefined) {
    if (!all.some((s) => s.seg === a.seg)) refuse(`${where}: no segment "${a.seg}" in this round. Its segments: ${list(all.map((s) => s.seg))}.`);
    return a.seg;
  }
  const card = id && c.pack.libs.questions.cards.find((q) => q.id === id);
  if (id && !card) {
    const runs = all.find((s) => s.ref === id);
    if (!runs) refuse(`${where}: no segment of this round runs "${id}". Add "seg" to say which one it was opened in.`);
    return runs.seg;
  }
  const holds = all.filter((s) => s.kind === 'questions' && (!card || s.ref === 'all' || [s.ref].flat().includes(card.pool)));
  const seg = (holds.find((s) => s.minutes > 0) ?? holds[0])?.seg;
  return seg ?? refuse(`${where}: this round has no questions segment${card ? ` holding pool "${card.pool}"` : ''}. Add "seg", one of ${list(all.map((s) => s.seg))}.`);
}

const itemOrRefuse = (c, id, where) => c.items.get(id) ?? refuse(`${where}: no item "${id}" in the pack. A card's id is the "id:" line of its file under pools/; an exercise's or script's is its folder or file name.`);

// Each action as the events the browser logs for the same gesture.
const ACTIONS = {
  start(c, a, where) {
    const role = c.pack.roles.find((r) => r.id === a.role) ?? refuse(`${where}: no role "${a.role}". Roles in the pack: ${list(c.pack.roles.map((r) => r.id))}.`);
    const round = c.pack.rounds.find((r) => r.id === a.round) ?? refuse(`${where}: no round "${a.round}". Rounds in the pack: ${list(c.pack.rounds.map((r) => r.id))}.`);
    c.role = role;
    c.round = composeRound(c.pack, role, round);
    c.append({ t: 'open', v: 2, sid: AUTHOR, author: AUTHOR, role: role.id, round: round.id, pack: { id: c.pack.id, version: '', sha: '' } });
    if (a.candidate) c.append({ t: 'put', k: 'session.candidate', v: String(a.candidate) });
    c.append({ t: 'put', k: 'session.startedAt', v: hex12(START) });
  },
  minutes(c, a, where) {
    c.append({ t: 'put', k: 'segment.minutes', seg: segFor(c, a, where), v: a.minutes });
  },
  pools(c, a, where) {
    const seg = segFor(c, a, where);
    if (!Array.isArray(a.pools)) refuse(`${where}: "pools" is a list of pool ids, such as ["${c.pack.libs.questions.pools[0]?.id}"].`);
    const step = runOfShow(c.round, c.plan()).all.find((s) => s.seg === seg);
    const offered = c.pack.libs.questions.pools.filter((p) => step.ref === 'all' || [step.ref].flat().includes(p.id)).map((p) => p.id);
    for (const id of a.pools) if (!offered.includes(id)) refuse(`${where}: pool "${id}" is not one ${seg} offers. Its pools: ${list(offered)}.`);
    for (const id of c.plan().segments[seg]?.pools ?? []) if (!a.pools.includes(id)) c.append({ t: 'member', k: 'segment.pools', seg, id, v: null });
    // Ticked again in the order given, so the latest stamps put them in that order.
    for (const id of a.pools) c.append({ t: 'member', k: 'segment.pools', seg, id, v: true });
  },
  open(c, a, where) {
    itemOrRefuse(c, a.id, where);
    c.ask(a.id, segFor(c, a, where, a.id));
  },
  mark(c, a, where) {
    const id = String(a.ref).split('#')[0];
    const rows = observables(itemOrRefuse(c, id, where));
    const o = rows.find((r) => r.ref === a.ref) ?? refuse(`${where}: "${id}" has no row "${a.ref}". Its rows: ${list(rows.map((r) => r.ref))}.`);
    c.ask(id, segFor(c, a, where, id));
    c.append({ t: 'mark', o: o.ref, d: o.digest, s: a.s ?? 'seen' });
  },
  note(c, a, where) {
    itemOrRefuse(c, a.id, where);
    c.ask(a.id, segFor(c, a, where, a.id));
    c.append({ t: 'note', scope: a.id, text: String(a.text ?? '') });
  },
  level(c, a, where) {
    if (!c.pack.ladder.some((l) => l.id === a.level)) refuse(`${where}: no level "${a.level}". Levels in ladder.md: ${list(c.pack.ladder.map((l) => l.id))}.`);
    c.append({ t: 'focus', level: a.level });
  },
  decide(c, a, where) {
    if (!c.role.decisions.some((d) => d.id === a.choice)) refuse(`${where}: no decision "${a.choice}" for ${c.role.id}. Its decisions: ${list(c.role.decisions.map((d) => d.id))}.`);
    if (a.level !== undefined && !c.pack.ladder.some((l) => l.id === a.level)) refuse(`${where}: no level "${a.level}". Levels in ladder.md: ${list(c.pack.ladder.map((l) => l.id))}.`);
    c.append({ t: 'decide', choice: a.choice, ...(a.level && { level: a.level }), why: String(a.why ?? '') });
    if (!c.log.pub.some((e) => e.t === 'decided')) c.append({ t: 'decided' });
  },
};

const said = (a) => [a.do, ...Object.entries(a).filter(([k]) => k !== 'do' && k !== 'at').map(([, v]) => (Array.isArray(v) ? `[${v.join(', ')}]` : v))].join(' ');

// An action script as the log the browser would have written, one step per action.
export function compile(pack, actions) {
  if (!Array.isArray(actions) || actions[0]?.do !== 'start') refuse('An action script is a JSON array whose first action is {"do": "start", "role": "<role id>", "round": "<round id>"}.');
  let wall = START;
  const clock = createClock(() => wall);
  const c = { pack, items: itemsOf(pack), log: { pub: [], prv: [] } };
  c.plan = () => foldShared({ [AUTHOR]: c.log.pub });
  const steps = actions.map((a, i) => {
    const where = `Action ${i + 1} (${a?.do})`;
    if (!Object.hasOwn(ACTIONS, a?.do)) refuse(`${where}: "do" must be one of ${list(Object.keys(ACTIONS))}.`);
    if (i > 0 && a.do === 'start') refuse(`${where}: a script starts once, with its first action.`);
    if (a.at !== undefined) {
      const ms = parseTime(a.at) ?? refuse(`${where}: "at" is ${JSON.stringify(a.at)}. Write the time into the interview as m:ss, such as "12:30".`);
      if (START + ms < wall) refuse(`${where}: "at" ${a.at} is earlier than the action before it. Keep the actions in time order.`);
      wall = START + ms;
    }
    const events = [];
    c.append = (body) => {
      const ch = STREAM_OF[body.t];
      const e = { n: c.log[ch].length, h: clock.now(), ...body };
      if (!CHECK[ch](e)) refuse(`${where}: the kit would refuse its ${body.t} event, ${JSON.stringify(body)}. Check the action's values against --help.`);
      c.log[ch].push(e);
      events.push({ ch, e });
    };
    c.ask = (id, seg) => { if (!c.plan().segments[seg]?.asked?.includes(id)) c.append({ t: 'member', k: 'segment.asked', seg, id, v: true }); };
    ACTIONS[a.do](c, a, where);
    return { did: said(a), wall, events };
  });
  return { input: 'script', author: AUTHOR, steps };
}

const LABEL_KEYS = ['k', 'seg', 'id', 'o', 'p', 'scope', 'item', 's', 'level', 'choice', 'from'];
const label = (e) => [e.t, ...LABEL_KEYS.filter((k) => e[k] !== undefined).map((k) => e[k]), ...(e.t === 'put' || e.t === 'member' ? [JSON.stringify(e.v)] : [])].join(' ');

// An evidence file as its events in stamp order, one step each.
export function fromBundle(text) {
  const { author, pub, prv } = importBundle(text);
  const events = [...pub.map((e) => ({ ch: 'pub', e })), ...prv.map((e) => ({ ch: 'prv', e }))].sort((x, y) => (x.e.h < y.e.h ? -1 : 1));
  return { input: 'evidence', author, steps: events.map((x) => ({ did: label(x.e), wall: wallOf(x.e.h), events: [x] })), private: prv.length };
}

const streams = (steps) => {
  const events = steps.flatMap((s) => s.events);
  return { pub: events.filter((x) => x.ch === 'pub').map((x) => x.e), prv: events.filter((x) => x.ch === 'prv').map((x) => x.e) };
};

// How many steps --at keeps.
function cut(steps, at, startedAt) {
  if (at === undefined) return steps.length;
  if (/^\d+$/.test(at)) {
    const n = Number(at);
    if (n < 1 || n > steps.length) refuse(`--at ${at}: this input has steps 1 to ${steps.length}.`);
    return n;
  }
  const ms = parseTime(at) ?? refuse(`--at ${at} is neither a step number nor a time. Write a step, such as 3, or a time into the interview, such as 12:30.`);
  return steps.filter((s) => s.wall <= startedAt + ms).length;
}

const rowOut = (r) => ({ ref: r.o.ref, text: r.o.text, key: r.key ?? null, mark: r.mark?.s ?? null });
const groupOut = (g, extra) => ({ layer: g.layer, level: g.level, name: `${g.name}${LAYERS[g.layer] ? `, ${LAYERS[g.layer]}` : ''}`, ...extra, rows: g.rows.map(rowOut) });

// What the kit shows once the first `at` steps of a run have happened.
export function view(pack, run, at) {
  const started = foldShared({ [run.author]: streams(run.steps).pub }).startedAt ?? run.steps[0]?.wall ?? START;
  const k = cut(run.steps, at, started);
  const kept = run.steps.slice(0, k);
  const { pub, prv } = streams(kept);
  const open = pub.find((e) => e.t === 'open');
  if (!open) refuse(`--at ${at}: the interview has not opened by then. Its open event is step ${run.steps.findIndex((s) => s.events.some((x) => x.e.t === 'open')) + 1}.`);
  const role = pack.roles.find((r) => r.id === open.role) ?? refuse(`The log's role "${open.role}" is not in this pack. Pass --pack with the pack the interview ran on.`);
  const preset = pack.rounds.find((r) => r.id === open.round) ?? refuse(`The log's round "${open.round}" is not in this pack. Pass --pack with the pack the interview ran on.`);
  const round = composeRound(pack, role, preset);
  const plan = foldShared({ [run.author]: pub });
  const evidence = foldEvidence(prv);
  const items = itemsOf(pack);
  const cards = new Map(pack.libs.questions.cards.map((q) => [q.id, q]));
  const { steps, minutes } = runOfShow(round, plan);
  const c = { pack, role, plan, evidence };
  const runOut = steps.map((step) => {
    const ids = planned(pack, [step], plan).filter((id) => items.has(id));
    const base = { seg: step.seg, title: step.title ?? items.get(step.ref)?.title ?? step.seg, kind: step.kind, start: step.start, minutes: step.minutes };
    if (step.kind !== 'questions') return base;
    const asked = plan.segments[step.seg]?.asked ?? [];
    const questions = ids.map((id) => cards.get(id)).map((q) => ({ id: q.id, title: q.title, pool: q.pool, minutes: q.minutes, asked: asked.includes(q.id) }));
    return { ...base, pools: plan.segments[step.seg]?.pools ?? [], questions, questionMinutes: questions.reduce((sum, q) => sum + q.minutes, 0) };
  });
  const lookFor = steps.flatMap((step) => planned(pack, [step], plan).filter((id) => items.get(id)?.lookFor.length).map((id) => {
    const m = panel({ ...c, segment: step }, items.get(id), step.seg);
    return { id, title: items.get(id).title, seg: step.seg, minutes: m.minutes, groups: [
      ...m.open.map((g) => groupOut(g, { folded: false, outOfScope: false })),
      ...m.out.map((g) => groupOut(g, { folded: true, outOfScope: true })),
      ...m.folded.map((g) => groupOut(g, { folded: true, outOfScope: false })),
    ] };
  }));
  const focus = focusOf(role, evidence);
  return {
    v: V, input: run.input,
    at: { step: k, of: run.steps.length, time: clockText((kept.at(-1)?.wall ?? started) - started), did: kept.at(-1)?.did ?? '' },
    candidate: plan.candidate ?? null,
    role: { id: role.id, name: role.name },
    round: { id: preset.id, name: planName(round, plan) },
    focus: { id: focus, name: pack.ladder.find((l) => l.id === focus)?.name ?? focus },
    minutes, run: runOut, lookFor,
    summary: summaryText(summarize({ pack, role, round, plan, evidence })),
    history: run.steps.map((s, i) => ({ step: i + 1, time: clockText(s.wall - started), did: s.did })),
  };
}

const MARK = { seen: '[seen] ', unseen: '[not seen] ' };

export function text(r) {
  const out = [`At step ${r.at.step} of ${r.at.of} (${r.at.did}), ${r.at.time} into the interview.`,
    `${r.candidate ?? 'No name yet'}: ${r.role.name}, ${r.round.name}, evaluating at ${r.focus.name}.`, '', `Run of show, ${r.minutes} min`];
  for (const s of r.run) {
    out.push(`  ${s.title}, ${s.minutes} min from minute ${s.start}  (${s.seg})`);
    if (s.kind !== 'questions') continue;
    out.push(`    Pools: ${list(s.pools)}. Questions: ${s.questionMinutes} min of ${s.minutes}.`);
    for (const q of s.questions) out.push(`    ${q.id}  ${q.title}, ${q.minutes} min${q.asked ? ', asked' : ''}`);
  }
  out.push('', 'Look for');
  for (const it of r.lookFor) {
    out.push(`  ${it.id}  ${it.title}`);
    for (const g of it.groups) {
      out.push(`    ${g.outOfScope ? `Out of scope at ${it.minutes} min: ` : ''}${g.name}${g.folded ? ' (folded)' : ''}`);
      for (const row of g.rows) out.push(`      ${row.key ?? ' '} ${MARK[row.mark] ?? ''}${plain(row.text)}  (${row.ref})`);
    }
  }
  if (!r.lookFor.length) out.push('  Nothing in the run of show has Look for rows yet.');
  out.push('', 'Copy summary', r.summary);
  return out.join('\n');
}

const read = (file) => {
  try { return readFileSync(file === '-' ? 0 : resolve(file), 'utf8'); } catch (e) { return refuse(`Can't read ${file === '-' ? 'stdin' : file} (${e.code ?? e.message}). Pass the path of an evidence file or an action script.`); }
};

function parse(text, name) {
  let json;
  try { json = JSON.parse(text); } catch { refuse(`${name} is not JSON. Pass an evidence file or an action script, a JSON array of actions (see --help).`); }
  return Array.isArray(json) ? json : null;
}

// interview-kit simulate: prints what the kit shows at one point of a logged or scripted interview.
export default async function simulate(args) {
  const opts = { json: false };
  try {
    for (let i = 0; i < args.length; i++) {
      const [flag, inline] = args[i].split(/=(.*)/s);
      if (flag === '-h' || flag === '--help') { console.log(HELP); return 0; }
      if (flag === '--json') opts.json = true;
      else if (flag === '--schema') opts.schema = true;
      else if (flag === '--at' || flag === '--pack') {
        const value = inline ?? args[++i];
        if (value === undefined) throw new Refusal(`${flag} needs a value. Run "interview-kit simulate --help".`, 2);
        opts[flag.slice(2)] = value;
      } else if (opts.file === undefined && (args[i] === '-' || !args[i].startsWith('-'))) opts.file = args[i];
      else throw new Refusal(`${args[i]} is not an option of simulate. Run "interview-kit simulate --help".`, 2);
    }
    if (opts.schema) { console.log(readFileSync(SCHEMA, 'utf8').trimEnd()); return 0; }
    if (opts.file === undefined) throw new Refusal(`simulate needs an evidence file or an action script, or - for stdin.\n${HELP.split('\n')[0]}`, 2);
    const dir = resolve(opts.pack ?? process.env.KIT_PACK ?? '.');
    const raw = read(opts.file);
    const script = parse(raw, opts.file);
    if (!existsSync(resolve(dir, 'pack.json'))) refuse(`No pack.json in ${dir}. Pass --pack <dir>, or set KIT_PACK, to the pack the interview ran on.`);
    const { model: pack, problems } = await loadPack(dir);
    const errors = problems.filter((p) => p.level === 'error').length;
    if (errors) refuse(`The pack at ${dir} has ${errors} error${errors === 1 ? '' : 's'}. Run "interview-kit check --pack ${dir}" and fix ${errors === 1 ? 'it' : 'them'}, or pass --pack <dir> if this is not the pack.`);
    let run;
    if (script) run = compile(pack, script);
    else {
      try { run = fromBundle(raw); } catch (e) { refuse(`${opts.file}: ${e.message} Pass an evidence file the kit saved, or an action script (see --help).`); }
      if (!run.private) console.error(`${opts.file} holds no private events, as a file saved before deciding does, so no marks show.`);
    }
    const result = view(pack, run, opts.at);
    console.log(opts.json ? JSON.stringify(result, null, 2) : text(result));
    return 0;
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    console.error(e.message);
    return e.code;
  }
}
