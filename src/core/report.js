// @ts-check
// بناء نموذج «تقرير الطباعة» — نقي بلا DOM. الصفحة (print.js) تعرضه بـ textContent فقط.
/** @typedef {import('./types.js').State} State */
/** @typedef {import('./types.js').Subject} Subject */
import { createContext } from './context.js';
import { DAYS_AR, eachDate, parseDate } from './dates.js';
import { PERIOD_AR, QUALITY_AR, SOURCE_AR, STATUS_AR, sortedSessions } from './export-csv.js';
import { targetsForDate } from './plan.js';
import { dayTotals } from './sessions.js';
import { evaluateDay } from './status.js';

/** @param {number} ms */
const hhmm = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const STATUS_ORDER = ['completed', 'compensated', 'failed', 'frozen', 'excused', 'rest', 'default'];

/**
 * @param {State} state حالة التطبيق
 * @param {{from: string, to: string, today: string}} range
 */
export function buildReport(state, { from, to, today }) {
  const ctx = createContext(state, today);
  const names = new Map(state.subjects.map((s) => [s.id, s]));
  const inRange = state.sessions.filter((s) => s.date >= from && s.date <= to);

  // ---- المجاميع ----
  /** @type {Map<string, number>} */
  const byDate = new Map();
  for (const s of inRange) byDate.set(s.date, (byDate.get(s.date) || 0) + s.minutes);
  const totalMins = inRange.reduce((n, s) => n + s.minutes, 0);
  /** @type {{ date: string, mins: number } | null} */
  let best = null;
  for (const [date, mins] of byDate) if (!best || mins > best.mins || (mins === best.mins && date < best.date)) best = { date, mins };

  // ---- حسب المادة ----
  /** @type {Map<string|null, { id: string|null, name: string, mins: number, sessions: number }>} */
  const subjMap = new Map();
  for (const s of inRange) {
    const key = s.subject && names.has(s.subject) ? s.subject : null;
    const cur = subjMap.get(key) || { id: key, name: key ? /** @type {Subject} */ (names.get(key)).name : 'بدون مادة', mins: 0, sessions: 0 };
    cur.mins += s.minutes;
    cur.sessions += 1;
    subjMap.set(key, cur);
  }
  const bySubject = [...subjMap.values()]
    .sort((a, b) => b.mins - a.mins || a.name.localeCompare(b.name))
    .map((x) => ({ ...x, pct: totalMins ? Math.round((x.mins / totalMins) * 100) : 0 }));

  // ---- حالات الأيام (من بداية التتبع حتى اليوم فقط) ----
  const statusCounts = Object.fromEntries(STATUS_ORDER.map((k) => [k, 0]));
  const first = from > state.settings.trackingStart ? from : state.settings.trackingStart;
  const last = to < today ? to : today;
  let daysInRange = 0;
  if (first <= last) {
    eachDate(first, last, (date) => {
      daysInRange++;
      const st = evaluateDay(date, ctx);
      if (statusCounts[st] !== undefined) statusCounts[st]++;
    });
  }

  // ---- الأيام ذات الجلسات ----
  /** @type {{ date: string, dayName: string, totalMins: number, targetMins: number, status: string, quality: string, sessions: { time: string, period: string, minutes: number, subject: string, source: string, note: string }[] }[]} */
  const days = [];
  const sorted = sortedSessions(inRange);
  for (const s of sorted) {
    let day = days[days.length - 1];
    if (!day || day.date !== s.date) {
      const q = state.dayMeta[s.date] && state.dayMeta[s.date].quality;
      day = {
        date: s.date,
        dayName: DAYS_AR[parseDate(s.date).getDay()],
        totalMins: dayTotals(ctx.index, s.date).totalMins,
        targetMins: targetsForDate(ctx.plan, s.date).totalMins,
        status: STATUS_AR[evaluateDay(s.date, ctx)] || '',
        quality: QUALITY_AR[q] || '',
        sessions: [],
      };
      days.push(day);
    }
    day.sessions.push({
      time: s.startedAt ? hhmm(s.startedAt) : '',
      period: PERIOD_AR[s.period] || '',
      minutes: s.minutes,
      subject: (s.subject && names.has(s.subject) && /** @type {Subject} */ (names.get(s.subject)).name) || '',
      source: SOURCE_AR[s.source] || '',
      note: s.note || '',
    });
  }

  return {
    range: { from, to },
    totals: {
      mins: totalMins,
      sessions: inRange.length,
      daysStudied: byDate.size,
      daysInRange,
      avgPerStudiedDay: byDate.size ? Math.round(totalMins / byDate.size) : 0,
      bestDay: best,
    },
    statusCounts,
    bySubject,
    days,
  };
}
