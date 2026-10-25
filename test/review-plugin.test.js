import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { expect, test } from 'vitest';

test("the dev server writes a review answer into the pack's .review folder", async () => {
  const pack = join(mkdtempSync(join(tmpdir(), 'ik-review-')), 'pack');
  cpSync('sample-pack', pack, { recursive: true });
  const before = process.env.KIT_PACK;
  process.env.KIT_PACK = pack;
  const server = await createServer({ logLevel: 'silent', server: { port: 0 } });
  try {
    await server.listen();
    const res = await fetch(new URL('/__review', server.resolvedUrls.local[0]), { method: 'POST', body: '{"id":"css-01","choice":"clear"}' });
    expect([res.status, readFileSync(join(pack, '.review/feedback.jsonl'), 'utf8')]).toEqual([204, '{"id":"css-01","choice":"clear"}\n']);
  } finally {
    await server.close();
    if (before === undefined) delete process.env.KIT_PACK;
    else process.env.KIT_PACK = before;
  }
}, 30_000);
