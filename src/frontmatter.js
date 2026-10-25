// Splits a Markdown file's `---` frontmatter into fields, with the rest as `body`. Shared by the app and scripts/.
export function parse(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const data = { body: m ? raw.slice(m[0].length) : raw };
  for (const line of m ? m[1].split(/\r?\n/) : []) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const v = line.slice(i + 1).trim();
    const quoted = v.match(/^"(?:[^"\\]|\\.)*"/);
    const plain = v.replace(/\s+#.*/, '');
    data[line.slice(0, i).trim()] = quoted || plain.startsWith('[') ? JSON.parse(quoted?.[0] ?? plain) : /^\d+$/.test(plain) ? Number(plain) : plain;
  }
  return data;
}
