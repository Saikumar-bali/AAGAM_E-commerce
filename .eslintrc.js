/**
 * Shared lint baseline for the monorepo.
 *
 * Syntactic only (no type-aware `project` parsing): every workspace can run it
 * without a built tsconfig, which keeps it fast and immune to the build-order
 * problems that already bite `tsc` here. Type checking is `tsc`'s job.
 *
 * `next/core-web-vitals` is deliberately NOT extended: it bundles its own
 * eslint-plugin-react-hooks (5.x), and ESLint 8 refuses to hold two versions of
 * one plugin name, which makes every React Compiler-era rule in the root 7.x
 * copy resolve as "definition not found". Instead the Next rules are enabled
 * directly via @next/eslint-plugin-next, and React comes from the single 7.x
 * copy at the repo root.
 *
 * The React Compiler-era `react-hooks` 7.x rules (purity, set-state-in-effect,
 * preserve-manual-memoization, refs, ...) and `rules-of-hooks` are warnings
 * rather than errors: they flag pre-existing patterns across the dashboard and
 * mobile apps. Warnings keep them visible without failing the build.
 */
module.exports = {
  root: true,
  env: { es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    '**/dist/',
    '**/build/',
    '**/coverage/',
    '**/.next/',
    '**/node_modules/',
    '**/*.d.ts',
    'packages/database/src/generated/',
    '**/e2e/**',
    '**/*.setup.ts',
    // Served verbatim: vendored Firebase SDK bundles and service workers
    '**/public/**',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-console': 'off',
    'no-useless-escape': 'warn',
  },
  overrides: [
    {
      // Every JSX surface: React + React Native + Next, from one plugin copy.
      files: ['**/*.tsx', '**/*.jsx'],
      plugins: ['react', 'react-hooks', '@next/next'],
      extends: ['plugin:react/recommended', 'plugin:react-hooks/recommended'],
      settings: { react: { version: 'detect' } },
      rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react/no-unescaped-entities': 'off',
        // styled-jsx legitimately uses <style jsx global>
        'react/no-unknown-property': ['error', { ignore: ['jsx', 'global'] }],
        'react-hooks/rules-of-hooks': 'warn',
        'react-hooks/exhaustive-deps': 'warn',
        'react-hooks/purity': 'warn',
        'react-hooks/set-state-in-effect': 'warn',
        'react-hooks/set-state-in-render': 'warn',
        'react-hooks/preserve-manual-memoization': 'warn',
        'react-hooks/static-components': 'warn',
        'react-hooks/use-memo': 'warn',
        'react-hooks/refs': 'warn',
        'react-hooks/immutability': 'warn',
        'react-hooks/globals': 'warn',
        'react-hooks/error-boundaries': 'warn',
        'react-hooks/unsupported-syntax': 'warn',
        'react-hooks/config': 'warn',
        'react-hooks/gating': 'warn',
        '@next/next/no-img-element': 'warn',
        '@next/next/no-html-link-for-pages': 'off',
      },
    },
    {
      // Server components / route handlers: Next rules apply without JSX.
      files: ['apps/admin-dashboard/src/app/**/*.ts'],
      plugins: ['@next/next'],
      rules: { '@next/next/no-img-element': 'warn' },
    },
    {
      files: [
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.spec.js',
        '**/*.spec.jsx',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.test.js',
        '**/*.test.jsx',
      ],
      env: { jest: true },
      rules: { '@typescript-eslint/no-unused-vars': 'off' },
    },
    {
      // Node scripts and the mobile Expo/Metro configs are plain tooling
      files: ['scripts/**/*.js', 'apps/mobile-*/metro.config.js', 'apps/mobile-*/*.config.js'],
      env: { node: true, browser: false },
    },
  ],
};
