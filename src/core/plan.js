// @ts-check
// الخطة الأسبوعية: نسخ مؤرَّخة (versions). كل نسخة تسري من تاريخ effectiveFrom.
// الأهداف بالدقائق الصحيحة. التعديل الجديد يسري دائماً من بداية الأسبوع القادم
// فلا يمكن التلاعب بالأيام الماضية ولا بالأسبوع الجاري.
// weeklyMins (اختياري): هدف أسبوعي صريح؛ إن غاب فالهدف الأسبوعي = مجموع الأهداف اليومية.
import { dayOfWeek, nextWeekStart } from './dates.js';

/** @typedef {import('./types.js').Plan} Plan */
/** @typedef {import('./types.js').PlanVersion} PlanVersion */
/** @typedef {import('./types.js').DayTarget} DayTarget */

export const EPOCH = '0000-01-01';
export const MAX_TARGET_MINS = 24 * 60;
export const MAX_WEEKLY_MINS = 7 * 24 * 60;

// 0 = الأحد ... 6 = السبت
/** @type {Record<number, DayTarget>} */
export const BASE_TARGETS = {
  1: { morningMins: 60, eveningMins: 60 },
  2: { morningMins: 60, eveningMins: 60 },
  3: { morningMins: 60, eveningMins: 60 },
  4: { morningMins: 60, eveningMins: 60 },
  5: { morningMins: 0, eveningMins: 120 },
  6: { morningMins: 180, eveningMins: 120 },
  0: { morningMins: 180, eveningMins: 120 },
};

/**
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {Record<number, any>|null|undefined} targets أهداف خام (قد تكون ناقصة أو تالفة)
 * @returns {Record<number, DayTarget>}
 */
export function normalizeTargets(targets) {
  /** @type {Record<number, DayTarget>} */
  const out = {};
  for (let dow = 0; dow <= 6; dow++) {
    const src = (targets && targets[dow]) || BASE_TARGETS[dow];
    const morningMins = clampInt(src.morningMins, 0, MAX_TARGET_MINS, BASE_TARGETS[dow].morningMins);
    let eveningMins = clampInt(src.eveningMins, 0, MAX_TARGET_MINS, BASE_TARGETS[dow].eveningMins);
    if (morningMins + eveningMins > MAX_TARGET_MINS) eveningMins = MAX_TARGET_MINS - morningMins;
    out[dow] = { morningMins, eveningMins };
  }
  return out;
}

// الهدف الأسبوعي الصريح: عدد صحيح موجب أو null (= تلقائي)
/**
 * @param {unknown} v
 * @returns {number|null}
 */
export function normalizeWeekly(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, MAX_WEEKLY_MINS);
}

/** @returns {Plan} */
export function createInitialPlan() {
  return { versions: [{ effectiveFrom: EPOCH, targets: normalizeTargets(BASE_TARGETS), weeklyMins: null }] };
}

// ضمان أن الخطة سليمة: مرتبة، وأولها EPOCH
/**
 * @param {Record<string, any>|null|undefined} plan خطة خام غير موثوقة
 * @returns {Plan}
 */
export function normalizePlan(plan) {
  const raw = plan && Array.isArray(plan.versions) ? plan.versions : [];
  /** @type {Map<string, PlanVersion>} */
  const byDate = new Map();
  for (const v of raw) {
    if (!v || typeof v.effectiveFrom !== 'string') continue;
    byDate.set(v.effectiveFrom, {
      effectiveFrom: v.effectiveFrom,
      targets: normalizeTargets(v.targets),
      weeklyMins: normalizeWeekly(v.weeklyMins),
    });
  }
  if (!byDate.has(EPOCH)) {
    byDate.set(EPOCH, { effectiveFrom: EPOCH, targets: normalizeTargets(BASE_TARGETS), weeklyMins: null });
  }
  const versions = [...byDate.values()].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  return { versions };
}

/**
 * @param {Plan} plan
 * @param {string} dateStr
 */
export function versionFor(plan, dateStr) {
  let found = plan.versions[0];
  for (const v of plan.versions) {
    if (v.effectiveFrom <= dateStr) found = v;
    else break;
  }
  return found;
}

/**
 * @param {Plan} plan
 * @param {string} dateStr
 */
export function targetsForDate(plan, dateStr) {
  const t = versionFor(plan, dateStr).targets[dayOfWeek(dateStr)];
  return {
    morningMins: t.morningMins,
    eveningMins: t.eveningMins,
    totalMins: t.morningMins + t.eveningMins,
  };
}

// الهدف الأسبوعي الصريح السارية وقت dateStr (عادةً الإثنين)، أو null
/**
 * @param {Plan} plan
 * @param {string} dateStr
 * @returns {number|null}
 */
export function weeklyGoalFor(plan, dateStr) {
  return versionFor(plan, dateStr).weeklyMins ?? null;
}

// تعديل مجدول لم يسرِ بعد (تاريخ سريانه بعد اليوم)
/**
 * @param {Plan} plan
 * @param {string} today
 */
export function pendingVersion(plan, today) {
  return plan.versions.find((v) => v.effectiveFrom > today) || null;
}

/**
 * @param {Plan} plan
 * @param {string} today
 */
export function currentVersion(plan, today) {
  return versionFor(plan, today);
}

/**
 * @param {Record<number, DayTarget>} a
 * @param {Record<number, DayTarget>} b
 */
export function targetsEqual(a, b) {
  for (let dow = 0; dow <= 6; dow++) {
    if (a[dow].morningMins !== b[dow].morningMins || a[dow].eveningMins !== b[dow].eveningMins) return false;
  }
  return true;
}

// يجدول خطة جديدة تسري من الإثنين القادم، ويستبدل أي تعديل مجدول سابق
/**
 * @param {Plan} plan
 * @param {Record<number, any>|null|undefined} targets
 * @param {string} today
 * @param {unknown} [weeklyMins]
 */
export function schedulePlanChange(plan, targets, today, weeklyMins = null) {
  const effectiveFrom = nextWeekStart(today);
  const normalized = normalizeTargets(targets);
  const weekly = normalizeWeekly(weeklyMins);
  const kept = plan.versions.filter((v) => v.effectiveFrom <= today);

  // لو المطلوب يطابق السارية حالياً فلا حاجة لنسخة جديدة
  const current = kept[kept.length - 1];
  if (targetsEqual(current.targets, normalized) && (current.weeklyMins ?? null) === weekly) {
    return { plan: { versions: kept }, effectiveFrom: null };
  }
  return {
    plan: { versions: [...kept, { effectiveFrom, targets: normalized, weeklyMins: weekly }] },
    effectiveFrom,
  };
}

/**
 * @param {Plan} plan
 * @param {string} today
 * @returns {Plan}
 */
export function cancelPendingChange(plan, today) {
  return { versions: plan.versions.filter((v) => v.effectiveFrom <= today) };
}
