// رسوم SVG مكتوبة يدوياً. كل دالة ترسم بعرض الحاوية الفعلي (لا تكبير لـ viewBox) فيبقى النص مقروءاً على الهاتف.
// الاتجاه RTL: الأقدم/اليوم 1 على اليمين. الألوان من فئات CSS (تُهيَّأ لاحقاً للثيمات).
import { STATUS_LABEL, STATUS_SYMBOL } from '../status-ui.js';
import { DAYS_AR, MONTHS_AR, dayOfWeek } from '../../core/dates.js';
import { intensityLevel } from '../../core/analytics.js';
import { formatMins } from '../../core/format.js';
import { axisLabel, el, niceScale, rectPath, topRoundedBar } from './svg.js';

export function longDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${DAYS_AR[dayOfWeek(dateStr)]} ${d} ${MONTHS_AR[m - 1]}`;
}

const PAD = { top: 12, right: 38, bottom: 24, left: 6 };
const GAP = 2; // فاصل بلون السطح بين الأجزاء

function frame(w, h, label) {
  return el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label, class: 'chart-svg' });
}

// المحور الرأسي والشبكة (خطوط شعرية صلبة) — الأرقام على يمين الرسم (بداية القراءة في RTL)
function yAxis(svg, w, h, scale) {
  const plotH = h - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + plotH - (v / scale.top) * plotH;
  for (const t of scale.ticks) {
    svg.append(el('line', { x1: PAD.left, x2: w - PAD.right + 4, y1: y(t), y2: y(t), class: t === 0 ? 'ch-base' : 'ch-grid' }));
    svg.append(el('text', { x: w - 2, y: y(t) + 4, 'text-anchor': 'end', class: 'ch-axis' }, axisLabel(t)));
  }
  return y;
}

/** أعمدة يومية مكدّسة (صباح/مساء) مع علامة هدف لكل يوم. */
export function drawStackedDaily(daily, w) {
  const h = w < 420 ? 190 : 230;
  const svg = frame(w, h, 'أعمدة يومية: دقائق الصباح والمساء لكل يوم من الشهر');
  const maxV = Math.max(...daily.map((d) => Math.max(d.total, d.target)), 0);
  const scale = niceScale(maxV, 4);
  const y = yAxis(svg, w, h, scale);
  const plotW = w - PAD.left - PAD.right;
  const slot = plotW / daily.length;
  const bw = Math.max(3, Math.min(20, slot - 3));
  const stops = [];
  const labelEvery = slot < 14 ? 5 : slot < 22 ? 2 : 1;

  daily.forEach((d, i) => {
    const cx = w - PAD.right - slot * (i + 0.5);
    const x = cx - bw / 2;
    if (!d.future) {
      const base = y(0);
      const hm = (d.morning / scale.top) * (base - y(scale.top));
      const he = (d.evening / scale.top) * (base - y(scale.top));
      const g = el('g', { class: 'ch-bar' });
      if (d.morning > 0 && d.evening > 0) {
        // المساء فوق الصباح: العلوي مدوّر، السفلي مربع، وبينهما فاصل
        g.append(el('path', { d: rectPath(x, base - hm, bw, hm), class: 'fill-morning' }));
        g.append(el('path', { d: topRoundedBar(x, base - hm - he - GAP, bw, he), class: 'fill-evening' }));
      } else if (d.morning > 0) {
        g.append(el('path', { d: topRoundedBar(x, base - hm, bw, hm), class: 'fill-morning' }));
      } else if (d.evening > 0) {
        g.append(el('path', { d: topRoundedBar(x, base - he, bw, he), class: 'fill-evening' }));
      }
      svg.append(g);
      d._g = g;
    }
    if (d.target > 0) {
      svg.append(el('line', { x1: cx - bw / 2 - 1, x2: cx + bw / 2 + 1, y1: y(d.target), y2: y(d.target), class: 'ch-target' }));
    }
    if (d.day === 1 || d.day % labelEvery === 0) {
      svg.append(el('text', { x: cx, y: h - 6, 'text-anchor': 'middle', class: 'ch-axis' }, String(d.day)));
    }
    const hit = el('rect', { x: cx - slot / 2, y: PAD.top, width: slot, height: h - PAD.top - PAD.bottom + 6, class: 'ch-hit' });
    svg.append(hit);
    const rows = d.future
      ? [{ label: 'لم يأتِ بعد', value: '—' }]
      : [
        { label: 'صباحاً', value: formatMins(d.morning), color: 'var(--c-morning)' },
        { label: 'مساءً', value: formatMins(d.evening), color: 'var(--c-evening)' },
        { label: 'المجموع', value: formatMins(d.total) },
      ];
    stops.push({
      x: cx, y: Math.max(PAD.top, y(Math.max(d.total, d.target))), hit, el: d._g,
      tip: { title: longDate(d.date), rows, note: d.target > 0 ? `الهدف ${formatMins(d.target)}` : (d.status === 'excused' || d.status === 'rest' ? 'يوم راحة/استثنائي' : undefined) },
    });
  });
  return { svg, stops };
}

/** خط تراكمي: الفعلي مقابل مسار الهدف، مع إسقاط تقديري متقطع اختياري. */
export function drawCumulative(cum, w) {
  const h = w < 420 ? 190 : 230;
  const svg = frame(w, h, 'خط تراكمي: مجموع دقائق الشهر مقابل مسار الهدف');
  const pts = cum.points;
  const maxV = Math.max(cum.targetTotal, cum.actualTotal, cum.projection ? cum.projection.final : 0);
  const scale = niceScale(maxV, 4);
  const y = yAxis(svg, w, h, scale);
  const plotW = w - PAD.left - PAD.right;
  const slot = plotW / pts.length;
  const cx = (i) => w - PAD.right - slot * (i + 0.5);

  // الهدف: خط رمادي مائل رفيع
  svg.append(el('polyline', { points: pts.map((p, i) => `${cx(i)},${y(p.target)}`).join(' '), class: 'ln-target' }));

  const done = pts.filter((p) => p.actual !== null);
  const line = done.map((p) => `${cx(p.day - 1)},${y(p.actual)}`);
  if (line.length) {
    const first = done[0]; const last = done[done.length - 1];
    svg.append(el('path', { d: `M${cx(first.day - 1)},${y(0)}L${line.join('L')}L${cx(last.day - 1)},${y(0)}Z`, class: 'ln-area' }));
    svg.append(el('polyline', { points: line.join(' '), class: 'ln-actual' }));
    svg.append(el('circle', { cx: cx(last.day - 1), cy: y(last.actual), r: 5, class: 'ln-dot' }));
    if (cum.projection) {
      svg.append(el('line', { x1: cx(last.day - 1), y1: y(last.actual), x2: cx(pts.length - 1), y2: y(cum.projection.final), class: 'ln-proj' }));
    }
  }
  [1, 8, 15, 22, pts.length].forEach((d) => {
    if (d <= pts.length) svg.append(el('text', { x: cx(d - 1), y: h - 6, 'text-anchor': 'middle', class: 'ch-axis' }, String(d)));
  });

  const cross = el('line', { y1: PAD.top, y2: h - PAD.bottom, class: 'ch-cross', visibility: 'hidden' });
  svg.append(cross);
  const stops = pts.map((p, i) => {
    const hit = el('rect', { x: cx(i) - slot / 2, y: PAD.top, width: slot, height: h - PAD.top - PAD.bottom, class: 'ch-hit' });
    svg.append(hit);
    hit.addEventListener('pointerenter', () => { cross.setAttribute('x1', String(cx(i))); cross.setAttribute('x2', String(cx(i))); cross.setAttribute('visibility', 'visible'); });
    hit.addEventListener('pointerleave', () => cross.setAttribute('visibility', 'hidden'));
    const rows = [];
    if (p.actual !== null) rows.push({ label: 'المنجز', value: formatMins(p.actual), color: 'var(--c-actual)' });
    rows.push({ label: 'مسار الهدف', value: formatMins(p.target), color: 'var(--c-target)' });
    return { x: cx(i), y: y(p.actual ?? p.target), hit, tip: { title: longDate(p.date), rows } };
  });
  return { svg, stops };
}

/** أعمدة بسلسلة واحدة (أسابيع/أشهر) مع علامة هدف؛ الأخير الجاري بلون كامل والباقي أخفت. */
export function drawColumns(items, w, { unit = 'أسبوع' } = {}) {
  const h = 190;
  const svg = frame(w, h, `أعمدة ${unit === 'أسبوع' ? 'أسبوعية' : 'شهرية'}: المنجز مقابل الهدف`);
  const scale = niceScale(Math.max(...items.map((i) => Math.max(i.value, i.target)), 0), 4);
  const y = yAxis(svg, w, h, scale);
  const plotW = w - PAD.left - PAD.right;
  const slot = plotW / items.length;
  const bw = Math.max(6, Math.min(22, slot - 6));
  const stops = [];
  items.forEach((it, i) => {
    const cx = w - PAD.right - slot * (i + 0.5);
    const g = el('g', { class: `ch-bar${it.current ? ' is-current' : ' is-past'}` });
    const hh = (it.value / scale.top) * (y(0) - y(scale.top));
    if (it.value > 0) g.append(el('path', { d: topRoundedBar(cx - bw / 2, y(0) - hh, bw, hh), class: 'fill-main' }));
    svg.append(g);
    if (it.target > 0) svg.append(el('line', { x1: cx - bw / 2 - 2, x2: cx + bw / 2 + 2, y1: y(it.target), y2: y(it.target), class: 'ch-target' }));
    const every = Math.max(1, Math.ceil(46 / slot)); // لا تتراكب التسميات على الشاشات الضيقة
    if (i % every === items.length % every || it.current) {
      svg.append(el('text', { x: cx, y: h - 6, 'text-anchor': 'middle', class: 'ch-axis' }, it.axis));
    }
    const hit = el('rect', { x: cx - slot / 2, y: PAD.top, width: slot, height: h - PAD.top - PAD.bottom + 6, class: 'ch-hit' });
    svg.append(hit);
    /** @type {{label:string,value:string,color?:string}[]} */
    const rows = [{ label: 'المنجز', value: formatMins(it.value), color: 'var(--c-main)' }];
    if (it.target > 0) rows.push({ label: 'الهدف', value: formatMins(it.target) });
    stops.push({ x: cx, y: y(Math.max(it.value, it.target)), hit, el: g, tip: { title: it.title, rows, note: it.current ? 'جارٍ' : undefined } });
  });
  return { svg, stops };
}

const WD_SHORT = ['إث', 'ث', 'أر', 'خ', 'ج', 'س', 'أح']; // الإثنين → الأحد

/** خريطة حرارية للسنة: عمود لكل أسبوع، سبعة صفوف. mode: intensity | status */
export function drawHeatmap(heat, w, mode = 'intensity') {
  const labelW = 22;
  const top = 18;
  const cols = heat.columns.length;
  const cell = Math.max(8, Math.min(16, Math.floor((w - labelW - 4) / cols)));
  const step = cell + 2;
  const width = labelW + cols * step;
  const h = top + 7 * step + 2;
  const svg = frame(Math.max(w, width), h, 'خريطة حرارية: دقائق كل يوم خلال السنة الأخيرة');
  svg.setAttribute('width', String(width));
  svg.setAttribute('viewBox', `0 0 ${width} ${h}`);
  const stops = [];
  // الصفوف: الإثنين أعلى. الأعمدة: الأقدم يميناً
  [0, 2, 4, 6].forEach((r) => svg.append(el('text', { x: width - 0, y: top + r * step + cell - 2, 'text-anchor': 'end', class: 'ch-axis' }, WD_SHORT[r])));
  let lastMonth = -1; let lastLabelX = Infinity;
  heat.columns.forEach((col, ci) => {
    const x = width - labelW - (ci + 1) * step + 2;
    const m = Number(col.weekStart.slice(5, 7)) - 1;
    if (m !== lastMonth && col.cells[0]) {
      lastMonth = m;
      if (lastLabelX - (x + cell) >= 34) {
      lastLabelX = x + cell;
      svg.append(el('text', { x: x + cell, y: 11, 'text-anchor': 'end', class: 'ch-axis' }, MONTHS_AR[m]));
      }
    }
    col.cells.forEach((c, r) => {
      const level = intensityLevel(c.mins, heat.max);
      const cls = c.future ? 'hm-future' : mode === 'status' ? `hm-st-${c.status}` : `hm-l${level}`;
      const rect = el('rect', { x, y: top + r * step, width: cell, height: cell, rx: 3, class: `hm ${cls}` });
      svg.append(rect);
      // رمز الحالة داخل الخلية حين تتسع (لا لون وحده)؛ في الأحجام الأصغر يعتمد على التلميح والجدول
      if (!c.future && mode === 'status' && cell >= 14 && STATUS_SYMBOL[c.status]) {
        svg.append(el('text', {
          x: x + cell / 2, y: top + r * step + cell / 2 + cell * 0.25, 'text-anchor': 'middle',
          'font-size': Math.round(cell * 0.7), class: `hm-glyph hm-glyph-${c.status}`, 'aria-hidden': 'true',
        }, STATUS_SYMBOL[c.status]));
      }
      if (!c.future) {
        const hit = el('rect', { x: x - 1, y: top + r * step - 1, width: cell + 2, height: cell + 2, class: 'ch-hit' });
        svg.append(hit);
        stops.push({ x: x + cell / 2, y: top + r * step, hit, el: rect, tip: { title: longDate(c.date), rows: [{ label: 'الدراسة', value: c.mins ? formatMins(c.mins) : 'لا شيء' }, ...(mode === 'status' ? [{ label: 'الحالة', value: `${STATUS_SYMBOL[c.status] ? `${STATUS_SYMBOL[c.status]} ` : ''}${STATUS_LABEL[c.status] || ''}` }] : [])] } });
      }
    });
  });
  return { svg, stops, width };
}

/** 24 عموداً لساعات اليوم مع إبراز أفضل نافذة 3 ساعات. */
export function drawHours(hist, w) {
  const h = 190;
  const svg = frame(w, h, 'توزيع دقائق الدراسة على ساعات اليوم');
  const scale = niceScale(Math.max(...hist.hours, 0), 4);
  const y = yAxis(svg, w, h, scale);
  const plotW = w - PAD.left - PAD.right;
  const slot = plotW / 24;
  const bw = Math.max(4, Math.min(16, slot - 3));
  const best = hist.bestWindow;
  const inBest = (hr) => best && [0, 1, 2].some((k) => (best.start + k) % 24 === hr);
  const stops = [];
  for (let hr = 0; hr < 24; hr++) {
    // الأقدم (00) يميناً — كاليوم 1 في بقية الرسوم
    const cx = w - PAD.right - slot * (hr + 0.5);
    const hh = (hist.hours[hr] / scale.top) * (y(0) - y(scale.top));
    const g = el('g', { class: 'ch-bar' });
    if (hist.hours[hr] > 0) g.append(el('path', { d: topRoundedBar(cx - bw / 2, y(0) - hh, bw, hh), class: inBest(hr) ? 'fill-best' : 'fill-main' }));
    svg.append(g);
    if (hr % 3 === 0) svg.append(el('text', { x: cx, y: h - 6, 'text-anchor': 'middle', class: 'ch-axis' }, String(hr).padStart(2, '0')));
    const hit = el('rect', { x: cx - slot / 2, y: PAD.top, width: slot, height: h - PAD.top - PAD.bottom + 6, class: 'ch-hit' });
    svg.append(hit);
    stops.push({ x: cx, y: y(hist.hours[hr]), hit, el: g, tip: { title: `${String(hr).padStart(2, '0')}:00 – ${String((hr + 1) % 24).padStart(2, '0')}:00`, rows: [{ label: 'دراسة', value: formatMins(Math.round(hist.hours[hr])) }] } });
  }
  return { svg, stops };
}
