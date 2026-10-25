// Dev tools, loaded only by `npm run dev`. One line per tool; each may export a question(main, q) hook.
import { mountHelpReview } from './review/help.js';
import { mountQuestions } from './review/questions.js';

// The pack's brand styling for these tools (theme/dev/*.css) comes with them, so the built file has none.
import.meta.glob('@pack/theme/dev/*.css', { eager: true });

export { default as review } from './review/review.js';

// These watch the page themselves, so they need no hook in main.js and work on the setup page too.
mountHelpReview(document.getElementById('root'));
mountQuestions(document.body);
