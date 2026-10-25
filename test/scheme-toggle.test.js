import { expect, test, vi } from 'vitest';
import { getScheme, schemeToggle, setScheme } from '../src/components/scheme-toggle.js';

const stored = new Map();
vi.stubGlobal('localStorage', { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) });
vi.stubGlobal('document', { documentElement: { style: {} }, querySelectorAll: () => [] });

test('the scheme defaults to auto and saves and reads light, dark and auto with the layout prefs', () => {
  const seen = [getScheme()];
  for (const s of ['light', 'dark', 'auto']) {
    setScheme(s);
    seen.push([getScheme(), JSON.parse(stored.get('interview-kit-layout')).scheme]);
  }
  expect(seen).toEqual(['auto', ['light', 'light'], ['dark', 'dark'], ['auto', 'auto']]);
});

test('applying a scheme sets color-scheme on the root', () => {
  const applied = ['light', 'dark', 'auto'].map((s) => { setScheme(s); return document.documentElement.style.colorScheme; });
  expect(applied).toEqual(['light', 'dark', 'light dark']);
});

test('the toggle renders Light, Dark and Auto buttons with the current one pressed', () => {
  setScheme('dark');
  expect(schemeToggle().match(/aria-label="[^"]+" aria-pressed="[^"]+"/g)).toEqual([
    'aria-label="Light" aria-pressed="false"', 'aria-label="Dark" aria-pressed="true"', 'aria-label="Auto" aria-pressed="false"',
  ]);
});
