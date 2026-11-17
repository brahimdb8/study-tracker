// @ts-check
/** @typedef {import('./types.js').EvalCtx} EvalCtx */
/** @typedef {import('./types.js').DayStatus} DayStatus */
/** @typedef {import('./types.js').DayMeta} DayMeta */
/** @typedef {import('./types.js').DateRange} DateRange */
/** @typedef {import('./types.js').Session} Session */
/** @typedef {import('./types.js').Subject} Subject */
/** @typedef {{ date: string, day: number, future: boolean, status: DayStatus, morning: number, evening: number, total: number, target: number }} DailyPoint */

// تحليلات نقية للوحة التحليلات: كلها دوال على (ctx, sessions, dayMeta) بلا DOM.
// ctx من createContext؛ الأيام المستقبلية لا تُحسب أبداً.
import { addDays, daysInMonth, monthKeyOf, shiftMonth, weekDays } from './dates.js';
import { targetsForDate } from './plan.js';
import { dayTotals } from './sessions.js';
import { monthStats } from './stats.js';
import { evaluateDay, weekProgress } from './status.js';

/**
 * @param {number} n
 */
const pad = (n) => String(n).padStart(2, '0');

// هدف اليوم الفعلي: صفر للاستثنائي/الراحة/قبل بداية التتبع
/**
 * @param {string} dateStr
 * @param {DayStatus} status
 * @param {EvalCtx} ctx
 * @returns {number}
 */
function effectiveTarget(dateStr, status, ctx) {
  if (status === 'excused' || status === 'rest') return 0;
  if (ctx.trackingStart && dateStr < ctx.trackingStart) return 0;
  return targetsForDate(ctx.plan, dateStr).totalMins;
}

/**
 * سلسلة أيام شهر: صباح/مساء/مجموع/هدف/حالة.
 * @param {number} year
 * @param {number} month0
 * @param {EvalCtx} ctx
 * @returns {DailyPoint[]}
 */
export function dailySeries(year, month0, ctx) {
  const n = daysInMonth(year, month0);
  const out = [];
  for (let day = 1; day <= n; day++) {
    const date = `${year}-${pad(month0 + 1)}-${pad(day)}`;
    const future = date > ctx.today;
    const status = evaluateDay(date, ctx);
    const t = dayTotals(ctx.index, date);
    out.push({
      date, day, future, status,
      morning: t.morningMins, evening: t.eveningMins, total: t.totalMins,
      target: effectiveTarget(date, status, ctx),
    });
  }
  return out;
}

/**
 * تراكمي الشهر: الفعلي حتى اليوم، والهدف للشهر كله، وإسقاط تقديري اختياري.
 * @param {DailyPoint[]} daily
 * @param {EvalCtx} ctx
 */
export function cumulativeSeries(daily, ctx) {
  let actual = 0; let target = 0;
  const points = daily.map((d) => {
    target += d.target;
    if (!d.future) actual += d.total;
    return { day: d.day, date: d.date, actual: d.future ? null : actual, target };
  });
  const elapsed = daily.filter((d) => !d.future).length;
  let projection = null;
  if (elapsed >= 5 && elapsed < daily.length) {
    const rate = actual / elapsed; // متوسط الدقائق/يوم حتى الآن
    projection = { rate, final: Math.round(actual + rate * (daily.length - elapsed)), elapsed };
  }
  return { points, projection, actualTotal: actual, targetTotal: target };
}

/**
 * أبرز ما في الشهر.
 * @param {DailyPoint[]} daily
 */
export function monthHighlights(daily) {
  const past = daily.filter((d) => !d.future);
  const studied = past.filter((d) => d.total > 0);
  let best = null;
  for (const d of studied) if (!best || d.total > best.total) best = d;
  const sum = studied.reduce((a, d) => a + d.total, 0);
  return {
    studiedDays: studied.length,
    elapsedDays: past.length,
    bestDay: best ? { date: best.date, mins: best.total } : null,
    avgPerStudiedDay: studied.length ? Math.round(sum / studied.length) : 0,
  };
}

/**
 * آخر N أسبوع (الأقدم أولاً) تنتهي بأسبوع اليوم.
 * @param {EvalCtx} ctx
 * @param {number} [weeks]
 */
export function weeklySeries(ctx, weeks = 12) {
  const thisMon = weekDays(ctx.today)[0];
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisMon, -7 * i);
    const wp = weekProgress(start, ctx);
    out.push({ weekStart: start, weekEnd: wp.weekEnd, studied: wp.studiedMins, target: wp.targetMins, current: i === 0 });
  }
  return out;
}

/**
 * آخر N شهراً (الأقدم أولاً) تنتهي بالشهر الحالي.
 * @param {EvalCtx} ctx
 * @param {DayMeta} [dayMeta]
 * @param {number} [months]
 */
export function monthlySeries(ctx, dayMeta = {}, months = 12) {
  const [y, m] = ctx.today.split('-').map(Number);
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const { year, month } = shiftMonth({ year: y, month: m - 1 }, -i);
    const st = monthStats(year, month, ctx, dayMeta);
    out.push({ year, month, studied: st.studiedMins, target: st.targetMins, rate: st.completionRate, current: i === 0 });
  }
  return out;
}

/**
 * شبكة السنة: أعمدة أسابيع (إثنين→أحد) تنتهي بأسبوع اليوم.
 * @param {EvalCtx} ctx
 * @param {number} [weeks]
 */
export function heatmapYear(ctx, weeks = 53) {
  const thisMon = weekDays(ctx.today)[0];
  const columns = [];
  let max = 0;
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(thisMon, -7 * w);
    const cells = weekDays(start).map((date) => {
      const future = date > ctx.today;
      const t = future ? { totalMins: 0 } : dayTotals(ctx.index, date);
      if (t.totalMins > max) max = t.totalMins;
      return { date, future, mins: t.totalMins, status: future ? 'future' : evaluateDay(date, ctx) };
    });
    columns.push({ weekStart: start, cells });
  }
  return { columns, max };
}

/**
 * مستوى الكثافة 0..4 بحسب نسبة اليوم من أعلى يوم.
 * @param {number} mins
 * @param {number} max
 * @returns {number}
 */
export function intensityLevel(mins, max) {
  if (!mins || max <= 0) return 0;
  const r = mins / max;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

/**
 * نطاق تاريخ شامل [from,to] لاسم نطاق.
 * @param {string} name
 * @param {EvalCtx} ctx
 * @param {Session[]} [sessions]
 * @returns {DateRange}
 */
export function rangeFor(name, ctx, sessions = []) {
  const to = ctx.today;
  if (name === 'month') return { from: `${to.slice(0, 7)}-01`, to };
  if (name === '30') return { from: addDays(to, -29), to };
  if (name === '90') return { from: addDays(to, -89), to };
  let from = to;
  for (const s of sessions) if (s.date < from) from = s.date;
  return { from, to };
}

/**
 * @param {string} date
 * @param {DateRange} r
 */
const inRange = (date, r) => date >= r.from && date <= r.to;

/**
 * توزيع الدقائق على المواد (+ «بدون مادة»)، الأكبر أولاً.
 * @param {Session[]} sessions
 * @param {Subject[]} subjects
 * @param {DateRange} range
 */
export function subjectBreakdown(sessions, subjects, range) {
  const map = new Map();
  let total = 0;
  for (const s of sessions) {
    if (!inRange(s.date, range)) continue;
    const key = s.subject ?? null;
    const row = map.get(key) || { id: key, mins: 0, count: 0 };
    row.mins += s.minutes; row.count += 1; total += s.minutes;
    map.set(key, row);
  }
  const rows = [...map.values()].map((r) => {
    const sub = r.id ? subjects.find((x) => x.id === r.id) : null;
    return {
      ...r,
      name: r.id ? (sub ? sub.name : 'مادة محذوفة') : 'بدون مادة',
      color: sub ? sub.color : null,
      pct: total ? Math.round((r.mins / total) * 100) : 0,
    };
  });
  rows.sort((a, b) => b.mins - a.mins);
  return { rows, total };
}

/**
 * توزيع الدقائق على ساعات اليوم من startedAt؛ الجلسات بلا وقت تُعدّ منفصلة.
 * @param {Session[]} sessions
 * @param {DateRange} range
 */
export function hourHistogram(sessions, range) {
  const hours = new Array(24).fill(0);
  let timed = 0; let untimed = 0;
  for (const s of sessions) {
    if (!inRange(s.date, range)) continue;
    if (!Number.isFinite(s.startedAt)) { untimed += s.minutes; continue; }
    timed += s.minutes;
    const d = new Date(/** @type {number} */ (s.startedAt)); // تحقق Number.isFinite أعلاه يضمن أنه رقم
    let h = d.getHours();
    let left = s.minutes;
    let room = 60 - d.getMinutes(); // الدقائق المتبقية في ساعة البدء
    while (left > 0) {
      const take = Math.min(left, room);
      hours[h] += take;
      left -= take;
      h = (h + 1) % 24; // التفاف منتصف الليل
      room = 60;
    }
  }
  let best = null;
  if (timed > 0) {
    for (let h = 0; h < 24; h++) {
      const mins = hours[h] + hours[(h + 1) % 24] + hours[(h + 2) % 24];
      if (!best || mins > best.mins) best = { start: h, mins };
    }
  }
  return { hours, timedMins: timed, untimedMins: untimed, bestWindow: best };
}

const QUALITY_KEYS = ['excellent', 'good', 'average', 'poor'];

/**
 * متوسط الدقائق لليوم بحسب تقييم الجودة (الأيام المقيَّمة فقط).
 * @param {EvalCtx} ctx
 * @param {DayMeta|undefined} dayMeta
 * @param {DateRange} range
 */
export function qualityVsMinutes(ctx, dayMeta, range) {
  const acc = Object.fromEntries(QUALITY_KEYS.map((k) => [k, { days: 0, mins: 0 }]));
  for (const [date, meta] of Object.entries(dayMeta || {})) {
    const q = meta && meta.quality;
    if (!acc[q] || !inRange(date, range) || date > ctx.today) continue;
    acc[q].days += 1;
    acc[q].mins += dayTotals(ctx.index, date).totalMins;
  }
  return QUALITY_KEYS.map((key) => ({
    key, days: acc[key].days,
    avgMins: acc[key].days ? Math.round(acc[key].mins / acc[key].days) : 0,
  }));
}

/**
 * الشهر الحالي مقابل السابق بالأيام المنقضية نفسها.
 * @param {number} year
 * @param {number} month0
 * @param {EvalCtx} ctx
 * @param {DayMeta} [dayMeta]
 */
export function monthComparison(year, month0, ctx, dayMeta = {}) {
  const cur = monthStats(year, month0, ctx, dayMeta);
  const prevRef = shiftMonth({ year, month: month0 }, -1);
  const isCurrent = monthKeyOf(ctx.today) === `${year}-${pad(month0 + 1)}`;
  const maxDay = isCurrent ? Number(ctx.today.slice(8, 10)) : Infinity;
  const prev = monthStats(prevRef.year, prevRef.month, ctx, dayMeta, { maxDay });
  const diffPct = prev.studiedMins > 0
    ? Math.round(((cur.studiedMins - prev.studiedMins) / prev.studiedMins) * 100)
    : null;
  return { cur, prev, prevRef, diffPct, sameSpan: isCurrent ? maxDay : null };
}

/**
 * تقرير الأسبوع: أيامه الحالية مقابل الأسبوع الماضي.
 * @param {EvalCtx} ctx
 */
export function weeklyReport(ctx) {
  const days = weekDays(ctx.today);
  /** @param {string} d */
  const mins = (d) => (d > ctx.today ? null : dayTotals(ctx.index, d).totalMins);
  const thisWeek = days.map((date) => ({ date, mins: mins(date) }));
  const lastWeek = days.map((d) => { const date = addDays(d, -7); return { date, mins: mins(date) }; });
  /** @param {{ mins: number|null }[]} arr */
  const sum = (arr) => arr.reduce((a, x) => a + (x.mins || 0), 0);
  const todayIdx = days.indexOf(ctx.today);
  const lastSameDays = sum(lastWeek.slice(0, todayIdx + 1));
  return {
    thisWeek, lastWeek,
    thisTotal: sum(thisWeek),
    lastTotal: sum(lastWeek),
    lastToDate: lastSameDays,
    diffToDate: sum(thisWeek) - lastSameDays,
    todayIndex: todayIdx,
  };
}
