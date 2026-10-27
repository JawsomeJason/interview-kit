# Capture kit

Every screenshot and clip in `src/media/` comes from a scene in `capture/scenes.js`. `npm run capture` renders the scenes whose definition, app source, pack or engine changed, and skips the rest. `npm run capture:check` renders every scene to a temp dir and fails on a changed still, a clip that drifts past the pixel threshold, a file over budget, or the company name read off a still by `tesseract`. Neither runs in `npm run verify` (a full render takes about 25 s); to gate CI on fresh media, add `npm run capture:check` as its own job on macOS, since fonts differ by platform.

## Add a scene

1. Append an entry to `scenes` in `capture/scenes.js`. Its `id` is the file name in `src/media/`.
2. Run `npm run capture -- --only <id>` and look at `src/media/<id>.webp` (a clip also writes `<id>.mp4`).
3. Show it with `![alt](media/<id>.webp)` (or `.mp4`) in `CHANGELOG.md` or `HELP.md`, reusing the scene's `alt`.

A still:

```js
{
  id: 'passions', viewport: phone,
  steps: [...at('#/practical/deep-dive'), { do: 'check', target: '.picker-passion input[value="css"]' }],
  crop: ['.picker-passions', '.picker-pools'],
  alt: 'The deep dive picker with CSS ticked, which also picks the CSS pool',
},
```

`at(hash)` in `scenes.js` starts an interview from the start page, as an interviewer does, then opens that page of it.

A clip:

```js
{
  id: 'mark-a-row', kind: 'clip', viewport: { width: 1280, height: 752 }, crop: ['.assess'],
  steps: [...at('#/practical/deep-dive/css-04'), { at: 1, do: 'press', value: '1' }, { at: 2, do: 'highlight', target: '.assess-group', for: 1 }],
  duration: 4, poster: 2.5,
  alt: 'Pressing 1 marks the first Look for row seen',
},
```

## Fields

- `kind`: `still` (default) or `clip`. `pack`: `sample` (default, `examples/sample-pack/`) or `demo` (`capture/demo-pack/`: longer questions, an overlapping pair, a flagged card).
- `viewport` (CSS px), `scheme` (`light` default, or `dark`), `dpr` (2 for stills, 1 for clips).
- Every scene runs at the fixed time `NOW` from `lib.js`, and opens on the start page; steps start the interview.
- `prefs`: UI prefs, such as `{ tab: 'assess' }`.
- `route`: the hash to open. `steps`: `{ do, target, value, wait }` run in order; `do` is `click`, `check`, `fill`, `type`, `press`, `hover`, `goto` (a hash) or `wait`.
- `crop`: selectors; the shot is their union plus `pad` (12 px for stills, 0 for clips). No `crop` means the whole viewport.
- `hide`: selectors made invisible (they keep their space). `css`: extra CSS for the scene. `highlight`: selectors ringed in blue. `mask`: selectors painted over. `colors`: palette cap for a still (64).
- `panels`: a list of overrides, one shot each, joined side by side with an optional `label` over each.
- `alt`: the text for the page's `![alt]`. It must describe what the picture shows.
- Clips only: steps take `at` (seconds) and play on the clip's clock; the pointer glides to each target. `type` adds `cps` (characters a second). `highlight` adds `for` (seconds). `duration`, `fps` (24), `poster` (seconds; the `.webp` of the same name), `width` (960 output px), `crf` (23), and `loop`: `fade` (default) blends the last half second into the first frame, `cut` doesn't.
- `stage: 'call'` plays a clip over a stand-in fullscreen call, for things that leave the tab, such as Pop out. See `stages/call.mjs` and the `pop-out` scene.

## Files

- `run.mjs` builds each pack, serves it on a free port, renders the scenes four at a time and writes `src/media/` and `manifest.json` (per file: bytes, size and hash, plus each scene's input hash). `--only <id>` renders one scene, `--force` renders all.
- `lib.js` holds the seeding, hashing, skip plan and budgets (40 KB an image, 350 KB a clip, 2 MB in all); `test/capture.test.js` covers them.
