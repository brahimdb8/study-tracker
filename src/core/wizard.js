// @ts-check
// معالج الترحيب التفاعلي: منطق نقي (بلا DOM). يحوّل مواد الطالب وساعاته الأسبوعية المخططة إلى حالة جديدة.
// لأن الطالب الجديد بلا جلسات، تُستبدل نسخة الخطة الأساسية (EPOCH) فوراً؛ لا حاجة لانتظار الاثنين القادم.
import { MAX_SUBJECTS } from './constants.js';
import { BASE_TARGETS, EPOCH, normalizeTargets } from './plan.js';
import { addSubject } from './subjects.js';

/** @typedef {import('./types.js').State} State */
/** @typedef {import('./types.js').DayTarget} DayTarget */

export const MIN_WEEKLY_HOURS = 1;
export const MAX_WEEKLY_HOURS = 70;
export const DEFAULT_WEEKLY_HOURS = 21;
const STEP_MINS = 5;

/**
 * يقرأ عدد الساعات الأسبوعية من نص المستخدم (يقبل الأرقام العربية-الهندية والفاصلة العربية).
 * @param {unknown} raw
 * @returns {{ ok: true, hours: number, mins: number } | { ok: false, error: string }}
 */
export function parseWeeklyHours(raw) {
  const text = String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[،٫,]/g, '.')
    .trim();
  if (text === '') return { ok: false, error: 'اكتب عدد الساعات الأسبوعية.' };
  const n = Number(text);
  if (!Number.isFinite(n)) return { ok: false, error: 'اكتب رقماً صحيحاً، مثل 14 أو 10.5.' };
  if (n < MIN_WEEKLY_HOURS) return { ok: false, error: `الحد الأدنى ${MIN_WEEKLY_HOURS} ساعة في الأسبوع.` };
  if (n > MAX_WEEKLY_HOURS) return { ok: false, error: `الحد الأقصى ${MAX_WEEKLY_HOURS} ساعة في الأسبوع.` };
  const mins = Math.round((n * 60) / STEP_MINS) * STEP_MINS;
  return { ok: true, hours: mins / 60, mins };
}

/**
 * يوزّع الهدف الأسبوعي على الأيام السبعة بنفس نسب الخطة الافتراضية (نهاية الأسبوع أثقل)،
 * بمضاعفات 5 دقائق، ومجموعها يساوي الهدف تماماً.
 * @param {number} weeklyMins
 * @returns {Record<number, DayTarget>}
 */
export function distributeWeekly(weeklyMins) {
  const total = Math.max(STEP_MINS, Math.round(weeklyMins / STEP_MINS) * STEP_MINS);
  const baseSum = Object.values(BASE_TARGETS).reduce((a, t) => a + t.morningMins + t.eveningMins, 0);
  /** @type {Record<number, DayTarget>} */
  const out = {};
  let sum = 0;
  let heaviest = 0;
  for (let dow = 0; dow <= 6; dow++) {
    const b = BASE_TARGETS[dow];
    const dayBase = b.morningMins + b.eveningMins;
    const dayMins = Math.round((total * dayBase) / baseSum / STEP_MINS) * STEP_MINS;
    const morningMins = Math.round((dayMins * (b.morningMins / dayBase)) / STEP_MINS) * STEP_MINS;
    out[dow] = { morningMins, eveningMins: dayMins - morningMins };
    sum += dayMins;
    if (dayBase > BASE_TARGETS[heaviest].morningMins + BASE_TARGETS[heaviest].eveningMins) heaviest = dow;
  }
  // تصحيح فرق التقريب على أثقل يوم حتى يتطابق المجموع
  out[heaviest] = { ...out[heaviest], eveningMins: Math.max(0, out[heaviest].eveningMins + (total - sum)) };
  return normalizeTargets(out);
}

/**
 * @param {string[]} names
 * @returns {string[]} أسماء نظيفة بلا تكرار وفي حدود الحد الأقصى
 */
export function cleanSubjectNames(names) {
  const seen = new Set();
  const out = [];
  for (const raw of names) {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, MAX_SUBJECTS);
}

/**
 * يطبّق نتيجة المعالج: يضيف المواد ويضبط الخطة من الساعة صفر.
 * إن وُجدت جلسات سابقة لا تُلمس الخطة (حماية السجل) ويُطبَّق إضافة المواد فقط.
 * @param {State} state
 * @param {{ subjects?: string[], weeklyMins?: number|null }} input
 * @returns {{ state: State, addedSubjects: number, planApplied: boolean, skipped: string[] }}
 */
export function applyWizard(state, { subjects = [], weeklyMins = null } = {}) {
  /** @type {import('./types.js').Subject[]} */
  let list = state.subjects;
  let added = 0;
  /** @type {string[]} */
  const skipped = [];
  for (const name of cleanSubjectNames(subjects)) {
    const res = addSubject(list, { name });
    if (res.ok && res.subjects) { list = res.subjects; added++; } else skipped.push(name);
  }
  let plan = state.plan;
  let planApplied = false;
  if (weeklyMins && state.sessions.length === 0) {
    const mins = Math.round(weeklyMins / STEP_MINS) * STEP_MINS;
    const rest = state.plan.versions.filter((v) => v.effectiveFrom !== EPOCH && v.effectiveFrom > EPOCH);
    plan = { versions: [{ effectiveFrom: EPOCH, targets: distributeWeekly(mins), weeklyMins: mins }, ...rest] };
    planApplied = true;
  }
  return { state: { ...state, subjects: list, plan }, addedSubjects: added, planApplied, skipped };
}
