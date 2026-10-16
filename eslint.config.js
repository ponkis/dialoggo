const js = require('@eslint/js');
const globals = require('globals');

const sharedRules = {
  'no-unused-vars': ['error', {
    args: 'after-used',
    argsIgnorePattern: '^_',
    caughtErrors: 'none',
  }],
  'no-empty': ['error', {
    allowEmptyCatch: true,
  }],
  'prefer-const': 'error',
  'no-var': 'error',
  eqeqeq: ['error', 'always'],
};

module.exports = [
  {
    ignores: [
      'dist/**',
      'release/**',
      'release-*/**',
      'coverage/**',
      'node_modules/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: sharedRules,
  },
  {
    // Bundled for the browser-like renderer page; no Node globals at runtime.
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.commonjs,
      },
    },
  },
  {
    // Sandboxed preload: only `require('electron')` and bundled modules.
    files: ['src/preload/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.commonjs,
      },
    },
  },
];
