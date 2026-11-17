import '../data/boot.js';
import '../styles/main.css';
import '../styles/analytics.css';
import {
  cumulativeSeries, dailySeries, heatmapYear, hourHistogram, monthComparison, monthHighlights,
  monthlySeries, qualityVsMinutes, rangeFor, subjectBreakdown, weeklyReport, weeklySeries,
} from '../core/analytics.js';
import { createContext } from '../core/context.js';
import { MONTHS_AR, shiftMonth, todayStr } from '../core/dates.js';
import { formatMins, minsToHoursText } from '../core/format.js';
import { getStore } from '../core/store.js';
import { QUALITY_OPTIONS, STATUS_SYMBOL, flushStoreNotices } from '../ui/status-ui.js';
import { initUnlockAnnouncer } from '../ui/celebrate.js';
import { initShell } from '../ui/shell.js';
import { initShortcuts } from '../ui/shortcuts.js';
import { openShareDialog } from '../ui/share-dialog.js';
import { showToast } from '../ui/toast.js';
import { chartCard } from '../ui/charts/card.js';
import { drawColumns, drawCumulative, drawHeatmap, drawHours, drawStackedDaily, longDate } from '../ui/charts/draw.js';

const store = getStore();
/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);
const now = new Date();
const cur = { year: now.getFullYear(), month: now.getMonth() };
const ui = { tab: 'month', range: '30', heat: 'intensity' };
let cards = []; // لتحرير مراقبات الحجم عند إعادة الرسم

// ---------- عناصر صغيرة ----------
function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function mount(panel, nodes) {
  for (const c of cards) c.destroy && c.destroy();
  cards = nodes.filter((n) => n.destroy);
  panel.replaceChildren(...nodes);
}
const hoursOf = (m) => minsToHoursText(m);

function deltaChip(diffPct, label) {
  if (diffPct === null) return h('span', 'delta', 'لا بيانات للمقارنة');
  const up = diffPct >= 0;
  const t = diffPct === 0 ? `بلا تغيّر ${label}` : `${up ? '▲' : '▼'} ${Math.abs(diffPct)}% ${label}`;
  return h('span', `delta ${diffPct === 0 ? '' : up ? 'up' : 'down'}`, t);
}

function fact(value, label) {
  const f = h('div', 'fact');
  f.append(h('b', '', value), h('span', '', label));
  return f;
}

function hbarRow({ name, color, value, valueBold, fill }) {
  const row = h('div', 'hbar');
  const nm = h('div', 'hbar-name');
  const sw = h('i');
  sw.style.background = color;
  nm.append(sw, h('span', '', name));
  const track = h('div', 'hbar-track');
  const f = h('span', 'hbar-fill');
  f.style.width = `${Math.max(0, Math.min(100, fill))}%`;
  f.style.background = color;
  track.appendChild(f);
  const val = h('div', 'hbar-val');
  const b = h('b', '', valueBold);
  val.append(b, document.createTextNode(` ${value}`));
  row.append(nm, track, val);
  return row;
}

// ---------- تبويب الشهر ----------
function renderMonth(ctx, state) {
  const { year, month } = cur;
  const daily = dailySeries(year, month, ctx);
  const cmp = monthComparison(year, month, ctx, state.dayMeta);
  const st = cmp.cur;
  const hi = monthHighlights(daily);
  const cum = cumulativeSeries(daily, ctx);
  const nodes = [];

  // الرأس: رقم واحد كبير
  const hero = h('div', 'hero');
  const left = h('div');
  const fig = h('div', 'hero-figure');
  fig.append(document.createTextNode(hoursOf(st.studiedMins)), h('small', '', 'ساعة'));
  left.append(fig);
  left.append(h('div', 'hero-sub', st.targetMins > 0 ? `من هدف ${hoursOf(st.targetMins)} ساعة · ${st.completionRate}% منجز` : 'لا هدف لهذا الشهر'));
  const lbl = cmp.sameSpan ? `عن أول ${cmp.sameSpan} يوم من ${MONTHS_AR[cmp.prevRef.month]}` : `عن ${MONTHS_AR[cmp.prevRef.month]}`;
  left.append(deltaChip(cmp.diffPct, lbl));

  const right = h('div');
  const ml = h('div', 'meter-line');
  ml.append(h('span', '', 'التقدم نحو هدف الشهر'), h('b', '', `${st.completionRate}%`));
  const meter = h('div', 'meter');
  meter.setAttribute('role', 'img');
  meter.setAttribute('aria-label', `نسبة الإنجاز ${st.completionRate}%`);
  const mf = h('span');
  mf.style.width = `${st.completionRate}%`;
  meter.appendChild(mf);
  right.append(ml, meter);
  const total = st.morningMins + st.eveningMins;
  if (total > 0) {
    const sb = h('div', 'split-bar');
    sb.setAttribute('role', 'img');
    sb.setAttribute('aria-label', `صباحاً ${formatMins(st.morningMins)} ومساءً ${formatMins(st.eveningMins)}`);
    const m = h('span', 'm'); m.style.flex = String(st.morningMins || 0.001);
    const e = h('span', 'e'); e.style.flex = String(st.eveningMins || 0.001);
    if (st.morningMins) sb.appendChild(m);
    if (st.eveningMins) sb.appendChild(e);
    const lg = h('div', 'split-legend');
    for (const [color, text] of [['var(--c-morning)', `صباحاً ${formatMins(st.morningMins)}`], ['var(--c-evening)', `مساءً ${formatMins(st.eveningMins)}`]]) {
      const s = h('span'); const i = h('i'); i.style.background = color; s.append(i, document.createTextNode(text)); lg.appendChild(s);
    }
    right.append(sb, lg);
  }
  hero.append(left, right);
  nodes.push(hero);

  // أرقام هادئة
  const facts = h('div', 'facts');
  facts.append(
    fact(`${st.bestStreak} ${st.bestStreak === 1 ? 'يوم' : 'أيام'}`, 'أطول سلسلة في الشهر'),
    fact(`${st.completedDays}`, 'يوم منجز'),
    fact(hi.studiedDays ? formatMins(hi.avgPerStudiedDay) : '—', 'متوسط اليوم الدراسي'),
    fact(hi.bestDay ? formatMins(hi.bestDay.mins) : '—', hi.bestDay ? `أفضل يوم: ${longDate(hi.bestDay.date)}` : 'أفضل يوم'),
  );
  nodes.push(facts);

  // الرسم الرئيسي: أعمدة يومية
  const daily1 = chartCard({
    title: 'كل يوم في الشهر',
    subtitle: 'الخط الأفقي القصير فوق كل عمود هو هدف ذلك اليوم',
    legend: [{ label: 'صباحاً', color: 'var(--c-morning)' }, { label: 'مساءً', color: 'var(--c-evening)' }],
    empty: hi.studiedDays === 0 ? 'لا جلسات في هذا الشهر بعد. سجّل جلسة من الصفحة الرئيسية وستظهر هنا.' : undefined,
    draw: (w) => drawStackedDaily(daily, w),
    table: { headers: ['اليوم', 'صباحاً', 'مساءً', 'المجموع', 'الهدف'], rows: daily.filter((d) => !d.future).map((d) => [longDate(d.date), formatMins(d.morning), formatMins(d.evening), formatMins(d.total), d.target ? formatMins(d.target) : '—']) },
  });
  nodes.push(daily1);

  const grid = h('div', 'grid-2');
  const cumCard = chartCard({
    title: 'المجموع التراكمي',
    subtitle: cum.projection ? `بهذا المعدل تنتهي بنحو ${hoursOf(cum.projection.final)} ساعة (تقدير)` : 'ما أنجزته حتى الآن مقابل مسار الهدف',
    legend: [{ label: 'المنجز', color: 'var(--c-actual)', line: true }, { label: 'مسار الهدف', color: 'var(--c-target)', line: true }],
    empty: hi.studiedDays === 0 ? 'يظهر هنا بعد أول جلسة.' : undefined,
    draw: (w) => drawCumulative(cum, w),
    table: { headers: ['اليوم', 'المنجز', 'مسار الهدف'], rows: cum.points.filter((p) => p.actual !== null).map((p) => [longDate(p.date), formatMins(p.actual), formatMins(p.target)]) },
  });
  grid.appendChild(cumCard);

  grid.appendChild(weekCard(ctx));
  nodes.push(grid);

  // ملاحظات مستخلصة
  const lines = insightLines(st, hi, cmp, cum);
  if (lines.length) {
    const box = h('section', 'chart-card');
    box.append(h('h3', '', 'ملاحظات'));
    box.firstChild.style.margin = '0 0 .8rem';
    const ul = h('ul', 'insights');
    for (const l of lines) { const li = h('li'); li.textContent = l; ul.appendChild(li); }
    box.appendChild(ul);
    if (st.frozenDays || st.excusedDays) {
      box.appendChild(h('p', 'note', `${st.frozenDays ? `${st.frozenDays} يوم مجمّد ❄️` : ''}${st.frozenDays && st.excusedDays ? ' · ' : ''}${st.excusedDays ? `${st.excusedDays} يوم راحة أو استثنائي لا يدخل في الهدف` : ''}`));
    }
    nodes.push(box);
  }
  mount($('panel-month'), nodes);
}

function insightLines(st, hi, cmp, cum) {
  const out = [];
  if (hi.studiedDays > 0) out.push(`درست ${hi.studiedDays} يوماً من ${hi.elapsedDays} مضت من الشهر.`);
  if (cum.projection) {
    const t = cum.targetTotal;
    const f = cum.projection.final;
    out.push(t > 0
      ? (f >= t ? 'بمعدلك الحالي ستبلغ هدف الشهر أو تتجاوزه (تقدير، قد يتغير).' : `بمعدلك الحالي ستنهي الشهر قرب ${hoursOf(f)} ساعة من ${hoursOf(t)} (تقدير، قد يتغير).`)
      : `بمعدلك الحالي ستنهي الشهر قرب ${hoursOf(f)} ساعة (تقدير).`);
  }
  if (cmp.diffPct !== null && cmp.diffPct !== 0) out.push(`${cmp.diffPct > 0 ? 'أعلى' : 'أقل'} بـ ${Math.abs(cmp.diffPct)}% من ${MONTHS_AR[cmp.prevRef.month]} في المدة نفسها.`);
  return out;
}

function weekCard(ctx) {
  const r = weeklyReport(ctx);
  const card = h('section', 'chart-card');
  const head = h('div', 'chart-head');
  const t = h('div');
  t.append(h('h3', '', 'هذا الأسبوع والأسبوع الماضي'));
  const diff = r.diffToDate;
  t.append(h('p', 'chart-sub', diff === 0 ? 'مثل الأسبوع الماضي حتى اليوم نفسه' : `${diff > 0 ? 'تتقدم' : 'تتأخر'} بـ ${formatMins(Math.abs(diff))} عن الأسبوع الماضي حتى اليوم نفسه`));
  head.appendChild(t);
  card.appendChild(head);
  const max = Math.max(60, ...r.thisWeek.map((x) => x.mins || 0), ...r.lastWeek.map((x) => x.mins || 0));
  const g = h('div', 'wk');
  const names = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  r.thisWeek.forEach((d, i) => {
    const a = h('div', `wk-day${i === r.todayIndex ? ' today' : ''}`, names[i]);
    const bars = h('div', 'wk-bars');
    const c = h('span', 'cur'); c.style.width = `${((d.mins || 0) / max) * 100}%`;
    const p = h('span', 'prev'); p.style.width = `${((r.lastWeek[i].mins || 0) / max) * 100}%`;
    bars.append(c, p);
    const v = h('div', 'wk-val', d.mins === null ? '—' : formatMins(d.mins));
    g.append(a, bars, v);
  });
  card.appendChild(g);
  const lg = h('ul', 'chart-legend');
  lg.style.marginTop = '.8rem';
  for (const [c, l] of [['var(--c-main)', 'هذا الأسبوع'], ['var(--base)', 'الأسبوع الماضي']]) {
    const li = h('li'); const k = h('span', 'chart-legend-key'); k.style.background = c; li.append(k, document.createTextNode(l)); lg.appendChild(li);
  }
  card.appendChild(lg);
  return card;
}

// ---------- تبويب السنة ----------
function renderYear(ctx, state) {
  const nodes = [];
  const heat = heatmapYear(ctx);
  const any = heat.max > 0;
  const hmCard = chartCard({
    title: 'السنة الأخيرة يوماً بيوم',
    subtitle: 'كل مربع يوم، وكل عمود أسبوع (الأحدث على اليسار)',
    empty: any ? undefined : 'لا جلسات في آخر سنة بعد.',
    draw: (w) => drawHeatmap(heat, w, ui.heat),
    table: { headers: ['الأسبوع يبدأ', 'المجموع'], rows: heat.columns.map((c) => [longDate(c.weekStart), formatMins(c.cells.reduce((a, x) => a + x.mins, 0))]) },
  });
  // مفتاح التبديل + مقياس
  if (any) {
    const row = h('div', 'filter-row');
    row.style.marginTop = '.8rem';
    for (const [k, l] of [['intensity', 'بحسب المدة'], ['status', 'بحسب حالة اليوم']]) {
      const b = h('button', 'chip', l);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(ui.heat === k));
      b.addEventListener('click', () => { ui.heat = k; render(); });
      row.appendChild(b);
    }
    hmCard.appendChild(row);
    if (ui.heat === 'intensity') {
      const sc = h('div', 'hm-scale');
      sc.append(document.createTextNode('أقل'));
      for (let i = 0; i < 5; i++) { const s = h('i'); s.style.background = `var(--l${i})`; sc.appendChild(s); }
      sc.append(document.createTextNode(`أكثر (حتى ${formatMins(heat.max)})`));
      hmCard.appendChild(sc);
    } else {
      const key = h('div', 'hm-status-key');
      for (const [c, sym, l] of [['var(--st-ok-bd)', STATUS_SYMBOL.completed, 'منجز'], ['var(--st-comp-bd)', STATUS_SYMBOL.compensated, 'معوَّض'], ['var(--st-bad-bd)', STATUS_SYMBOL.failed, 'مقصّر'], ['var(--st-frozen-bd)', STATUS_SYMBOL.frozen, 'مجمّد'], ['var(--st-excused-bd)', STATUS_SYMBOL.excused, 'استثنائي']]) {
        const s = h('span', '', l); s.dataset.sym = sym; s.style.setProperty('--k', c);
        const dot = h('i'); dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-inline-end:.3rem`;
        s.prepend(dot);
        key.appendChild(s);
      }
      hmCard.appendChild(key);
    }
  }
  nodes.push(hmCard);

  const ws = weeklySeries(ctx, 12).map((w) => ({
    value: w.studied, target: w.target, current: w.current,
    axis: w.weekStart.slice(8, 10) + '/' + w.weekStart.slice(5, 7),
    title: `أسبوع ${longDate(w.weekStart)}`,
  }));
  const ms = monthlySeries(ctx, state.dayMeta, 12).map((m) => ({
    value: m.studied, target: m.target, current: m.current,
    axis: MONTHS_AR[m.month].slice(0, 4), title: `${MONTHS_AR[m.month]} ${m.year}`,
  }));
  const grid = h('div', 'grid-2');
  grid.append(
    chartCard({
      title: 'آخر 12 أسبوعاً', subtitle: 'الأسبوع الحالي بلون كامل، والعلامة هي هدف الأسبوع',
      draw: (w) => drawColumns(ws, w, { unit: 'أسبوع' }),
      table: { headers: ['الأسبوع', 'المنجز', 'الهدف'], rows: ws.map((x) => [x.title, formatMins(x.value), x.target ? formatMins(x.target) : '—']) },
    }),
    chartCard({
      title: 'آخر 12 شهراً', subtitle: 'مجموع كل شهر مقابل هدفه',
      draw: (w) => drawColumns(ms, w, { unit: 'شهر' }),
      table: { headers: ['الشهر', 'المنجز', 'الهدف'], rows: ms.map((x) => [x.title, formatMins(x.value), x.target ? formatMins(x.target) : '—']) },
    }),
  );
  nodes.push(grid);
  mount($('panel-year'), nodes);
}

// ---------- تبويب المواد والعادات ----------
const RANGES = [['month', 'هذا الشهر'], ['30', 'آخر 30 يوماً'], ['90', 'آخر 90 يوماً'], ['all', 'كل المدة']];

function renderSubjects(ctx, state) {
  const nodes = [];
  const fr = h('div', 'filter-row');
  fr.setAttribute('role', 'group');
  fr.setAttribute('aria-label', 'المدة');
  for (const [k, l] of RANGES) {
    const b = h('button', 'chip', l);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(ui.range === k));
    b.addEventListener('click', () => { ui.range = k; render(); });
    fr.appendChild(b);
  }
  nodes.push(fr);
  const range = rangeFor(ui.range, ctx, state.sessions);

  // المواد: أعمدة أفقية مرتبة (أدق للمقارنة من الدونات)
  const sb = subjectBreakdown(state.sessions, state.subjects, range);
  const subjCard = h('section', 'chart-card');
  subjCard.append(h('h3', '', 'أين يذهب وقتك'));
  subjCard.firstChild.style.margin = '0 0 .8rem';
  if (!sb.rows.length) subjCard.append(h('p', 'chart-empty', 'لا جلسات في هذه المدة.'));
  else {
    const list = h('div', 'hbars');
    const top = sb.rows[0].mins;
    for (const r of sb.rows) {
      list.appendChild(hbarRow({ name: r.name, color: r.color || 'var(--muted)', valueBold: formatMins(r.mins), value: `· ${r.pct}%`, fill: (r.mins / top) * 100 }));
    }
    subjCard.appendChild(list);
    if (sb.rows.length === 1 && sb.rows[0].id === null) subjCard.append(h('p', 'note', 'اختر مادة عند تسجيل الجلسة لترى التوزيع هنا.'));
  }

  // الساعات
  const hist = hourHistogram(state.sessions, range);
  const hoursCard = chartCard({
    title: 'ساعات يومك الأكثر إنتاجاً',
    subtitle: hist.bestWindow ? `أكثر نافذة تركيزاً: من ${String(hist.bestWindow.start).padStart(2, '0')}:00 إلى ${String((hist.bestWindow.start + 3) % 24).padStart(2, '0')}:00` : undefined,
    empty: hist.timedMins === 0 ? 'يحتاج هذا الرسم إلى جلسات لها وقت بدء: جلسات المؤقت تُسجَّل بوقتها تلقائياً، وفي الجلسات اليدوية أضف «وقت البدء».' : undefined,
    draw: (w) => drawHours(hist, w),
    table: { headers: ['الساعة', 'الدقائق'], rows: hist.hours.map((m, i) => [`${String(i).padStart(2, '0')}:00`, formatMins(Math.round(m))]) },
  });
  if (hist.untimedMins > 0 && hist.timedMins > 0) {
    hoursCard.appendChild(h('p', 'note', `${formatMins(hist.untimedMins)} من الجلسات بلا وقت بدء ولم تدخل في هذا الرسم.`));
  }

  // الجودة مقابل المقدار
  const qv = qualityVsMinutes(ctx, state.dayMeta, range).filter((q) => q.days > 0);
  const labels = Object.fromEntries(QUALITY_OPTIONS);
  const qCard = h('section', 'chart-card');
  qCard.append(h('h3', '', 'التركيز مقابل المدة'));
  qCard.firstChild.style.margin = '0';
  qCard.append(h('p', 'chart-sub', 'متوسط دقائق اليوم بحسب تقييمك له'));
  if (!qv.length) qCard.append(h('p', 'chart-empty', 'قيّم أيامك من الصفحة الرئيسية لتقارن التركيز بالمدة.'));
  else {
    const list = h('div', 'hbars');
    list.style.marginTop = '.8rem';
    const top = Math.max(...qv.map((q) => q.avgMins), 1);
    for (const q of qv) list.appendChild(hbarRow({ name: String(labels[q.key] || q.key).replace(/^[^\p{L}]+/u, '').replace(/\s*\(.*\)/, ''), color: 'var(--c-main)', valueBold: formatMins(q.avgMins), value: `· ${q.days} أيام`, fill: (q.avgMins / top) * 100 }));
    qCard.appendChild(list);
  }

  const grid = h('div', 'grid-2');
  grid.append(subjCard, qCard);
  const full = h('div');
  nodes.push(grid, hoursCard);
  void full;
  mount($('panel-subjects'), nodes);
}

// ---------- التحكم ----------
function render() {
  const state = store.getState();
  const ctx = createContext(state, todayStr());
  $('analytics-month-year').textContent = `${MONTHS_AR[cur.month]} ${cur.year}`;
  const isNow = cur.year === now.getFullYear() && cur.month === now.getMonth();
  $('next-month').disabled = isNow;
  $('month-stepper').hidden = ui.tab !== 'month';
  for (const t of ['month', 'year', 'subjects']) {
    const on = ui.tab === t;
    $(`tab-${t}`).setAttribute('aria-selected', String(on));
    $(`tab-${t}`).tabIndex = on ? 0 : -1;
    $(`panel-${t}`).hidden = !on;
  }
  if (ui.tab === 'month') renderMonth(ctx, state);
  else if (ui.tab === 'year') renderYear(ctx, state);
  else renderSubjects(ctx, state);
}

$('prev-month').addEventListener('click', () => { Object.assign(cur, shiftMonth(cur, -1)); render(); });
$('next-month').addEventListener('click', () => { if (!$('next-month').disabled) { Object.assign(cur, shiftMonth(cur, 1)); render(); } });

const tabs = ['month', 'year', 'subjects'];
for (const t of tabs) {
  $(`tab-${t}`).addEventListener('click', () => { ui.tab = t; render(); });
  $(`tab-${t}`).addEventListener('keydown', (e) => {
    const i = tabs.indexOf(t);
    const d = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0; // RTL
    if (!d) return;
    e.preventDefault();
    ui.tab = tabs[(i + d + tabs.length) % tabs.length];
    render();
    $(`tab-${ui.tab}`).focus();
  });
}

initShell({ active: 'analytics', store });
initShortcuts();
$('share-card-btn').addEventListener('click', () => openShareDialog(store));
render();
flushStoreNotices(store, showToast);
initUnlockAnnouncer(store);
