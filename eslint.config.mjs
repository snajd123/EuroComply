import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  // Base ESLint recommended rules
  eslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.mjs'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',

      // General rules - allow console.log since we use structured logging
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',

      // Disable rules that conflict with TypeScript
      'no-undef': 'off', // TypeScript handles this
      'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
    },
  },
];
