// @ts-check
// بوابة تحليلات الزوّار الاختيارية: منطق نقي. لا تُحمَّل أي أداة إلا إذا اجتمعت كل الشروط.
export const VISITOR_STATS_KEY = 'studyTracker:analytics';

/**
 * تفضيل الزائر المحفوظ على جهازه: 'off' = رفض. أي قيمة أخرى = غير مرفوض.
 * @param {unknown} stored
 * @returns {boolean} true إن كان الزائر قد رفض
 */
export function isOptedOut(stored) {
  return stored === 'off';
}

/**
 * @param {{ token?: unknown, doNotTrack?: unknown, optedOut?: boolean, online?: boolean }} ctx
 * @returns {boolean}
 */
export function shouldLoadVisitorStats({ token, doNotTrack, optedOut = false, online = true }) {
  if (typeof token !== 'string' || token.trim().length < 8) return false; // لا مفتاح = لا تحليلات
  if (optedOut) return false;
  if (doNotTrack === '1' || doNotTrack === 'yes') return false; // احترام «عدم التتبع»
  if (!online) return false; // وضع الأوفلاين: لا طلبات خارجية
  return true;
}
