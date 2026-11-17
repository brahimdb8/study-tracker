import { describe, expect, it } from 'vitest';
import { migrateLegacy, migrateLegacyPlan } from '../src/core/migrate.js';
import { targetsForDate } from '../src/core/plan.js';
import { buildDayIndex } from '../src/core/sessions.js';

const TODAY = '2026-11-12';

describe('migrateLegacy', () => {
  it('الصيغة القديمة (ساعات عشرية) → جلسات بالدقائق', () => {
    const s = migrateLegacy({ studyLogs: { '2026-11-10': { morning: 1.5, evening: 0.33, quality: 'good' } } }, TODAY);
    const idx = buildDayIndex(s.sessions);
    expect(idx['2026-11-10']).toMatchObject({ morningMins: 90, eveningMins: 20 });
    expect(s.dayMeta['2026-11-10']).toEqual({ quality: 'good' });
    expect(s.schemaVersion).toBe(5);
    expect(s.subjects).toEqual([]);
    expect(s.dayOffs).toEqual([]);
    expect(s.settings.freezesPerMonth).toBe(2);
  });

  it('الصيغة الأحدث (دقائق) تُنقل كما هي', () => {
    const s = migrateLegacy({ studyLogs: { '2026-11-10': { morningMins: 75, eveningMins: 0, quality: 'none' } } }, TODAY);
    expect(buildDayIndex(s.sessions)['2026-11-10'].totalMins).toBe(75);
    expect(s.dayMeta['2026-11-10']).toBeUndefined();
  });

  it('معرّفات ثابتة فلا تتكرر الجلسات عند إعادة الترحيل', () => {
    const legacy = { studyLogs: { '2026-11-10': { morning: 1, evening: 1 } } };
    const a = migrateLegacy(legacy, TODAY).sessions.map((x) => x.id);
    const b = migrateLegacy(legacy, TODAY).sessions.map((x) => x.id);
    expect(a).toEqual(b);
  });

  it('تتجاهل الأيام والقيم التالفة', () => {
    const s = migrateLegacy({ studyLogs: { bad: { morning: 1 }, '2026-11-10': null, '2026-11-11': { morning: 'x', evening: -3 } } }, TODAY);
    expect(s.sessions).toHaveLength(0);
  });

  it('بداية التتبع: الأقدم بين المخزَّن وأول سجل', () => {
    const s = migrateLegacy({ studyLogs: { '2026-10-05': { morning: 1 } }, trackingStart: '2026-11-01' }, TODAY);
    expect(s.settings.trackingStart).toBe('2026-10-05');
    expect(migrateLegacy({}, TODAY).settings.trackingStart).toBe(TODAY);
  });
});

describe('migrateLegacyPlan', () => {
  const custom = { '2026-10': { 1: { minMorning: 2, minEvening: 2, total: 4 } } };

  it('شهر مخصص يحتفظ بأهدافه، ويعود للأساس بعده (سلوك الماضي لا يتغير)', () => {
    const plan = migrateLegacyPlan(custom, TODAY);
    expect(targetsForDate(plan, '2026-10-05').totalMins).toBe(240); // إثنين في أكتوبر: مخصص
    expect(targetsForDate(plan, '2026-10-06').totalMins).toBe(120); // الثلاثاء: لم يُخصَّص → أساس
    expect(targetsForDate(plan, '2026-11-02').totalMins).toBe(120); // نوفمبر: عاد للأساس
    expect(targetsForDate(plan, '2026-09-07').totalMins).toBe(120); // قبله: أساس
  });

  it('الشهر الحالي المخصص يستمر ولا يعود للأساس', () => {
    const plan = migrateLegacyPlan({ '2026-11': { 1: { minMorning: 3, minEvening: 0 } } }, TODAY);
    expect(targetsForDate(plan, '2026-11-09').totalMins).toBe(180);
    expect(targetsForDate(plan, '2026-12-07').totalMins).toBe(180);
  });

  it('بلا تخصيص: الخطة الأساسية', () => {
    expect(migrateLegacyPlan(undefined, TODAY).versions).toHaveLength(1);
  });
});
