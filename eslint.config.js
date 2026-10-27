// Unused imports, variables and functions, which have shipped unnoticed before and hide dead code. And the wall around
// blindness: kinds and plugins see only my evidence and the plan, never the store, the gate or sync's insides.
const STORE_AND_GATE = { regex: '(^|/)evidence/(store|gate)(\\.js)?$', message: 'Kinds and plugins read evidence through ctx, never the store or the gate.' };
const SYNC = { regex: '(^|/)sync/', message: 'Only the sync plugin may import its own files.' };

export default [
  { ignores: ['dist/**', 'node_modules/**', 'capture/out/**'] },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  },
  {
    files: ['src/kinds/**/*.js', 'src/plugins/**/*.js'],
    ignores: ['src/plugins/sync/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [STORE_AND_GATE, SYNC] }] },
  },
  {
    files: ['src/plugins/sync/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: [STORE_AND_GATE] }] },
  },
];
