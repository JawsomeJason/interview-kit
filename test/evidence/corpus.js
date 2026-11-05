import { importBundle } from '../../src/evidence/bundle.js';
import { foldEvidence, foldShared } from '../../src/evidence/reduce.js';
import { composeRound } from '../../src/model/plan.js';
import { summarize, summaryText } from '../../src/views/summary.js';

export const CORPUS = 'test/fixtures/evidence';

// An evidence file read the way the Decide page reads its author's own log: the file's plan, its marks, and the
// role and round its open event names.
export function summaryOf(pack, text) {
  const { author, pub, prv } = importBundle(text);
  const open = pub.find((e) => e.t === 'open');
  const role = pack.roles.find((r) => r.id === open.role);
  const round = composeRound(pack, role, pack.rounds.find((r) => r.id === open.round));
  return summaryText(summarize({ pack, role, round, plan: foldShared({ [author]: pub }), evidence: foldEvidence(prv) }));
}
