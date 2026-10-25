import { expect, test, vi } from 'vitest';
import { applyLayout, getPref, loadPrefs, phoneTab, setLayout, setPhoneTab, setPref, trialId, trialSwitcher } from '../src/components/layout-switcher.js';
import { commit, commitUndoable, newInterview } from '../src/undo.js';

const stored = new Map();
vi.stubGlobal('localStorage', { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) });
vi.stubGlobal('document', { body: { className: '' }, getElementById: () => null });

test('the layout choice is saved under its own key and applied as a body class', () => {
  setLayout('b');
  expect([JSON.parse(stored.get('interview-kit-layout')), document.body.className]).toEqual([{ layout: 'b' }, 'layout-b']);
});

test('New interview leaves the layout alone', () => {
  setLayout('b');
  const state = { round: 'pair', deepDive: { minutes: 25, pools: [] }, ticks: { r1: [0] } };
  commitUndoable(state, newInterview(state), '#/deep-dive', () => {});
  commitUndoable(state, {}, '#/round', () => {});
  commit({});
  expect([JSON.parse(stored.get('interview-kit-layout')).layout, stored.get('interview-kit')]).toEqual(['b', '{}']);
});

test('the phone tab starts on Question, and a switch is saved and read back', () => {
  const before = phoneTab();
  setPhoneTab('assess');
  expect([before, phoneTab(), JSON.parse(stored.get('interview-kit-layout')).tab]).toEqual(['question', 'assess', 'assess']);
});

test('a saved layout C, now removed, falls back to A', () => {
  stored.set('interview-kit-layout', JSON.stringify({ layout: 'c', notesOpen: true }));
  loadPrefs();
  applyLayout();
  expect(document.body.className).toBe('layout-a');
});

test('the sidebar switcher lists every variant with the saved one pressed, and an unknown one falls back to A', () => {
  const variants = { a: { label: 'Timeline' }, b: { label: 'Run of show' } };
  setPref('sidebar', 'b');
  const pressed = trialSwitcher('sidebar', 'Sidebar', variants).match(/data-sidebar="[^"]+" title="[^"]+" aria-pressed="[^"]+"/g);
  setPref('sidebar', 'z');
  expect([pressed, trialId('sidebar', variants), JSON.parse(stored.get('interview-kit-layout')).sidebar]).toEqual([
    ['data-sidebar="a" title="Timeline" aria-pressed="false"', 'data-sidebar="b" title="Run of show" aria-pressed="true"'], 'a', 'z',
  ]);
});

test('notes saved under the old Layout name move to Question layout on load, keeping any newer note', () => {
  stored.set('interview-kit-layout', JSON.stringify({ notes: { 'Layout A': 'cramped', 'Layout B': 'old', 'Question layout B': 'new', 'Sidebar C': 'fine' } }));
  loadPrefs();
  expect(getPref('notes')).toEqual({ 'Question layout A': 'cramped', 'Question layout B': 'new', 'Sidebar C': 'fine' });
});

test('with no saved pick the setup page trial defaults to C, and the other trials to A', () => {
  stored.clear();
  loadPrefs();
  expect([trialId('setup', { a: 1, b: 1, c: 1, d: 1 }), trialId('header', { a: 1, b: 1 })]).toEqual(['c', 'a']);
});
