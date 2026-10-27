import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { describe, loadPack, PACK_PATHS } from './load.js';

const IDS = ['virtual:pack', 'virtual:pack/theme', 'virtual:pack/theme/dev'];

// Serves the pack to the browser. virtual:pack is the loaded model as JSON, built only once something imports it;
// virtual:pack/theme and virtual:pack/theme/dev import the pack's theme CSS. A pack with errors fails the module, so
// the dev server shows them in its overlay and a build stops.
export default (pack) => {
  let build = false;
  const css = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.css')).sort().map((f) => `import ${JSON.stringify(join(dir, f))};`).join('\n') : '');
  return {
    name: 'pack',
    configResolved: (config) => { build = config.command === 'build'; },
    resolveId: (id) => (IDS.includes(id) ? `\0${id}` : undefined),
    async load(id) {
      if (id === '\0virtual:pack/theme') return css(join(pack, 'theme'));
      if (id === '\0virtual:pack/theme/dev') return css(join(pack, 'theme/dev'));
      if (id !== '\0virtual:pack') return undefined;
      const { model, problems } = await loadPack(pack);
      if (!model) this.error(problems.filter((p) => p.level === 'error').map(describe).join('\n\n'));
      // The built file keeps a card's review flag but not the editor's notes under its "## Review".
      return `export default ${JSON.stringify(model, (key, value) => (build && key === 'reviewMd' ? undefined : value))};`;
    },
    configureServer(server) {
      const watched = [...PACK_PATHS, 'theme'].map((p) => resolve(pack, p));
      server.watcher.add(watched);
      const reload = (file) => {
        if (!watched.some((p) => file === p || file.startsWith(`${p}${sep}`))) return;
        for (const id of IDS) {
          const mod = server.moduleGraph.getModuleById(`\0${id}`);
          if (mod) server.reloadModule(mod);
        }
      };
      server.watcher.on('add', reload).on('unlink', reload).on('change', reload);
    },
  };
};
