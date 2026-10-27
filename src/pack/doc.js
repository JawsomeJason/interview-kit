import { LineCounter, parseDocument } from 'yaml';

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const list = (xs) => xs.join(', ') || '(none)';

function distance(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
// The option nearest to word once case and punctuation are ignored, or undefined when none is within maxDistance.
export const closest = (word, options, maxDistance = Infinity) => options
  .map((o) => [o, distance(norm(word), norm(o))]).filter(([, d]) => d <= maxDistance).sort((x, y) => x[1] - y[1])[0]?.[0];

// Collects one file's problems, so the loader can tell which files are clean enough to check against their schema.
export const sink = (path) => {
  const problems = [];
  const add = (level) => (line, message) => problems.push({ level, file: path, line, message });
  return { path, problems, error: add('error'), note: add('note'), failed: () => problems.some((p) => p.level === 'error') };
};

const blank = (l) => !l.text.trim();

// Reports every run of non-blank lines that no field took, one problem per run.
export function leftover(doc, lines, fix) {
  const runs = [];
  for (const l of lines.filter((x) => !blank(x))) {
    const run = runs.at(-1);
    if (run && l.n === run.last + 1) { run.last = l.n; run.count++; } else runs.push({ first: l.n, last: l.n, count: 1, text: l.text });
  }
  for (const r of runs) doc.error(r.first, `This line is not shown anywhere: "${r.text}"${r.count > 1 ? ` (${r.count} lines, to line ${r.last})` : ''}.\n  ${fix}`);
}

// The Markdown under a heading, its own sub-headings included, trimmed.
export const markdown = (sec) => {
  const out = [...sec.lines.map((l) => l.text)];
  const walk = (s) => { out.push(`${'#'.repeat(s.depth)} ${s.title}${s.id ? ` {#${s.id}}` : ''}`, ...s.lines.map((l) => l.text)); s.children.forEach(walk); };
  sec.children.forEach(walk);
  return out.join('\n').trim();
};

// Splits a file into YAML frontmatter and a heading tree whose sections hold every body line with its line number.
export function parseDoc(path, raw) {
  const doc = { ...sink(path), lines: raw.split(/\r?\n/), fm: [], front: {}, ok: true };
  const { lines } = doc;
  let i = 0;
  let yaml;
  let counter;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end < 0) {
      doc.error(1, 'the frontmatter is never closed.\n  Add a "---" line after the last key.');
      doc.ok = false;
      i = lines.length;
    } else {
      doc.fm = lines.slice(1, end);
      counter = new LineCounter();
      yaml = parseDocument(doc.fm.join('\n'), { lineCounter: counter });
      const front = yaml.errors.length ? null : yaml.toJS() ?? {};
      if (yaml.errors.length) {
        const e = yaml.errors[0];
        // YAML notices an unclosed quote or bracket where the next key starts, so name the key whose value it is.
        const owner = yaml.contents?.items?.find((p) => p.key?.range && p.value?.range && p.value.range[0] <= e.pos[0] && e.pos[0] <= p.value.range[2]);
        const at = owner ? counter.linePos(owner.key.range[0]).line : e.linePos?.[0].line ?? 1;
        doc.error(at + 1, `"${doc.fm[at - 1]}" is not valid YAML: ${e.message.split('\n')[0].replace(/ at line \d+, column \d+.*$/, '')}.\n  Put the value in quotes.`);
        doc.ok = false;
      } else if (typeof front !== 'object' || Array.isArray(front)) {
        doc.error(2, 'the frontmatter must be "key: value" lines.\n  Start with "id:" and "name:".');
        doc.ok = false;
      } else doc.front = front;
      i = end + 1;
    }
  }
  // The file line of a frontmatter value, by its YAML path; line 1 when the key is absent.
  doc.at = (path) => {
    const offset = doc.ok ? yaml?.getIn(path, true)?.range?.[0] : undefined;
    return offset == null ? 1 : counter.linePos(offset).line + 1;
  };
  doc.keyLine = (key) => {
    const node = doc.ok && yaml?.contents?.items?.find((p) => p.key?.value === key);
    return node ? counter.linePos(node.key.range[0]).line + 1 : 1;
  };
  const root = { depth: 0, title: '', id: null, line: 0, lines: [], children: [] };
  const stack = [root];
  let fence = false;
  for (; i < lines.length; i++) {
    const text = lines[i];
    const isFence = /^\s*```/.test(text);
    const h = !fence && !isFence && text.match(/^(#{1,6}) +(.+?)(?:\s+\{#([\w-]+)\})?\s*$/);
    if (h) {
      const sec = { depth: h[1].length, title: h[2], id: h[3] ?? null, line: i + 1, lines: [], children: [] };
      while (stack.at(-1).depth >= sec.depth) stack.pop();
      stack.at(-1).children.push(sec);
      stack.push(sec);
      continue;
    }
    stack.at(-1).lines.push({ n: i + 1, text, fence: fence || isFence });
    if (isFence) fence = !fence;
  }
  doc.root = root;
  if (doc.ok) cutComments(doc);
  return doc;
}

// A value whose " #" started a YAML comment, as in `title: Menu cut off #1 culprit`. Ordinary trailing comments
// (`id: resume  # resume | pr`) stay legal, so only a cut that starts "#" followed by a non-space is an error.
function cutComments(doc) {
  for (const [k, v] of Object.entries(doc.front)) {
    if (!(typeof v === 'string' || v === null)) continue;
    const line = doc.fm.find((l) => l.startsWith(`${k}:`));
    const rest = line?.slice(k.length + 1).trim() ?? '';
    if (/^["'|>]/.test(rest)) continue;
    const cut = rest.startsWith('#') ? 0 : rest.indexOf(' #');
    if (cut < 0) continue;
    const comment = rest.slice(cut).trim();
    if (/^#\s/.test(comment) || (typeof v === 'string' && v.includes(comment))) continue;
    doc.error(doc.keyLine(k), `${k}: was cut at " #", because YAML reads " #" as a comment.\n  Put the value in quotes.`);
  }
}

const ALIASES = { dimensions: 'competencies', dimension: 'competencies', skills: 'competencies', competency: 'competencies' };

// Frontmatter keys are closed per file kind. gone maps a key format 1 used to the fix for it.
export function closedKeys(doc, keys, noun, gone = {}) {
  for (const k of Object.keys(doc.front)) {
    if (keys.includes(k)) continue;
    if (gone[k]) { doc.error(doc.keyLine(k), `${k}: ${gone[k]}`); continue; }
    const guess = ALIASES[k] ?? closest(k, keys, 3);
    doc.error(doc.keyLine(k), `${k}: is not a key ${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun} takes.\n  Keys: ${keys.join(', ')}.${guess ? ` Did you mean "${guess}"?` : ''}`);
  }
}

// The "##" sections of a file. known lists the sections the file kind takes; null takes any.
export function sections(doc, known, noun) {
  const all = [];
  leftover(doc, doc.root.lines, `Put it under a "## ${known?.[0] ?? 'Script'}" heading.`);
  for (const c of doc.root.children) {
    if (c.depth === 1) {
      doc.error(c.line, `"# ${c.title}" is not used in a ${noun}.\n  Put the name in frontmatter and start with a "##" section.`);
      leftover(doc, c.lines, 'Move it under a "##" section.');
      for (const s of c.children) if (s.depth === 2) all.push(s);
    } else if (c.depth === 2) all.push(c);
    else doc.error(c.line, `"${'#'.repeat(c.depth)} ${c.title}" has no "##" above it.\n  Start with a "##" section.`);
  }
  const seen = new Set();
  for (const s of all) {
    const key = s.title.toLowerCase();
    if (known && !known.some((k) => k.toLowerCase() === key)) doc.error(s.line, `"## ${s.title}" is not a section ${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun} takes.\n  Sections: ${known.join(', ')}.`);
    if (seen.has(key)) doc.error(s.line, `"## ${s.title}" appears twice.\n  Merge them.`);
    seen.add(key);
  }
  return { all, get: (title) => all.find((s) => s.title.toLowerCase() === title.toLowerCase()) };
}

const KNOWN_LABELS = ['Nudge', 'Show it', 'Fallback', 'Why', 'Good answer'];

// A list of bullets. With details, a nested "- Label: text" line adds detail to the bullet above; an indented line
// that is not a nested item continues the bullet or label above it, so an editor's wrapped lines lose nothing.
export function bullets(doc, lines, { details = false, peel = false, fix }) {
  const items = [];
  const left = [];
  let chain = null;
  for (const l of lines) {
    const { n, text } = l;
    if (!text.trim()) { chain = null; continue; }
    let m;
    if (!l.fence && (m = text.match(/^(?:[-*+]|\d+\.) +(\S.*)$/))) { items.push({ text: m[1].trim(), line: n, details: [] }); chain = 'item'; continue; }
    const nested = !l.fence && items.length && text.match(/^ {2,}([-*+]|\d+\.) +(.*)$/);
    if (nested) {
      chain = null;
      const [, mark, rest] = nested;
      const label = rest.match(/^([A-Z][A-Za-z' ]*?):\s+(\S.*)$/);
      const lower = rest.match(/^([a-z][A-Za-z' ]*?):\s/);
      const known = lower && KNOWN_LABELS.find((x) => x.toLowerCase() === lower[1].toLowerCase());
      const shownAs = `This line is not shown anywhere: "${text}".\n  `;
      if (/\d/.test(mark)) doc.error(n, `${shownAs}A numbered line under a bullet is not kept. Write it as "- Nudge: ..." or "- Why: ...", or fold it into the bullet.`);
      else if (!details) doc.error(n, `${shownAs}Only Look for bullets take nested lines. Fold this into the bullet or delete it.`);
      else if (label) { items.at(-1).details.push({ label: label[1], text: label[2].trim(), line: n }); chain = 'detail'; }
      else if (known) doc.error(n, `${shownAs}A label starts with a capital letter. Did you mean "- ${known}:"?`);
      else doc.error(n, `${shownAs}A nested line needs a label, such as "- Why: ...", or move it up to its own bullet.`);
      continue;
    }
    if (!l.fence && chain && /^ {2,}\S/.test(text)) {
      const target = chain === 'detail' ? items.at(-1).details.at(-1) : items.at(-1);
      target.text += ` ${text.trim()}`;
      continue;
    }
    chain = null;
    left.push(l);
  }
  leftover(doc, left, fix);
  if (peel) for (const it of items) {
    it.tags = [];
    for (let m; (m = it.text.match(/\s#([a-z][a-z0-9-]*)$/) ?? it.text.match(/\s\{#([\w-]+)\}$/));) {
      if (!m[0].includes('{')) it.tags.unshift(m[1]);
      else if (it.pin) doc.error(it.line, 'two {#pin} tokens on one bullet.\n  Keep one.');
      else it.pin = m[1];
      it.text = it.text.slice(0, m.index);
    }
    it.text = it.text.trim();
  }
  return items;
}

// "### <level>" groups under a "## Look for" or "## Stretch" section, each holding bullets.
export function levelled(doc, sec, name, ladder, opts) {
  const ids = ladder.levels.map((l) => l.id);
  leftover(doc, sec.lines, `Under "## ${name}", put it under a "### <level>" heading. Levels: ${list(ids)}.`);
  const out = [];
  const seen = new Set();
  for (const g of sec.children) {
    const where = `${name}: "${'#'.repeat(g.depth)} ${g.title}"`;
    if (g.depth !== 3) { doc.error(g.line, `${where} is not a level heading.\n  Use "### <level>" directly under "## ${name}".`); continue; }
    if (g.id) doc.error(g.line, `${where} carries {#${g.id}}, which a level heading ignores.\n  Delete it.`);
    for (const deeper of g.children) doc.error(deeper.line, `${name}: "${'#'.repeat(deeper.depth)} ${deeper.title}" sits inside a level and is not read.\n  Delete the heading or move it.`);
    const level = ladder.levelOf(g.title);
    if (!level) { doc.error(g.line, `${where} is not a level.\n  ${ladder.hint(g.title)}`); continue; }
    if (seen.has(level.id)) doc.error(g.line, `${name}: level ${level.id} has two "###" headings.\n  Merge them.`);
    seen.add(level.id);
    const items = bullets(doc, g.lines, { ...opts, fix: `Put it in a bullet starting with "- " under "### ${g.title}", or delete it.` });
    out.push({ level: level.id, heading: g.title, line: g.line, items });
  }
  return out;
}
