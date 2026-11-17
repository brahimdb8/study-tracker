// @ts-check
// الأوسمة والإنجازات — منطق نقي بلا DOM. الوقت يُحقن (today) والحالة تأتي كاملة.
//
// القواعد (المرحلة 8: التقييم ديناميكي من السجل الحالي):
//  - الأوسمة المفتوحة (state.achievements.unlocked) نسخة مخزَّنة من نتيجة التقييم، والمرجع دائماً السجل الحالي.
//  - إن حُذفت الجلسة (أو تغيّر السجل) فلم يعد الشرط متحققاً يُسحب الوسام تلقائياً، ويعود إن تحقق من جديد.
//  - أوسمة السلاسل والساعات «تاريخية»: تُقيَّم على أفضل ما في السجل (أطول سلسلة، مجموع الساعات)،
//    فانكسار السلسلة الجارية لا يسحب وسام «سلسلة 7 أيام» ما دام السجل فيه سلسلة بهذا الطول.
//  - تاريخ الفتح = اليوم الذي تحقق فيه الشرط فعلاً في السجل (لا يوم اكتشافه) ويُعاد اشتقاقه من السجل،
//    فيبقى دقيقاً بعد الترقية أو الاستيراد أو تعديل السجل.
//  - التقييم تطابقي (idempotent): تطبيقه مرتين يعيد نفس كائن الحالة.
/** @typedef {import('./types.js').DayStatus} DayStatus */
/** @typedef {import('./types.js').Session} Session */
/** @typedef {import('./types.js').Subject} Subject */
/** @typedef {import('./types.js').Plan} Plan */
/** @typedef {import('./types.js').State} State */

import { addDays, isValidDateStr, weekDays } from './dates.js';
import { createContext } from './context.js';
import { targetsForDate } from './plan.js';
import { buildDayIndex, dayTotals } from './sessions.js';
import { getTimeline, isDone } from './status.js';
import { activeSubjects } from './subjects.js';
import {
  BADGES, BADGE_IDS, STREAK_STEPS, HOURS_STEPS, MORNING_STEPS, NIGHT_RUN_TARGET, WEEK_SUBJECTS_TARGET,
  MONTH_RATE_PCT, MONTH_MIN_DAYS, WEEK_MIN_DAYS, MIN_ACTIVE_SUBJECTS_FOR_MONTH, POMODORO_COUNT_TARGET,
  POMODORO_MIN_MINS, PRECISE_COUNT_TARGET, PRECISE_MIN_MINS, FIRST_WEEK_DAYS, MARATHON_MINS, GOLDEN_WEEK_HOURS,
  WEEKEND_SAT_SUN,
} from './badge-defs.js';

export {
  BADGES, BADGE_IDS, CATEGORY_LABEL, CATEGORY_ORDER, STREAK_STEPS, HOURS_STEPS, WEEK_SUBJECTS_TARGET,
  MONTH_RATE_PCT, MONTH_MIN_DAYS, WEEK_MIN_DAYS, MIN_ACTIVE_SUBJECTS_FOR_MONTH, badgeById,
} from './badge-defs.js';

/** @typedef {{ unlocked: Record<string, string> }} AchievementsState */

export function createInitialAchievements() {
  return { unlocked: {} };
}

/**
 * تنظيف عند التحميل/الاستيراد: يسقط المعرّفات المجهولة والتواريخ الفاسدة ويعيد عددها.
 * @param {unknown} raw
 */
export function sanitizeAchievements(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {any} */ (raw).unlocked : null;
  /** @type {Record<string, string>} */
  const unlocked = {};
  let dropped = 0;
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    for (const [id, date] of Object.entries(src)) {
      if (BADGE_IDS.has(id) && typeof date === 'string' && isValidDateStr(date)) unlocked[id] = date;
      else dropped++;
    }
  } else if (src !== null && src !== undefined) {
    dropped++;
  }
  return { value: { unlocked }, dropped };
}

/**
 * @param {string|null} a
 * @param {string} b
 * @returns {string}
 */
const minDate = (a, b) => (a === null || b < a ? b : a);

// ---------- حسابات مساعدة ----------

/**
 * السلسلة الجارية في كل يوم من الخط الزمني (تُطابق منطق getTimeline).
 * @param {Map<string, DayStatus>} statuses
 * @param {string} today
 * @returns {Map<string, number>}
 */
export function runningStreaks(statuses, today) {
  /** @type {Map<string, number>} */
  const out = new Map();
  let run = 0;
  const dates = [...statuses.keys()].sort();
  for (const d of dates) {
    const st = statuses.get(d);
    if (isDone(st)) run++;
    else if (st === 'rest' || st === 'excused' || st === 'frozen' || d === today) { /* محايد */ }
    else run = 0;
    out.set(d, run);
  }
  return out;
}

/**
 * @param {Map<string, DayStatus>} statuses
 * @param {string} today
 */
function streakResults(statuses, today) {
  const run = runningStreaks(statuses, today);
  /** @type {Record<number, string>} */
  const dates = {};
  let best = 0;
  let current = 0;
  for (const [d, n] of [...run.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (n > best) best = n;
    current = n;
    for (const step of STREAK_STEPS) if (n >= step && !(step in dates)) dates[step] = d;
  }
  return { dates, best, current };
}

/**
 * @param {Session[]} sessions
 */
function hoursResults(sessions) {
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  /** @type {Record<number, string>} */
  const dates = {};
  let total = 0;
  for (const s of sorted) {
    total += s.minutes;
    for (const h of HOURS_STEPS) if (total >= h * 60 && !(h in dates)) dates[h] = s.date;
  }
  return { dates, totalMins: total };
}

/**
 * @param {Session[]} sessions
 */
function weekVariety(sessions) {
  const sorted = [...sessions].filter((s) => s.subject).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  /** @type {Map<string, Set<string|null>>} */
  const weeks = new Map();
  let date = null;
  let best = 0;
  for (const s of sorted) {
    const wk = weekDays(s.date)[0];
    const set = weeks.get(wk) || new Set();
    set.add(s.subject);
    weeks.set(wk, set);
    if (set.size > best) best = set.size;
    if (set.size >= WEEK_SUBJECTS_TARGET && date === null) date = s.date;
  }
  return { date, best };
}

/**
 * @param {Session[]} sessions
 * @param {Subject[]} subjects
 */
function monthVariety(sessions, subjects) {
  /** @type {Set<string|null>} */
  const active = new Set(activeSubjects(subjects).map((s) => s.id));
  const need = Math.max(MIN_ACTIVE_SUBJECTS_FOR_MONTH, active.size);
  const sorted = [...sessions].filter((s) => s.subject && active.has(s.subject)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  /** @type {Map<string, Set<string|null>>} */
  const months = new Map();
  let date = null;
  let best = 0;
  for (const s of sorted) {
    const mk = s.date.slice(0, 7);
    const set = months.get(mk) || new Set();
    set.add(s.subject);
    months.set(mk, set);
    if (set.size > best) best = set.size;
    if (active.size >= MIN_ACTIVE_SUBJECTS_FOR_MONTH && set.size === active.size && date === null) date = s.date;
  }
  return { date, best, need };
}

/**
 * @param {string|undefined} st
 */
const isNeutralDay = (st) => st === 'rest' || st === 'excused';
/**
 * @param {Session} a
 * @param {Session} b
 */
const bySessionOrder = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0));

/**
 * الأسابيع (إثنين→أحد) المنتهية بالكامل التي أُنجزت كل أيامها المستهدفة (≥3 أيام مستهدفة).
 * يُعيد تواريخ نهاياتها (الأحد). تُستعمل للوسام ولنقاط الخبرة.
 * @param {Map<string,string>} statuses
 * @param {string} today
 * @returns {string[]}
 */
export function perfectWeekEnds(statuses, today) {
  const starts = new Set();
  for (const d of statuses.keys()) starts.add(weekDays(d)[0]);
  /** @type {string[]} */
  const out = [];
  for (const start of [...starts].sort()) {
    const days = weekDays(start);
    if (days[6] >= today) continue;
    if (!days.every((d) => statuses.has(d))) continue;
    const targeted = days.filter((d) => !isNeutralDay(statuses.get(d)));
    if (targeted.length < WEEK_MIN_DAYS) continue;
    if (targeted.every((d) => isDone(statuses.get(d)))) out.push(days[6]);
  }
  return out;
}

/**
 * ملخص كل شهر في الخط الزمني: الأيام الحاسمة والمنجزة، وهل أُغلق (انتهى وبدأ تتبعه من أوله).
 * @param {Map<string, DayStatus>} statuses
 * @param {string} today
 * @returns {{ mk: string, end: string, counted: number, done: number, pct: number, closed: boolean }[]}
 */
export function monthSummaries(statuses, today) {
  /** @type {Map<string, string[]>} */
  const months = new Map();
  for (const d of [...statuses.keys()].sort()) {
    const mk = d.slice(0, 7);
    const arr = months.get(mk) || [];
    arr.push(d);
    months.set(mk, arr);
  }
  const out = [];
  for (const [mk, days] of months) {
    const counted = days.filter((d) => !isNeutralDay(statuses.get(d)) && !(d === today && !isDone(statuses.get(d))));
    const done = counted.filter((d) => isDone(statuses.get(d))).length;
    const end = `${mk}-${String(new Date(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
    out.push({
      mk, end, counted: counted.length, done,
      pct: counted.length ? Math.floor((done / counted.length) * 100) : 0,
      closed: end < today && days[days.length - 1] === end,
    });
  }
  return out;
}

/**
 * @param {Map<string, DayStatus>} statuses
 * @param {string} today
 */
function weekHabit(statuses, today) {
  const ends = perfectWeekEnds(statuses, today);
  const cur = weekDays(today);
  const targetedNow = cur.filter((d) => statuses.has(d) && !isNeutralDay(statuses.get(d)));
  const doneNow = targetedNow.filter((d) => isDone(statuses.get(d))).length;
  return { date: ends[0] || null, value: doneNow, target: Math.max(WEEK_MIN_DAYS, targetedNow.length) };
}

/**
 * @param {Map<string, DayStatus>} statuses
 * @param {string} today
 */
function monthHabit(statuses, today) {
  let date = null;
  let ironDate = null;
  let currentPct = 0;
  let bestIron = 0;
  const thisMonth = today.slice(0, 7);
  for (const m of monthSummaries(statuses, today)) {
    if (m.mk === thisMonth) currentPct = m.pct;
    if (m.counted > 0) bestIron = Math.max(bestIron, m.pct);
    if (m.closed && m.counted >= MONTH_MIN_DAYS) {
      if (m.done * 100 >= MONTH_RATE_PCT * m.counted) date = minDate(date, m.end);
      if (m.done === m.counted) ironDate = minDate(ironDate, m.end);
    }
  }
  return { date, ironDate, pct: currentPct, bestPct: bestIron };
}

/**
 * أطول تتابع أيام يحقق فيه المستخدم هدف الفترة ('morning' | 'evening').
 * @param {Session[]} sessions
 * @param {Plan} plan
 * @param {string} today
 * @param {'morning'|'evening'} period
 * @param {number[]} steps
 */
function periodRun(sessions, plan, today, period, steps) {
  if (!sessions.length) return { dates: {}, best: 0 };
  const index = buildDayIndex(sessions);
  const first = sessions.reduce((m, s) => (s.date < m ? s.date : m), today);
  let run = 0;
  let best = 0;
  /** @type {Record<number, string>} */
  const dates = {};
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const t = dayTotals(index, d);
    const mins = period === 'morning' ? t.morningMins : t.eveningMins;
    const tg = targetsForDate(plan, d);
    const target = period === 'morning' ? tg.morningMins : tg.eveningMins;
    const ok = target > 0 ? mins >= target : mins > 0;
    run = ok ? run + 1 : 0;
    if (run > best) best = run;
    for (const n of steps) if (run >= n && !(n in dates)) dates[n] = d;
  }
  return { dates, best };
}

/**
 * @param {Session} s
 * @param {number} mins
 */
const isGoodTimer = (s, mins) => s.source === 'timer' && s.minutes >= mins;

/**
 * @param {Session[]} sessions
 */
function pomodoroResults(sessions) {
  const good = sessions.filter((s) => isGoodTimer(s, POMODORO_MIN_MINS)).sort(bySessionOrder);
  return { date: good.length >= POMODORO_COUNT_TARGET ? good[POMODORO_COUNT_TARGET - 1].date : null, count: good.length };
}

/**
 * @param {Session[]} sessions
 */
function preciseResults(sessions) {
  /** @type {Map<string, number>} */
  const perDay = new Map();
  for (const s of [...sessions].sort(bySessionOrder)) if (isGoodTimer(s, PRECISE_MIN_MINS)) perDay.set(s.date, (perDay.get(s.date) || 0) + 1);
  let best = 0;
  let date = null;
  for (const [d, n] of [...perDay.entries()].sort()) {
    best = Math.max(best, n);
    if (n >= PRECISE_COUNT_TARGET && date === null) date = d;
  }
  return { date, best };
}

/**
 * @param {Session[]} sessions
 */
function marathonResults(sessions) {
  /** @type {Map<string, number>} */
  const perDay = new Map();
  for (const s of sessions) perDay.set(s.date, (perDay.get(s.date) || 0) + s.minutes);
  let best = 0;
  let date = null;
  for (const [d, n] of [...perDay.entries()].sort()) {
    best = Math.max(best, n);
    if (n >= MARATHON_MINS && date === null) date = d;
  }
  return { date, best };
}

/**
 * أسبوع (إثنين→أحد) فيه جلسات في ≥4 أيام مختلفة.
 * @param {Session[]} sessions
 */
function firstWeekResults(sessions) {
  /** @type {Map<string, Set<string>>} */
  const weeks = new Map();
  let best = 0;
  let date = null;
  for (const s of [...sessions].filter((x) => x.minutes > 0).sort(bySessionOrder)) {
    const wk = weekDays(s.date)[0];
    const set = weeks.get(wk) || new Set();
    set.add(s.date);
    weeks.set(wk, set);
    best = Math.max(best, set.size);
    if (set.size >= FIRST_WEEK_DAYS && date === null) date = s.date;
  }
  return { date, best };
}

/**
 * أسبوع ذهبي: مجموع دقائق أسبوع واحد ≥ 25 ساعة.
 * @param {Session[]} sessions
 */
function goldenWeekResults(sessions) {
  /** @type {Map<string, number>} */
  const weeks = new Map();
  let best = 0;
  let date = null;
  for (const s of [...sessions].sort(bySessionOrder)) {
    const wk = weekDays(s.date)[0];
    const v = (weeks.get(wk) || 0) + s.minutes;
    weeks.set(wk, v);
    best = Math.max(best, v);
    if (v >= GOLDEN_WEEK_HOURS * 60 && date === null) date = s.date;
  }
  return { date, bestHours: Math.floor(best / 60) };
}

/**
 * عطلة نشطة: السبت والأحد كلاهما «منجز» في الأسبوع نفسه (ثابت: سبت+أحد).
 * @param {Map<string, DayStatus>} statuses
 * @param {string} today
 */
function holidayResults(statuses, today) {
  const starts = new Set();
  for (const d of statuses.keys()) starts.add(weekDays(d)[0]);
  let date = null;
  let best = 0;
  for (const start of [...starts].sort()) {
    const days = weekDays(start);
    const n = WEEKEND_SAT_SUN.filter((i) => isDone(statuses.get(days[i]))).length;
    best = Math.max(best, n);
    if (n === WEEKEND_SAT_SUN.length && date === null) date = days[WEEKEND_SAT_SUN[WEEKEND_SAT_SUN.length - 1]];
  }
  return { date, best };
}

/**
 * يحسب كل الأوسمة المستحقة (مع تاريخ تحقق الشرط) وتقدّم كل وسام.
 * @param {State} state الحالة الكاملة
 * @param {string} today YYYY-MM-DD
 * @returns {{ earned: Record<string, string>, progress: Record<string, { value: number, target: number }> }}
 */
export function evaluateAchievements(state, today) {
  const sessions = state.sessions.filter((s) => s.date <= today);
  const ctx = createContext({ ...state, sessions }, today);
  const { statuses } = getTimeline(ctx);

  /** @type {Record<string, string>} */
  const earned = {};
  /** @type {Record<string, { value: number, target: number }>} */
  const progress = {};
/**
 * @param {string} id
 * @param {string|null|undefined} date
 * @param {number} value
 * @param {number} target
 */
  const put = (id, date, value, target) => {
    if (date) earned[id] = date;
    progress[id] = { value: Math.min(target, value), target };
  };

  // البدايات
  const firstSession = sessions.filter((s) => s.minutes > 0).sort(bySessionOrder)[0];
  put('first-session', firstSession ? firstSession.date : null, firstSession ? 1 : 0, 1);
  const firstDone = [...statuses.keys()].sort().find((d) => isDone(statuses.get(d)));
  put('first-day', firstDone || null, firstDone ? 1 : 0, 1);
  const pomo = pomodoroResults(sessions);
  put('pomodoro-5', pomo.date, pomo.count, POMODORO_COUNT_TARGET);
  const fw = firstWeekResults(sessions);
  put('first-week', fw.date, fw.best, FIRST_WEEK_DAYS);

  // السلاسل
  const streak = streakResults(statuses, today);
  for (const n of STREAK_STEPS) put(`streak-${n}`, streak.dates[n], streak.best, n);

  // الساعات
  const hours = hoursResults(sessions);
  for (const h of HOURS_STEPS) put(`hours-${h}`, hours.dates[h], Math.floor(hours.totalMins / 60), h);

  // العادات والأوقات
  const mr = periodRun(sessions, state.plan, today, 'morning', MORNING_STEPS);
  put('habit-morning', mr.dates[5], mr.best, 5);
  put('habit-morning-15', mr.dates[15], mr.best, 15);
  const nr = periodRun(sessions, state.plan, today, 'evening', [NIGHT_RUN_TARGET]);
  put('habit-night', nr.dates[NIGHT_RUN_TARGET], nr.best, NIGHT_RUN_TARGET);
  const mar = marathonResults(sessions);
  put('habit-marathon', mar.date, mar.best, MARATHON_MINS);
  const hol = holidayResults(statuses, today);
  put('habit-holiday', hol.date, hol.best, WEEKEND_SAT_SUN.length);
  const pre = preciseResults(sessions);
  put('habit-precise', pre.date, pre.best, PRECISE_COUNT_TARGET);
  const gw = goldenWeekResults(sessions);
  put('habit-golden-week', gw.date, gw.bestHours, GOLDEN_WEEK_HOURS);

  // الالتزام وتنوع المواد
  const wv = weekVariety(sessions);
  put('variety-week', wv.date, wv.best, WEEK_SUBJECTS_TARGET);
  const mv = monthVariety(sessions, state.subjects || []);
  put('variety-month', mv.date, mv.best, mv.need);
  const wh = weekHabit(statuses, today);
  put('habit-week', wh.date, wh.value, wh.target);
  const mh = monthHabit(statuses, today);
  put('habit-month', mh.date, mh.pct, MONTH_RATE_PCT);
  put('habit-iron-month', mh.ironDate, mh.pct, 100);

  return { earned, progress };
}

/**
 * يطابق الأوسمة المخزَّنة مع السجل الحالي: يفتح المستحق الجديد (newly) ويسحب ما لم يعد مستحقاً (revoked)
 * ويعيد اشتقاق التواريخ. يعيد نفس كائن الحالة إن لم يتغير شيء.
 * @param {State} state الحالة الكاملة
 * @param {string} today
 * @returns {{ state: State, newly: string[], revoked: string[] }}
 */
export function applyAchievements(state, today) {
  const stored = (state.achievements && state.achievements.unlocked) || {};
  const { earned } = evaluateAchievements(state, today);
  /** @type {string[]} */
  const newly = [];
  /** @type {string[]} */
  const revoked = [];
  /** @type {Record<string, string>} */
  const unlocked = {};
  let changed = false;
  for (const b of BADGES) {
    const inEarned = b.id in earned;
    const inStored = b.id in stored;
    if (inEarned) {
      unlocked[b.id] = earned[b.id];
      if (!inStored) { newly.push(b.id); changed = true; } else if (stored[b.id] !== earned[b.id]) changed = true;
    } else if (inStored) {
      revoked.push(b.id);
      changed = true;
    }
  }
  if (!changed) return { state, newly, revoked };
  return { state: { ...state, achievements: { unlocked } }, newly, revoked };
}

/**
 * عرض صفحة الأوسمة: كل وسام مع حالته وتقدّمه.
 * @param {State} state الحالة الكاملة
 * @param {string} today
 */
export function badgeViews(state, today) {
  const stored = (state.achievements && state.achievements.unlocked) || {};
  const { progress } = evaluateAchievements(state, today);
  return BADGES.map((b) => {
    const unlockedOn = stored[b.id] || null;
    const p = progress[b.id] || { value: 0, target: b.target };
    const value = unlockedOn ? p.target : p.value;
    return {
      ...b,
      unlockedOn,
      value,
      target: p.target,
      pct: p.target > 0 ? Math.min(100, Math.round((value / p.target) * 100)) : 0,
    };
  });
}

/**
 * أوسمة فُتحت ضمن مدى تاريخي (للبطاقة المشاركة).
 * @param {State} state
 * @param {string} from
 * @param {string} to
 */
export function badgesUnlockedBetween(state, from, to) {
  const stored = (state.achievements && state.achievements.unlocked) || {};
  return BADGES.filter((b) => stored[b.id] && stored[b.id] >= from && stored[b.id] <= to);
}
