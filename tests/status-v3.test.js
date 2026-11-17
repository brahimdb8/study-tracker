import { describe, expect, it } from 'vitest';
import { BASE_TARGETS, createInitialPlan, normalizePlan, normalizeTargets } from '../src/core/plan.js';
import { computeStreak, dayOffFor, evaluateDay, freezeInfo, getTimeline, weekProgress, weekTargetMins } from '../src/core/status.js';
import { monthStats } from '../src/core/stats.js';
import { createContext } from '../src/core/context.js';
import { ctxFor, dayOff, session } from './helpers.js';

// الأسبوع المرجعي: إثنين 2026-11-09 … أحد 2026-11-15 (120×5 + 300×2 = 1200 د)

describe('الأيام الاستثنائية', () => {
  it('يوم ضمن مدى استثنائي → excused ولا يُعدّ تقصيراً', () => {
    const ctx = ctxFor([], { today: '2026-11-20', dayOffs: [dayOff('2026-11-10', '2026-11-10')] });
    expect(evaluateDay('2026-11-10', ctx)).toBe('excused');
    expect(evaluateDay('2026-11-11', ctx)).toBe('failed');
    expect(dayOffFor(ctx, '2026-11-10').type).toBe('vacation');
    expect(dayOffFor(ctx, '2026-11-11')).toBeNull();
  });

  it('الاستثناء يسبق الدراسة: يوم استثنائي بدراسة يبقى excused', () => {
    const ctx = ctxFor([session('2026-11-10', 'morning', 300)], { today: '2026-11-20', dayOffs: [dayOff('2026-11-10', '2026-11-10')] });
    expect(evaluateDay('2026-11-10', ctx)).toBe('excused');
  });

  it('أيام استثنائية تخفّض هدف الأسبوع فيصير التعويض ممكناً', () => {
    // إجازة من الأربعاء إلى الأحد (120+120+120+300+300 = 960) → هدف الأسبوع 240
    const sessions = [session('2026-11-10', 'morning', 240)]; // الثلاثاء 240 د
    const off = [dayOff('2026-11-11', '2026-11-15')];
    const withOff = ctxFor(sessions, { today: '2026-11-20', dayOffs: off });
    expect(weekTargetMins('2026-11-09', withOff)).toBe(240);
    expect(evaluateDay('2026-11-09', withOff)).toBe('compensated'); // الإثنين 0 لكن الأسبوع أُنجز
    const without = ctxFor(sessions, { today: '2026-11-20' });
    expect(evaluateDay('2026-11-09', without)).toBe('failed');
  });

  it('اليوم الاستثنائي محايد في السلسلة: لا يقطعها ولا يزيدها', () => {
    const sessions = [session('2026-11-09', 'morning', 120), session('2026-11-11', 'morning', 120)];
    const ctx = ctxFor(sessions, { today: '2026-11-12', trackingStart: '2026-11-09', dayOffs: [dayOff('2026-11-10', '2026-11-10', 'sick')] });
    expect(computeStreak(ctx)).toBe(2);
  });

  it('الإجازة المستقبلية لا تؤثر قبل موعدها', () => {
    const ctx = ctxFor([], { today: '2026-11-12', dayOffs: [dayOff('2026-11-20', '2026-11-25')] });
    expect(evaluateDay('2026-11-21', ctx)).toBe('future');
  });
});

describe('يوم الراحة بحسب الخطة (هدفه صفر)', () => {
  const targets = normalizeTargets({ ...BASE_TARGETS, 5: { morningMins: 0, eveningMins: 0 } });
  const plan = normalizePlan({ versions: [{ effectiveFrom: '0000-01-01', targets }] });

  it('الجمعة بهدف صفر → rest (لا "مكتمل")', () => {
    expect(evaluateDay('2026-11-13', ctxFor([], { today: '2026-11-20', plan }))).toBe('rest');
  });

  it('محايد في السلسلة', () => {
    const sessions = [session('2026-11-12', 'morning', 120), session('2026-11-14', 'morning', 300)];
    const ctx = ctxFor(sessions, { today: '2026-11-14', trackingStart: '2026-11-12', plan });
    expect(evaluateDay('2026-11-13', ctx)).toBe('rest');
    expect(computeStreak(ctx)).toBe(2);
  });
});

describe('تجميد السلسلة التلقائي', () => {
  const base = { today: '2026-11-12', trackingStart: '2026-11-09' };
  const monday = [session('2026-11-09', 'morning', 120)];

  it('يحمي السلسلة القائمة: يومان مجمّدان ثم تبقى السلسلة', () => {
    const ctx = ctxFor(monday, { ...base, freezesPerMonth: 2 });
    expect(evaluateDay('2026-11-10', ctx)).toBe('frozen');
    expect(evaluateDay('2026-11-11', ctx)).toBe('frozen');
    expect(computeStreak(ctx)).toBe(1); // المجمّد لا يزيد
    expect(freezeInfo(ctx, '2026-11').used).toBe(2);
    expect(freezeInfo(ctx, '2026-11').remaining).toBe(0);
  });

  it('عند نفاد الرصيد تنقطع السلسلة', () => {
    const ctx = ctxFor(monday, { ...base, freezesPerMonth: 1 });
    expect(evaluateDay('2026-11-10', ctx)).toBe('frozen');
    expect(evaluateDay('2026-11-11', ctx)).toBe('default');
    expect(computeStreak(ctx)).toBe(0);
  });

  it('رصيد صفر = بلا تجميد (سلوك المرحلة 1)', () => {
    const ctx = ctxFor(monday, { ...base, freezesPerMonth: 0 });
    expect(evaluateDay('2026-11-10', ctx)).toBe('default');
    expect(computeStreak(ctx)).toBe(0);
  });

  it('لا يُستهلك الرصيد إن لم تكن هناك سلسلة تستحق الحماية', () => {
    const ctx = ctxFor([], { ...base, freezesPerMonth: 2 });
    expect(evaluateDay('2026-11-09', ctx)).toBe('default');
    expect(freezeInfo(ctx, '2026-11').used).toBe(0);
    expect(computeStreak(ctx)).toBe(0);
  });

  it('الرصيد شهري: يتجدد مع الشهر الجديد', () => {
    const ctx = ctxFor([session('2026-10-29', 'morning', 120)], { today: '2026-11-04', trackingStart: '2026-10-29', freezesPerMonth: 2 });
    expect(evaluateDay('2026-10-30', ctx)).toBe('frozen');
    expect(evaluateDay('2026-10-31', ctx)).toBe('frozen');
    expect(evaluateDay('2026-11-01', ctx)).toBe('frozen'); // رصيد نوفمبر
    expect(evaluateDay('2026-11-02', ctx)).toBe('frozen');
    expect(evaluateDay('2026-11-03', ctx)).toBe('default'); // نفد رصيد نوفمبر
    expect(freezeInfo(ctx, '2026-10').used).toBe(2);
    expect(freezeInfo(ctx, '2026-11').used).toBe(2);
    expect(computeStreak(ctx)).toBe(0);
  });

  it('بعد التجميد يمكن استئناف العدّ', () => {
    const sessions = [session('2026-11-09', 'morning', 120), session('2026-11-11', 'morning', 120), session('2026-11-12', 'morning', 120)];
    const ctx = ctxFor(sessions, { ...base, freezesPerMonth: 2 });
    expect(evaluateDay('2026-11-10', ctx)).toBe('frozen');
    expect(computeStreak(ctx)).toBe(3); // الإثنين + الأربعاء + الخميس (الثلاثاء مجمّد)
  });

  it('اليوم الحالي غير المكتمل لا يستهلك تجميداً', () => {
    const ctx = ctxFor(monday, { today: '2026-11-10', trackingStart: '2026-11-09', freezesPerMonth: 2 });
    expect(evaluateDay('2026-11-10', ctx)).toBe('default');
    expect(freezeInfo(ctx, '2026-11').used).toBe(0);
  });

  it('الحالة محسوبة لا مخزّنة: إن عُوِّض اليوم لاحقاً زال التجميد', () => {
    // الإثنين مقصّر، لكن الثلاثاء يحمل فائضاً يغطي الأسبوع كله → الإثنين "معوّض"
    const sessions = [session('2026-11-08', 'morning', 300), session('2026-11-10', 'morning', 1200)];
    const ctx = ctxFor(sessions, { today: '2026-11-15', trackingStart: '2026-11-08', freezesPerMonth: 2 });
    expect(evaluateDay('2026-11-09', ctx)).toBe('compensated');
    for (const d of ['2026-11-09', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']) {
      expect(evaluateDay(d, ctx), d).not.toBe('frozen');
    }
    expect(freezeInfo(ctx, '2026-11').used).toBe(0);
  });
});

describe('الهدف الأسبوعي', () => {
  const planWeekly = (weeklyMins) => normalizePlan({
    versions: [{ effectiveFrom: '0000-01-01', targets: BASE_TARGETS, weeklyMins }],
  });

  it('بلا هدف صريح: مجموع اليومية', () => {
    expect(weekTargetMins('2026-11-12', ctxFor([], { today: '2026-11-20' }))).toBe(1200);
  });

  it('هدف صريح أدنى يسهّل التعويض', () => {
    const sessions = [session('2026-11-10', 'morning', 600)];
    expect(evaluateDay('2026-11-09', ctxFor(sessions, { today: '2026-11-20' }))).toBe('failed');
    expect(evaluateDay('2026-11-09', ctxFor(sessions, { today: '2026-11-20', plan: planWeekly(600) }))).toBe('compensated');
  });

  it('الهدف الصريح تُطرح منه أهداف الأيام الاستثنائية', () => {
    const ctx = ctxFor([], { today: '2026-11-20', plan: planWeekly(600), dayOffs: [dayOff('2026-11-10', '2026-11-10')] });
    expect(weekTargetMins('2026-11-09', ctx)).toBe(480);
  });

  it('الأيام قبل بداية التتبع لا تدخل في هدف الأسبوع', () => {
    const ctx = ctxFor([], { today: '2026-11-20', trackingStart: '2026-11-12' });
    expect(weekTargetMins('2026-11-12', ctx)).toBe(1200 - 120 * 3); // إثنين..أربعاء مستثناة
  });

  it('تقدّم الأسبوع', () => {
    const sessions = [session('2026-11-09', 'morning', 120), session('2026-11-11', 'evening', 60)];
    const wp = weekProgress('2026-11-12', ctxFor(sessions, { today: '2026-11-12' }));
    expect(wp).toEqual({
      weekStart: '2026-11-09', weekEnd: '2026-11-15',
      studiedMins: 180, targetMins: 1200, remainingMins: 1020, pct: 15, daysLeft: 4,
    });
  });

  it('أسبوع بهدف صفر: التقدم 100%', () => {
    const ctx = ctxFor([], { today: '2026-11-12', dayOffs: [dayOff('2026-11-09', '2026-11-15')] });
    const wp = weekProgress('2026-11-12', ctx);
    expect(wp.targetMins).toBe(0);
    expect(wp.pct).toBe(100);
  });
});

describe('monthStats مع الحالات الجديدة', () => {
  it('الأيام الاستثنائية لا تدخل في هدف الشهر', () => {
    const args = { today: '2026-11-20', trackingStart: '2026-11-01' };
    const a = monthStats(2026, 10, ctxFor([], args));
    const b = monthStats(2026, 10, ctxFor([], { ...args, dayOffs: [dayOff('2026-11-10', '2026-11-10')] }));
    expect(a.targetMins - b.targetMins).toBe(120);
    expect(b.excusedDays).toBe(1);
  });

  it('عدّاد الأيام المجمّدة والسلسلة المحايدة', () => {
    const sessions = [session('2026-11-09', 'morning', 120), session('2026-11-11', 'morning', 120)];
    const ctx = ctxFor(sessions, { today: '2026-11-12', trackingStart: '2026-11-09', freezesPerMonth: 2 });
    const st = monthStats(2026, 10, ctx);
    expect(st.frozenDays).toBe(1);
    expect(st.completedDays).toBe(2);
    expect(st.bestStreak).toBe(2); // الثلاثاء المجمّد لم يقطع
  });

  it('الدقائق في الأيام الاستثنائية تُحتسب ضمن المُنجَز', () => {
    const ctx = ctxFor([session('2026-11-10', 'morning', 90)], { today: '2026-11-20', trackingStart: '2026-11-01', dayOffs: [dayOff('2026-11-10', '2026-11-10')] });
    expect(monthStats(2026, 10, ctx).studiedMins).toBe(90);
  });
});

describe('createContext والأداء', () => {
  it('الإعدادات الناقصة تأخذ الافتراضي (تجميد يومان)', () => {
    const state = { sessions: [], plan: createInitialPlan(), settings: { trackingStart: '2026-11-01' } };
    expect(createContext(state, '2026-11-12').freezesPerMonth).toBe(2);
    expect(createContext(state, '2026-11-12').dayOffs).toEqual([]);
  });

  it('تتبع قديم جداً لا يعلّق التطبيق ويبقى التقييم صحيحاً', () => {
    const t0 = Date.now();
    const ctx = ctxFor([session('2026-11-11', 'morning', 120)], { today: '2026-11-12', trackingStart: '2000-01-01', freezesPerMonth: 2 });
    expect(evaluateDay('2026-11-11', ctx)).toBe('completed');
    expect(evaluateDay('2010-05-05', ctx)).toBeTypeOf('string'); // خارج النافذة المحسوبة → حساب مباشر
    expect(getTimeline(ctx).statuses.size).toBeLessThanOrEqual(1831);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('الخط الزمني يُبنى مرة واحدة لكل سياق', () => {
    const ctx = ctxFor([], { today: '2026-11-12' });
    expect(getTimeline(ctx)).toBe(getTimeline(ctx));
  });
});
