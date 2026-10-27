import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

// The plugins a build includes: every folder in src/plugins/, minus each one `--without` names or pack.json sets to
// false. Neither can switch a plugin on. A name that is not a folder there is an error, from either place.
export function enabledPlugins(app, without = '', packPlugins, packLabel) {
  const all = readdirSync(resolve(app, 'src/plugins'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const named = [
    ...without.split(',').filter(Boolean).map((name) => [`--without ${name}`, name, false]),
    ...Object.entries(packPlugins ?? {}).map(([name, on]) => [`${packLabel} plugins.${name}`, name, on]),
  ];
  const unknown = named.find(([, name]) => !all.includes(name));
  if (unknown) throw new Error(`${unknown[0]}: no plugin named "${unknown[1]}". Plugins: ${all.join(', ')}.`);
  return all.filter((name) => !named.some(([, n, on]) => n === name && on === false));
}

// Serves virtual:plugins, one static export per enabled plugin, so a plugin left out is never in the module graph and
// not one byte of it reaches the build. bin/interview-kit.js passes --without in KIT_WITHOUT.
export default function plugins(pack) {
  const packJson = resolve(pack, 'pack.json');
  const packPlugins = existsSync(packJson) ? JSON.parse(readFileSync(packJson, 'utf8')).plugins : undefined;
  const enabled = enabledPlugins('.', process.env.KIT_WITHOUT, packPlugins, relative('.', packJson));
  const id = '\0virtual:plugins';
  return {
    name: 'plugins',
    resolveId: (source) => (source === 'virtual:plugins' ? id : undefined),
    load: (resolved) => (resolved === id
      ? enabled.map((name) => `export { default as ${name.replace(/-(\w)/g, (_, c) => c.toUpperCase())} } from '/src/plugins/${name}/index.js';`).join('\n')
      : undefined),
  };
}
