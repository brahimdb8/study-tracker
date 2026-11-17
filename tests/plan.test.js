import { describe, expect, it } from 'vitest';
import { BASE_TARGETS, cancelPendingChange, createInitialPlan, normalizeTargets, pendingVersion, schedulePlanChange, targetsForDate } from '../src/core/plan.js';

const edit = (over) => {
  const t = JSON.parse(JSON.stringify(BASE_TARGETS));
  Object.assign(t, over);
  return t;
};

describe('plan', () => {
  it('الأهداف الأساسية حسب اليوم', () => {
    const plan = createInitialPlan();
    expect(targetsForDate(plan, '2026-11-09').totalMins).toBe(120);  // إثنين
    expect(targetsForDate(plan, '2026-11-14').totalMins).toBe(300);  // سبت
    expect(targetsForDate(plan, '2026-11-15').totalMins).toBe(300);  // أحد
  });

  it('التعديل يسري من الإثنين القادم لا قبله', () => {
    const today = '2026-11-12'; // خميس
    const { plan, effectiveFrom } = schedulePlanChange(createInitialPlan(), edit({ 1: { morningMins: 120, eveningMins: 120 } }), today);
    expect(effectiveFrom).toBe('2026-11-16');
    expect(targetsForDate(plan, '2026-11-09').totalMins).toBe(120); // الأسبوع الماضي كما كان
    expect(targetsForDate(plan, '2026-11-16').totalMins).toBe(240); // يسري من الإثنين
    expect(pendingVersion(plan, today).effectiveFrom).toBe('2026-11-16');
    expect(pendingVersion(plan, '2026-11-16')).toBeNull();
  });

  it('تعديل جديد يستبدل المجدول السابق', () => {
    const today = '2026-11-12';
    const a = schedulePlanChange(createInitialPlan(), edit({ 1: { morningMins: 120, eveningMins: 0 } }), today).plan;
    const b = schedulePlanChange(a, edit({ 1: { morningMins: 30, eveningMins: 30 } }), today).plan;
    expect(b.versions.length).toBe(2);
    expect(targetsForDate(b, '2026-11-16').totalMins).toBe(60);
  });

  it('تعديل مطابق للسارية لا ينشئ نسخة ويلغي المجدول', () => {
    const today = '2026-11-12';
    const a = schedulePlanChange(createInitialPlan(), edit({ 1: { morningMins: 120, eveningMins: 0 } }), today).plan;
    const r = schedulePlanChange(a, BASE_TARGETS, today);
    expect(r.effectiveFrom).toBeNull();
    expect(r.plan.versions.length).toBe(1);
  });

  it('إلغاء التعديل المجدول', () => {
    const today = '2026-11-12';
    const a = schedulePlanChange(createInitialPlan(), edit({ 1: { morningMins: 120, eveningMins: 0 } }), today).plan;
    expect(cancelPendingChange(a, today).versions.length).toBe(1);
  });

  it('normalizeTargets يقصّ القيم الشاذة', () => {
    const t = normalizeTargets({ 1: { morningMins: -5, eveningMins: 99999 } });
    expect(t[1].morningMins).toBe(0);
    expect(t[1].eveningMins).toBeLessThanOrEqual(1440);
    expect(t[2]).toEqual(BASE_TARGETS[2]); // الناقص يُكمَّل من الأساس
  });
});
