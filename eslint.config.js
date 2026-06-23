import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        DataTransfer: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        MutationObserver: 'readonly',
        Promise: 'readonly',
        // Chrome extension globals
        chrome: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off', // TypeScript handles unused vars
      'no-undef': 'off',       // TypeScript handles undefined references
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];
