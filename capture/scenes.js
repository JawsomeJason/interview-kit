// Every screenshot and clip in src/media/, as data. `npm run capture` renders the ones that changed; capture/README.md
// lists the fields. Scenes run in the default theme at NOW (lib.js).
import { ago } from './lib.js';

const desktop = { width: 1280, height: 800 };
// Phone width keeps a full-width block (the list, the pools box) tight around its content.
const phone = { width: 390, height: 844 };
const interview = { round: 'sample', candidate: 'Sam Rivera', deepDive: { minutes: 20, pools: ['css', 'html'] }, ticks: {}, notes: {}, done: [], startedAt: ago(12) };
const note = 'Centered with grid, then talked through flex.';
// The clips' frame: everything under the header.
const columns = { viewport: { width: 1280, height: 752 }, crop: ['.app-cols'], pad: 16, hide: ['.app-header'] };

export const scenes = [
  // What's new
  {
    id: 'time-meter', viewport: desktop, route: '#/q/css-01', state: interview,
    crop: ['.now-next-rest'], pad: 16,
    alt: 'The rest of the plan in the sidebar, 45 of 45 min, each part with its start time and the meter under it',
  },
  {
    id: 'your-hour', viewport: phone,
    crop: ['.setup-plan'],
    alt: 'Your hour on the setup page: the intro, the round, the deep dive and the outro at their clock times, and when the interview ends',
  },
  {
    id: 'header-menu', viewport: desktop, route: '#/q/css-01', state: interview,
    steps: [{ do: 'click', target: '.header-menu-button' }],
    crop: ['.header-menu-button', '.header-menu'],
    alt: 'Menu open under the header, with the colors, What\'s new, Help, Pop out and New interview',
  },
  {
    id: 'question-search', viewport: desktop, route: '#/q/css-01', state: interview,
    steps: [{ do: 'click', target: '.now-next-browse' }, { do: 'type', target: '.question-search-box', value: 'la' }, { do: 'press', value: 'ArrowDown' }],
    crop: ['.question-search'],
    alt: 'All questions open with la typed in the search: the matches marked in each title, grouped by topic, the second one picked',
  },
  {
    id: 'centered', viewport: { width: 1480, height: 600 }, colors: 16, route: '#/q/css-01', state: interview,
    alt: 'A question page on a wide screen: the question in the middle of the window with the dock under it, and the sidebar beside it on the left',
  },
  {
    id: 'schemes', viewport: { width: 1280, height: 520 }, route: '#/q/css-01',
    state: { ...interview, ticks: { 'css-01': [0] }, notes: { 'css-01': note } },
    crop: ['.question-notes', '.look-for'],
    panels: [{ scheme: 'light' }, { scheme: 'dark' }],
    alt: 'Notes and Look for in the light scheme beside the same panel in the dark scheme',
  },
  {
    id: 'pop-out', kind: 'clip', stage: 'call', viewport: { width: 1280, height: 672 }, window: { width: 380, height: 640 }, dpr: 2,
    route: '#/q/css-01', state: { ...interview, candidate: 'Sam', startedAt: ago(18.5) },
    steps: [
      { at: 0.9, do: 'click', target: '.header-menu-button' },
      { at: 1.5, do: 'popout', target: '.header-button:has-text("Pop out")' },
      { at: 3.5, do: 'click', target: '[data-tab=assess]' },
      { at: 4.3, do: 'click', target: '.look-for-item input' },
      { at: 5.0, do: 'click', target: '.question-notes-text', x: 0.3, y: 0.7 },
      { at: 5.2, do: 'type', value: 'Grid answer, explained why', cps: 12 },
      { at: 8.05, do: 'close' },
    ],
    duration: 9.7, loop: 'cut', crf: 26, poster: 7.7,
    alt: 'The interview kit pops out of its browser tab into a small always-on-top window over a fullscreen call, where the interviewer ticks a Look for item and types a note while the elapsed time ticks, then closes it and the kit returns to the tab with nothing lost',
  },

  // Help
  {
    id: 'score-after', viewport: phone, route: '#/deep-dive',
    state: { ...interview, ticks: { 'css-01': [0, 2], 'css-02': [0, 1, 2], 'html-01': [1] }, done: ['css-01', 'css-02', 'html-01'] },
    crop: ['.picked-list'],
    alt: 'The Deep dive list after the interview, where each question you ticked shows Weak, Solid or Strong, above a note that scores come from your Look for ticks',
  },
  {
    id: 'pick', viewport: phone, route: '#/deep-dive', state: interview,
    crop: ['.minutes-control', '.pool-picker', '.picked-list-items', '.picked-list-total'],
    alt: 'The Deep dive planner at 20 minutes, with CSS checked as the main focus and HTML second, and the four questions the kit picked to fill the time',
  },
  {
    id: 'name-first', viewport: phone,
    crop: ['label:has(.candidate-field)', '.setup-go'],
    panels: [{}, { steps: [{ do: 'fill', target: '.candidate-field', value: 'Sam Rivera' }] }],
    alt: 'The setup page twice: with no name, Start interview is grayed out, and once a name is typed it turns on',
  },
  {
    id: 'notes-done', viewport: desktop, route: '#/q/css-01',
    state: { ...interview, ticks: { 'css-01': [0, 2] }, notes: { 'css-01': 'Reached for grid first, then explained place-items without a prompt.' }, done: ['css-01'] },
    crop: ['.question-notes', '.look-for'],
    alt: 'The Notes box holding a line about the answer, the Mark done button showing Done, and two of three Look for items ticked',
  },
  {
    id: 'ticks-score', kind: 'clip', pack: 'demo', ...columns, route: '#/q/css-01',
    state: { ...interview, candidate: 'Sam', deepDive: { minutes: 20, pools: ['css'] } },
    steps: [
      { at: 0.9, do: 'click', target: '.look-for-item input[value="0"]' },
      { at: 1.9, do: 'click', target: '.look-for-item input[value="2"]' },
      { at: 3.2, do: 'click', target: '.run-row[href="#/deep-dive"]', x: 0.3 },
      { at: 3.8, do: 'highlight', target: '.picked-list li:first-child .score-label', for: 3.2 },
      { at: 4.1, do: 'hover', target: '.picked-list li:first-child .score-label', x: 0.7, y: 2.4 },
    ],
    duration: 7.5, poster: 5,
    alt: 'On a question, the interviewer ticks two of three Look for items and no score appears. Opening the Deep dive list then shows the question scored Solid, worked out from the ticks',
  },
  {
    id: 'stable-controls', kind: 'clip', pack: 'demo', ...columns, route: '#/q/css-01',
    state: { ...interview, candidate: 'Sam', deepDive: { minutes: 20, pools: ['css'] } },
    // A slow pulse outlines the controls that hold still. Padding main and the side column by the outline's room and
    // pulling them back by the same margin keeps every box where it was.
    css: `.main, .question-side { padding: 8px; margin: -8px; }
      .pager, .question-notes, .look-for { animation: hold-still 1.6s ease-in-out infinite; border-radius: 6px; }
      @keyframes hold-still { 0%, 100% { outline: 2.5px solid rgb(37 99 235 / 0.15); outline-offset: 4px; }
        50% { outline: 2.5px solid rgb(37 99 235 / 0.7); outline-offset: 4px; } }`,
    steps: [
      { at: 1.0, do: 'click', target: '.pager a:last-child' },
      { at: 3.6, do: 'click', target: '.pager a:last-child' },
    ],
    duration: 8, poster: 4.6,
    alt: 'Clicking Next through a short question, a long one with code and a medium one, the pager, Notes and the Look for checkboxes stay in the same place while the question text changes length',
  },
  {
    id: 'overlap-note', pack: 'demo', viewport: desktop, route: '#/q/css-04',
    state: { ...interview, deepDive: { minutes: 20, pools: ['css'] } },
    crop: ['.main h1', '.overlap-note'],
    alt: 'A question the pick left out, with a note under its title saying it overlaps with Center a box, which the pick chose',
  },
  {
    id: 'needs-check', pack: 'demo', viewport: desktop, route: '#/q/html-03', state: interview,
    crop: ['.review-badge', '.main h1'],
    alt: 'A question with a quiet Being reviewed badge above its title',
  },
];
