import { expect, test } from 'vitest';
import { codeOf, fingerprint, joinFragment, makeKeys, makePair, makeSigner, memberText, parseJoin, sign, signedBy, unwrap, wrap } from '../../src/plugins/sync/admit.js';
import { b64 } from '../../src/plugins/sync/seal.js';

const GRANT = { role: 'frontend-engineer', round: 'practical' };

const FP = 'AbCdEfGhIjKlMnOpQrStUv';

test('an invite makes two 128-bit keys, and the link carries the link key and the inviter\'s fingerprint, never the session key', () => {
  const keys = makeKeys();
  const fragment = joinFragment({ sid: 'k3x9q2', link: keys.link, fp: FP, from: 'Jason Q' });
  expect([keys.link.length, keys.session.length, fragment, fragment.includes(b64(keys.session))])
    .toEqual([16, 16, `join=k3x9q2.${b64(keys.link)}.${FP}&from=Jason%20Q`, false]);
});

test('a join link, a bare code and a fragment all parse the same, and anything else is refused', () => {
  const link = Uint8Array.from({ length: 16 }, (_, i) => 255 - i);
  const fragment = joinFragment({ sid: 'k3x9q2', link, fp: FP, from: 'Jason' });
  const want = { sid: 'k3x9q2', link, fp: FP, from: 'Jason' };
  expect([parseJoin(`https://kit.example.com/#${fragment}`), parseJoin(` ${fragment} `), parseJoin(`#${fragment}`),
    parseJoin(joinFragment({ sid: 'k3x9q2', link, fp: FP })), parseJoin('IK1.abc'), parseJoin(''), parseJoin('join=k3x9q2.short'), parseJoin(`join=k3x9q2.${b64(link)}&from=Jason`)])
    .toEqual([want, want, want, { sid: 'k3x9q2', link, fp: FP, from: '' }, null, null, null, null]);
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

test('a member key the inviter signed checks out against the fingerprint in the link, and nothing else does', async () => {
  const [inviter, other, member] = await Promise.all([makeSigner(), makeSigner(), makePair()]);
  const fp = await fingerprint(inviter.pub);
  const cert = await sign(inviter.priv, memberText('k3x9q2', member.pub));
  const forged = await sign(other.priv, memberText('k3x9q2', member.pub));
  expect([/^[A-Za-z0-9_-]{22}$/.test(fp), fp === await fingerprint(other.pub), cert.length <= 400,
    await signedBy(inviter.pub, memberText('k3x9q2', member.pub), cert), await signedBy(other.pub, memberText('k3x9q2', member.pub), forged),
    await signedBy(inviter.pub, memberText('k3x9q2', member.pub), forged), await signedBy(inviter.pub, memberText('other', member.pub), cert),
    await signedBy(inviter.pub, memberText('k3x9q2', member.pub), 'not-a-signature')])
    .toEqual([true, false, true, true, true, false, false, false]);
});

test('a knock code is 32 bits of the knock key, 8 hex digits in two groups, so a look-alike key is out of reach', async () => {
  const [a, b] = await Promise.all([makePair(), makePair()]);
  const [codeA, again, codeB] = [await codeOf(a.pub), await codeOf(a.pub), await codeOf(b.pub)];
  expect([/^[0-9A-F]{4} [0-9A-F]{4}$/.test(codeA), codeA === again, codeA === codeB]).toEqual([true, true, false]);
});
