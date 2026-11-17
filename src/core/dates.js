// @ts-check
// أدوات التواريخ — كل التواريخ نصوص "YYYY-MM-DD" بالتوقيت المحلي

export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
// الفهرس = Date.getDay() (0 = الأحد)
export const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
// ترتيب عرض الأسبوع: من الإثنين إلى الأحد
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {unknown} str
 * @returns {boolean}
 */
export function isValidDateStr(str) {
  if (typeof str !== 'string') return false;
  const m = DATE_RE.exec(str);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

// تحليل بالتوقيت المحلي (new Date("YYYY-MM-DD") يفسَّر UTC ويسبب انزياح يوم)
/**
 * @param {string} str
 * @returns {Date}
 */
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * @param {Date} dateObj
 * @returns {string}
 */
export function formatDate(dateObj) {
  const y = String(dateObj.getFullYear()).padStart(4, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {Date} [now]
 * @returns {string}
 */
export function todayStr(now = new Date()) {
  return formatDate(now);
}

/**
 * @param {string} dateStr
 */
export function monthKeyOf(dateStr) {
  return dateStr.slice(0, 7);
}

/**
 * @param {string} dateStr
 * @param {number} n
 * @returns {string}
 */
export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

// عدد الأيام بين تاريخين (b - a)، آمن مع تغيّر التوقيت الصيفي
/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function diffDays(a, b) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

// يستدعي fn لكل تاريخ من from إلى to شاملاً
/**
 * @param {string} from
 * @param {string} to
 * @param {(date: string) => void} fn
 */
export function eachDate(from, to, fn) {
  const d = parseDate(from);
  const end = parseDate(to);
  while (d <= end) {
    fn(formatDate(d));
    d.setDate(d.getDate() + 1);
  }
}

/**
 * @param {string} dateStr
 * @returns {number}
 */
export function dayOfWeek(dateStr) {
  return parseDate(dateStr).getDay();
}

// أيام الأسبوع (إثنين → أحد) الذي يقع فيه التاريخ
/**
 * @param {string} dateStr
 * @returns {string[]}
 */
export function weekDays(dateStr) {
  const distanceToMonday = (dayOfWeek(dateStr) + 6) % 7;
  const monday = addDays(dateStr, -distanceToMonday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// أول إثنين يأتي بعد التاريخ (دائماً بعده تماماً، حتى لو كان إثنين)
/**
 * @param {string} dateStr
 * @returns {string}
 */
export function nextWeekStart(dateStr) {
  const distanceToMonday = (dayOfWeek(dateStr) + 6) % 7;
  return addDays(dateStr, 7 - distanceToMonday);
}

/**
 * @param {number} year
 * @param {number} month0
 * @returns {number}
 */
export function daysInMonth(year, month0) {
  return new Date(year, month0 + 1, 0).getDate();
}

// تنقل بين الأشهر بلا أخطاء "31 → شهر قصير"
/**
 * @param {{ year: number, month: number }} ym
 * @param {number} offset
 * @returns {{ year: number, month: number }}
 */
export function shiftMonth({ year, month }, offset) {
  const d = new Date(year, month + offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
