import { describe, expect, it } from 'vitest';
import { computeStreak, evaluateDay } from '../src/core/status.js';
import { monthStats } from '../src/core/stats.js';
import { ctxFor, session } from './helpers.js';

// الأسبوع المرجعي: إثنين 2026-11-09 … أحد 2026-11-15 (أهداف: 2,2,2,2,2,5,5 ساعات = 20)
const TODAY_THU = '2026-11-12';

describe('evaluateDay', () => {
  it('المستقبل', () => {
    expect(evaluateDay('2026-11-13', ctxFor([], { today: TODAY_THU }))).toBe('future');
  });

  it('مكتمل عند بلوغ الهدف (مجموع الصباح والمساء)', () => {
    const s = [session('2026-11-09', 'evening', 120)]; // الإثنين، المساء وحده يكفي
    expect(evaluateDay('2026-11-09', ctxFor(s, { today: TODAY_THU }))).toBe('completed');
  });

  it('اليوم الحالي غير المكتمل لا يُحكم عليه', () => {
    expect(evaluateDay(TODAY_THU, ctxFor([], { today: TODAY_THU }))).toBe('default');
  });

  it('يوم ماضٍ بلا تدوين والأسبوع لم ينتهِ: بلا لون، لا أحمر', () => {
    expect(evaluateDay('2026-11-10', ctxFor([], { today: TODAY_THU }))).toBe('default');
  });

  it('يوم ماضٍ مقصّر مع تدوين جزئي: أحمر', () => {
    const s = [session('2026-11-10', 'morning', 30)];
    expect(evaluateDay('2026-11-10', ctxFor(s, { today: TODAY_THU }))).toBe('failed');
  });

  it('أسبوع انتهى بتقصير: أحمر حتى بلا تدوين', () => {
    expect(evaluateDay('2026-11-10', ctxFor([], { today: '2026-11-20' }))).toBe('failed');
  });

  it('تعويض من فائض الأسبوع', () => {
    // الإثنين 0، الثلاثاء 20 ساعة (فائض) → كل الأسبوع مُنجَز إجمالاً
    const s = [session('2026-11-10', 'morning', 1200)];
    expect(evaluateDay('2026-11-09', ctxFor(s, { today: '2026-11-20' }))).toBe('compensated');
  });

  it('لا تعويض لليوم الحالي', () => {
    const s = [session('2026-11-10', 'morning', 1200)];
    expect(evaluateDay('2026-11-12', ctxFor(s, { today: '2026-11-12' }))).toBe('default');
  });

  it('قبل بداية التتبع: بلا حكم', () => {
    expect(evaluateDay('2026-11-01', ctxFor([], { today: '2026-11-20', trackingStart: '2026-11-10' }))).toBe('default');
  });

  it('أشهر سابقة تحتفظ بألوانها (التجميد القديم كان يمحوها)', () => {
    const s = [session('2026-09-02', 'morning', 120)];
    expect(evaluateDay('2026-09-02', ctxFor(s, { today: '2026-11-12' }))).toBe('completed');
  });
});

describe('computeStreak', () => {
  it('اليوم الحالي غير المكتمل لا يقطع السلسلة', () => {
    const s = [session('2026-11-10', 'morning', 120), session('2026-11-11', 'morning', 120)];
    expect(computeStreak(ctxFor(s, { today: TODAY_THU }))).toBe(2);
  });

  it('إكمال اليوم الحالي يزيدها', () => {
    const s = [session('2026-11-10', 'morning', 120), session('2026-11-11', 'morning', 120), session(TODAY_THU, 'evening', 120)];
    expect(computeStreak(ctxFor(s, { today: TODAY_THU }))).toBe(3);
  });

  it('تعبر حدود الأشهر (كانت تتصفّر كل أول شهر)', () => {
    const s = [
      session('2026-10-30', 'morning', 120), session('2026-10-31', 'morning', 300),
      session('2026-11-01', 'morning', 300), session('2026-11-02', 'morning', 120),
    ];
    const ctx = ctxFor(s, { today: '2026-11-02' });
    expect(computeStreak(ctx)).toBe(4);
  });

  it('تنقطع عند يوم فاشل', () => {
    const s = [session('2026-11-11', 'morning', 120)];
    // الإثنين والثلاثاء لا تدوين والأسبوع لم ينتهِ → "default" يقطع السلسلة أيضاً
    expect(computeStreak(ctxFor(s, { today: TODAY_THU }))).toBe(1);
  });
});

describe('monthStats', () => {
  it('الأشهر المستقبلية: هدف صفر لا نسبة مضللة', () => {
    const st = monthStats(2026, 11, ctxFor([], { today: TODAY_THU }));
    expect(st.targetMins).toBe(0);
    expect(st.completionRate).toBe(0);
  });

  it('الأرقام متسقة مع حالة الأيام', () => {
    const s = [session('2026-11-09', 'morning', 120), session('2026-11-10', 'morning', 120), session('2026-11-11', 'evening', 30)];
    const st = monthStats(2026, 10, ctxFor(s, { today: TODAY_THU, trackingStart: '2026-11-09' }), { '2026-11-09': { quality: 'good' } });
    expect(st.completedDays).toBe(2);
    expect(st.studiedMins).toBe(270);
    expect(st.morningMins).toBe(240);
    expect(st.eveningMins).toBe(30);
    expect(st.targetMins).toBe(8 * 60); // إثنين..خميس × 2س
    expect(st.bestStreak).toBe(2);
    expect(st.qualityCounts.good).toBe(1);
    expect(st.qualityCounts.none).toBe(3);
  });
});
