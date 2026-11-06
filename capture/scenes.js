// Every screenshot and clip in src/media/, as data. `npm run capture` renders the ones that changed; capture/README.md
// lists the fields. Scenes run in the default theme at NOW (lib.js).

const desktop = { width: 1280, height: 800 };
// Phone width keeps a full-width block (the form, the picker) tight around its content.
const phone = { width: 390, height: 844 };
// Every scene but the start page begins an interview the way an interviewer does, then opens a page of it.
// The Mid role, whose Look for has a placement layer below it; the start page opens on the first role, Junior.
const begin = [{ do: 'fill', target: '.start-name', value: 'Jordan Park' }, { do: 'fill', target: '.start-candidate', value: 'Sam Rivera' }, { do: 'check', target: '.start-option input[value="frontend-engineer"]' },
  { do: 'click', target: '.start-go' }, { do: 'wait', target: '.session-header' }];
const at = (hash) => [...begin, { do: 'goto', value: hash }, { do: 'wait', target: `main[data-route="${hash}"]` }];

// The course in the sidebar mid-round, so capture:check fails a change to any step state: done, skipped, amended and
// left, then back on the path with Now and Up next, then off it. d finishes a step, s then 1 skips it, [ steps back.
const press = (...keys) => keys.map((value) => ({ do: 'press', value, wait: 150 }));
const midRound = [...at('#/practical/before-the-call'), { do: 'click', target: '.course-pools-link' }, { do: 'click', target: '.picker-ask[data-pool="html"]' },
  { do: 'click', target: '[data-course="begin"]', wait: 200 }, ...press('d', 'd', 's', '1', 'd', '[', '1')];

export const scenes = [
  {
    id: 'start', viewport: phone,
    crop: ['.start-form', '.start-check'],
    alt: 'The start page: your name as colleagues will see it, who you are meeting, when it starts, the role and the round to run, Start interview, and the check that notes save on this laptop',
  },
  {
    id: 'mark', kind: 'clip', viewport: { width: 1280, height: 800 }, dpr: 2, width: 560, crop: ['.assess .panel-title', '.assess-group >> nth=2'], pad: 16,
    steps: [...at('#/practical/deep-dive/css-04'),
      { at: 1, do: 'click', target: '.assess-row .option-row-control' },
      { at: 2.2, do: 'click', target: '.assess-row >> nth=1 >> .option-row-control' },
      { at: 3.2, do: 'highlight', target: '.assess-group', for: 1.4 }],
    duration: 5, poster: 3.6,
    alt: 'Look for on a question, evaluating at Mid: the interviewer marks two of the three numbered Mid rows seen, with the Junior rows below for placement and Senior folded away',
  },
  {
    id: 'nudges', viewport: desktop,
    steps: [...at('#/practical/review-a-teammate-s-pr'), { do: 'press', value: 'h', wait: 400 }, { do: 'press', value: 'Shift+1' }],
    crop: ['.assess-focus', '.assess-row'],
    alt: 'A finding with its nudges shown, gentlest first: the first one marked as given, and Gave it beside the next',
  },
  {
    id: 'passions', viewport: phone,
    steps: [...at('#/practical/deep-dive'), { do: 'click', target: '.picker-named[data-pool="css"]' }, { do: 'click', target: '.picker-ask[data-pool="css"]' },
      { do: 'click', target: '.picker-named[data-pool="html"]' }],
    crop: ['.picker-lead', '.picker-pools'],
    alt: 'The deep dive\'s Pools list: each pool has They named it, for what the candidate claims, and Ask from it, which picks questions. They named CSS and HTML, and the questions come from CSS',
  },
  {
    id: 'course-states', viewport: desktop, pad: 8,
    panels: [
      { label: 'Back on a finished step', steps: midRound, crop: ['.course-path'] },
      { label: 'Back on the path', steps: [...midRound, ...press('d')], crop: ['.course-path'] },
      { label: 'Off the path', steps: [...midRound, ...press('d'), { do: 'goto', value: '#/practical/deep-dive/css-03' }, { do: 'wait', target: '.course-step.is-off' }], crop: ['.course-path'] },
    ],
    alt: 'The course in the sidebar at three moments: back on a finished question, with steps done, one skipped with its reason, the question amended and the next one left; back on the path, with the question on now and the next step up next; and off the path on a question opened from Browse',
  },
  {
    id: 'decide', viewport: phone,
    steps: [...at('#/decide')],
    crop: ['.decide-form'],
    alt: 'Decide: the role\'s two decisions, each with what it means, none picked, then the level you would place them at and your reason',
  },
];
