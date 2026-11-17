// حلقة تقدّم دائرية SVG مكتوبة يدوياً. لا تعرف شيئاً عن المؤقت: تستقبل نسبة (0..1) وطوراً.
// الألوان رموز CSS (--ring-focus / --ring-break / --ring-track)، والحلقة زخرفية (aria-hidden):
// المعنى كله في النص (الوقت واسم الطور) فلا يعتمد على اللون وحده.
const NS = 'http://www.w3.org/2000/svg';
const R = 90;
const C = 2 * Math.PI * R;

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function createRing(container) {
  const svg = el('svg', { viewBox: '0 0 200 200', class: 'ring', 'aria-hidden': 'true', focusable: 'false' });
  const track = el('circle', { cx: 100, cy: 100, r: R, class: 'ring-track', fill: 'none', 'stroke-width': 10 });
  const bar = el('circle', {
    cx: 100, cy: 100, r: R, class: 'ring-progress', fill: 'none', 'stroke-width': 10,
    'stroke-linecap': 'round', 'stroke-dasharray': C, 'stroke-dashoffset': C, transform: 'rotate(-90 100 100)',
  });
  svg.append(track, bar);
  container.replaceChildren(svg);

  let lastOffset = null;
  let lastClass = null;
  return {
    // phase: idle | focus | shortBreak | longBreak
    update(progress, phase) {
      const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
      const offset = (C * (1 - p)).toFixed(2);
      if (offset !== lastOffset) {
        bar.setAttribute('stroke-dashoffset', offset);
        bar.style.opacity = p > 0 ? '1' : '0'; // الطرف المدوّر يرسم نقطة عند الصفر، فنخفيه
        lastOffset = offset;
      }
      const cls = phase === 'focus' ? 'ring ring-focus' : phase === 'idle' ? 'ring ring-idle' : 'ring ring-break';
      if (cls !== lastClass) {
        svg.setAttribute('class', cls);
        lastClass = cls;
      }
    },
  };
}
