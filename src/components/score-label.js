import './score-label.css';

export const score = (ticked, total) => (!ticked ? null : ticked === total ? 'Strong' : ticked / total >= 0.5 ? 'Solid' : 'Weak');

export const scoreLabel = (q, ticked = []) => {
  const word = score(ticked.length, q.lookFor.length);
  return word ? ` <small class="score-label">${word}</small>` : '';
};
