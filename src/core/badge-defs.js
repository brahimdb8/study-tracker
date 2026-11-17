// @ts-check
// كتالوج الأوسمة (32 وساماً في 5 فئات) كبيانات نقية. المحرك في achievements.js.
// معرّفات الأوسمة القديمة (المرحلة 6) محفوظة كما هي كي لا يضيع وسام مفتوح؛ الأيقونة مفتاح في ui/badge-icons.js.

/**
 * @typedef {'start'|'streak'|'hours'|'habit'|'commit'} BadgeCat
 * @typedef {{ id: string, cat: BadgeCat, icon: string, title: string, desc: string, target: number, unit: string }} BadgeDef
 */

export const CATEGORY_LABEL = {
  start: 'البدايات والانطلاقة',
  streak: 'السلاسل',
  hours: 'الساعات التراكمية',
  habit: 'العادات والأوقات',
  commit: 'الالتزام وتنوع المواد',
};
export const CATEGORY_ORDER = /** @type {BadgeCat[]} */ (['start', 'streak', 'hours', 'habit', 'commit']);

// ---- العتبات (تشاركها المحركات والاختبارات) ----
export const STREAK_STEPS = [3, 7, 14, 30, 60, 100, 180, 365];
export const HOURS_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2000];
export const MORNING_STEPS = [5, 15];
export const NIGHT_RUN_TARGET = 5;
export const WEEK_SUBJECTS_TARGET = 3;
export const MONTH_RATE_PCT = 90;
export const MONTH_MIN_DAYS = 10;
export const WEEK_MIN_DAYS = 3;
export const MIN_ACTIVE_SUBJECTS_FOR_MONTH = 2;
export const POMODORO_COUNT_TARGET = 5;
export const POMODORO_MIN_MINS = 15;     // جلسة مؤقت تُحتسب إن بلغت 15 دقيقة
export const PRECISE_COUNT_TARGET = 4;
export const PRECISE_MIN_MINS = 20;      // «دقة الساعة»: 4 جلسات مؤقت في يوم، كل منها ≥ 20 دقيقة
export const FIRST_WEEK_DAYS = 4;
export const MARATHON_MINS = 360;
export const GOLDEN_WEEK_HOURS = 25;
export const WEEKEND_SAT_SUN = [5, 6];   // موضعا السبت والأحد في أسبوع (إثنين=0 … أحد=6)

/**
 * @param {number} n
 */
const days = (n) => `${n} ${n >= 11 ? 'يوماً' : 'أيام'}`;
/**
 * @param {number} n
 */
const hoursText = (n) => `${n} ${n <= 10 ? 'ساعات' : 'ساعة'}`;

/** @type {BadgeDef[]} */
export const BADGES = [
  // ---- البدايات والانطلاقة ----
  { id: 'first-session', cat: 'start', icon: 'sprout', title: 'البذرة الأولى', desc: 'سجّل جلسة مذاكرتك الأولى.', target: 1, unit: 'جلسة' },
  { id: 'first-day', cat: 'start', icon: 'flag', title: 'أول يوم مكتمل', desc: 'أتمّ هدف يوم كاملاً لأول مرة.', target: 1, unit: 'يوم' },
  { id: 'pomodoro-5', cat: 'start', icon: 'tomato', title: 'خمس جولات تركيز', desc: `أنهِ ${POMODORO_COUNT_TARGET} جلسات بالمؤقت، كل منها ${POMODORO_MIN_MINS} دقيقة فأكثر.`, target: POMODORO_COUNT_TARGET, unit: 'جلسات' },
  { id: 'first-week', cat: 'start', icon: 'calendar-star', title: 'أسبوع نشط', desc: `ادرس في ${FIRST_WEEK_DAYS} أيام مختلفة خلال أسبوع واحد (إثنين → أحد).`, target: FIRST_WEEK_DAYS, unit: 'أيام' },

  // ---- السلاسل ----
  ...[['flame', 3], ['flame-sparks', 7], ['flame-twin', 14], ['flame-ring', 30], ['torch', 60], ['crown', 100], ['shield-flame', 180], ['sun', 365]].map(([icon, n]) => ({
    id: `streak-${n}`, cat: /** @type {BadgeCat} */ ('streak'), icon: String(icon),
    title: n === 365 ? 'وسام السنة الكاملة' : `سلسلة ${days(Number(n))}`,
    desc: n === 365 ? 'حافظ على سلسلتك 365 يوماً متتالية دون انقطاع.' : `أكمل أهدافك ${days(Number(n))} متتالية بلا انقطاع.`,
    target: Number(n), unit: 'يوم',
  })),

  // ---- الساعات التراكمية ----
  ...[['hourglass', 10], ['clock', 25], ['book', 50], ['medal', 100], ['rocket', 250], ['diamond', 500], ['star', 1000], ['star-orbit', 2000]].map(([icon, n]) => ({
    id: `hours-${n}`, cat: /** @type {BadgeCat} */ ('hours'), icon: String(icon),
    title: n === 2000 ? 'وسام الأساطير' : `${hoursText(Number(n))} مذاكرة`,
    desc: `اجمع ${hoursText(Number(n))} من المذاكرة في مجموع جلساتك.`,
    target: Number(n), unit: 'ساعة',
  })),

  // ---- العادات والأوقات ----
  { id: 'habit-morning', cat: 'habit', icon: 'sunrise', title: 'بطل الصباح', desc: 'حقّق هدف الصباح 5 أيام متتالية.', target: 5, unit: 'أيام' },
  { id: 'habit-morning-15', cat: 'habit', icon: 'sunrise-hill', title: 'فارس الفجر', desc: 'حقّق هدف الصباح 15 يوماً متتالية.', target: 15, unit: 'يوماً' },
  { id: 'habit-night', cat: 'habit', icon: 'moon', title: 'ساهر الليل', desc: `حقّق هدف المساء ${NIGHT_RUN_TARGET} أيام متتالية.`, target: NIGHT_RUN_TARGET, unit: 'أيام' },
  { id: 'habit-marathon', cat: 'habit', icon: 'mountain', title: 'ماراثون اليوم الواحد', desc: `ادرس ${MARATHON_MINS / 60} ساعات أو أكثر في يوم واحد.`, target: MARATHON_MINS, unit: 'دقيقة' },
  { id: 'habit-holiday', cat: 'habit', icon: 'umbrella', title: 'عطلة نشطة', desc: 'أكمل هدف السبت والأحد معاً في عطلة نهاية الأسبوع نفسها.', target: 2, unit: 'يوم' },
  { id: 'habit-precise', cat: 'habit', icon: 'stopwatch', title: 'دقة الساعة', desc: `${PRECISE_COUNT_TARGET} جلسات مؤقت في يوم واحد، كل منها ${PRECISE_MIN_MINS} دقيقة فأكثر.`, target: PRECISE_COUNT_TARGET, unit: 'جلسات' },
  { id: 'habit-golden-week', cat: 'habit', icon: 'bolt', title: 'أسبوع ذهبي', desc: `اجمع ${GOLDEN_WEEK_HOURS} ساعة مذاكرة في أسبوع واحد (إثنين → أحد).`, target: GOLDEN_WEEK_HOURS, unit: 'ساعة' },

  // ---- الالتزام وتنوع المواد ----
  { id: 'variety-week', cat: 'commit', icon: 'venn', title: 'أسبوع متنوع', desc: `ادرس ${WEEK_SUBJECTS_TARGET} مواد مختلفة في أسبوع واحد (إثنين → أحد).`, target: WEEK_SUBJECTS_TARGET, unit: 'مواد' },
  { id: 'variety-month', cat: 'commit', icon: 'rainbow', title: 'شهر شامل', desc: 'ادرس كل موادك النشطة (مادتان على الأقل) في شهر تقويمي واحد.', target: MIN_ACTIVE_SUBJECTS_FOR_MONTH, unit: 'مواد' },
  { id: 'habit-week', cat: 'commit', icon: 'seal-check', title: 'أسبوع مثالي', desc: `أكمل 100% من الأيام المستهدفة في أسبوع منتهٍ (${WEEK_MIN_DAYS} أيام مستهدفة على الأقل).`, target: WEEK_MIN_DAYS, unit: 'أيام' },
  { id: 'habit-month', cat: 'commit', icon: 'calendar-check', title: 'شهر منتظم', desc: `أكمل ${MONTH_RATE_PCT}% أو أكثر من أيام شهر منتهٍ (${MONTH_MIN_DAYS} أيام مستهدفة على الأقل).`, target: MONTH_RATE_PCT, unit: '%' },
  { id: 'habit-iron-month', cat: 'commit', icon: 'dumbbell', title: 'شهر حديدي', desc: `أكمل كل الأيام المستهدفة في شهر منتهٍ بلا يوم ناقص (${MONTH_MIN_DAYS} أيام مستهدفة على الأقل).`, target: 100, unit: '%' },
];

export const BADGE_IDS = new Set(BADGES.map((b) => b.id));
/**
 * @param {string} id
 * @returns {BadgeDef|null}
 */
export const badgeById = (id) => BADGES.find((b) => b.id === id) || null;
