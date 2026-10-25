// Lists backticked repo paths in tracked Markdown that point at nothing. Usage: node scripts/check-doc-links.mjs
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const deadLinks = () => {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  const roots = new Set([...tracked.filter((f) => f.includes('/')).map((f) => f.split('/')[0]), 'pack', '.llm-research']);
  return tracked.filter((f) => f.endsWith('.md')).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/`([\w.\/-]+)`/g)]
    .map(([, p]) => p)
    .filter((p) => (roots.has(p.split('/')[0]) && p.includes('/')) || /^[A-Z]+\.md$/.test(p))
    .filter((p) => !existsSync(p))
    .map((p) => `${f}: ${p}`));
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dead = deadLinks();
  console.log(dead.length ? dead.join('\n') : 'No dead doc paths.');
  process.exit(dead.length ? 1 : 0);
}
