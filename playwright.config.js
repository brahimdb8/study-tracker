// اختبارات e2e حقيقية: 4 تركيبات (عرض 1280 و390 × الثيم الفاتح والداكن) على نسخة الإنتاج المبنية.
import { defineConfig } from '@playwright/test';


const SIZES = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
const THEMES = ['light', 'dark'];

const projects = [];
for (const [sizeName, viewport] of Object.entries(SIZES)) {
  for (const theme of THEMES) {
    projects.push({ name: `${sizeName}-${theme}`, use: { viewport, theme, colorScheme: theme } });
  }
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'ar',
    timezoneId: 'Africa/Casablanca',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects,
});
