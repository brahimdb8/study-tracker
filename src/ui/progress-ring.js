// حلقة تقدم SVG صغيرة (بلا innerHTML). الألوان من CSS (.pr-track/.pr-fill). النص داخلها عنصر HTML عادي.
const NS = 'http://www.w3.org/2000/svg';

/**
 * @param {{ size?: number, stroke?: number }} [o]
 * @returns {{ el: HTMLElement, update: (pct: number, centerText: string, label: string) => void }}
 */
export function createProgressRing({ size = 84, stroke = 9 } = {}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const wrap = document.createElement('div');
  wrap.className = 'pr';
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  wrap.setAttribute('role', 'progressbar');
  wrap.setAttribute('aria-valuemin', '0');
  wrap.setAttribute('aria-valuemax', '100');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const mk = (cls) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', String(size / 2));
    c.setAttribute('cy', String(size / 2));
    c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', String(stroke));
    return c;
  };
  const track = mk('pr-track');
  const fill = mk('pr-fill');
  fill.setAttribute('stroke-linecap', 'round');
  fill.setAttribute('stroke-dasharray', String(circ));
  fill.setAttribute('stroke-dashoffset', String(circ));
  fill.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  svg.append(track, fill);

  const center = document.createElement('span');
  center.className = 'pr-center';
  wrap.append(svg, center);

  return {
    el: wrap,
    update(pct, centerText, label) {
      const v = Math.max(0, Math.min(100, Math.round(pct)));
      fill.setAttribute('stroke-dashoffset', String(circ * (1 - v / 100)));
      center.textContent = centerText;
      wrap.setAttribute('aria-valuenow', String(v));
      wrap.setAttribute('aria-label', label);
      wrap.setAttribute('aria-valuetext', `${v}%`);
    },
  };
}
