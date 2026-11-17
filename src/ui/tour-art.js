// رسوم الجولة التعريفية: SVG يدوي (240×130) يُبنى بـ createElementNS، ألوانه كلها من الرموز عبر CSS (.ta-*).
// لا تُنشأ العناصر إلا عند الاستدعاء فيمكن استيراد الملف في Node للاختبار.
import { badgeIconGroup } from './badge-icons.js';

const NS = 'http://www.w3.org/2000/svg';

function n(tag, cls, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  if (cls) e.setAttribute('class', cls);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}
const rect = (cls, x, y, w, h, rx = 4) => n('rect', cls, { x, y, width: w, height: h, rx });
const circle = (cls, cx, cy, r) => n('circle', cls, { cx, cy, r });
const text = (cls, x, y, t) => n('text', cls, { x, y, 'text-anchor': 'middle' }, t);
const icon = (key, tf, cls) => { const g = badgeIconGroup(key, tf); if (g && cls) g.setAttribute('class', cls); return g; };

const ART = {
  welcome: () => [
    icon('book', 'translate(72 6) scale(4.6)', 'ta-acc'),
    icon('star', 'translate(168 10) scale(2.6)', 'ta-gold-g'),
    icon('sprout', 'translate(14 62) scale(2.6)', 'ta-start'),
  ],
  plan: () => {
    const out = [
      rect('ta-chip ta-hours', 18, 14, 64, 22, 11), rect('ta-chip ta-start-f', 90, 14, 64, 22, 11), rect('ta-chip ta-habit-f', 162, 14, 60, 22, 11),
    ];
    const heights = [[14, 14], [14, 14], [14, 14], [14, 14], [0, 28], [40, 28], [40, 28]];
    heights.forEach(([m, e], i) => {
      const x = 22 + i * 30;
      out.push(rect('ta-morning', x, 118 - e - m - 2, 20, m || 0.01, 2), rect('ta-evening', x, 118 - e, 20, e, 2));
    });
    out.push(n('line', 'ta-axis', { x1: 14, y1: 120, x2: 226, y2: 120 }));
    return out;
  },
  timer: () => {
    const r = 40; const c = 2 * Math.PI * r;
    const arc = circle('ta-ring-fill', 120, 66, r);
    arc.setAttribute('stroke-dasharray', `${c * 0.68} ${c}`);
    arc.setAttribute('transform', 'rotate(-90 120 66)');
    arc.setAttribute('stroke-linecap', 'round');
    const out = [circle('ta-ring-track', 120, 66, r), arc, text('ta-big', 120, 74, '25:00')];
    [0, 1, 2, 3].forEach((i) => out.push(circle(i < 2 ? 'ta-dot-on' : 'ta-dot', 100 + i * 13, 120, 4)));
    return out;
  },
  calendar: () => {
    const kinds = ['ok', 'ok', 'comp', 'ok', 'frozen', 'ok', 'excused', 'ok', 'bad', 'ok', 'ok', 'comp', 'ok', 'ok', 'ok', 'frozen', 'ok', 'bad', 'ok', 'ok', 'excused'];
    const glyph = { ok: '✓', comp: '≈', bad: '✕', frozen: '❄', excused: '☾' };
    const out = [];
    kinds.forEach((k, i) => {
      const x = 16 + (i % 7) * 31; const y = 12 + Math.floor(i / 7) * 36;
      out.push(rect(`ta-cell ta-st-${k}`, x, y, 27, 30, 6), text(`ta-glyph ta-fg-${k}`, x + 13.5, y + 20, glyph[k]));
    });
    return out;
  },
  levels: () => [
    circle('ta-lv-ring', 36, 38, 22), text('ta-lv-num', 36, 46, '14'),
    rect('ta-bar-track', 70, 30, 150, 10, 5), rect('ta-bar-fill', 70, 30, 96, 10, 5),
    text('ta-small', 145, 56, 'مجتهد · 5,115 نقطة'),
    icon('flame', 'translate(24 76) scale(1.9)', 'ta-streak'), icon('medal', 'translate(82 76) scale(1.9)', 'ta-hours-g'),
    icon('crown', 'translate(140 76) scale(1.9)', 'ta-streak'), icon('seal-check', 'translate(188 76) scale(1.9)', 'ta-commit'),
  ],
  share: () => [
    rect('ta-card', 16, 14, 104, 70, 10), text('ta-big', 68, 52, '12'), text('ta-small', 68, 70, 'يوماً للامتحان'),
    rect('ta-card ta-card-tall', 142, 8, 70, 112, 8), rect('ta-morning', 154, 78, 12, 24, 2), rect('ta-evening', 170, 62, 12, 40, 2), rect('ta-morning', 186, 86, 12, 16, 2),
    icon('star', 'translate(166 20) scale(1.9)', 'ta-gold-g'),
  ],
  settings: () => {
    const out = [];
    /** @type {[number, boolean][]} */
    const rowsDef = [[22, true], [60, false], [98, true]];
    rowsDef.forEach(([y, on]) => {
      out.push(rect('ta-row', 20, y, 200, 28, 8), rect(on ? 'ta-sw ta-sw-on' : 'ta-sw', 28, y + 6, 40, 16, 8), circle('ta-knob', on ? 58 : 38, y + 14, 6));
      out.push(rect('ta-line-text', 96, y + 11, 90 + (y % 3) * 10, 6, 3));
    });
    return out;
  },
};

export const ART_KEYS = Object.keys(ART);

/** @param {string} key @returns {SVGElement|null} */
export function tourArt(key) {
  const make = ART[key];
  if (!make) return null;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 240 130');
  svg.setAttribute('class', 'tour-art');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const e of make()) if (e) svg.appendChild(e);
  return svg;
}
