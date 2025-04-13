// @ts-check

import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierConfigRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: ['dist/'],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.[jt]s'],
    languageOptions: {ecmaVersion: 2023},
    rules: {
      'no-undef': 'error',
      'no-var': 'error',
    },
  },
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['eslint.config.js', 'tsup.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-inferrable-types': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {...globals.node},
    },
  },
  prettierConfigRecommended
);
