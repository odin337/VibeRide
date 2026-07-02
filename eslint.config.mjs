// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // Disabled: flags every computed member access (arr[i]) producing
      // an unmanageable false-positive rate; object-injection risks are
      // covered by strict typing and zod validation at all IO boundaries.
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/e2e/**/*.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Test helpers legitimately use single-use type parameters purely for
      // inference (e.g. typed event recorders keyed by GameEventMap).
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
    },
  },
  {
    files: ['apps/backend/**/*.ts'],
    rules: {
      // NestJS modules are declarative decorator-holder classes by design.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  prettier,
);
