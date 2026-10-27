import { esc } from '../../esc.js';
import { itemsOf } from '../../model/observables.js';
import { assess, bindAssess, itemPage } from '../../ui/assess.js';
import { bindRunBlocks, runBlock } from '../../components/run-block.js';

const scriptOf = (ctx) => ctx.pack.libs.script.find((s) => s.id === ctx.segment.ref);

export default {
  render(ctx) {
    const script = scriptOf(ctx);
    const run = `<h1>${esc(ctx.segment.title)}</h1>${script.blocks.map(runBlock).join('')}`;
    return script.lookFor?.length ? itemPage(run, assess(ctx, itemsOf(ctx.pack).get(script.id), ctx.segment.seg)) : `<article class="item-run">${run}</article>`;
  },
  bind(root, ctx) {
    bindRunBlocks(root);
    const panel = root.querySelector('.assess');
    if (panel) bindAssess(panel, ctx, itemsOf(ctx.pack).get(scriptOf(ctx).id));
  },
};
