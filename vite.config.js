import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { swManifest } from './vite-plugin-sw-manifest.js';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const page = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [swManifest()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    rollupOptions: {
      // sw يُبنى باسم ثابت sw.js في الجذر (لا هاش) ليبقى رابط التسجيل ثابتاً
      output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
      input: {
        sw: fileURLToPath(new URL('./src/pwa/sw.js', import.meta.url)),
        main: page('index.html'),
        analytics: page('analytics.html'),
        achievements: page('achievements.html'),
        settings: page('settings.html'),
        print: page('print.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
