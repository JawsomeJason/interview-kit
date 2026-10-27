# Capture kit

Every screenshot and clip in `src/media/` comes from a scene in `capture/scenes.js`. `npm run capture` renders the scenes whose definition, app source, pack or engine changed, and skips the rest. `npm run capture:check` renders every scene to a temp dir and fails on a changed still, a clip that drifts past the pixel threshold, a file over budget, or the company name read off a still by `tesseract`. Neither runs in `npm run verify` (a full render takes about 25 s); to gate CI on fresh media, add `npm run capture:check` as its own job on macOS, since fonts differ by platform.

## Add a scene

1. Append an entry to `scenes` in `capture/scenes.js`. Its `id` is the file name in `src/media/`.
2. Run `npm run capture -- --only <id>` and look at `src/media/<id>.webp` (a clip also writes `<id>.mp4`).
3. Show it with `![alt](media/<id>.webp)` (or `.mp4`) in `CHANGELOG.md` or `HELP.md`, reusing the scene's `alt`.

A still:

```js
{
  id: 'pools', viewport: { width: 390, height: 844 }, route: '#/deep-dive',
  state: { round: 'sample', candidate: 'Sam Rivera', deepDive: { minutes: 20, pools: ['css'] } },
  steps: [{ do: 'check', target: '.pool-picker input[value=html]' }],
  crop: ['.pool-picker'],
  alt: 'The pools box with CSS as the main focus and HTML second',
},
```

A clip:

```js
{
  id: 'tick-a-box', kind: 'clip', viewport: { width: 1280, height: 752 }, crop: ['.app-cols'], hide: ['.app-header'],
  route: '#/q/css-01', state: { round: 'sample', candidate: 'Sam' },
  steps: [{ at: 1, do: 'click', target: '.look-for-item input' }, { at: 2, do: 'highlight', target: '.look-for', for: 1 }],
  duration: 4, poster: 2.5,
  alt: 'Ticking the first Look for item',
},
```

## Fields

- `kind`: `still` (default) or `clip`. `pack`: `sample` (default, `examples/sample-pack/`) or `demo` (`capture/demo-pack/`: longer questions, an overlapping pair, a flagged card).
- `viewport` (CSS px), `scheme` (`light` default, or `dark`), `dpr` (2 for stills, 1 for clips).
- `state`: the interview as `src/store.js` saves it. Leave it out to open on setup. Use `ago(minutes)` from `lib.js` for `startedAt`; every scene runs at the fixed time `NOW`.
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
