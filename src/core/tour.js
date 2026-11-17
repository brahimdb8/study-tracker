// @ts-check
// الجولة التعريفية: محتوى الخطوات وقواعد التنقل — نقية بلا DOM. الأرقام تُقرأ من ثوابت المشروع فلا تتقادم.
import { BADGES } from './badge-defs.js';
import { DEFAULT_TIMER_SETTINGS } from './constants.js';
import {
  LEVEL_TITLES, MAX_LEVEL, XP_DONE_DAY, XP_PER_BADGE, XP_PER_MINUTES,
} from './levels.js';

/** @typedef {{ id: string, art: string, title: string, body: string, subjects?: boolean }} TourStep */

/** @returns {TourStep[]} */
export function buildTourSteps() {
  const total = 7;
  return [
    {
      id: 'welcome', art: 'welcome', title: 'مرحباً بك في متتبع المذاكرة 👋',
      body: `تسجّل جلساتك بالمؤقت أو يدوياً، فيحسب لك أهدافك وسلسلة أيامك وتحليلاتك ونقاطك. بياناتك تبقى في متصفحك فقط. هذه جولة قصيرة من ${total} خطوات.`,
    },
    {
      id: 'plan', art: 'plan', title: 'موادك وخطتك الأسبوعية', subjects: true,
      body: 'أضف موادك لتنسب كل جلسة إلى مادتها. الخطة الأسبوعية تحدد هدف كل يوم (صباحاً ومساءً)، وتعدّلها من الإعدادات في أي وقت. اختر موادك الآن إن شئت:',
    },
    {
      id: 'timer', art: 'timer', title: 'المؤقت (بومودورو)',
      body: `ابدأ جلسة تركيز (افتراضياً ${DEFAULT_TIMER_SETTINGS.focusMins} دقيقة) تتبعها استراحة قصيرة، وبعد ${DEFAULT_TIMER_SETTINGS.longEvery} جلسات استراحة طويلة. «إنهاء وحفظ» يسجّل الدقائق المنقضية. المدد والصوت والإشعارات من الإعدادات، والمفتاح T يبدأ المؤقت أو يوقفه.`,
    },
    {
      id: 'calendar', art: 'calendar', title: 'التقويم وحالات الأيام',
      body: 'لكل يوم لون ورمز: ✓ مكتمل، ≈ معوَّض من فائض الأسبوع، ✕ غير مكتمل، ❄ مجمَّد تلقائياً لحماية سلسلتك، ☾ استثنائي (مرض أو إجازة). اضغط أي يوم لتضيف جلسة أو تجعله استثنائياً.',
    },
    {
      id: 'levels', art: 'levels', title: 'النقاط والمستويات والأوسمة',
      body: `تكسب نقطة لكل ${XP_PER_MINUTES} دقائق مذاكرة، و${XP_DONE_DAY} نقطة لكل يوم مكتمل، و${XP_PER_BADGE} لكل وسام تفتحه. تصعد عبر ${MAX_LEVEL} مستوى من «${LEVEL_TITLES[0]}» إلى «${LEVEL_TITLES[LEVEL_TITLES.length - 1]}»، وتجمع ${BADGES.length} وساماً في 5 فئات. الأوسمة تُحسب من سجل جلساتك الحقيقي: إن حذفت الجلسة التي منحتك وساماً سُحب منك تلقائياً.`,
    },
    {
      id: 'share', art: 'share', title: 'العد التنازلي وبطاقة الإنجاز',
      body: 'أضف امتحاناتك من الإعدادات فيظهر العد التنازلي في الرئيسية. ومن صفحة التحليلات تصنع بطاقة إنجازاتك الأسبوعية أو الشهرية كصورة تشاركها، وأسماء موادك مخفية فيها افتراضياً.',
    },
    {
      id: 'settings', art: 'settings', title: 'الإعدادات لتخصيص الموقع',
      body: 'من الإعدادات تضبط الخطة والمواد وتجميد السلسلة والمؤقت والامتحانات، وتختار الثيم الفاتح أو الداكن، وتعطّل الحركة، وتنسخ بياناتك احتياطياً. وتستطيع إعادة هذه الجولة من هناك متى شئت.',
    },
  ];
}

/** الخطوة التالية/السابقة بحدود ثابتة. */
/** @param {number} i @param {number} n */
export const tourNext = (i, n) => Math.min(n - 1, i + 1);
/** @param {number} i */
export const tourPrev = (i) => Math.max(0, i - 1);

/**
 * ماذا يعني هذا المفتاح؟ الواجهة عربية (RTL): السهم الأيسر = التالي، الأيمن = السابق.
 * @param {string} code e.code أو e.key
 * @returns {'next'|'prev'|'close'|null}
 */
export function tourKeyAction(code) {
  if (code === 'ArrowLeft') return 'next';
  if (code === 'ArrowRight') return 'prev';
  if (code === 'Escape') return 'close';
  return null;
}
