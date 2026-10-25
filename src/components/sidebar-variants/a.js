import { allQuestions, detailsToOpen, needsCheck, timeline } from '../nav.js';

// Up, Down, Home and End move between the pool folders' headers, as in the ARIA accordion pattern. Down stops at the
// last pool and Up at the first: All questions and Being reviewed are a Tab away. A key with a modifier is left alone.
const walkFolders = (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
  const heads = [...e.currentTarget.querySelectorAll('.all-questions-pool > summary')];
  const i = heads.indexOf(e.target);
  const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: heads.length - 1 }[e.key];
  if (i < 0 || to === undefined) return;
  e.preventDefault();
  heads[Math.min(Math.max(to, 0), heads.length - 1)].focus();
};

// Today's sidebar: the timeline, then every pool and question, then the cards that need a check.
export default {
  label: 'Timeline',
  render: ({ round, parts, dd, picked, done, pools, questions }) => `<div id="timeline" class="timeline">${timeline(round, parts, dd, picked, done)}</div>
    ${allQuestions(pools, picked)}
    ${needsCheck(questions)}`,
  bind(el, { picked, question, route }) {
    // The open page is the current page; on a question page the Deep dive part is the current step.
    for (const a of el.querySelectorAll('a')) {
      const href = a.getAttribute('href');
      const current = href === route ? 'page' : question && href === '#/deep-dive' ? 'step' : null;
      if (current) a.setAttribute('aria-current', current);
    }
    el.querySelector('.all-questions').addEventListener('keydown', walkFolders);
    for (const id of detailsToOpen(question, picked)) el.querySelector(`#${CSS.escape(id)}`).open = true;
  },
};
