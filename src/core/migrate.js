// @ts-check
// ترحيل بيانات النسخة القديمة (localStorage: studyLogs / monthlyCustomTargets / trackingStart)
// إلى النموذج الجديد. يدعم صيغتين للسجل القديم:
//   الأقدم:  { morning: ساعات عشرية, evening: ساعات عشرية }
//   الأحدث:  { morningMins: دقائق, eveningMins: دقائق }
import { DEFAULT_FREEZES_PER_MONTH, DEFAULT_TIMER_SETTINGS, SCHEMA_VERSION } from './constants.js';
import { isValidDateStr } from './dates.js';
import { BASE_TARGETS, EPOCH, normalizePlan, normalizeTargets } from './plan.js';
import { MAX_DAY_MINS } from './sessions.js';

/** @typedef {import('./types.js').Session} Session */
/** @typedef {import('./types.js').DayTarget} DayTarget */
/** @typedef {import('./types.js').State} State */

export { SCHEMA_VERSION };
export const QUALITIES = ['excellent', 'good', 'average', 'poor'];

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {Record<string, any>} entry سجل قديم خام
 * @param {string} minsKey
 * @param {string} hoursKey
 */
function legacyMins(entry, minsKey, hoursKey) {
  if (Number.isFinite(entry[minsKey])) return Math.round(entry[minsKey]);
  if (Number.isFinite(entry[hoursKey])) return Math.round(entry[hoursKey] * 60);
  return 0;
}

/**
 * @param {string} date
 * @param {'morning'|'evening'} period
 * @param {number} minutes
 * @returns {Session}
 */
function legacySession(date, period, minutes) {
  return {
    id: `legacy-${date}-${period === 'morning' ? 'm' : 'e'}`, // ثابت: إعادة الترحيل لا تكرر الجلسات
    date,
    period,
    minutes,
    startedAt: null,
    source: 'migrated',
    subject: null,
    note: '',
    createdAt: 0,
  };
}

/** @param {string} key */
function nextMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m, 1); // m (1-based) هنا = الشهر التالي (0-based)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// الأهداف القديمة كانت تخصَّص لشهر واحد ثم تعود للأساس. نحافظ على نتائج الماضي
// بإضافة نسخة "عودة للأساس" بعد كل شهر مخصص ما لم يكن الشهر التالي مخصصاً أيضاً.
/**
 * @param {unknown} customTargets أهداف قديمة خام
 * @param {string} today
 */
export function migrateLegacyPlan(customTargets, today) {
  const versions = [{ effectiveFrom: EPOCH, targets: normalizeTargets(BASE_TARGETS) }];
  if (!isObj(customTargets)) return normalizePlan({ versions });

  const months = Object.keys(customTargets).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  for (const m of months) {
    /** @type {Record<number, DayTarget>} */
    const monthTargets = {};
    for (let dow = 0; dow <= 6; dow++) {
      const t = customTargets[m] && customTargets[m][dow];
      monthTargets[dow] = t
        ? {
            morningMins: Math.round((Number(t.minMorning) || 0) * 60),
            eveningMins: Math.round((Number(t.minEvening) || 0) * 60),
          }
        : BASE_TARGETS[dow];
    }
    versions.push({ effectiveFrom: `${m}-01`, targets: normalizeTargets(monthTargets) });

    const next = nextMonthKey(m);
    if (!customTargets[next] && `${next}-01` <= today) {
      versions.push({ effectiveFrom: `${next}-01`, targets: normalizeTargets(BASE_TARGETS) });
    }
  }
  return normalizePlan({ versions });
}

/**
 * @param {Record<string, any>} legacy بيانات النسخة القديمة الخام (يُتسامح مع null وقت التشغيل)
 * @param {string} today
 * @returns {State}
 */
export function migrateLegacy(legacy, today) {
  const logs = isObj(legacy && legacy.studyLogs) ? legacy.studyLogs : {};
  /** @type {Session[]} */
  const sessions = [];
  /** @type {Record<string, {quality: string}>} */
  const dayMeta = {};
  /** @type {string[]} */
  const dates = [];

  for (const date of Object.keys(logs).sort()) {
    if (!isValidDateStr(date) || !isObj(logs[date])) continue;
    const entry = logs[date];

    const m = Math.min(MAX_DAY_MINS, Math.max(0, legacyMins(entry, 'morningMins', 'morning')));
    const e = Math.min(MAX_DAY_MINS - m, Math.max(0, legacyMins(entry, 'eveningMins', 'evening')));

    if (m > 0) sessions.push(legacySession(date, 'morning', m));
    if (e > 0) sessions.push(legacySession(date, 'evening', e));
    if (QUALITIES.includes(entry.quality)) dayMeta[date] = { quality: entry.quality };
    if (m > 0 || e > 0 || dayMeta[date]) dates.push(date);
  }

  const earliest = dates.length ? dates[0] : null;
  const legacyStart = legacy && isValidDateStr(legacy.trackingStart) ? legacy.trackingStart : null;
  let trackingStart;
  if (legacyStart) trackingStart = earliest && earliest < legacyStart ? earliest : legacyStart;
  else trackingStart = earliest || today;

  return {
    schemaVersion: SCHEMA_VERSION,
    sessions,
    dayMeta,
    subjects: [],
    dayOffs: [],
    exams: [],
    achievements: { unlocked: {} },
    plan: migrateLegacyPlan(legacy && legacy.monthlyCustomTargets, today),
    settings: { trackingStart, freezesPerMonth: DEFAULT_FREEZES_PER_MONTH, timer: { ...DEFAULT_TIMER_SETTINGS } },
  };
}
