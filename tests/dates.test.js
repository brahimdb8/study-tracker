import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, formatDate, isValidDateStr, nextWeekStart, parseDate, shiftMonth, weekDays } from '../src/core/dates.js';

describe('dates', () => {
  it('parseDate يعمل بالتوقيت المحلي ولا ينزاح يوماً', () => {
    expect(dayOfWeek('2026-11-12')).toBe(4); // الخميس
    expect(formatDate(parseDate('2026-01-01'))).toBe('2026-01-01');
  });

  it('addDays يعبر الشهور والسنوات', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('الأسبوع من الإثنين إلى الأحد', () => {
    const w = weekDays('2026-11-12'); // الخميس
    expect(w[0]).toBe('2026-11-09'); // الإثنين
    expect(w[6]).toBe('2026-11-15'); // الأحد
    expect(weekDays('2026-11-15')).toEqual(w); // الأحد ينتمي لنفس الأسبوع
    expect(weekDays('2026-11-09')).toEqual(w); // والإثنين أيضاً
  });

  it('nextWeekStart دائماً إثنين بعد التاريخ تماماً', () => {
    expect(nextWeekStart('2026-11-12')).toBe('2026-11-16');
    expect(nextWeekStart('2026-11-09')).toBe('2026-11-16'); // إثنين → الإثنين التالي
    expect(nextWeekStart('2026-11-15')).toBe('2026-11-16'); // أحد → غداً
  });

  it('shiftMonth لا يقفز شهراً (خطأ 31 يناير القديم)', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, 1)).toEqual({ year: 2026, month: 1 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('isValidDateStr', () => {
    expect(isValidDateStr('2026-02-28')).toBe(true);
    expect(isValidDateStr('2026-02-30')).toBe(false);
    expect(isValidDateStr('2026-2-3')).toBe(false);
    expect(isValidDateStr(null)).toBe(false);
  });
});
