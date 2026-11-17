// @ts-check
// نموذج بيانات بطاقة الإنجازات (أسبوعية/شهرية) — نقي. الرسم على canvas في ui/share-card-render.js.
/** @typedef {import('./types.js').State} State */
import { badgesUnlockedBetween } from './achievements.js';
import { createContext } from './context.js';
import { MONTHS_AR, addDays, daysInMonth, formatDate, weekDays } from './dates.js';
import { buildDayIndex, dayTotals } from './sessions.js';
import { computeStreak, evaluateDay, isDone } from './status.js';

export const SHARE_PERIODS = ['week', 'month'];

/**
 * @param {State} state
 * @param {string} today
 * @param {{ period?: 'week'|'month', hideSubjects?: boolean }} [opts]
 */
export function buildShareModel(state, today, { period = 'week', hideSubjects = true } = {}) {
  const ctx = createContext(state, today);
  const index = buildDayIndex(state.sessions);

  let from; let to; let title; let rangeLabel;
  if (period === 'month') {
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7)) - 1;
    from = formatDate(new Date(y, m, 1));
    to = formatDate(new Date(y, m, daysInMonth(y, m)));
    title = 'إنجازاتي هذا الشهر';
    rangeLabel = `${MONTHS_AR[m]} ${y}`;
  } else {
    const days = weekDays(today);
    from = days[0]; to = days[6];
    title = 'إنجازاتي هذا الأسبوع';
    rangeLabel = `${from} → ${to}`;
  }

  /** @type {{ date: string, morning: number, evening: number, future: boolean }[]} */
  const days = [];
  let totalMins = 0; let morning = 0; let evening = 0; let done = 0; let targeted = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d > today) { days.push({ date: d, morning: 0, evening: 0, future: true }); continue; }
    const t = dayTotals(index, d);
    const st = evaluateDay(d, ctx);
    days.push({ date: d, morning: t.morningMins, evening: t.eveningMins, future: false });
    totalMins += t.totalMins; morning += t.morningMins; evening += t.eveningMins;
    if (st === 'completed' || st === 'compensated' || st === 'failed' || st === 'frozen') targeted += 1;
    if (isDone(st)) done += 1;
  }

  const bySubject = new Map();
  for (const s of state.sessions) {
    if (s.date < from || s.date > to || !s.subject) continue;
    bySubject.set(s.subject, (bySubject.get(s.subject) || 0) + s.minutes);
  }
  const subjects = hideSubjects ? [] : [...bySubject.entries()]
    .map(([id, mins]) => ({ name: (state.subjects.find((x) => x.id === id) || { name: 'مادة' }).name, mins }))
    .sort((a, b) => b.mins - a.mins)
    .slice(0, 3);

  return {
    period, title, rangeLabel, from, to,
    totalMins, morningMins: morning, eveningMins: evening,
    doneDays: done, targetedDays: targeted,
    streak: computeStreak(ctx),
    days,
    maxDayMins: Math.max(1, ...days.map((x) => x.morning + x.evening)),
    subjects,
    badges: badgesUnlockedBetween(state, from, to).map((b) => ({ id: b.id, icon: b.icon, title: b.title })),
    hideSubjects,
  };
}

/**
 * اسم ملف آمن للصورة.
 * @param {{ period: string, to: string }} model
 */
export function shareFileName(model) {
  return `study-${model.period}-${model.to}.png`;
}
