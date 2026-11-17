// بطاقة رسم: عنوان + وسيلة إيضاح + رسم مستجيب بعرض الحاوية الحقيقي + عرض جدولي بديل + تنقل بالأسهم.
import { el } from './svg.js';
import { hideTip, showTip } from './tooltip.js';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string=} o.subtitle
 * @param {{label:string,color:string,line?:boolean}[]=} o.legend
 * @param {(width:number, api?:{stops:Function}) => {svg:SVGElement, stops:{x:number,y:number,tip:any,el?:Element,hit?:Element}[]}} o.draw
 * @param {{headers:string[], rows:string[][]}=} o.table
 * @param {string=} o.empty  رسالة تظهر بدل الرسم عند غياب البيانات
 */
export function chartCard(o) {
  const root = /** @type {HTMLElement & {destroy?: () => void}} */ (document.createElement('figure'));
  root.className = 'chart-card';

  const head = document.createElement('figcaption');
  head.className = 'chart-head';
  const titles = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = o.title;
  titles.appendChild(h);
  if (o.subtitle) {
    const p = document.createElement('p');
    p.className = 'chart-sub';
    p.textContent = o.subtitle;
    titles.appendChild(p);
  }
  head.appendChild(titles);

  let tableBtn = null;
  if (o.table && !o.empty) {
    tableBtn = document.createElement('button');
    tableBtn.type = 'button';
    tableBtn.className = 'chart-toggle';
    tableBtn.textContent = 'جدول';
    tableBtn.setAttribute('aria-pressed', 'false');
    tableBtn.title = 'عرض البيانات كجدول';
    head.appendChild(tableBtn);
  }
  root.appendChild(head);

  if (o.legend && o.legend.length >= 2 && !o.empty) {
    const lg = document.createElement('ul');
    lg.className = 'chart-legend';
    for (const item of o.legend) {
      const li = document.createElement('li');
      const key = document.createElement('span');
      key.className = `chart-legend-key${item.line ? ' is-line' : ''}`;
      key.style.background = item.color;
      li.append(key, document.createTextNode(item.label));
      lg.appendChild(li);
    }
    root.appendChild(lg);
  }

  const plot = document.createElement('div');
  plot.className = 'chart-plot';
  root.appendChild(plot);

  if (o.empty) {
    const e = document.createElement('p');
    e.className = 'chart-empty';
    e.textContent = o.empty;
    plot.appendChild(e);
    return root;
  }

  let tableEl = null;
  let showingTable = false;
  let stops = [];
  let active = -1;
  let lastW = 0;

  function highlight(i) {
    stops.forEach((s, k) => s.el && s.el.classList.toggle('is-hot', k === i));
  }
  function focusStop(i) {
    const s = stops[i];
    if (!s) return;
    active = i;
    highlight(i);
    const r = plot.getBoundingClientRect();
    showTip(s.tip, { x: r.left + s.x, y: r.top + s.y });
  }
  function clear() {
    active = -1;
    highlight(-1);
    hideTip();
  }

  function render() {
    const w = Math.floor(plot.clientWidth);
    if (w < 40) return;
    lastW = w;
    const res = o.draw(w);
    stops = res.stops || [];
    plot.replaceChildren(res.svg);
    // مؤشر/لمس: أقرب محطة بحسب x (أو العنصر نفسه إن حدّد hit)
    stops.forEach((s, i) => {
      if (!s.hit) return;
      s.hit.addEventListener('pointerenter', () => focusStop(i));
      s.hit.addEventListener('pointerdown', () => focusStop(i));
    });
    res.svg.addEventListener('pointerleave', clear);
  }

  plot.tabIndex = 0;
  plot.setAttribute('role', 'group');
  plot.setAttribute('aria-label', `${o.title}. استخدم الأسهم لاستعراض القيم، أو زر «جدول».`);
  plot.addEventListener('keydown', (e) => {
    if (showingTable || !stops.length) return;
    // الرسم معكوس (RTL): السهم الأيسر = التالي
    const dir = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (!dir && e.key !== 'Escape') return;
    e.preventDefault();
    if (e.key === 'Escape') { clear(); return; }
    focusStop(active < 0 ? (dir > 0 ? 0 : stops.length - 1) : Math.max(0, Math.min(stops.length - 1, active + dir)));
  });
  plot.addEventListener('blur', clear);

  if (tableBtn) {
    tableBtn.addEventListener('click', () => {
      showingTable = !showingTable;
      tableBtn.setAttribute('aria-pressed', String(showingTable));
      tableBtn.textContent = showingTable ? 'رسم' : 'جدول';
      clear();
      if (showingTable) {
        tableEl = buildTable(o.table, o.title);
        plot.replaceChildren(tableEl);
      } else {
        render();
      }
    });
  }

  const ro = new ResizeObserver(() => {
    if (showingTable) return;
    if (Math.abs(plot.clientWidth - lastW) >= 2) render();
  });
  ro.observe(plot);
  // أول رسم بعد إدراج البطاقة في الصفحة
  requestAnimationFrame(render);
  root.destroy = () => { ro.disconnect(); hideTip(); };
  return root;
}

function buildTable(t, caption) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-table-wrap';
  const table = document.createElement('table');
  table.className = 'chart-table';
  const cap = document.createElement('caption');
  cap.className = 'sr-only';
  cap.textContent = caption;
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const h of t.headers) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = h; hr.appendChild(th); }
  thead.appendChild(hr);
  const tbody = document.createElement('tbody');
  for (const r of t.rows) {
    const tr = document.createElement('tr');
    r.forEach((c, i) => { const td = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) td.scope = 'row'; td.textContent = c; tr.appendChild(td); });
    tbody.appendChild(tr);
  }
  table.append(cap, thead, tbody);
  wrap.appendChild(table);
  return wrap;
}

export { el };
