import { expect, test } from 'vitest';
import { joinFragment, makeKeys, makePair, parseJoin, unwrap, wrap } from '../../src/plugins/sync/admit.js';
import { b64 } from '../../src/plugins/sync/seal.js';

const GRANT = { role: 'frontend-engineer', round: 'practical' };

test('an invite makes two 128-bit keys, and the link carries only the link key', () => {
  const keys = makeKeys();
  const fragment = joinFragment({ sid: 'k3x9q2', link: keys.link, from: 'Jason Q' });
  expect([keys.link.length, keys.session.length, fragment, fragment.includes(b64(keys.session))])
    .toEqual([16, 16, `join=k3x9q2.${b64(keys.link)}&from=Jason%20Q`, false]);
});

test('a join link, a bare code and a fragment all parse the same, and anything else is refused', () => {
  const link = Uint8Array.from({ length: 16 }, (_, i) => 255 - i);
  const fragment = joinFragment({ sid: 'k3x9q2', link, from: 'Jason' });
  const want = { sid: 'k3x9q2', link, from: 'Jason' };
  expect([parseJoin(`https://kit.example.com/#${fragment}`), parseJoin(` ${fragment} `), parseJoin(`#${fragment}`),
    parseJoin(joinFragment({ sid: 'k3x9q2', link })), parseJoin('IK1.abc'), parseJoin(''), parseJoin('join=k3x9q2.short')])
    .toEqual([want, want, want, { sid: 'k3x9q2', link, from: '' }, null, null, null]);
});

test('only the knocker can open the keys the inviter wraps for them', async () => {
  const [inviter, joiner, other] = await Promise.all([makePair(), makePair(), makePair()]);
  const keys = makeKeys();
  const wrapped = await wrap(inviter.priv, joiner.pub, 'k3x9q2', { ...keys, ...GRANT });
  expect([/^[A-Za-z0-9_-]+$/.test(wrapped), wrapped.length <= 400, /^[A-Za-z0-9_-]{87}$/.test(inviter.pub),
    await unwrap(joiner.priv, inviter.pub, 'k3x9q2', wrapped),
    await unwrap(other.priv, inviter.pub, 'k3x9q2', wrapped), await unwrap(joiner.priv, other.pub, 'k3x9q2', wrapped), await unwrap(joiner.priv, inviter.pub, 'other', wrapped)])
    .toEqual([true, true, true, { link: keys.link, session: keys.session, ...GRANT }, null, null, null]);
});
