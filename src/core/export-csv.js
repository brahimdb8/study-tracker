// @ts-check
// تصدير CSV — منطق نقي بلا DOM.
// - UTF-8 مع BOM كي يقرأ Excel العربية. الأسطر CRLF (RFC 4180) والاقتباس عند الحاجة فقط.
// - الفاصل قابل للاختيار (; لإعدادات Excel بالعربية/الفرنسية، و, للمعيار وGoogle Sheets).
// - حماية من حقن الصيغ: الملاحظات وأسماء المواد بيانات غير موثوقة، فأي خلية نصية تبدأ بـ = + - @
//   (أو tab/CR) تُسبَق بفاصلة علوية ' فلا تُنفَّذ كصيغة في Excel/Sheets.
// - لا أعمدة عشرية عمداً (فاصل الكسور يختلف بين اللغات): الدقائق والنسب أعداد صحيحة.
/** @typedef {import('./types.js').Session} Session */
/** @typedef {import('./types.js').State} State */
import { createContext } from './context.js';
import { DAYS_AR, eachDate, isValidDateStr, parseDate } from './dates.js';
import { targetsForDate } from './plan.js';
import { dayTotals } from './sessions.js';
import { evaluateDay } from './status.js';

export const CSV_BOM = '﻿';
export const DELIMITERS = [';', ','];

/** @type {Record<string, string>} */
export const PERIOD_AR = { morning: 'صباحاً', evening: 'مساءً' };
/** @type {Record<string, string>} */
export const SOURCE_AR = { timer: 'مؤقت', manual: 'يدوي', migrated: 'مُرحَّل' };
/** @type {Record<string, string>} */
export const QUALITY_AR = { excellent: 'ممتاز', good: 'جيد', average: 'متوسط', poor: 'ضعيف' };
/** @type {Record<string, string>} */
export const STATUS_AR = {
  completed: 'مكتمل', compensated: 'معوّض', failed: 'غير مكتمل', frozen: 'مجمّد', excused: 'يوم استثنائي',
  rest: 'يوم راحة', default: 'بدون حكم', future: 'مستقبل',
};

// تحوي الحروف غير المرئية (LRM/RLM/BOM) عمداً لاكتشاف حقن الصيغ
// eslint-disable-next-line no-irregular-whitespace
const FORMULA_START = /^[\t\r\s‎‏﻿]*[=+\-@]|^[\t\r]/;

/**
 * خلية CSV واحدة: تحييد الصيغ ثم الاقتباس عند الحاجة.
 * @param {unknown} value
 * @param {string} [delimiter]
 */
export function csvCell(value, delimiter = ';') {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * @param {unknown[][]} rows
 * @param {string} [delimiter]
 */
export function toCsv(rows, delimiter = ';') {
  const d = DELIMITERS.includes(delimiter) ? delimiter : ';';
  return CSV_BOM + rows.map((r) => r.map((c) => csvCell(c, d)).join(d)).join('\r\n') + '\r\n';
}

/**
 * يحسم نطاق التصدير: month | all | custom → { from, to } أو { error }
 * @param {string} kind
 * @param {{ today: string, sessions?: Session[], trackingStart?: string|null, from?: string, to?: string }} opts
 * @returns {{ from: string, to: string } | { error: string }}
 */
export function resolveExportRange(kind, { today, sessions = [], trackingStart = null, from = '', to = '' }) {
  if (kind === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  if (kind === 'all') {
    const dates = sessions.map((s) => s.date).sort();
    const start = dates[0] || trackingStart || today;
    return { from: start < today ? start : today, to: today };
  }
  if (kind === 'custom') {
    if (!isValidDateStr(from) || !isValidDateStr(to)) return { error: 'اختر تاريخ بداية ونهاية صالحين.' };
    if (from > to) return { error: 'تاريخ البداية بعد تاريخ النهاية.' };
    return { from, to };
  }
  return { error: 'نطاق غير معروف.' };
}

/**
 * @param {string} date
 * @param {string} from
 * @param {string} to
 */
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);
/** @param {number} ms */
const hhmm = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** @param {Session[]} sessions */
export function sortedSessions(sessions) {
  return [...sessions].sort((a, b) => (
    a.date.localeCompare(b.date)
    || (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity)
    || a.createdAt - b.createdAt
    || a.id.localeCompare(b.id)
  ));
}

/**
 * CSV الجلسات: صف لكل جلسة ضمن النطاق.
 * @param {State} state
 * @param {{ from?: string, to?: string, delimiter?: string }} [opts]
 */
export function sessionsToCsv(state, { from = '', to = '', delimiter = ';' } = {}) {
  const names = new Map(state.subjects.map((s) => [s.id, s.name]));
  /** @type {(string|number)[][]} */
  const rows = [['التاريخ', 'اليوم', 'وقت البدء', 'الفترة', 'الدقائق', 'المادة', 'المصدر', 'الملاحظة', 'جودة اليوم']];
  for (const s of sortedSessions(state.sessions)) {
    if (!inRange(s.date, from, to)) continue;
    const quality = state.dayMeta[s.date] && state.dayMeta[s.date].quality;
    rows.push([
      s.date,
      DAYS_AR[parseDate(s.date).getDay()],
      s.startedAt ? hhmm(s.startedAt) : '',
      PERIOD_AR[s.period] || '',
      s.minutes,
      (s.subject && names.get(s.subject)) || '',
      SOURCE_AR[s.source] || '',
      s.note || '',
      QUALITY_AR[quality] || '',
    ]);
  }
  return toCsv(rows, delimiter);
}

/**
 * CSV الملخص اليومي: صف لكل يوم في النطاق (حتى اليوم) بحالته وهدفه ومجموعه.
 * @param {State} state
 * @param {{ from: string, to: string, today: string, delimiter?: string }} opts
 */
export function dailySummaryToCsv(state, { from, to, today, delimiter = ';' }) {
  const ctx = createContext(state, today);
  /** @type {(string|number)[][]} */
  const rows = [['التاريخ', 'اليوم', 'الدقائق', 'هدف اليوم (دقائق)', 'النسبة %', 'الحالة', 'عدد الجلسات', 'جودة اليوم']];
  const last = to > today ? today : to;
  if (from <= last) {
    eachDate(from, last, (date) => {
      const totals = dayTotals(ctx.index, date);
      const target = targetsForDate(ctx.plan, date).totalMins;
      const quality = state.dayMeta[date] && state.dayMeta[date].quality;
      const count = state.sessions.reduce((n, s) => n + (s.date === date ? 1 : 0), 0);
      rows.push([
        date,
        DAYS_AR[parseDate(date).getDay()],
        totals.totalMins,
        target,
        target > 0 ? Math.round((totals.totalMins / target) * 100) : '',
        STATUS_AR[evaluateDay(date, ctx)] || '',
        count,
        QUALITY_AR[quality] || '',
      ]);
    });
  }
  return toCsv(rows, delimiter);
}

/**
 * @param {string} kind
 * @param {string} from
 * @param {string} to
 */
export function exportFileName(kind, from, to) {
  return `study-${kind}-${from}_${to}.csv`;
}

