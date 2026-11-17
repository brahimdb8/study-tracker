// @ts-check
// الامتحانات القادمة (للعد التنازلي في الرئيسية): exam = { id, name, date }
// نقي بلا DOM. اليوم يُحقن.
import { MAX_EXAMS, MAX_EXAM_NAME } from './constants.js';
import { diffDays, isValidDateStr } from './dates.js';
import { newId } from './sessions.js';

/** @typedef {import('./types.js').Exam} Exam */

/** @param {unknown} name */
const cleanName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

/** @param {Record<string, any>|null|undefined} e كائن خام غير موثوق */
export function isValidExam(e) {
  return !!e && typeof e === 'object'
    && typeof e.id === 'string' && e.id.length > 0
    && typeof e.name === 'string' && cleanName(e.name).length >= 1 && cleanName(e.name).length <= MAX_EXAM_NAME
    && isValidDateStr(e.date);
}

/**
 * @param {Exam[]} exams
 * @param {{ name?: string, date?: string }} input
 */
export function addExam(exams, input = {}) {
  const name = cleanName(input.name);
  if (name.length < 1) return { ok: false, error: 'اكتب اسم الامتحان.' };
  if (name.length > MAX_EXAM_NAME) return { ok: false, error: `اسم الامتحان أطول من ${MAX_EXAM_NAME} حرفاً.` };
  if (!isValidDateStr(input.date ?? '')) return { ok: false, error: 'اختر تاريخ الامتحان.' };
  if (exams.length >= MAX_EXAMS) return { ok: false, error: `الحد الأقصى ${MAX_EXAMS} امتحاناً.` };
  /** @type {Exam} */
  const exam = { id: newId(), name, date: /** @type {string} */ (input.date) };
  return { ok: true, exams: [...exams, exam], exam };
}

/**
 * @param {Exam[]} exams
 * @param {string} id
 */
export function removeExam(exams, id) {
  if (!exams.some((e) => e.id === id)) return { ok: false, error: 'الامتحان غير موجود.' };
  return { ok: true, exams: exams.filter((e) => e.id !== id) };
}

/**
 * الأيام المتبقية حتى الامتحان (0 = اليوم، سالب = فات).
 * @param {string} today
 * @param {string} date
 */
export function daysUntil(today, date) {
  return diffDays(today, date);
}

/**
 * امتحانات اليوم وما بعده، الأقرب أولاً (ثم بالاسم لثبات الترتيب).
 * @param {Exam[]} exams
 * @param {string} today
 */
export function upcomingExams(exams, today) {
  return exams
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name, 'ar')))
    .map((e) => ({ ...e, days: daysUntil(today, e.date) }));
}

/**
 * نص العد التنازلي بصياغة عربية سليمة.
 * @param {number} days
 */
export function countdownLabel(days) {
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'غداً';
  if (days === 2) return 'بعد يومين';
  if (days <= 10) return `بعد ${days} أيام`;
  return `بعد ${days} يوماً`;
}

/** @param {unknown} raw مدخل خام غير موثوق */
export function sanitizeExams(raw) {
  const src = Array.isArray(raw) ? raw : [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Exam[]} */
  const list = [];
  let dropped = Array.isArray(raw) || raw === undefined || raw === null ? 0 : 1;
  for (const e of src) {
    if (!isValidExam(e) || seen.has(e.id) || list.length >= MAX_EXAMS) { dropped++; continue; }
    seen.add(e.id);
    list.push({ id: e.id, name: cleanName(e.name), date: e.date });
  }
  return { list, dropped };
}
