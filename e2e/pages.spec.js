// فحوص عامة على الصفحات الخمس في كل تركيبة: لا أخطاء console، لا تمرير أفقي، axe بصفر مخالفات، لقطة شاشة.
import { test, expect, trackErrors, expectNoHorizontalScroll, expectNoAxeViolations } from './fixtures.js';
import { richState } from './seed.js';

const PAGES = [
  { name: 'home', url: '/index.html', ready: '#calendar-grid .calendar-day-btn' },
  { name: 'analytics', url: '/analytics.html', ready: '.chart-card svg' },
  { name: 'achievements', url: '/achievements.html', ready: '#ach-groups > *' },
  { name: 'settings', url: '/settings.html', ready: '#plan-rows > *' },
  { name: 'print', url: '/print.html?from=2026-11-01&to=2026-11-15', ready: '#report > *' },
];

test.describe('الصفحات الخمس', () => {
  test.use({ seed: richState() });

  for (const p of PAGES) {
    test(`${p.name}: بلا أخطاء ولا تمرير أفقي وaxe نظيف`, async ({ page }, testInfo) => {
      const errors = trackErrors(page);
      await page.goto(p.url);
      await expect(page.locator(p.ready).first()).toBeVisible();
      // انتظر استقرار الرسوم المتحركة/إعادة الرسم
      await page.waitForTimeout(400);

      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);

      const shot = await page.screenshot({ fullPage: true, animations: 'disabled' });
      await testInfo.attach(`${p.name}-${testInfo.project.name}`, { body: shot, contentType: 'image/png' });
      await testInfo.attach(`${p.name}.png`, { body: shot, contentType: 'image/png' });
      if (process.env.E2E_SHOTS) {
        const fs = await import('node:fs/promises');
        const dir = `e2e-artifacts/${testInfo.project.name}`;
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(`${dir}/${p.name}.png`, shot);
      }

      expect(errors, 'أخطاء console/الصفحة').toEqual([]);
    });
  }
});
