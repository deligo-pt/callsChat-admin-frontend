import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    'node_modules',
    'public/mockServiceWorker.js',
  ]),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  /* -----------------------------------------------------------------------
   * Architecture boundary — plan.md §7
   * Shared components must stay generic: they may never import from features/.
   * A WithdrawalApproveDialog belongs to its feature; a ConfirmActionDialog
   * belongs to components/feedback.
   * -------------------------------------------------------------------- */
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/layouts/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '**/features/*'],
              message:
                'Shared components and layouts must stay generic — they cannot import from features/. Move the shared part into components/, or keep the component inside its feature. See plan.md §7.',
            },
          ],
        },
      ],
    },
  },

  /* -----------------------------------------------------------------------
   * Features must not import from each other directly — cross-feature reuse
   * goes through components/, lib/, api/ or types/.
   * -------------------------------------------------------------------- */
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*/'],
              message:
                'Features must not reach into sibling features. Promote shared code to components/, lib/, api/ or types/. See plan.md §7.',
            },
          ],
        },
      ],
    },
  },

  /* -----------------------------------------------------------------------
   * Finance safety — plan.md §3.3
   * Money and Diamond values are integers in minor units. Floating point
   * arithmetic on them is a correctness bug, so parseFloat is banned outright.
   * -------------------------------------------------------------------- */
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.{test,spec}.{ts,tsx}', 'src/mocks/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'Money and Diamond amounts are integers in minor units — floating point arithmetic on them is forbidden. Use lib/format.ts. See plan.md §3.3.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Number',
          property: 'parseFloat',
          message:
            'Money and Diamond amounts are integers in minor units — floating point arithmetic on them is forbidden. Use lib/format.ts. See plan.md §3.3.',
        },
      ],
    },
  },

  /* -----------------------------------------------------------------------
   * shadcn primitives are vendored code (components/ui/). They intentionally
   * export cva variant functions alongside components, which trips the
   * react-refresh rule. We do not hand-edit these files for style, so the
   * rule is scoped off here rather than patched into each component.
   * -------------------------------------------------------------------- */
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  /* -----------------------------------------------------------------------
   * Route configuration is a module of route objects, not a component module,
   * so the fast-refresh component-export rule does not apply.
   * -------------------------------------------------------------------- */
  {
    files: ['src/app/router.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  /* Config and test files run in Node. */
  {
    files: ['*.config.{ts,js}', 'tests/**/*.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-console': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
])
