// Only unused code: B1 found an unused import and two unused functions in main.js that had shipped.
export default [
  { ignores: ['dist/**', 'dist-sync/**', 'node_modules/**', 'capture/out/**'] },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] },
  },
];
