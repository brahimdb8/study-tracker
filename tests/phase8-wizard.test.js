import { describe, it, expect } from 'vitest';
import { applyWizard, cleanSubjectNames, distributeWeekly, parseWeeklyHours } from '../src/core/wizard.js';
import { createInitialState } from '../src/core/store.js';
import { EPOCH, MAX_TARGET_MINS } from '../src/core/plan.js';
import { shouldShowOnboarding } from '../src/core/onboarding.js';
import { buildTourSteps } from '../src/core/tour.js';

const sum = (t) => Object.values(t).reduce((a, d) => a + d.morningMins + d.eveningMins, 0);

describe('parseWeeklyHours', () => {
  it('يقبل أرقاماً عربية وفاصلة عربية', () => {
    expect(parseWeeklyHours('١٤')).toMatchObject({ ok: true, hours: 14, mins: 840 });
    expect(parseWeeklyHours('١٠٫٥')).toMatchObject({ ok: true, mins: 630 });
  });
  it('يرفض الفارغ والنص والحدود', () => {
    expect(parseWeeklyHours('').ok).toBe(false);
    expect(parseWeeklyHours('abc').ok).toBe(false);
    expect(parseWeeklyHours('0.5').ok).toBe(false);
    expect(parseWeeklyHours('71').ok).toBe(false);
    expect(parseWeeklyHours('70').ok).toBe(true);
  });
});

describe('distributeWeekly', () => {
  it('المجموع يطابق الهدف تماماً ولكل الساعات من 1 إلى 70', () => {
    for (let h = 1; h <= 70; h += 0.5) {
      const mins = h * 60;
      const t = distributeWeekly(mins);
      expect(sum(t)).toBe(mins);
      for (let d = 0; d <= 6; d++) expect(t[d].morningMins + t[d].eveningMins).toBeLessThanOrEqual(MAX_TARGET_MINS);
    }
  });
  it('نهاية الأسبوع أثقل من منتصفه', () => {
    const t = distributeWeekly(21 * 60);
    expect(t[6].morningMins + t[6].eveningMins).toBeGreaterThan(t[2].morningMins + t[2].eveningMins);
  });
});

describe('applyWizard', () => {
  const base = createInitialState('2026-11-16');
  it('يضيف المواد ويضبط الخطة من EPOCH فوراً', () => {
    const r = applyWizard(base, { subjects: ['الرياضيات', ' الفيزياء ', 'الرياضيات'], weeklyMins: 600 });
    expect(r.addedSubjects).toBe(2);
    expect(r.planApplied).toBe(true);
    expect(r.state.plan.versions[0].effectiveFrom).toBe(EPOCH);
    expect(r.state.plan.versions[0].weeklyMins).toBe(600);
    expect(sum(r.state.plan.versions[0].targets)).toBe(600);
  });
  it('لا يغيّر الخطة بلا ساعات، ولا يلمسها إن وُجدت جلسات', () => {
    expect(applyWizard(base, { subjects: ['أ'] }).planApplied).toBe(false);
    const withSession = { ...base, sessions: [{ id: 'x', date: '2026-11-15', period: 'morning', minutes: 30, startedAt: null, source: 'manual', subject: null, note: '', createdAt: 1 }] };
    const r = applyWizard(withSession, { weeklyMins: 600 });
    expect(r.planApplied).toBe(false);
    expect(r.state.plan).toBe(withSession.plan);
  });
  it('يتخطى مادة موجودة مسبقاً', () => {
    const first = applyWizard(base, { subjects: ['الكيمياء'] }).state;
    const r = applyWizard(first, { subjects: ['الكيمياء'] });
    expect(r.skipped).toEqual(['الكيمياء']);
  });
  it('cleanSubjectNames يزيل التكرار والفراغ', () => {
    expect(cleanSubjectNames(['  أ  ب ', 'أ ب', '', 'ج'])).toEqual(['أ ب', 'ج']);
  });
});

describe('الجولة والأهلية', () => {
  it('المستخدم الجديد يرى المعالج، وبعد إدخال مواد لا', () => {
    const s = createInitialState('2026-11-16');
    expect(shouldShowOnboarding(s, null)).toBe(true);
    expect(shouldShowOnboarding(applyWizard(s, { subjects: ['أ'] }).state, null)).toBe(false);
  });
  it('نص الأوسمة في الجولة يطابق الدلالة الديناميكية', () => {
    const levels = buildTourSteps().find((x) => x.id === 'levels');
    expect(levels.body).not.toContain('يبقى لك دائماً');
    expect(levels.body).toContain('سجل جلساتك');
  });
});
