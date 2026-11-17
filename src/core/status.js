// @ts-check
// تقييم حالة اليوم والسلسلة — دوال نقية: كل ما تحتاجه يأتي في ctx
//   ctx = { index, plan, trackingStart, today, dayOffs?, freezesPerMonth? }
//
// الحالات:
//   future       مستقبل
//   default      بلا حكم (اليوم الحالي، أو يوم لم يُحسم، أو قبل بداية التتبع)
//   completed    مكتمل بجهده
//   compensated  معوَّض من فائض الأسبوع
//   failed       مقصّر
//   frozen       فشل لكن جُمِّد تلقائياً لحماية السلسلة
//   excused      يوم استثنائي (إجازة/مرض/امتحان/راحة يدوية)
//   rest         يوم راحة بحسب الخطة (هدفه صفر)
//
// السلسلة والتجميد يُحسبان على "خط زمني" واحد بترتيب الأيام (getTimeline)،
// ويُخزَّن على كائن ctx، فيُبنى مرة واحدة لكل عرض.
/** @typedef {import('./types.js').EvalCtx} EvalCtx */
/** @typedef {import('./types.js').DayStatus} DayStatus */
/** @typedef {import('./types.js').Timeline} Timeline */
/** @typedef {import('./types.js').DayOff} DayOff */

import { TIMELINE_MAX_DAYS } from './constants.js';
import { addDays, weekDays } from './dates.js';
import { buildDayOffIndex } from './dayoffs.js';
import { targetsForDate, weeklyGoalFor } from './plan.js';
import { dayTotals } from './sessions.js';

/**
 * @param {string|undefined} status
 * @returns {boolean}
 */
export function isDone(status) {
  return status === 'completed' || status === 'compensated';
}

// حالات محايدة: لا تزيد السلسلة ولا تقطعها
/**
 * @param {string|undefined} status
 * @returns {boolean}
 */
export function isNeutral(status) {
  return status === 'rest' || status === 'excused' || status === 'frozen';
}

/**
 * @param {EvalCtx} ctx
 * @returns {Map<string, DayOff>}
 */
function dayOffIndex(ctx) {
  return ctx._dayOffIndex || (ctx._dayOffIndex = buildDayOffIndex(ctx.dayOffs || []));
}

/**
 * @param {EvalCtx} ctx
 * @param {string} dateStr
 * @returns {DayOff|null}
 */
export function dayOffFor(ctx, dateStr) {
  return dayOffIndex(ctx).get(dateStr) || null;
}

/**
 * @param {string} dateStr
 * @param {EvalCtx} ctx
 * @returns {boolean}
 */
function isExcludedFromTarget(dateStr, ctx) {
  return !!(ctx.trackingStart && dateStr < ctx.trackingStart) || dayOffIndex(ctx).has(dateStr);
}

// هدف الأسبوع الذي يقع فيه التاريخ: (الهدف الصريح أو مجموع اليومي) مطروحاً منه
// أهداف الأيام المستثناة (قبل بداية التتبع أو الاستثنائية)
/**
 * @param {string} dateStr
 * @param {EvalCtx} ctx
 * @returns {number}
 */
export function weekTargetMins(dateStr, ctx) {
  const week = weekDays(dateStr);
  const explicit = weeklyGoalFor(ctx.plan, week[0]);
  let base = 0;
  let excluded = 0;
  for (const w of week) {
    const t = targetsForDate(ctx.plan, w).totalMins;
    base += t;
    if (isExcludedFromTarget(w, ctx)) excluded += t;
  }
  return Math.max(0, (explicit ?? base) - excluded);
}

// الحالة الأساسية لليوم (قبل تطبيق التجميد)
/**
 * @param {string} dateStr
 * @param {EvalCtx} ctx
 * @returns {DayStatus}
 */
export function baseStatus(dateStr, ctx) {
  const { index, plan, trackingStart, today } = ctx;

  if (dateStr > today) return 'future';
  if (trackingStart && dateStr < trackingStart) return 'default';
  if (dayOffIndex(ctx).has(dateStr)) return 'excused';

  const target = targetsForDate(plan, dateStr).totalMins;
  if (target === 0) return 'rest';

  const studied = dayTotals(index, dateStr).totalMins;
  if (studied >= target) return 'completed';

  // اليوم الحالي غير المكتمل: لا يُحكم عليه بعد
  if (dateStr === today) return 'default';

  // تعويض من فائض الأسبوع (إثنين → أحد)، لأيام ماضية فقط
  const week = weekDays(dateStr);
  let weekStudied = 0;
  for (const w of week) weekStudied += dayTotals(index, w).totalMins;
  if (weekStudied >= weekTargetMins(dateStr, ctx)) return 'compensated';

  // يوم بلا تدوين والأسبوع لم ينتهِ: ما زال قابلاً للتعويض
  const weekFinished = week[6] < today;
  if (!index[dateStr] && !weekFinished) return 'default';

  return 'failed';
}

/**
 * @param {EvalCtx} ctx
 * @returns {Timeline}
 */
export function getTimeline(ctx) {
  if (ctx._timeline) return ctx._timeline;

/**
 * @type {Map<string, DayStatus>}
 */
  const statuses = new Map();
/**
 * @type {Record<string, number>}
 */
  const freezesUsed = {};
  const allowance = ctx.freezesPerMonth ?? 0;
  const floor = addDays(ctx.today, -TIMELINE_MAX_DAYS);
  const start = ctx.trackingStart && ctx.trackingStart > floor ? ctx.trackingStart : floor;

  let streak = 0;
  for (let d = ctx.trackingStart ? start : ctx.today; d <= ctx.today; d = addDays(d, 1)) {
    let st = baseStatus(d, ctx);

    if (isDone(st)) {
      streak++;
    } else if (st === 'rest' || st === 'excused' || d === ctx.today) {
      // محايد: لا يغيّر السلسلة
    } else {
      // يوم "كاسر" (فشل أو لم يُحسم وفات): يُجمَّد إن وُجدت سلسلة تستحق الحماية
      const month = d.slice(0, 7);
      if (streak > 0 && (freezesUsed[month] || 0) < allowance) {
        freezesUsed[month] = (freezesUsed[month] || 0) + 1;
        st = 'frozen';
      } else {
        streak = 0;
      }
    }
    statuses.set(d, st);
  }

  ctx._timeline = { statuses, streak, freezesUsed };
  return ctx._timeline;
}

/**
 * @param {string} dateStr
 * @param {EvalCtx} ctx
 * @returns {DayStatus}
 */
export function evaluateDay(dateStr, ctx) {
  if (dateStr > ctx.today) return 'future';
  const st = getTimeline(ctx).statuses.get(dateStr);
  return st !== undefined ? st : baseStatus(dateStr, ctx);
}

// السلسلة الحالية (اليوم غير المكتمل لا يقطعها)
/**
 * @param {EvalCtx} ctx
 * @returns {number}
 */
export function computeStreak(ctx) {
  return getTimeline(ctx).streak;
}

// معلومات التجميد لشهر معيّن (YYYY-MM)
/**
 * @param {EvalCtx} ctx
 * @param {string} monthKey
 * @returns {{ allowance: number, used: number, remaining: number }}
 */
export function freezeInfo(ctx, monthKey) {
  const allowance = ctx.freezesPerMonth ?? 0;
  const used = getTimeline(ctx).freezesUsed[monthKey] || 0;
  return { allowance, used, remaining: Math.max(0, allowance - used) };
}

// تقدّم الأسبوع الذي يقع فيه التاريخ
/**
 * @param {string} dateStr
 * @param {EvalCtx} ctx
 */
export function weekProgress(dateStr, ctx) {
  const week = weekDays(dateStr);
  let studiedMins = 0;
  for (const w of week) studiedMins += dayTotals(ctx.index, w).totalMins;
  const targetMins = weekTargetMins(dateStr, ctx);
  const remainingMins = Math.max(0, targetMins - studiedMins);
  const pct = targetMins > 0 ? Math.min(100, Math.round((studiedMins / targetMins) * 100)) : 100;
  const daysLeft = week.filter((w) => w >= ctx.today).length;
  return { weekStart: week[0], weekEnd: week[6], studiedMins, targetMins, remainingMins, pct, daysLeft };
}
