/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  ignorePatterns: [
    'dist/**',
    'node_modules/**',
    '.viszi/**',
    'grammars/**',
    'coverage/**',
    'bin/**',
  ],
  rules: {
    'prefer-const': 'error',
    'no-var': 'error',
    'no-console': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
  },
  overrides: [
    {
      // CLI and server may log to stdout/stderr.
      files: ['src/cli/**/*.ts', 'src/server/**/*.ts', 'src/shared/**/*.ts'],
      rules: { 'no-console': 'off' },
    },
    {
      files: ['*.cjs', '*.config.*'],
      rules: { '@typescript-eslint/no-var-requires': 'off' },
    },
  ],
};
