import { expect, test, vi } from 'vitest';
import { setTheme, themeToggle } from '../src/components/theme-toggle.js';

const stored = new Map();
vi.stubGlobal('localStorage', { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) });
vi.stubGlobal('document', { documentElement: { dataset: {} } });
const packTheme = { id: 'acme', name: 'Acme' };

test('no switcher when the pack declares no theme', () => {
  expect(themeToggle(null)).toBe('');
});

test('the switcher offers Default and the pack theme, starting on the pack theme', () => {
  expect(themeToggle(packTheme).match(/data-theme-choice="[^"]+" aria-pressed="[^"]+">[^<]+/g)).toEqual([
    'data-theme-choice="default" aria-pressed="false">Default', 'data-theme-choice="acme" aria-pressed="true">Acme',
  ]);
});

test('choosing Default removes data-theme, the pack theme sets it, and the choice persists', () => {
  setTheme('default', packTheme);
  const afterDefault = [document.documentElement.dataset.theme, JSON.parse(stored.get('interview-kit-layout')).theme];
  setTheme('acme', packTheme);
  expect([afterDefault, [document.documentElement.dataset.theme, JSON.parse(stored.get('interview-kit-layout')).theme]])
    .toEqual([[undefined, 'default'], ['acme', 'acme']]);
});
