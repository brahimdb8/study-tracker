// أدوات SVG صغيرة: إنشاء عناصر، محاور بأرقام «لطيفة»، مسار أعمدة بطرف علوي مدوّر.
import { formatMins } from '../../core/format.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} name
 * @param {Record<string, any>} [attrs]
 * @param {any} [children] نص أو عقدة أو مصفوفة منهما
 * @returns {SVGElement}
 */
export function el(name, attrs = {}, children = []) {
  const node = /** @type {SVGElement} */ (document.createElementNS(NS, name));
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  for (const c of /** @type {any[]} */ ([]).concat(children)) {
    if (c == null) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

const STEPS = [10, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880, 5760, 11520];

/** أعلى قيمة المحور وخطواته (بالدقائق) بحيث لا تزيد العلامات عن maxTicks. */
export function niceScale(maxValue, maxTicks = 4) {
  const v = Math.max(maxValue, 30);
  const step = STEPS.find((s) => Math.ceil(v / s) <= maxTicks) || STEPS[STEPS.length - 1];
  const top = Math.ceil(v / step) * step;
  const ticks = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, step, ticks };
}

/** تسمية قصيرة للدقائق على المحور: 30د، 1س، 1.5س. */
export function axisLabel(mins) {
  if (mins === 0) return '0';
  if (mins < 60) return `${mins}د`;
  const h = mins / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}س`;
}

export { formatMins };

/** مستطيل بزاويتين علويتين مدوّرتين (القاعدة مربعة). الأعمدة تنمو من خط الأساس. */
export function topRoundedBar(x, y, w, h, r = 4) {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** مستطيل مربع (لقطعة وسطى في عمود مكدّس). */
export function rectPath(x, y, w, h) {
  if (h <= 0 || w <= 0) return '';
  return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
}
