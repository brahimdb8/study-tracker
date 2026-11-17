import { describe, expect, it } from 'vitest';
import { BASE_TARGETS, createInitialPlan, normalizePlan, normalizeWeekly, schedulePlanChange, weeklyGoalFor } from '../src/core/plan.js';

describe('الهدف الأسبوعي في الخطة', () => {
  it('normalizeWeekly', () => {
    expect(normalizeWeekly(null)).toBeNull();
    expect(normalizeWeekly('')).toBeNull();
    expect(normalizeWeekly(0)).toBeNull();
    expect(normalizeWeekly(-5)).toBeNull();
    expect(normalizeWeekly('abc')).toBeNull();
    expect(normalizeWeekly(600.4)).toBe(600);
    expect(normalizeWeekly(10 ** 9)).toBe(7 * 24 * 60);
  });

  it('الخطة الابتدائية بلا هدف أسبوعي صريح', () => {
    expect(weeklyGoalFor(createInitialPlan(), '2026-11-09')).toBeNull();
  });

  it('يُجدول الهدف الأسبوعي من الإثنين القادم', () => {
    const today = '2026-11-12';
    const { plan, effectiveFrom } = schedulePlanChange(createInitialPlan(), BASE_TARGETS, today, 900);
    expect(effectiveFrom).toBe('2026-11-16');
    expect(weeklyGoalFor(plan, '2026-11-09')).toBeNull();
    expect(weeklyGoalFor(plan, '2026-11-16')).toBe(900);
  });

  it('تغيير الهدف الأسبوعي وحده يُعدّ تعديلاً، وإعادته للسارية لا تُنشئ نسخة', () => {
    const today = '2026-11-12';
    const a = schedulePlanChange(createInitialPlan(), BASE_TARGETS, today, 900);
    expect(a.effectiveFrom).not.toBeNull();
    const same = schedulePlanChange(createInitialPlan(), BASE_TARGETS, today, null);
    expect(same.effectiveFrom).toBeNull();
  });

  it('خطة مخزنة بلا weeklyMins (المرحلة 1) تُقرأ كـ null', () => {
    const plan = normalizePlan({ versions: [{ effectiveFrom: '0000-01-01', targets: BASE_TARGETS }] });
    expect(plan.versions[0].weeklyMins).toBeNull();
  });
});
