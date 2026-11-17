// @ts-check
// إحصاءات شهرية — تستخدم نفس evaluateDay فلا يختلف أي رقم بين الصفحات
/** @typedef {import('./types.js').EvalCtx} EvalCtx */
/** @typedef {import('./types.js').DayMeta} DayMeta */

import { daysInMonth, formatDate } from './dates.js';
import { targetsForDate } from './plan.js';
import { dayTotals } from './sessions.js';
import { evaluateDay, isDone, isNeutral } from './status.js';

// maxDay (اختياري): يقصّ الحساب عند هذا اليوم من الشهر، لمقارنة عادلة مع شهر سابق
/**
 * @param {number} year
 * @param {number} month0
 * @param {EvalCtx} ctx
 * @param {DayMeta} [dayMeta]
 * @param {{ maxDay?: number }} [opts]
 */
export function monthStats(year, month0, ctx, dayMeta = {}, { maxDay = Infinity } = {}) {
  const { plan, trackingStart, today, index } = ctx;
  const n = Math.min(daysInMonth(year, month0), maxDay);

/**
 * @type {{ studiedMins: number, targetMins: number, morningMins: number, eveningMins: number, completedDays: number, frozenDays: number, excusedDays: number, bestStreak: number, qualityCounts: Record<string, number>, completionRate: number }}
 */
  const stats = {
    studiedMins: 0,
    targetMins: 0,
    morningMins: 0,
    eveningMins: 0,
    completedDays: 0,
    frozenDays: 0,
    excusedDays: 0, // استثنائية + راحة الخطة
    bestStreak: 0,
    qualityCounts: { excellent: 0, good: 0, average: 0, poor: 0, none: 0 },
    completionRate: 0,
  };

  let run = 0;
  for (let day = 1; day <= n; day++) {
    const dateStr = formatDate(new Date(year, month0, day));
    if (dateStr > today) break;                              // لا شيء من المستقبل
    if (trackingStart && dateStr < trackingStart) continue;  // قبل بداية التتبع

    const status = evaluateDay(dateStr, ctx);
    const t = dayTotals(index, dateStr);
    stats.morningMins += t.morningMins;
    stats.eveningMins += t.eveningMins;
    stats.studiedMins += t.totalMins;

    // الأيام الاستثنائية وأيام الراحة لا تدخل في هدف الشهر
    if (status === 'excused' || status === 'rest') stats.excusedDays++;
    else stats.targetMins += targetsForDate(plan, dateStr).totalMins;

    if (status === 'frozen') stats.frozenDays++;

    if (isDone(status)) {
      stats.completedDays++;
      run++;
      if (run > stats.bestStreak) stats.bestStreak = run;
    } else if (!isNeutral(status) && dateStr !== today) {
      run = 0; // المحايد (راحة/استثناء/تجميد) واليوم الحالي لا يقطعان السلسلة
    }

    const q = dayMeta[dateStr] && dayMeta[dateStr].quality;
    if (q && stats.qualityCounts[q] !== undefined && q !== 'none') stats.qualityCounts[q]++;
    else stats.qualityCounts.none++;
  }

  stats.completionRate = stats.targetMins > 0
    ? Math.min(100, Math.round((stats.studiedMins / stats.targetMins) * 100))
    : 0;
  return stats;
}
