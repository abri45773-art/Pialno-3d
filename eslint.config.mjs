import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', localStorage: 'readonly', console: 'readonly',
        performance: 'readonly', requestAnimationFrame: 'readonly', setTimeout: 'readonly',
        clearTimeout: 'readonly', Promise: 'readonly', Float32Array: 'readonly', Math: 'readonly',
        Set: 'readonly', Map: 'readonly', Array: 'readonly', Object: 'readonly', Number: 'readonly',
        String: 'readonly', JSON: 'readonly', AudioContext: 'readonly', HTMLCanvasElement: 'readonly',
        devicePixelRatio: 'readonly', navigator: 'readonly', CustomEvent: 'readonly', URL: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
