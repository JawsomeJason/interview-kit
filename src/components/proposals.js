import { esc } from '../esc.js';
import { foldEvidence, nudgesBefore, rowState } from '../evidence/reduce.js';
import { STATE } from '../views/summary.js';
import { circleCheck } from './icons.js';

const other = { seen: 'unseen', unseen: 'seen' };

// A second opinion is a colleague whose marks a transcript proposed (src: ai, ADR 028).
export const isSecondOpinion = (evidence) => [...evidence.marks.values()].some((m) => m.src === 'ai');

// Each mark a second opinion proposed, with what I did about it. I answer after my blind decision, so a mark of mine
// on that row after the first decide is my answer: Accept takes its state (src: accepted), Change takes the other one,
// and Reject logs again what the row held at my decision, or clears it, so the original read stands.
export function proposals(unlocked, myLog, say) {
  const first = myLog.prv.findIndex((e) => e.t === 'decide');
  if (first < 0) return [];
  const before = foldEvidence(myLog.prv.slice(0, first + 1)).marks;
  const answers = new Map();
  for (const e of myLog.prv.slice(first + 1)) if (e.t === 'mark') answers.set(e.o, e);
  const mine = foldEvidence(myLog.prv);
  return unlocked.participants.filter((p) => p.author !== unlocked.me && isSecondOpinion(p.evidence)).flatMap((p) => [...p.evidence.marks]
    .filter(([, m]) => m.src === 'ai' && m.s !== 'clear')
    .map(([ref, m]) => {
      const item = ref.slice(0, ref.indexOf('#'));
      const answer = answers.get(ref);
      const had = before.get(ref)?.s ?? 'clear';
      const outcome = !answer ? null : answer.src === 'accepted' ? 'accepted' : answer.s === had ? 'rejected' : 'changed';
      // The nudges the AI's mark came after, which Accept carries over, so a row it saw after a nudge reads that way in my record too.
      return { author: p.author, ref, d: m.d, s: m.s, state: rowState(p.evidence, ref, true), nudges: nudgesBefore(p.evidence, ref).filter((n) => !mine.prompts.has(n)), quote: m.quote, at: m.at, item, text: say.ref(ref), title: say.item(item), had, outcome,
        now: mine.marks.get(ref)?.s ?? 'clear', bookmarks: mine.bookmarks.filter((b) => b.id === item) };
    }));
}

// The events each answer logs, in order: Accept gives the nudges first, so they come before the mark.
export const answer = (p, act) => ({
  accept: [...p.nudges.map((n) => ({ t: 'prompt', p: n })),
    { t: 'mark', o: p.ref, d: p.d, s: p.s, src: 'accepted', ...(p.quote && { quote: p.quote }), ...(p.at && { at: p.at }) }],
  change: [{ t: 'mark', o: p.ref, d: p.d, s: other[p.s], src: 'self' }],
  reject: [{ t: 'mark', o: p.ref, d: p.d, s: p.had, src: 'self' }],
})[act];

const word = (s) => STATE[s] ?? 'Not marked';
const done = (p) => ({ accepted: `Accepted: ${word(p.state)}`, changed: `Changed to ${word(p.now)}`, rejected: p.had === 'clear' ? 'Rejected' : `Rejected, yours stays: ${word(p.had)}` })[p.outcome];

// One row per proposal: the row's words, the AI's mark with its quote and time, my bookmarks on that card, then my
// answer or the three buttons.
export function proposalsHtml(list, at) {
  if (!list.length) return '';
  const left = list.filter((p) => !p.outcome).length;
  return `<section class="proposals" aria-labelledby="proposals-title"><h3 id="proposals-title" class="decide-subtitle">The second opinion's marks</h3>
    <p class="proposals-left" role="status">${left ? `${left} of ${list.length} to review.` : `All ${list.length} reviewed.`}</p>
    <ul class="proposals-list">${list.map((p, i) => `<li class="proposal" data-ref="${esc(p.ref)}">
      <p class="proposal-head"><b class="proposal-text" id="proposal-${i}">${esc(p.text)}</b> <span class="proposal-badge">AI: ${esc(word(p.state))}</span> <span class="proposal-card">${esc(p.title)}</span></p>
      ${p.quote ? `<p class="proposal-quote">"${esc(p.quote)}"${p.at ? ` <span class="proposal-at">at ${esc(p.at)}</span>` : ''}</p>` : ''}
      ${p.bookmarks.length ? `<p class="proposal-bookmarks">Your bookmark${p.bookmarks.length > 1 ? 's' : ''}: ${p.bookmarks.map((b) => `${esc(at(b.h))}${b.word ? ` ${esc(b.word)}` : ''}`).join(', ')}</p>` : ''}
      <p class="proposal-actions">${p.outcome ? `<span class="proposal-done">${circleCheck} ${esc(done(p))}</span>`
    : ['accept', 'change', 'reject'].map((act) => `<button type="button" class="proposal-button" data-act="${act}" data-i="${i}" aria-describedby="proposal-${i}">${act[0].toUpperCase()}${act.slice(1)}</button>`).join('')}</p></li>`).join('')}</ul></section>`;
}
