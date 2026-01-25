// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const crossPlatform = require('./eslint-rules/cross-platform.js');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      '.husky/**',
      'eslint-rules/**',
      'coverage/**',
      '*.config.js',
      'vite.config.ts',
    ],
  },

  // TypeScript files configuration
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        // Electron globals
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'cross-platform': crossPlatform,
    },
    rules: {
      // TypeScript rules
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-require-imports': 'off',

      // Standard ESLint rules
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-undef': 'off', // TypeScript handles this

      // Cross-platform rules
      'cross-platform/no-hardcoded-path-separator': 'error',
      'cross-platform/no-platform-specific-shell': 'error',
      'cross-platform/no-console-in-main': 'error',
      'cross-platform/no-hardcoded-app-paths': 'error',
      'cross-platform/require-platform-check': 'warn',
    },
  },

  // Test files - relax some rules
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'cross-platform/no-console-in-main': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
