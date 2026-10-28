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
    steps: [...at('#/practical/deep-dive'), { do: 'check', target: '.picker-passion input[value="css"]' }],
    crop: ['.picker-passions', '.picker-pools'],
    alt: 'The deep dive picker: what the candidate specializes in or is excited by, with CSS ticked, which also picks the CSS pool as the main focus',
  },
  {
    id: 'decide', viewport: phone,
    steps: [...at('#/decide')],
    crop: ['.decide-form'],
    alt: 'Decide: the role\'s two decisions, each with what it means, none picked, then the level you would place them at and your reason',
  },
];
