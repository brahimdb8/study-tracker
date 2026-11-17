// ESLint 9 (flat config). يحرس قواعد المشروع الهندسية بجانب الاختبارات.
import js from '@eslint/js';
import globals from 'globals';

const DOM_ONLY = ['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history'];

export default [
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'e2e-artifacts/**'] },
  js.configs.recommended,
  {
    // كل ملفات التطبيق
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.worker, __APP_VERSION__: 'readonly' } },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      // نص المستخدم لا يدخل DOM إلا عبر textContent/createElement
      'no-restricted-properties': ['error',
        { property: 'innerHTML', message: 'ممنوع innerHTML: استعمل textContent/createElement.' },
        { property: 'outerHTML', message: 'ممنوع outerHTML: استعمل textContent/createElement.' },
        { property: 'insertAdjacentHTML', message: 'ممنوع insertAdjacentHTML: استعمل textContent/createElement.' },
      ],
      'no-restricted-syntax': ['error',
        { selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]", message: 'ممنوع إسناد innerHTML/outerHTML.' },
        { selector: "Property[key.name=/^(innerHTML|outerHTML)$/]", message: 'ممنوع innerHTML/outerHTML في الخصائص.' },
      ],
    },
  },
  {
    // src/core نقي: لا DOM ولا تخزين؛ الوقت والتخزين يُحقنان
    files: ['src/core/**/*.js'],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      'no-restricted-globals': ['error', ...DOM_ONLY.map((name) => ({ name, message: 'src/core نقي: لا تستعمل واجهات المتصفح (احقنها).' }))],
      'no-restricted-properties': ['error',
        { object: 'globalThis', property: 'document', message: 'src/core نقي.' },
        { object: 'globalThis', property: 'window', message: 'src/core نقي.' },
        { object: 'globalThis', property: 'localStorage', message: 'src/core نقي.' },
        { property: 'innerHTML', message: 'ممنوع innerHTML.' },
        { property: 'outerHTML', message: 'ممنوع outerHTML.' },
        { property: 'insertAdjacentHTML', message: 'ممنوع insertAdjacentHTML.' },
      ],
    },
  },
  {
    // اختبارات Vitest وأدوات Node
    files: ['tests/**/*.js', 'vite.config.js', 'eslint.config.js', 'playwright.config.js', 'e2e/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }, // browser: دوال page.evaluate في e2e
    rules: { 'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }] },
  },
];
