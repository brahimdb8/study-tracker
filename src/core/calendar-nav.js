// @ts-check
// تنقل لوحة المفاتيح في تقويم الشهر — دالة نقية بلا DOM.
// الشبكة RTL: عمود الأحد يميناً، فالسهم الأيسر = اليوم التالي والأيمن = السابق.
import { addDays, daysInMonth, formatDate, parseDate, shiftMonth } from './dates.js';

export const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * @param {string} dateStr
 * @param {number} offset
 * @returns {string}
 */
function addMonths(dateStr, offset) {
  const d = parseDate(dateStr);
  const { year, month } = shiftMonth({ year: d.getFullYear(), month: d.getMonth() }, offset);
  return formatDate(new Date(year, month, Math.min(d.getDate(), daysInMonth(year, month))));
}

/**
 * التاريخ الذي يجب نقل التركيز إليه، أو null إن لم يكن هناك حركة.
 * - الأسهم: يوم/أسبوع. Home/End: بداية الأسبوع (الأحد) ونهايته (السبت).
 * - PageUp/PageDown: شهر سابق/تالٍ (مع Shift: سنة)، مع تقصير اليوم لطول الشهر (31 يناير → 28 فبراير).
 * - لا تنقل إلى المستقبل (يُقصَّر على اليوم)، ولا إلى ما قبل min إن وُجد.
 * @param {string} dateStr
 * @param {string} key
 * @param {{ today: string, shift?: boolean, min?: string|null }} opts
 * @returns {string|null}
 */
export function navigateDate(dateStr, key, { today, shift = false, min = null }) {
  if (!NAV_KEYS.has(key)) return null;
  const dow = parseDate(dateStr).getDay(); // 0 = الأحد
  let target;
  switch (key) {
    case 'ArrowLeft': target = addDays(dateStr, 1); break;
    case 'ArrowRight': target = addDays(dateStr, -1); break;
    case 'ArrowDown': target = addDays(dateStr, 7); break;
    case 'ArrowUp': target = addDays(dateStr, -7); break;
    case 'Home': target = addDays(dateStr, -dow); break;
    case 'End': target = addDays(dateStr, 6 - dow); break;
    case 'PageUp': target = addMonths(dateStr, shift ? -12 : -1); break;
    default: target = addMonths(dateStr, shift ? 12 : 1); break;
  }
  if (target > today) target = today;
  if (min && target < min) target = min;
  return target === dateStr ? null : target;
}
