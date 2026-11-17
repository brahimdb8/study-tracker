// المرحلة 8: IndexedDB وPWA في متصفح حقيقي — بقاء البيانات، الترحيل، العمل دون اتصال، التثبيت، التحديث، وتعدد التبويبات.
import { test, expect, trackErrors, storedState, gotoReady } from './fixtures.js';
import { emptyState, richState } from './seed.js';
import { serveDistCopy } from './static-server.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatMins } from '../src/core/format.js';

const HOME_READY = '#calendar-grid .calendar-day-btn';

/** ينتظر تفعيل الـ SW ووصوله للتحكم بالصفحة (اكتمال التخزين المسبق) */
async function waitForServiceWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test.describe('IndexedDB: بقاء البيانات', () => {
  test.use({ seed: emptyState() });

  test('جلسة مضافة تبقى بعد إعادة التحميل وتُحفظ في IndexedDB لا localStorage', async ({ page }) => {
    const errors = trackErrors(page);
    await gotoReady(page, '/index.html', HOME_READY);
    await page.locator('#session-hours').fill('2');
    await page.locator('#session-submit').click();
    await expect(page.locator('#sessions-list')).toContainText(formatMins(120));
    await expect.poll(async () => (await storedState(page)).sessions.length).toBe(1);

    await page.reload();
    await page.locator(HOME_READY).first().waitFor();
    await expect(page.locator('#sessions-list')).toContainText(formatMins(120));

    // الحالة الجديدة لم تُكتب في localStorage (بقي فيه ما حُقن عند البذر فقط)
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem('studyTracker:v2') || '{"sessions":[]}').sessions.length);
    expect(local).toBe(0);
    expect(errors).toEqual([]);
  });

  test('مفاتيح الجهاز تبقى في localStorage ولا تدخل IndexedDB', async ({ page }) => {
    await gotoReady(page, '/index.html', HOME_READY);
    const keys = await page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('studyTracker', 1);
      open.onsuccess = () => {
        const r = open.result.transaction('kv').objectStore('kv').getAllKeys();
        r.onsuccess = () => { open.result.close(); resolve(r.result); };
      };
    }));
    expect(keys.some((k) => /theme|onboarded|pomodoro|motion|celebrated/.test(k))).toBe(false);
    expect(keys).toContain('studyTracker:v2');
    expect(await page.evaluate(() => localStorage.getItem('studyTracker:theme'))).toBeTruthy();
  });
});

test.describe('الترحيل من localStorage (مستخدم قديم)', () => {
  test.use({ seed: richState() });

  test('تُنقل البيانات كاملة مع إشعار، وتبقى النسخة القديمة حتى يحذفها المستخدم بنقرتين', async ({ page }) => {
    const rich = richState();
    await gotoReady(page, '/index.html', HOME_READY);
    await expect(page.locator('.toast-container')).toContainText('IndexedDB');

    await expect.poll(async () => (await storedState(page))?.sessions.length).toBe(rich.sessions.length);
    expect(await page.evaluate(() => localStorage.getItem('studyTracker:idbMigrated'))).toBe('1');
    expect(await page.evaluate(() => localStorage.getItem('studyTracker:v2'))).not.toBeNull(); // الأصل باقٍ

    await gotoReady(page, '/settings.html', '#plan-rows > *');
    await expect(page.locator('#storage-status')).toContainText('IndexedDB');
    const btn = page.locator('#legacy-clear-btn');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(btn).toContainText('مرة أخرى');
    expect(await page.evaluate(() => localStorage.getItem('studyTracker:v2'))).not.toBeNull(); // نقرة واحدة لا تحذف
    await btn.click();
    await expect(page.locator('#legacy-clear-row')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('studyTracker:v2'))).toBeNull();
    // البيانات سليمة في IndexedDB
    expect((await storedState(page)).sessions).toHaveLength(rich.sessions.length);
    expect(await page.evaluate(() => localStorage.getItem('studyTracker:theme'))).toBeTruthy(); // مفاتيح الجهاز لم تُمس
  });
});

test.describe('PWA: manifest وقابلية التثبيت', () => {
  test.use({ seed: emptyState() });

  test('manifest صالح وأيقوناته تُحمَّل', async ({ page, request }) => {
    await gotoReady(page, '/index.html', HOME_READY);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const res = await request.get(new URL(href, page.url()).href);
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.display).toBe('standalone');
    for (const icon of m.icons) {
      const r = await request.get(new URL(icon.src, page.url()).href);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()['content-type'], icon.src).toContain('image/png');
    }
  });

  test('Chrome لا يرى أي عائق للتثبيت بعد تفعيل الـ SW', async ({ page, context }) => {
    await gotoReady(page, '/index.html', HOME_READY);
    await waitForServiceWorker(page);
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
  });
});

test.describe('العمل دون اتصال', () => {
  test.use({ seed: richState() });

  test('الصفحات الخمس تُفتح بلا شبكة وإضافة جلسة تعمل وتبقى', async ({ page, context }) => {
    const errors = trackErrors(page);
    await gotoReady(page, '/index.html', HOME_READY);
    await waitForServiceWorker(page);

    await context.setOffline(true);
    try {
      await page.reload();
      await page.locator(HOME_READY).first().waitFor();

      const pages = [
        ['/analytics.html', '.chart-card svg'],
        ['/achievements.html', '#ach-groups > *'],
        ['/settings.html', '#plan-rows > *'],
        ['/print.html?from=2026-11-01&to=2026-11-15', '#report > *'],
        ['/index.html', HOME_READY],
      ];
      for (const [url, sel] of pages) {
        await page.goto(url);
        await expect(page.locator(sel).first(), `${url} دون اتصال`).toBeVisible();
      }

      // جلسة جديدة دون اتصال: تُحفظ وتبقى بعد إعادة التحميل
      await page.locator('#session-hours').fill('3');
      await page.locator('#session-submit').click();
      await expect(page.locator('#sessions-list')).toContainText(formatMins(180));
      await expect.poll(async () => (await storedState(page)).sessions.some((s) => s.minutes === 180)).toBe(true);
      await page.reload();
      await page.locator(HOME_READY).first().waitFor();
      await expect(page.locator('#sessions-list')).toContainText(formatMins(180));
    } finally {
      await context.setOffline(false);
    }
    expect(errors.filter((e) => !/Failed to load resource|net::ERR/.test(e))).toEqual([]);
  });

  test('الإعدادات تعرض «جاهز للعمل دون اتصال» وإصدار التطبيق', async ({ page }) => {
    await gotoReady(page, '/settings.html', '#plan-rows > *');
    await expect(page.locator('#pwa-status')).toContainText('جاهز للعمل دون اتصال');
    await expect(page.locator('#pwa-version')).toContainText('0.9.0');
    await expect(page.locator('#pwa-install-hint')).not.toBeEmpty();
  });
});

test.describe('تحديث التطبيق', () => {
  test.use({ seed: emptyState() });

  test('نسخة جديدة من sw: إشعار «تحديث» ولا تفعيل تلقائي، والنقر يفعّلها ويستبدل الكاش القديم', async ({ page }) => {
    // نسخة معزولة من dist بخادم خاص: نعدّل sw.js فيها كأن الموقع نُشر من جديد
    const srv = await serveDistCopy();
    try {
      await gotoReady(page, `${srv.origin}/index.html`, HOME_READY);
      await waitForServiceWorker(page);
      const before = await page.evaluate(() => caches.keys());
      expect(before).toHaveLength(1);

      const swPath = join(srv.dir, 'sw.js');
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replace(/(["'`])[0-9a-f]{12}\1/, '"e2eversion02"'));
      await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));

      const toast = page.locator('.toast-action');
      await expect(toast).toContainText('نسخة جديدة');
      // لم تُفعَّل تلقائياً: كاش النسخة الجديدة جاهز بجانب القديم، والقديم هو الفعّال حتى يقرر المستخدم
      await expect.poll(() => page.evaluate(() => caches.keys().then((k) => k.sort()))).toHaveLength(2);
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

      const reloaded = page.waitForEvent('load');
      await toast.getByRole('button', { name: 'تحديث' }).click();
      await reloaded;
      await page.locator(HOME_READY).first().waitFor();
      await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['st-precache-e2eversion02']);
      await expect(page.locator('.toast-action')).toHaveCount(0); // لا إشعار متكرر بعد التحديث
    } finally {
      await srv.close();
    }
  });
});

test.describe('تبويبان', () => {
  test.use({ seed: emptyState() });

  test('تعديل في تبويب يُعلِم الآخر، والتحديث يعرض الجلسة', async ({ page, context }) => {
    await gotoReady(page, '/index.html', HOME_READY);
    const other = await context.newPage();
    await gotoReady(other, '/index.html', HOME_READY);

    await page.locator('#session-hours').fill('1');
    await page.locator('#session-mins').fill('15');
    await page.locator('#session-submit').click();
    await expect(page.locator('#sessions-list')).toContainText(formatMins(75));

    const toast = other.locator('.toast-action');
    await expect(toast).toContainText('تغيّرت بياناتك من تبويب آخر');
    await toast.getByRole('button', { name: 'تحديث' }).click();
    await other.locator(HOME_READY).first().waitFor();
    await expect(other.locator('#sessions-list')).toContainText(formatMins(75));
    await other.close();
  });
});
