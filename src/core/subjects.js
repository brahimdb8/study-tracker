// @ts-check
// المواد الدراسية: subject = { id, name, color, archived }
// الجلسة تشير إلى المادة بـ id. المادة التي عليها جلسات لا تُحذف بل تُؤرشف.
import { MAX_SUBJECTS, MAX_SUBJECT_NAME } from './constants.js';
import { newId } from './sessions.js';

/** @typedef {import('./types.js').Subject} Subject */
/** @typedef {import('./types.js').Session} Session */

export const SUBJECT_COLORS = ['#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c'];

/** @param {unknown} name */
function cleanName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * @param {Subject[]} subjects
 * @param {string} name
 * @param {string|null} [exceptId]
 */
function nameTaken(subjects, name, exceptId = null) {
  const key = name.toLocaleLowerCase();
  return subjects.some((s) => s.id !== exceptId && s.name.toLocaleLowerCase() === key);
}

/**
 * @param {Subject[]} subjects
 * @param {string} name
 * @param {string|null} [exceptId]
 */
function checkName(subjects, name, exceptId = null) {
  if (name.length < 1) return 'اكتب اسم المادة.';
  if (name.length > MAX_SUBJECT_NAME) return `اسم المادة أطول من ${MAX_SUBJECT_NAME} حرفاً.`;
  if (nameTaken(subjects, name, exceptId)) return 'يوجد مادة بهذا الاسم.';
  return null;
}

/** @param {Record<string, any>|null|undefined} s كائن خام غير موثوق */
export function isValidSubject(s) {
  return !!s
    && typeof s === 'object'
    && typeof s.id === 'string' && s.id.length > 0
    && typeof s.name === 'string' && cleanName(s.name).length >= 1 && cleanName(s.name).length <= MAX_SUBJECT_NAME;
}

/**
 * @param {Subject[]} subjects
 * @param {{ name?: unknown, color?: string }} [input]
 */
export function addSubject(subjects, { name, color } = {}) {
  const clean = cleanName(name);
  if (subjects.length >= MAX_SUBJECTS) return { ok: false, error: `الحد الأقصى ${MAX_SUBJECTS} مادة.` };
  const err = checkName(subjects, clean);
  if (err) return { ok: false, error: err };
  /** @type {Subject} */
  const subject = {
    id: newId(),
    name: clean,
    color: SUBJECT_COLORS.includes(/** @type {string} */ (color)) ? /** @type {string} */ (color) : SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length],
    archived: false,
  };
  return { ok: true, subjects: [...subjects, subject], subject };
}

/**
 * @param {Subject[]} subjects
 * @param {string} id
 * @param {{ name?: unknown, color?: string, archived?: unknown }} patch
 */
export function updateSubject(subjects, id, patch) {
  const current = subjects.find((s) => s.id === id);
  if (!current) return { ok: false, error: 'المادة غير موجودة.' };
  const name = patch.name !== undefined ? cleanName(patch.name) : current.name;
  if (patch.name !== undefined) {
    const err = checkName(subjects, name, id);
    if (err) return { ok: false, error: err };
  }
  const color = patch.color !== undefined && SUBJECT_COLORS.includes(patch.color) ? patch.color : current.color;
  const archived = patch.archived !== undefined ? !!patch.archived : current.archived;
  const next = { ...current, name, color, archived };
  return { ok: true, subjects: subjects.map((s) => (s.id === id ? next : s)), subject: next };
}

/**
 * @param {Session[]} sessions
 * @param {string} id
 */
export function subjectUsage(sessions, id) {
  let count = 0;
  let minutes = 0;
  for (const s of sessions) {
    if (s.subject === id) { count++; minutes += s.minutes; }
  }
  return { count, minutes };
}

// الحذف مسموح فقط لمادة لا جلسات عليها
/**
 * @param {Subject[]} subjects
 * @param {Session[]} sessions
 * @param {string} id
 */
export function removeSubject(subjects, sessions, id) {
  if (!subjects.some((s) => s.id === id)) return { ok: false, error: 'المادة غير موجودة.' };
  if (subjectUsage(sessions, id).count > 0) {
    return { ok: false, error: 'عليها جلسات مسجّلة؛ يمكنك أرشفتها بدل حذفها.' };
  }
  return { ok: true, subjects: subjects.filter((s) => s.id !== id) };
}

/** @param {Subject[]} subjects */
export function activeSubjects(subjects) {
  return subjects.filter((s) => !s.archived);
}

/**
 * @param {Subject[]} subjects
 * @param {string} id
 */
export function subjectById(subjects, id) {
  return subjects.find((s) => s.id === id) || null;
}

// تنظيف عند التحميل/الاستيراد: يسقط التالف ويعيد عدده
/** @param {unknown} raw مدخل خام غير موثوق */
export function sanitizeSubjects(raw) {
  const src = Array.isArray(raw) ? raw : [];
  /** @type {Set<string>} */
  const seenIds = new Set();
  /** @type {Set<string>} */
  const seenNames = new Set();
  /** @type {Subject[]} */
  const list = [];
  let dropped = 0;
  for (const s of src) {
    if (!isValidSubject(s) || seenIds.has(s.id)) { dropped++; continue; }
    const name = cleanName(s.name);
    const key = name.toLocaleLowerCase();
    if (seenNames.has(key) || list.length >= MAX_SUBJECTS) { dropped++; continue; }
    seenIds.add(s.id);
    seenNames.add(key);
    list.push({
      id: s.id,
      name,
      color: SUBJECT_COLORS.includes(s.color) ? s.color : SUBJECT_COLORS[list.length % SUBJECT_COLORS.length],
      archived: !!s.archived,
    });
  }
  return { list, dropped };
}
