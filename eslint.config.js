// ESLint Flat Config for Sonmap Studio (ESLint 9+)
// See: https://eslint.org/docs/latest/use/configure/configuration-files

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import next from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Custom rule: Enforce async/await dbLogger usage and prohibit console.log, LogManager, createLogger in DB, API, and utility code.
 * (For now, use no-restricted-syntax and no-console as a baseline. Custom rule can be added later.)
 */

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': reactHooks,
      '@next/next': next,
    },
    rules: {
      // TypeScript/React/Next.js best practices
      'react/jsx-uses-react': 'off', // React 17+
      'react/react-in-jsx-scope': 'off', // React 17+
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-html-link-for-pages': 'off',
      // Sonmap Studio: Enforce async dbLogger and prohibit legacy loggers
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='createLogger']",
          message: 'Use dbLogger from @/utils/logging/dbLogger instead of createLogger.'
        },
        {
          selector: "Identifier[name='LogManager']",
          message: 'Use dbLogger from @/utils/logging/dbLogger instead of LogManager.'
        },
        {
          selector: "MemberExpression[property.name='error'][object.name='logger']",
          message: 'Use dbLogger.error (async/await) with context instead of logger.error.'
        },
        {
          selector: "MemberExpression[property.name='info'][object.name='logger']",
          message: 'Use dbLogger.info (async/await) with context instead of logger.info.'
        },
        {
          selector: "MemberExpression[property.name='warn'][object.name='logger']",
          message: 'Use dbLogger.warn (async/await) with context instead of logger.warn.'
        },
        {
          selector: "MemberExpression[property.name='debug'][object.name='logger']",
          message: 'Use dbLogger.debug (async/await) with context instead of logger.debug.'
        }
      ],
      // Enforce awaiting dbLogger calls (best effort, can be improved with custom rule)
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: false,
          ignoreIIFE: true,
        },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
]; 