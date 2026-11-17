// @ts-check
// التحية حسب الساعة: صباح الهمة 5–11، ظهيرة العزم 12–16، مساء الإنجاز 17–21، سهرة التركيز 22–4.
import { DAYS_AR, MONTHS_AR } from './dates.js';


/** @param {number} hour 0..23 */
export function greetingForHour(hour) {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h <= 11) return { id: 'morning', text: 'صباح الهمة' };
  if (h >= 12 && h <= 16) return { id: 'noon', text: 'ظهيرة العزم' };
  if (h >= 17 && h <= 21) return { id: 'evening', text: 'مساء الإنجاز' };
  return { id: 'night', text: 'سهرة التركيز' };
}

/** تاريخ ميلادي واضح: «الأحد 15 نوفمبر 2026» (شهور المشروع نفسها). @param {string} date YYYY-MM-DD */
export function gregorianLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DAYS_AR[dow]} ${d} ${MONTHS_AR[m - 1]} ${y}`;
}
