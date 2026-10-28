import { expect, test, vi } from 'vitest';
import { getPref, loadPrefs, setPref } from '../src/prefs.js';

const stored = new Map();
vi.stubGlobal('localStorage', { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) });

test('a pref is saved under its own key and read back', () => {
  setPref('scheme', 'dark');
  expect([getPref('scheme'), JSON.parse(stored.get('interview-kit-layout'))]).toEqual(['dark', { scheme: 'dark' }]);
});

test('prefs saved before 0.10.0 load without the trial picks, notes and theme choice, keeping the rest', () => {
  stored.set('interview-kit-layout', JSON.stringify({ layout: 'a', header: 'd', sidebar: 'b', setup: 'c', notesOpen: true,
    notes: { 'Sidebar C': 'fine' }, scheme: 'dark', theme: 'default', tab: 'assess', seenVersion: '0.9.0' }));
  loadPrefs();
  expect(JSON.parse(stored.get('interview-kit-layout'))).toEqual({ scheme: 'dark', tab: 'assess', seenVersion: '0.9.0' });
});

test('saved prefs that are not JSON load as none', () => {
  stored.set('interview-kit-layout', '{oops');
  loadPrefs();
  expect(getPref('scheme', 'auto')).toBe('auto');
});
