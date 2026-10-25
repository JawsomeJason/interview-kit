import { expect, test } from 'vitest';
import { optionRow } from '../src/components/option-row.js';

test('an option row is a label holding the control and its text in their own grid cells', () => {
  expect(optionRow({ type: 'checkbox', value: '2', checked: true }, 'Says <em>why</em>', 'look-for-item')).toBe(
    '<label class="option-row look-for-item"><span class="option-row-box"><input type="checkbox" value="2" checked class="option-row-control"></span>'
    + '<span class="option-row-text">Says <em>why</em></span></label>',
  );
});
