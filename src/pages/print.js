import '../data/boot.js';
// صفحة تقرير الطباعة: تقرأ من التخزين نفسه وتعرض نموذج buildReport بـ textContent فقط.
// الأسماء والملاحظات بيانات غير موثوقة → لا innerHTML في أي مكان.
import '../styles/print.css';
import { isValidDateStr, todayStr } from '../core/dates.js';
import { formatMins } from '../core/format.js';
import { buildReport, STATUS_ORDER } from '../core/report.js';
import { getStore } from '../core/store.js';
import { registerServiceWorker } from '../pwa/register.js';

registerServiceWorker();
import { STATUS_SHORT, STATUS_SYMBOL } from '../ui/status-ui.js';

const root = document.getElementById('report');

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cell(text, className) {
  return h('td', className, text === '' || text == null ? '—' : String(text));
}

function stat(label, value) {
  const box = h('div', 'stat');
  box.append(h('div', 'stat-value', value), h('div', 'stat-label', label));
  return box;
}

function render() {
  const store = getStore();
  const state = store.getState();
  const today = todayStr();
  const params = new URLSearchParams(location.search);
  let from = params.get('from');
  let to = params.get('to');
  if (!isValidDateStr(from) || !isValidDateStr(to) || from > to) {
    from = `${today.slice(0, 8)}01`;
    to = today;
  }
  const report = buildReport(state, { from, to, today });
  document.title = `تقرير المذاكرة ${from} → ${to}`;

  const frag = document.createDocumentFragment();
  const head = h('header', 'report-head');
  head.append(h('h1', '', 'تقرير المذاكرة'), h('p', 'range', `من ${from} إلى ${to}`),
    h('p', 'generated', `أُنشئ بتاريخ ${today}`));
  frag.appendChild(head);

  const t = report.totals;
  const stats = h('section', 'stats');
  stats.append(
    stat('إجمالي الدراسة', formatMins(t.mins)),
    stat('الجلسات', String(t.sessions)),
    stat('أيام دراسة', `${t.daysStudied} من ${t.daysInRange}`),
    stat('متوسط اليوم الدراسي', t.avgPerStudiedDay ? formatMins(t.avgPerStudiedDay) : '—'),
    stat('أفضل يوم', t.bestDay ? `${formatMins(t.bestDay.mins)} (${t.bestDay.date})` : '—'),
  );
  frag.appendChild(stats);

  const statusLine = h('p', 'status-line');
  statusLine.textContent = STATUS_ORDER.map((k) => `${STATUS_SYMBOL[k]} ${STATUS_SHORT[k]}: ${report.statusCounts[k]}`).join('   •   ');
  frag.append(h('h2', '', 'حالات الأيام'), statusLine);

  frag.appendChild(h('h2', '', 'حسب المادة'));
  if (!report.bySubject.length) frag.appendChild(h('p', 'empty', 'لا جلسات في هذا النطاق.'));
  else {
    const table = h('table', 'tbl');
    const thead = h('thead');
    const hr = h('tr');
    ['المادة', 'المدة', 'الجلسات', 'النسبة', ''].forEach((x) => hr.appendChild(h('th', '', x)));
    thead.appendChild(hr);
    const tbody = h('tbody');
    for (const s of report.bySubject) {
      const tr = h('tr');
      const bar = h('td', 'bar-cell');
      const fill = h('span', 'bar');
      fill.style.width = `${s.pct}%`;
      bar.appendChild(fill);
      tr.append(cell(s.name), cell(formatMins(s.mins)), cell(s.sessions), cell(`${s.pct}%`), bar);
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    frag.appendChild(table);
  }

  frag.appendChild(h('h2', '', 'الجلسات'));
  if (!report.days.length) frag.appendChild(h('p', 'empty', 'لا جلسات في هذا النطاق.'));
  else {
    const table = h('table', 'tbl sessions');
    const thead = h('thead');
    const hr = h('tr');
    ['التاريخ', 'اليوم', 'الوقت', 'الفترة', 'المادة', 'المدة', 'الملاحظة'].forEach((x) => hr.appendChild(h('th', '', x)));
    thead.appendChild(hr);
    table.appendChild(thead);
    for (const day of report.days) {
      const tbody = h('tbody', 'day-group');
      day.sessions.forEach((s, i) => {
        const tr = h('tr');
        tr.append(cell(i === 0 ? day.date : ''), cell(i === 0 ? day.dayName : ''), cell(s.time), cell(s.period), cell(s.subject), cell(formatMins(s.minutes)), cell(s.note, 'note'));
        tbody.appendChild(tr);
      });
      const sum = h('tr', 'day-sum');
      const extra = [day.status && `الحالة: ${day.status}`, day.quality && `الجودة: ${day.quality}`].filter(Boolean).join(' — ');
      const label = h('td', '', `مجموع ${day.date}${extra ? ` — ${extra}` : ''}`);
      label.colSpan = 5;
      sum.append(label, h('td', '', formatMins(day.totalMins)), h('td', '', day.targetMins ? `الهدف ${formatMins(day.targetMins)}` : ''));
      tbody.appendChild(sum);
      table.appendChild(tbody);
    }
    frag.appendChild(table);
  }

  root.replaceChildren(frag);
}

document.getElementById('print-btn').addEventListener('click', () => window.print());
render();
