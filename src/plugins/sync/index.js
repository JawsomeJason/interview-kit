import { startSync } from './sync.js';

export default function sync(api) {
  const shadow = startSync(() => ({ ticks: api.ticks() }));
  api.onUpdate(() => {
    shadow.mount(api.doc());
    shadow.send();
  });
}
// The build test looks for this string to tell whether the plugin made it into a build.
sync.marker = '__ik_plugin_sync__';
