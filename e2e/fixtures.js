// أساس كل اختبارات e2e: ساعة ثابتة، ثيم المشروع، تجاوز الجولة، وحقن بيانات بذرية اختيارية.
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXED_NOW } from './seed.js';

export const STATE_KEY = 'studyTracker:v2';

export const test = base.extend({
  theme: ['dark', { option: true }],
  /** كائن حالة يُحقن إن لم يوجد مفتاح التخزين بعد (لا يطغى على تغييرات الاختبار عند إعادة التحميل) */
  seed: [null, { option: true }],
  /** false = أظهر الجولة التعريفية */
  onboarded: [true, { option: true }],
  /** معطّل = ثبّت الحركة 'off' */
  motionOff: [false, { option: true }],

  page: async ({ page, theme, seed, onboarded, motionOff }, use) => {
    await page.clock.install({ time: FIXED_NOW });
    await page.addInitScript(
      ([themePref, seedJson, isOnboarded, off, key]) => {
        try {
          localStorage.setItem('studyTracker:theme', themePref);
          if (isOnboarded) localStorage.setItem('studyTracker:onboarded', '1');
          if (off) localStorage.setItem('studyTracker:motion', 'off');
          if (seedJson && !localStorage.getItem(key)) localStorage.setItem(key, seedJson);
        } catch { /* تجاهل */ }
      },
      [theme, seed ? JSON.stringify(seed) : null, onboarded, motionOff, STATE_KEY],
    );
    await use(page);
  },
});

export { expect };

/** يقرأ حالة التطبيق المحفوظة من IndexedDB (المرحلة 8: البيانات لم تعد في localStorage) */
export function storedState(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('studyTracker', 1);
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('kv')) { db.close(); resolve(null); return; }
      const req = db.transaction('kv').objectStore('kv').get('studyTracker:v2');
      req.onsuccess = () => { const raw = req.result; db.close(); resolve(raw ? JSON.parse(raw) : null); };
      req.onerror = () => { db.close(); resolve(null); };
    };
  }));
}

/** يفتح صفحة وينتظر اكتمال الإقلاع غير المتزامن (IndexedDB) بظهور عنصر يُبنى بعده */
export async function gotoReady(page, url, readySelector) {
  await page.goto(url);
  await page.locator(readySelector).first().waitFor();
}

/** يجمع أخطاء console وأخطاء الصفحة غير الملتقطة */
export function trackErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** لا تمرير أفقي */
export async function expectNoHorizontalScroll(page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, `scrollWidth(${sw}) يجب ألا يتجاوز clientWidth(${cw})`).toBeLessThanOrEqual(cw);
}

/** axe-core: wcag2a/aa/21a/21aa بصفر مخالفات */
export async function expectNoAxeViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, 'مخالفات axe').toEqual([]);
}
