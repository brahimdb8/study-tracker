// @ts-check
// متى نحتفل؟ منطق نقي: عبور هدف اليوم/الأسبوع من «غير مكتمل» إلى «مكتمل» أثناء الاستخدام الحي،
// ومرة واحدة لكل يوم/أسبوع (السجل يُحفظ لكل جهاز في localStorage، خارج مخطط البيانات).
import { createContext } from './context.js';
import { isDone, evaluateDay, weekProgress } from './status.js';

export const CELEBRATED_KEY = 'studyTracker:celebrated';

/**
 * @param {any} before الحالة قبل الإجراء
 * @param {any} after الحالة بعده
 * @param {string} today
 * @returns {{ day: boolean, week: boolean, weekKey: string }}
 */
export function detectGoalCrossings(before, after, today) {
  const b = createContext(before, today);
  const a = createContext(after, today);
  const day = !isDone(evaluateDay(today, b)) && isDone(evaluateDay(today, a))
    && evaluateDay(today, a) !== 'rest';
  const wb = weekProgress(today, b);
  const wa = weekProgress(today, a);
  const week = wa.targetMins > 0 && wb.pct < 100 && wa.pct >= 100;
  return { day, week, weekKey: wa.weekStart };
}

/** @param {unknown} raw */
export function parseCelebrated(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (v && typeof v === 'object') {
      return {
        day: typeof v.day === 'string' ? v.day : null,
        week: typeof v.week === 'string' ? v.week : null,
      };
    }
  } catch { /* تالف: يُهمل */ }
  return { day: null, week: null };
}

/**
 * هل نحتفل بهذا العبور؟ وماذا نسجّل بعده؟
 * @param {{ day: string|null, week: string|null }} record
 * @param {{ day: boolean, week: boolean, weekKey: string }} crossing
 * @param {string} today
 */
export function planCelebration(record, crossing, today) {
  const day = crossing.day && record.day !== today;
  const week = crossing.week && record.week !== crossing.weekKey;
  return {
    day, week,
    record: { day: day ? today : record.day, week: week ? crossing.weekKey : record.week },
  };
}
