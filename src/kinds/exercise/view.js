import { esc } from '../../esc.js';
import { itemsOf } from '../../model/observables.js';
import { assess, bindAssess, itemPage } from '../../ui/assess.js';
import { optionRow } from '../../components/option-row.js';
import { bindRunBlocks, runBlock } from '../../components/run-block.js';
import { bindSegmentMinutes, segmentMinutes } from '../../components/segment-minutes.js';

const exerciseOf = (ctx) => ctx.pack.libs.exercise.find((e) => e.id === ctx.segment.ref);
const fallbackOn = (ctx) => Boolean(ctx.api.plan().segments[ctx.segment.seg]?.fallback);

// The fallback switch is shared: a broken sandbox is broken for everyone in the room.
const run = (ctx, ex) => `<h1>${esc(ctx.segment.title)}</h1>${segmentMinutes(ctx)}${[['Brief', ex.brief], ['Paste to the candidate', ex.paste, true], ['Run', ex.run]]
  .filter(([, text]) => text).map(([title, text, copy]) => runBlock({ title, md: text, copy })).join('')}${ex.fallback ? `<div class="exercise-fallback">
  ${optionRow({ type: 'checkbox', checked: fallbackOn(ctx) }, 'Run the fallback: no running app', 'exercise-fallback-switch')}
  <div class="exercise-fallback-text" ${fallbackOn(ctx) ? '' : 'hidden'}>${runBlock({ title: 'Fallback', md: ex.fallback })}</div></div>` : ''}`;

export default {
  render(ctx) {
    const ex = exerciseOf(ctx);
    return itemPage(run(ctx, ex), assess(ctx, itemsOf(ctx.pack).get(ex.id), ctx.segment.seg));
  },
  bind(root, ctx) {
    const ex = exerciseOf(ctx);
    const item = itemsOf(ctx.pack).get(ex.id);
    bindRunBlocks(root);
    const panel = bindAssess(root.querySelector('.assess'), ctx, item);
    root.querySelector('.exercise-fallback-switch')?.addEventListener('input', async ({ target }) => {
      await ctx.api.log({ t: 'put', k: 'segment.fallback', seg: ctx.segment.seg, v: target.checked });
      root.querySelector('.exercise-fallback-text').hidden = !target.checked;
      // Findings that hide in the fallback leave the panel, and a finding's own fallback line replaces Show it.
      panel.redraw();
    });
    return bindSegmentMinutes(root, ctx, panel.redraw);
  },
};
