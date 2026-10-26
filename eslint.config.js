// Only one rule: unused imports, variables and functions, which have shipped unnoticed before and hide dead code.
export default [
  { ignores: ['dist/**', 'dist-sync/**', 'node_modules/**', 'capture/out/**'] },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  },
];
