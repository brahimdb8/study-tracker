// @ts-check
// الأيام الاستثنائية (راحة / مرض / امتحان / إجازة): dayOff = { id, from, to, type, note }
// اليوم الاستثنائي لا يُحسب تقصيراً، ولا يدخل في أهداف الأسبوع والشهر، ولا يقطع السلسلة.
import { MAX_DAY_OFFS, MAX_DAY_OFF_NOTE, MAX_DAY_OFF_SPAN_DAYS } from './constants.js';
import { addDays, diffDays, eachDate, isValidDateStr } from './dates.js';
import { newId } from './sessions.js';

/** @typedef {import('./types.js').DayOff} DayOff */

/** @type {Record<string, string>} */
export const DAY_OFF_TYPES = { rest: 'راحة', sick: 'مرض', exam: 'امتحان', vacation: 'إجازة' };

/** @param {PropertyKey} t قيمة خام تُقارَن بمفاتيح الأنواع */
const hasType = (t) => Object.prototype.hasOwnProperty.call(DAY_OFF_TYPES, t);

/**
 * @param {Record<string, any>|null|undefined} d كائن خام غير موثوق
 * @returns {boolean}
 */
export function isValidDayOff(d) {
  return !!d
    && typeof d === 'object'
    && typeof d.id === 'string' && d.id.length > 0
    && isValidDateStr(d.from) && isValidDateStr(d.to)
    && d.from <= d.to
    && diffDays(d.from, d.to) < MAX_DAY_OFF_SPAN_DAYS
    && hasType(d.type);
}

/** @param {{ from: string, to: string, type: string }} input */
function checkInput({ from, to, type }) {
  if (!isValidDateStr(from) || !isValidDateStr(to)) return 'اختر تاريخي البداية والنهاية.';
  if (from > to) return 'تاريخ النهاية قبل البداية.';
  if (diffDays(from, to) >= MAX_DAY_OFF_SPAN_DAYS) return `المدى أطول من ${MAX_DAY_OFF_SPAN_DAYS} يوماً.`;
  if (!hasType(type)) return 'نوع غير صالح.';
  return null;
}

/**
 * @param {DayOff[]} dayOffs
 * @param {{ from: string, to: string, type: string, note?: unknown }} input
 */
export function addDayOff(dayOffs, input) {
  const err = checkInput(input);
  if (err) return { ok: false, error: err };
  if (dayOffs.length >= MAX_DAY_OFFS) return { ok: false, error: 'وصلت الحد الأقصى من الأيام الاستثنائية.' };
  /** @type {DayOff & { type: string }} */
  const entry = {
    id: newId(),
    from: input.from,
    to: input.to,
    type: input.type,
    note: String(input.note ?? '').trim().slice(0, MAX_DAY_OFF_NOTE),
  };
  return { ok: true, dayOffs: [...dayOffs, entry], dayOff: entry };
}

/**
 * @param {DayOff[]} dayOffs
 * @param {string} id
 */
export function removeDayOff(dayOffs, id) {
  if (!dayOffs.some((d) => d.id === id)) return { ok: false, error: 'العنصر غير موجود.' };
  return { ok: true, dayOffs: dayOffs.filter((d) => d.id !== id) };
}

// يزيل يوماً واحداً من أي مدى يحتويه (يقسم المدى عند الحاجة)
/**
 * @param {DayOff[]} dayOffs
 * @param {string} date
 */
export function removeDateFromDayOffs(dayOffs, date) {
  let changed = false;
  /** @type {DayOff[]} */
  const out = [];
  for (const d of dayOffs) {
    if (date < d.from || date > d.to) { out.push(d); continue; }
    changed = true;
    if (d.from === d.to) continue;
    if (date === d.from) out.push({ ...d, from: addDays(date, 1) });
    else if (date === d.to) out.push({ ...d, to: addDays(date, -1) });
    else {
      out.push({ ...d, to: addDays(date, -1) });
      out.push({ ...d, id: newId(), from: addDays(date, 1) });
    }
  }
  return changed ? { ok: true, dayOffs: out } : { ok: false, error: 'هذا اليوم غير مستثنى.' };
}

// فهرس: تاريخ → العنصر (الأقدم في القائمة يُفضَّل عند التداخل)
/** @param {DayOff[]|null|undefined} dayOffs */
export function buildDayOffIndex(dayOffs) {
  /** @type {Map<string, DayOff>} */
  const map = new Map();
  for (const d of dayOffs || []) {
    eachDate(d.from, d.to, (date) => { if (!map.has(date)) map.set(date, d); });
  }
  return map;
}

/** @param {unknown} raw مدخل خام غير موثوق */
export function sanitizeDayOffs(raw) {
  const src = Array.isArray(raw) ? raw : [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {(DayOff & { type: string })[]} */
  const list = [];
  let dropped = 0;
  for (const d of src) {
    if (!isValidDayOff(d) || seen.has(d.id) || list.length >= MAX_DAY_OFFS) { dropped++; continue; }
    seen.add(d.id);
    list.push({
      id: d.id,
      from: d.from,
      to: d.to,
      type: d.type,
      note: typeof d.note === 'string' ? d.note.slice(0, MAX_DAY_OFF_NOTE) : '',
    });
  }
  return { list, dropped };
}
