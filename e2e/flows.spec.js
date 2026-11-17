// السيناريوهات الأساسية للمستخدم (تُشغَّل في الأربع تركيبات).
import { test, expect, trackErrors, storedState, gotoReady } from './fixtures.js';
import { emptyState, richState } from './seed.js';
import { formatMins } from '../src/core/format.js';

test.describe('1) إضافة جلسة يدوياً', () => {
  test.use({ seed: emptyState() });

  test('تظهر في الرئيسية ثم في التحليلات', async ({ page }) => {
    const errors = trackErrors(page);
    await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
    await page.locator('#session-hours').fill('1');
    await page.locator('#session-mins').fill('30');
    await page.locator('#session-submit').click();

    await expect(page.locator('#sessions-list')).toContainText(formatMins(90));

    await page.goto('/analytics.html');
    await expect(page.locator('.chart-card svg').first()).toBeVisible();
    await expect(page.locator('#panel-month')).toContainText(formatMins(90));
    expect(errors).toEqual([]);
  });

  test('مدخلات غير صالحة لا تُحفظ', async ({ page }) => {
    await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
    await page.locator('#session-submit').click(); // صفر ساعات وصفر دقائق
    await expect(page.locator('#sessions-list')).not.toContainText('د ·');
    await page.waitForTimeout(150);
    expect((await storedState(page)).sessions).toHaveLength(0);
  });
});

test.describe('2) دورة المؤقت (ساعة مزيّفة)', () => {
  test.use({ seed: emptyState() });

  test('بدء ثم إيقاف مؤقت ثم إنهاء وحفظ دقيقتين', async ({ page }) => {
    await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
    await expect(page.locator('#timer-display')).toHaveText('25:00');
    await page.locator('#start-timer-btn').click();
    await expect(page.locator('#pause-timer-btn')).toBeVisible();

    await page.clock.fastForward(61_000);
    await expect(page.locator('#timer-display')).toHaveText('23:59');

    await page.locator('#pause-timer-btn').click();
    const frozen = await page.locator('#timer-display').textContent();
    await page.clock.fastForward(30_000);
    await expect(page.locator('#timer-display')).toHaveText(frozen);

    await expect(page.locator('#start-timer-btn')).toHaveText(/استئناف/);
    await page.locator('#start-timer-btn').click(); // استئناف
    await page.clock.runFor(60_000);
    await page.locator('#stop-timer-btn').click();

    await expect(page.locator('#sessions-list')).toContainText(formatMins(2));
    await expect.poll(async () => (await storedState(page)).sessions.length).toBe(1);
    const s = (await storedState(page)).sessions;
    expect(s[0].source).toBe('timer');
    expect(s[0].minutes).toBe(2);
  });
});

test.describe('3) أول وسام والاحتفال', () => {
  test.describe('الحركة مفعّلة', () => {
    test.use({ seed: emptyState() });
    test('بطاقة تهنئة + طبقة الاحتفال ثم تزول', async ({ page }) => {
      const errors = trackErrors(page);
      await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
      await page.locator('#session-hours').fill('1');
      await page.locator('#session-submit').click();
      await expect(page.locator('#cheer-live .cheer-card').first()).toBeVisible();
      await expect(page.locator('.fx-layer')).toHaveCount(1);
      await page.clock.runFor(8_000);
      await expect(page.locator('.cheer-card')).toHaveCount(0);
      await expect(page.locator('.fx-layer')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });

  test.describe('الحركة معطّلة (data-motion=off)', () => {
    test.use({ seed: emptyState(), motionOff: true });
    test('إشعار نصي فقط بلا بطاقة ولا طبقة', async ({ page }) => {
      await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
      await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
      await page.locator('#session-hours').fill('1');
      await page.locator('#session-submit').click();
      await expect(page.locator('.toast-container')).toContainText('وسام');
      await expect(page.locator('.cheer-card')).toHaveCount(0);
      await expect(page.locator('.fx-layer')).toHaveCount(0);
    });
  });
});

test.describe('4) الإعدادات: تصدير واستيراد مع تراجع', () => {
  test.use({ seed: emptyState() });

  test('تصدير JSON وCSV', async ({ page }) => {
    await gotoReady(page, '/settings.html', '#plan-rows > *');
    const [json] = await Promise.all([page.waitForEvent('download'), page.locator('#export-btn').click()]);
    expect(json.suggestedFilename()).toBe('study-backup-2026-11-16.json');
    const body = JSON.parse(await (await import('node:fs/promises')).readFile(await json.path(), 'utf8'));
    expect(body.schemaVersion).toBe(5);

    const [csv] = await Promise.all([page.waitForEvent('download'), page.locator('#export-csv-sessions').click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('استيراد ثم تراجع يعيد البيانات السابقة', async ({ page }) => {
    await gotoReady(page, '/settings.html', '#plan-rows > *');
    const rich = richState();
    await page.locator('#import-file').setInputFiles({
      name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rich)),
    });
    await expect(page.locator('.toast-undo')).toContainText('الاستيراد');
    const count = async () => (await storedState(page)).sessions.length;
    await expect.poll(count).toBe(rich.sessions.length);

    await page.locator('.toast-undo .undo-btn').click();
    await expect.poll(count).toBe(0);
  });

  test('ملف غير صالح يُرفض برسالة ولا يمس البيانات', async ({ page }) => {
    await gotoReady(page, '/settings.html', '#plan-rows > *');
    await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') });
    await expect(page.locator('.toast-error')).toBeVisible();
    expect((await storedState(page)).sessions).toHaveLength(0);
  });
});

test.describe('5) الجولة التعريفية', () => {
  test.describe('مستخدم جديد', () => {
    test.use({ seed: emptyState(), onboarded: false });
    test('المعالج يظهر تلقائياً ويحفظ المواد والخطة فوراً', async ({ page }) => {
      await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
      const dlg = page.locator('.ob-dialog[role="dialog"]');
      await expect(dlg).toBeVisible();
      await dlg.getByRole('button', { name: 'التالي' }).click();
      await dlg.getByRole('button', { name: 'الرياضيات' }).click();
      await dlg.getByLabel('مادة أخرى').fill('التاريخ');
      await dlg.getByRole('button', { name: 'إضافة', exact: true }).click();
      await expect(dlg.locator('.ob-picked-item')).toHaveCount(2);
      await dlg.getByRole('button', { name: 'التالي' }).click();
      await dlg.getByLabel('ساعات الأسبوع').fill('٧');
      await expect(dlg.locator('.ob-table td')).toHaveCount(7);
      await dlg.getByLabel('ساعات الأسبوع').fill('abc');
      await expect(dlg.locator('#ob-next')).toBeDisabled();
      await dlg.getByLabel('ساعات الأسبوع').fill('14');
      await dlg.getByRole('button', { name: 'التالي' }).click();
      await dlg.getByRole('button', { name: 'ابدأ المذاكرة' }).click();
      await expect(dlg).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('studyTracker:onboarded'))).toBe('1');
      await expect.poll(async () => {
        const st = await storedState(page);
        const v = st.plan.versions[0];
        return [st.subjects.map((x) => x.name).join('|'), v.weeklyMins, v.effectiveFrom];
      }).toEqual(['الرياضيات|التاريخ', 840, '0000-01-01']);
    });

    test('تخطي المعالج لا يغيّر البيانات ولا يعود', async ({ page }) => {
      await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
      await page.locator('.ob-dialog').getByRole('button', { name: 'تخطي الإعداد' }).click();
      await expect(page.locator('.ob-dialog')).toHaveCount(0);
      expect((await storedState(page)).subjects).toHaveLength(0);
      await page.reload();
      await page.waitForSelector('#calendar-grid .calendar-day-btn');
      await expect(page.locator('.ob-dialog')).toHaveCount(0);
    });
  });

  test.describe('إعادة من الإعدادات', () => {
    test.use({ seed: emptyState() });
    test('زر الإعادة يفتح الجولة ويمكن تخطيها', async ({ page }) => {
      await gotoReady(page, '/settings.html', '#plan-rows > *');
      await expect(page.locator('.ob-dialog')).toHaveCount(0);
      await page.locator('#tour-replay').click();
      const dlg = page.locator('.ob-dialog[role="dialog"]');
      await expect(dlg).toBeVisible();
      await dlg.getByRole('button', { name: 'تخطي الجولة' }).click();
      await expect(dlg).toHaveCount(0);
    });
  });
});

test.describe('6) اختصارات لوحة المفاتيح', () => {
  test.use({ seed: richState() });

  test('1–4 للتنقل بين الصفحات', async ({ page }) => {
    await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
    // الصفحات تُقلع بشكل غير متزامن (IndexedDB)؛ ننتظر ظهور محتوى كل صفحة قبل الضغط التالي
    await page.keyboard.press('2');
    await expect(page).toHaveURL(/analytics\.html/);
    await page.waitForSelector('.chart-card svg');
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/achievements\.html/);
    await page.waitForSelector('.badge-card');
    await page.keyboard.press('4');
    await expect(page).toHaveURL(/settings\.html/);
    await page.waitForSelector('#plan-rows > *');
    await page.keyboard.press('1');
    await expect(page).toHaveURL(/index\.html/);
  });

  test('؟ تفتح المساعدة وEsc تغلقها', async ({ page }) => {
    await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
    await page.keyboard.press('Shift+Slash');
    const dlg = page.locator('.help-dialog[role="dialog"]');
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
  });

  test('T يبدأ المؤقت ثم يوقفه مؤقتاً', async ({ page }) => {
    await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
    await page.keyboard.press('t');
    await expect(page.locator('#pause-timer-btn')).toBeVisible();
    await page.clock.fastForward(5_000);
    await page.keyboard.press('t');
    const frozen = await page.locator('#timer-display').textContent();
    await page.clock.fastForward(10_000);
    await expect(page.locator('#timer-display')).toHaveText(frozen);
  });

  test('الاختصارات لا تعمل أثناء الكتابة في حقل', async ({ page }) => {
    await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
    await page.locator('#session-note').fill('');
    await page.locator('#session-note').press('2');
    await expect(page).toHaveURL(/index\.html/);
    await expect(page.locator('#session-note')).toHaveValue('2');
  });
});

test.describe('7) الأوسمة ديناميكية: حذف الجلسة المخالفة يسحب الوسام', () => {
  test.use({ seed: emptyState(), motionOff: true });

  test('وسام يُفتح بجلسة ثم يُسحب عند حذفها، ويعود عند التراجع', async ({ page }) => {
    const errors = trackErrors(page);
    await gotoReady(page, '/index.html', '#calendar-grid .calendar-day-btn');
    await page.locator('#session-hours').fill('1');
    await page.locator('#session-submit').click();
    await expect(page.locator('.toast-container')).toContainText('وسام');

    await page.goto('/achievements.html');
    await expect(page.locator('.badge-card.is-open').first()).toBeVisible();
    const opened = await page.locator('.badge-card.is-open').count();
    expect(opened).toBeGreaterThan(0);

    await page.goto('/index.html');
    await page.waitForSelector('#sessions-list');
    await page.locator('#sessions-list').getByRole('button', { name: 'حذف' }).first().click();
    await expect(page.locator('.toast-container')).toContainText('سُحب');

    await page.goto('/achievements.html');
    await expect(page.locator('.badge-card.is-open')).toHaveCount(0);
    await expect.poll(async () => Object.keys((await storedState(page)).achievements.unlocked).length).toBe(0);
    expect(errors).toEqual([]);
  });
});
