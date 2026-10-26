import { expect, test, vi } from 'vitest';
import { getPref, loadPrefs, phoneTab, setPhoneTab, setPref } from '../src/prefs.js';
import { commit, commitUndoable, newInterview } from '../src/undo.js';

const stored = new Map();
vi.stubGlobal('localStorage', { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) });

test('a pref is saved under its own key and read back', () => {
  setPref('scheme', 'dark');
  expect([getPref('scheme'), JSON.parse(stored.get('interview-kit-layout'))]).toEqual(['dark', { scheme: 'dark' }]);
});

test('New interview leaves the prefs alone', () => {
  const state = { round: 'pair', deepDive: { minutes: 25, pools: [] }, ticks: { r1: [0] } };
  commitUndoable(state, newInterview(state), '#/deep-dive', () => {});
  commitUndoable(state, {}, '#/round', () => {});
  commit({});
  expect([JSON.parse(stored.get('interview-kit-layout')).scheme, stored.get('interview-kit')]).toEqual(['dark', '{}']);
});

test('the phone tab starts on Question, and a switch is saved and read back', () => {
  const before = phoneTab();
  setPhoneTab('assess');
  expect([before, phoneTab(), JSON.parse(stored.get('interview-kit-layout')).tab]).toEqual(['question', 'assess', 'assess']);
});

test('prefs saved during the layout trials load without their trial picks and notes, keeping the rest', () => {
  stored.set('interview-kit-layout', JSON.stringify({ layout: 'a', header: 'd', sidebar: 'b', setup: 'c', notesOpen: true,
    notes: { 'Sidebar C': 'fine' }, scheme: 'dark', theme: 'default', tab: 'assess', seenVersion: '0.9.0' }));
  loadPrefs();
  expect(JSON.parse(stored.get('interview-kit-layout'))).toEqual({ scheme: 'dark', theme: 'default', tab: 'assess', seenVersion: '0.9.0' });
});

test('saved prefs that are not JSON load as none', () => {
  stored.set('interview-kit-layout', '{oops');
  loadPrefs();
  expect([getPref('scheme', 'auto'), phoneTab()]).toEqual(['auto', 'question']);
});
