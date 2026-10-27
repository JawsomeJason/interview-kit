import { loadPack } from '../../src/pack/load.js';
import { STREAM_OF } from '../../src/evidence/events.js';
import { digest } from '../../src/model/observables.js';

// The sample fixture pack plus two cards in the css pool: one with no competency anywhere, so it shows under Other,
// and one too long for the Deep dive, so a mark on it shows under Also asked.
export async function fixturePack() {
  const { model } = await loadPack('test/fixtures/packs/sample-pack');
  model.libs.questions.cards.push(
    { id: 'css-09', pool: 'css', title: 'Image pushes the text down', minutes: 3, tier: 'core', ask: '', followUps: [], stretch: [],
      lookFor: [{ level: 'mid', text: 'Reserves space for the image before it loads' }] },
    { id: 'css-10', pool: 'css', title: 'Page jumps while it loads', minutes: 30, tier: 'core', competencies: ['judgment'], ask: '', followUps: [], stretch: [],
      lookFor: [{ level: 'mid', text: 'Names the layout shift metric' }] },
  );
  return model;
}

// A log from bare events: each gets its stream position and a stamp one second after the last, from `start` (wall ms).
export function logOf(events, start = 0x0194c0de0000) {
  const log = { pub: [], prv: [] };
  events.forEach((e, i) => {
    const ch = log[STREAM_OF[e.t]];
    ch.push({ n: ch.length, h: `${(start + i * 1000).toString(16).padStart(12, '0')}.0000`, ...e });
  });
  return log;
}

export const DIVS = '**Plus and minus are divs, not buttons.** No focus, no role, and the glyph is the name.';
export const mark = (o, text, s = 'seen') => ({ t: 'mark', o, d: digest(text), s });
export const open = (author) => ({ t: 'open', v: 2, sid: 'k3x9q2', author, role: 'frontend-engineer', round: 'practical', pack: { id: 'pack-6f39cc38', version: '1.0.0', sha: 'e6854f1' } });
