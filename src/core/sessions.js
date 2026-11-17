// @ts-check
// نموذج الجلسات: كل جلسة دراسة سجل مستقل. المجاميع (صباح/مساء/يوم) كلها محسوبة منها.
// session = { id, date, period, minutes, startedAt, source, subject, note, createdAt }
import { isValidDateStr } from './dates.js';

/** @typedef {import('./types.js').Session} Session */
/** @typedef {import('./types.js').Period} Period */
/** @typedef {import('./types.js').DayTotals} DayTotals */
/** @typedef {import('./types.js').DayIndex} DayIndex */
/**
 * مدخل إنشاء جلسة (الحقول الاختيارية تأخذ افتراضياتها).
 * @typedef {object} SessionInput
 * @property {string} date
 * @property {number} minutes
 * @property {Period} period
 * @property {string} [id]
 * @property {number|null} [startedAt]
 * @property {string} [source]
 * @property {string|null} [subject]
 * @property {unknown} [note]
 * @property {number} [createdAt]
 */
/** @typedef {Partial<Pick<Session, 'date'|'minutes'|'period'|'note'|'subject'|'startedAt'>>} SessionPatch */

export const MAX_DAY_MINS = 24 * 60;
/** @type {Period[]} */
export const PERIODS = ['morning', 'evening'];
/** @type {Record<Period, string>} */
export const PERIOD_LABEL = { morning: 'صباحاً', evening: 'مساءً' };
/** @type {Record<string, string>} */
export const SOURCE_LABEL = { timer: 'مؤقت', manual: 'يدوي', migrated: 'مُرحَّل' };

/** @returns {string} */
export function newId() {
  try {
    if (/** @type {any} */ (globalThis).crypto && typeof /** @type {any} */ (globalThis).crypto.randomUUID === 'function') {
      return /** @type {any} */ (globalThis).crypto.randomUUID();
    }
  } catch { /* بيئة غير آمنة (file://) */ }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// الفترة تُحدَّد بوقت بدء الجلسة
/** @param {number} ms @returns {Period} */
export function periodFromTimestamp(ms) {
  return new Date(ms).getHours() < 12 ? 'morning' : 'evening';
}

/** @param {number} totalMins */
export function splitMins(totalMins) {
  return { hours: Math.floor(totalMins / 60), mins: totalMins % 60 };
}

/** @param {Record<string, any>|null|undefined} s مدخل غير موثوق @returns {boolean} */
export function isValidSession(s) {
  return !!s
    && typeof s === 'object'
    && typeof s.id === 'string' && s.id.length > 0
    && isValidDateStr(s.date)
    && Number.isInteger(s.minutes) && s.minutes >= 1 && s.minutes <= MAX_DAY_MINS
    && PERIODS.includes(s.period)
    && (s.startedAt === null || s.startedAt === undefined || Number.isFinite(s.startedAt));
}

/** @param {{ date: string, minutes: number, period: string }} o @returns {string|null} */
function checkInput({ date, minutes, period }) {
  if (!isValidDateStr(date)) return 'تاريخ غير صالح.';
  if (!Number.isInteger(minutes) || minutes < 1) return 'أدخل مدة لا تقل عن دقيقة واحدة.';
  if (minutes > MAX_DAY_MINS) return 'المدة تتجاوز 24 ساعة.';
  if (!PERIODS.includes(/** @type {Period} */ (period))) return 'فترة غير صالحة.';
  return null;
}

/** @param {Session[]} sessions @param {string} date @param {string|null} [excludeId] */
function dayMinutes(sessions, date, excludeId = null) {
  let total = 0;
  for (const s of sessions) {
    if (s.date === date && s.id !== excludeId) total += s.minutes;
  }
  return total;
}

/**
 * @param {Session[]} sessions
 * @param {SessionInput} input
 * @returns {{ ok: false, error: string } | { ok: true, sessions: Session[], session: Session }}
 */
export function addSession(sessions, input) {
  const err = checkInput(input);
  if (err) return { ok: false, error: err };
  if (dayMinutes(sessions, input.date) + input.minutes > MAX_DAY_MINS) {
    return { ok: false, error: 'مجموع هذا اليوم سيتجاوز 24 ساعة.' };
  }
  /** @type {Session} */
  const session = {
    id: input.id || newId(),
    date: input.date,
    period: input.period,
    minutes: input.minutes,
    startedAt: input.startedAt ?? null,
    source: input.source || 'manual',
    subject: input.subject ?? null,
    note: String(input.note ?? '').trim().slice(0, 200),
    createdAt: input.createdAt ?? Date.now(),
  };
  return { ok: true, sessions: [...sessions, session], session };
}

// استعادة جلسة محذوفة (للتراجع): تُعاد بكل حقولها الأصلية (id وcreatedAt...) لا كجلسة جديدة.
// آمنة للتكرار: إن كانت موجودة فعلاً لا تُضاف مرتين. وسقف 24 ساعة لليوم ما زال ساري المفعول.
/**
 * @param {Session[]} sessions
 * @param {Session} session
 * @returns {{ ok: false, error: string } | { ok: true, sessions: Session[], already: boolean }}
 */
export function restoreSession(sessions, session) {
  if (!isValidSession(session)) return { ok: false, error: 'تعذّرت الاستعادة: بيانات الجلسة غير صالحة.' };
  if (sessions.some((s) => s.id === session.id)) return { ok: true, sessions, already: true };
  if (dayMinutes(sessions, session.date) + session.minutes > MAX_DAY_MINS) {
    return { ok: false, error: 'تعذّرت الاستعادة: مجموع هذا اليوم سيتجاوز 24 ساعة.' };
  }
  return { ok: true, sessions: [...sessions, { ...session }], already: false };
}

/**
 * @param {Session[]} sessions
 * @param {string} id
 * @param {SessionPatch} patch
 * @returns {{ ok: false, error: string } | { ok: true, sessions: Session[], session: Session }}
 */
export function updateSession(sessions, id, patch) {
  const current = sessions.find((s) => s.id === id);
  if (!current) return { ok: false, error: 'الجلسة غير موجودة.' };
  const next = {
    ...current,
    date: patch.date ?? current.date,
    minutes: patch.minutes ?? current.minutes,
    period: patch.period ?? current.period,
    note: patch.note !== undefined ? String(patch.note).trim().slice(0, 200) : current.note,
    subject: patch.subject !== undefined ? patch.subject : current.subject,
    startedAt: patch.startedAt !== undefined ? patch.startedAt : current.startedAt,
  };
  if (next.startedAt !== null && !Number.isFinite(next.startedAt)) return { ok: false, error: 'وقت بدء غير صالح.' };
  const err = checkInput(next);
  if (err) return { ok: false, error: err };
  if (dayMinutes(sessions, next.date, id) + next.minutes > MAX_DAY_MINS) {
    return { ok: false, error: 'مجموع هذا اليوم سيتجاوز 24 ساعة.' };
  }
  return { ok: true, sessions: sessions.map((s) => (s.id === id ? next : s)), session: next };
}

/** @param {Session[]} sessions @param {string} id @returns {{ ok: false, error: string } | { ok: true, sessions: Session[] }} */
export function removeSession(sessions, id) {
  if (!sessions.some((s) => s.id === id)) return { ok: false, error: 'الجلسة غير موجودة.' };
  return { ok: true, sessions: sessions.filter((s) => s.id !== id) };
}

/** @param {Session[]} sessions @param {string} date @returns {Session[]} */
export function sessionsForDate(sessions, date) {
  return sessions
    .filter((s) => s.date === date)
    .sort((a, b) => {
      if (a.period !== b.period) return a.period === 'morning' ? -1 : 1;
      return (a.startedAt ?? a.createdAt ?? 0) - (b.startedAt ?? b.createdAt ?? 0);
    });
}

// فهرس: تاريخ → { morningMins, eveningMins, totalMins, count } (للأيام التي فيها جلسات فقط)
/** @param {Session[]} sessions @returns {DayIndex} */
export function buildDayIndex(sessions) {
  /** @type {DayIndex} */
  const index = {};
  for (const s of sessions) {
    const day = index[s.date] || (index[s.date] = { morningMins: 0, eveningMins: 0, totalMins: 0, count: 0 });
    if (s.period === 'morning') day.morningMins += s.minutes;
    else day.eveningMins += s.minutes;
    day.totalMins += s.minutes;
    day.count += 1;
  }
  return index;
}

/** @param {DayIndex} index @param {string} date @returns {DayTotals} */
export function dayTotals(index, date) {
  return index[date] || { morningMins: 0, eveningMins: 0, totalMins: 0, count: 0 };
}
