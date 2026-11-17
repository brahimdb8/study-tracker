import { applyMotionPref, readMotionPref, writeMotionPref } from '../ui/celebrate.js';

/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);

// مفتاح «تعطيل الحركة»: تفضيل لكل جهاز (localStorage)، لا يدخل مخطط البيانات ولا يُزامَن.
export function initMotion() {
  const box = $('motion-off');
  box.checked = readMotionPref() === 'off';
  box.addEventListener('change', () => {
    const pref = box.checked ? 'off' : 'auto';
    writeMotionPref(pref);
    applyMotionPref(pref);
  });
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('motion-system-note').textContent = reduced
    ? 'نظامك مضبوط على «تقليل الحركة»، فالحركة معطّلة هنا بغض النظر عن هذا المفتاح.'
    : 'نظامك لا يطلب تقليل الحركة.';
}
