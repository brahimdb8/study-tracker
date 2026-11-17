// أيقونات الأوسمة الـ32: رسوم SVG يدوية متناسقة (24×24) تُبنى بـ createElementNS فقط (لا innerHTML).
// الألوان من CSS: main/soft/line بلون الفئة (currentColor)، gold بلون الذهب، cut بلون خلفية البلاطة.
// المقفل يُلوَّن رمادياً من CSS نفسه (--bi-gold و currentColor)، فلا تتكرر الأيقونات للحالتين.
const NS = 'http://www.w3.org/2000/svg';

const p = (cls, d, extra = {}) => ({ tag: 'path', cls, a: { d, ...extra } });
const c = (cls, cx, cy, r, extra = {}) => ({ tag: 'circle', cls, a: { cx, cy, r, ...extra } });
const r = (cls, x, y, width, height, rx = 0) => ({ tag: 'rect', cls, a: { x, y, width, height, rx } });
const e = (cls, cx, cy, rx, ry, extra = {}) => ({ tag: 'ellipse', cls, a: { cx, cy, rx, ry, ...extra } });
const g = (transform, ...kids) => ({ tag: 'g', a: { transform }, kids });

/** نجمة منتظمة كمسار. */
function star(cx, cy, R, inner, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / n;
    const rad = i % 2 === 0 ? R : inner;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`);
  }
  return `M${pts.join('L')}z`;
}
/** بريق رباعي صغير. */
const sparkle = (cx, cy, s) => `M${cx} ${cy - s}L${cx + s * 0.28} ${cy - s * 0.28}L${cx + s} ${cy}L${cx + s * 0.28} ${cy + s * 0.28}L${cx} ${cy + s}L${cx - s * 0.28} ${cy + s * 0.28}L${cx - s} ${cy}L${cx - s * 0.28} ${cy - s * 0.28}z`;

const FLAME = 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5 1 2.5 2 2.5 0-3-1-5 1-8z';
const FLAME_IN = 'M12 20a2.5 2.5 0 0 1-2.5-2.5c0-1.5 1.5-2.5 2.5-4 1 1.5 2.5 2.5 2.5 4A2.5 2.5 0 0 1 12 20z';

const calendarFrame = [
  r('bi-soft', 4, 5, 16, 15, 3), r('bi-line', 4, 5, 16, 15, 3),
  p('bi-line', 'M8 3v4M16 3v4M4 10h16'),
];

export const ICONS = {
  sprout: [
    p('bi-main', 'M12 14c0-4-3-6.5-7.5-6.5 0 4 3 6.5 7.5 6.500z'),
    p('bi-soft', 'M12 12c0-4 3-6.5 7.5-6.5 0 4-3 6.5-7.5 6.500z'),
    p('bi-line', 'M12 21v-9M12 12c0-4 3-6.5 7.5-6.5'),
    p('bi-line', 'M7 21h10'),
  ],
  flag: [
    p('bi-line', 'M6 21V4'),
    p('bi-main', 'M6 5h12l-3 4 3 4H6z'),
    p('bi-gold', star(10.5, 9, 2.2, 0.9)),
  ],
  tomato: [
    c('bi-main', 12, 13.5, 7.5),
    p('bi-cutline', 'M8 13a4.5 4.5 0 0 1 2.5-3.5'),
    p('bi-gold', 'M8.5 7.500L12 9.500l3.5-2-1.5-2.5-2 1-2-1z'),
    p('bi-line', 'M12 9.500V4.5'),
  ],
  'calendar-star': [...calendarFrame, p('bi-gold', star(12, 15, 3.6, 1.5))],
  flame: [p('bi-main', FLAME), p('bi-gold', FLAME_IN)],
  'flame-sparks': [
    g('translate(3.2 4.5) scale(.75)', p('bi-main', FLAME), p('bi-gold', FLAME_IN)),
    p('bi-gold', sparkle(19.5, 5.5, 2.8)),
    p('bi-gold', sparkle(4.5, 6, 2)),
  ],
  'flame-twin': [
    g('translate(0.5 7) scale(.6)', p('bi-soft', FLAME), p('bi-line', FLAME)),
    g('translate(7 1.5) scale(.8)', p('bi-main', FLAME), p('bi-gold', FLAME_IN)),
  ],
  'flame-ring': [
    c('bi-line', 12, 12, 10.5),
    g('translate(6.6 6.5) scale(.45)', p('bi-main', FLAME)),
    g('translate(6.6 6.5) scale(.45)', p('bi-gold', FLAME_IN)),
    p('bi-gold', sparkle(12, 2.5, 1.3)),
  ],
  torch: [
    p('bi-soft', 'M10 21l1.5-9h1l1.5 9z'), p('bi-line', 'M10 21l1.5-9h1l1.5 9z'),
    p('bi-main', 'M8 12h8l-1.2-3.500H9.200z'),
    p('bi-gold', 'M12 2.500c.800 2 3 3.2 3 5.500a3 3 0 0 1-6 0c0-1.5.800-2.5 1.5-3 0 1 .500 1.5 1 1.5 0-1.5 0-3 .500-4z'),
  ],
  crown: [
    p('bi-main', 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z'),
    p('bi-cutline', 'M5.5 16h13'),
    c('bi-gold', 3, 8, 1.6), c('bi-gold', 12, 4.8, 1.6), c('bi-gold', 21, 8, 1.6),
  ],
  'shield-flame': [
    p('bi-soft', 'M12 2.500l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z'),
    p('bi-line', 'M12 2.500l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z'),
    g('translate(6 6.5) scale(.5)', p('bi-main', FLAME)),
    g('translate(6 6.5) scale(.5)', p('bi-gold', FLAME_IN)),
  ],
  sun: [
    c('bi-main', 12, 12, 4.8), c('bi-gold', 12, 12, 2.2),
    p('bi-lineb', 'M12 2v2.500M12 19.500V22M2 12h2.500M19.5 12H22M4.9 4.900l1.8 1.800M17.3 17.300l1.8 1.800M4.9 19.100l1.8-1.800M17.3 6.700l1.8-1.8'),
  ],
  hourglass: [
    p('bi-line', 'M7 3h10M7 21h10'),
    p('bi-line', 'M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9'),
    p('bi-soft', 'M8.8 3.800h6.400c-.300 3-3.2 4-3.2 6-0-2-2.9-3-3.2-6z'),
    p('bi-main', 'M9.2 20.200h5.600c-.600-2-2.8-3-2.8-3s-2.2 1-2.8 3z'),
  ],
  clock: [
    c('bi-soft', 12, 12, 9), c('bi-line', 12, 12, 9),
    p('bi-lineb', 'M12 7v5l3.5 2'), c('bi-gold', 12, 12, 1.2),
  ],
  book: [
    p('bi-main', 'M12 6.500C10 5 6.5 4.5 3 5v13c3.5-.500 7 0 9 1.500z'),
    p('bi-soft', 'M12 6.500C14 5 17.5 4.5 21 5v13c-3.5-.500-7 0-9 1.500z'),
    p('bi-line', 'M12 6.500C14 5 17.5 4.5 21 5v13c-3.5-.500-7 0-9 1.500V6.5'),
    p('bi-gold', star(16.5, 11, 2.4, 1)),
  ],
  medal: [
    p('bi-lineb', 'M8.5 2.500L12 9M15.5 2.500L12 9'),
    c('bi-main', 12, 15, 6), p('bi-gold', star(12, 15, 3.4, 1.4)),
  ],
  rocket: [
    p('bi-soft', 'M7.5 13l-3.2 4.5 3.2-.500zM16.5 13l3.2 4.5-3.2-.500z'),
    p('bi-line', 'M7.5 13l-3.2 4.5 3.2-.500zM16.5 13l3.2 4.5-3.2-.500z'),
    p('bi-main', 'M12 2c3 2.5 4.5 6 4.5 10v3.500h-9V12c0-4 1.5-7.5 4.5-10z'),
    c('bi-cut', 12, 9.5, 1.9),
    p('bi-gold', 'M10.2 16.500h3.600L12 22z'),
  ],
  diamond: [
    p('bi-main', 'M6 4h12l4 5-10 12L2 9z'),
    p('bi-cutline', 'M2 9h20M9 4L7 9l5 12 5-12-2-5'),
  ],
  star: [
    p('bi-main', star(12, 12.8, 10, 4.3)),
    p('bi-gold', star(12, 12.8, 4.8, 2.1)),
  ],
  'star-orbit': [
    e('bi-line', 12, 12, 10, 4.2, { transform: 'rotate(-25 12 12)' }),
    p('bi-main', star(12, 12, 5.8, 2.5)),
    c('bi-gold', 21.060, 7.770, 1.6), c('bi-gold', 2.940, 16.230, 1.1),
  ],
  sunrise: [
    p('bi-main', 'M6.5 18a5.5 5.5 0 0 1 11 0z'),
    p('bi-line', 'M2 18.500h20M12 4v3.500M5 8.500l2 2M19 8.500l-2 2M2.5 14.500H5M19 14.500h2.5'),
    p('bi-soft', 'M7 21.500h10'),
  ],
  'sunrise-hill': [
    c('bi-gold', 15.5, 9.5, 3.6),
    p('bi-lineb', 'M15.5 2.500v1M21 9.500h1M9 9.500H8M19.4 5.600l.700-.700M11.6 5.600l-.700-.700'),
    p('bi-main', 'M2 21c4-7 8-7 10-3.5 2-3.5 6-3.5 10 3.500z'),
  ],
  moon: [
    p('bi-main', 'M20 14.500A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.500z'),
    p('bi-gold', sparkle(17.5, 6, 2.8)),
    c('bi-gold', 20.5, 11.5, 0.9),
  ],
  mountain: [
    c('bi-gold', 18, 6, 2.2),
    p('bi-main', 'M2 20l7-12 4 6 3-4 6 10z'),
    p('bi-cut', 'M9 8l-2.2 3.8 2.2-1 2.2 1.500z'),
  ],
  umbrella: [
    p('bi-main', 'M3 12a9 9 0 0 1 18 0z'),
    p('bi-cutline', 'M12 12C12 8.5 10 5.5 8 4.300M12 12c0-3.5 2-6.5 4-7.7'),
    p('bi-lineb', 'M12 12v6.500a2 2 0 0 1-4 0M12 3v1.5'),
    p('bi-gold', sparkle(19.5, 18.5, 2.2)),
  ],
  stopwatch: [
    c('bi-soft', 12, 13.5, 7.5), c('bi-line', 12, 13.5, 7.5),
    p('bi-main', 'M12 13.500V7.800a5.7 5.7 0 0 1 5.7 5.700z'),
    p('bi-lineb', 'M10 2.500h4M12 2.500V6M18.5 7l1.5-1.5'),
  ],
  bolt: [
    p('bi-main', 'M13.5 2L5 13.500h6L10 22l9-12h-6.500z'),
    p('bi-gold', 'M16 4.500l1 1M18.5 7l1.5.500M5 5l1.2 1.2'),
    p('bi-goldline', 'M17 3.500l.800.800M20 6.500l1 .300'),
  ],
  venn: [
    c('bi-soft', 9, 9, 5.5), c('bi-soft', 15, 9, 5.5), c('bi-soft', 12, 15, 5.5),
    c('bi-line', 9, 9, 5.5), c('bi-line', 15, 9, 5.5), c('bi-line', 12, 15, 5.5),
    c('bi-gold', 12, 11.5, 1.5),
  ],
  rainbow: [
    p('bi-lineb', 'M3 19a9 9 0 0 1 18 0'),
    p('bi-goldline', 'M6.5 19a5.5 5.5 0 0 1 11 0'),
    p('bi-linesoft', 'M10 19a2 2 0 0 1 4 0'),
    p('bi-soft', 'M2.5 19.500h6.500M15 19.500h6.5'),
  ],
  'seal-check': [
    p('bi-main', star(12, 12, 10.5, 8.7, 12)),
    p('bi-cutline', 'M7.8 12.500l3 3L16.5 9', { 'stroke-width': 2.2 }),
  ],
  'calendar-check': [...calendarFrame, p('bi-lineb', 'M8.5 14.500l2.5 2.5 4.5-5')],
  dumbbell: [
    p('bi-lineb', 'M7 12h10'),
    r('bi-soft', 1.5, 10, 2, 4, 0.8), r('bi-soft', 20.5, 10, 2, 4, 0.8),
    r('bi-main', 3.5, 7.5, 3.5, 9, 1), r('bi-main', 17, 7.5, 3.5, 9, 1),
    r('bi-gold', 7, 9, 1.6, 6, 0.6), r('bi-gold', 15.4, 9, 1.6, 6, 0.6),
  ],
};

export const ICON_KEYS = Object.keys(ICONS);

function build(spec) {
  const n = document.createElementNS(NS, spec.tag);
  if (spec.cls) n.setAttribute('class', spec.cls);
  for (const [k, v] of Object.entries(spec.a || {})) n.setAttribute(k, String(v));
  for (const kid of spec.kids || []) n.appendChild(build(kid));
  return n;
}

/**
 * أيقونة وسام كعنصر SVG (زخرفية: aria-hidden). مفتاح مجهول يعيد null.
 * @param {string} key
 * @param {{ size?: number }} [opts]
 */
export function badgeIcon(key, { size = 28 } = {}) {
  const spec = ICONS[key];
  if (!spec) return null;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'bi');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const s of spec) svg.appendChild(build(s));
  return svg;
}

/** مجموعة <g> بأيقونة وسام مع تحويل (للرسوم التوضيحية في الجولة). */
export function badgeIconGroup(key, transform) {
  const spec = ICONS[key];
  if (!spec) return null;
  const grp = document.createElementNS(NS, 'g');
  grp.setAttribute('transform', transform);
  for (const sp of spec) grp.appendChild(build(sp));
  return grp;
}
