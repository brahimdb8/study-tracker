// تقييم حالة اليوم والسلسلة — دوال نقية: كل ما تحتاجه يأتي في ctx
//   ctx = { index, plan, trackingStart, today }
// الحالات: future | default | completed | compensated | failed
import { addDays, weekDays } from '../../src/core/dates.js';
import { targetsForDate } from '../../src/core/plan.js';
import { dayTotals } from '../../src/core/sessions.js';

export function isDone(status) {
  return status === 'completed' || status === 'compensated';
}

export function evaluateDay(dateStr, ctx) {
  const { index, plan, trackingStart, today } = ctx;

  if (dateStr > today) return 'future';
  if (trackingStart && dateStr < trackingStart) return 'default';

  const target = targetsForDate(plan, dateStr).totalMins;
  const studied = dayTotals(index, dateStr).totalMins;

  // 1. مكتمل بجهده الذاتي (يوم هدفه صفر = يوم راحة يُحسب مكتملاً)
  if (studied >= target) return 'completed';

  // اليوم الحالي غير المكتمل: لا يُحكم عليه بعد
  if (dateStr === today) return 'default';

  // 2. تعويض من فائض الأسبوع (إثنين → أحد)، ولأيام ماضية فقط
  const week = weekDays(dateStr);
  let weekTarget = 0;
  let weekStudied = 0;
  for (const w of week) {
    if (!trackingStart || w >= trackingStart) weekTarget += targetsForDate(plan, w).totalMins;
    weekStudied += dayTotals(index, w).totalMins;
  }
  if (weekStudied >= weekTarget) return 'compensated';

  // 3. يوم بلا تدوين والأسبوع لم ينتهِ: ما زال قابلاً للتعويض
  const weekFinished = week[6] < today;
  if (!index[dateStr] && !weekFinished) return 'default';

  // 4. تقصير
  return 'failed';
}

// السلسلة الحالية: اليوم غير المكتمل لا يقطعها
export function computeStreak(ctx) {
  let streak = 0;
  let d = ctx.today;
  for (let i = 0; i < 5000; i++) {
    if (ctx.trackingStart && d < ctx.trackingStart) break;
    const st = evaluateDay(d, ctx);
    if (isDone(st)) streak++;
    else if (d !== ctx.today) break;
    d = addDays(d, -1);
  }
  return streak;
}
