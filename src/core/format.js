// @ts-check
// تنسيق الدقائق للعرض: 0د / 45د / 2س / 1س 30د
/** @param {number} mins */
export function formatMins(mins) {
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}د`;
  return m === 0 ? `${h}س` : `${h}س ${m}د`;
}

// ساعات عشرية للعرض في البطاقات
/** @param {number} mins @param {number} [digits] */
export function minsToHoursText(mins, digits = 1) {
  return (Math.max(0, mins) / 60).toFixed(digits);
}
