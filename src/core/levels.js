// @ts-check
// نقاط الخبرة (XP) والمستويات — نقية من السجل ولا تُخزَّن (لا تغيير في المخطط).
// حذف الجلسات يخفّض النقاط، وكذلك نقاط الأوسمة إن سُحب وسام (الأوسمة تُقيَّم ديناميكياً من السجل).
/** @typedef {import('./types.js').State} State */

import { createContext } from './context.js';
import { getTimeline, isDone } from './status.js';
import { BADGE_IDS } from './badge-defs.js';
import { monthSummaries, perfectWeekEnds, runningStreaks } from './achievements.js';
import { MONTH_MIN_DAYS, MONTH_RATE_PCT } from './badge-defs.js';

export const MAX_LEVEL = 40;
export const XP_PER_MINUTES = 6;      // نقطة لكل 6 دقائق
export const XP_DONE_DAY = 50;
export const XP_STREAK_BONUS = 25;    // إضافية لكل يوم منجز سلسلته ≥ 3
export const XP_STREAK_MIN = 3;
export const XP_PERFECT_WEEK = 150;
export const XP_GOOD_MONTH = 400;
export const XP_PER_BADGE = 60;

export const LEVEL_TITLES = ['مبتدئ', 'مثابر', 'مجتهد', 'متفوق', 'نابغ', 'عبقري', 'أسطورة', 'حكيم'];

/**
 * النقاط اللازمة لبلوغ المستوى n (المستوى 1 = 0)، مقرّبة لأقرب 10.
 * @param {number} n
 * @returns {number}
 */
export function levelThreshold(n) {
  const k = Math.max(1, Math.min(MAX_LEVEL, Math.floor(n)));
  return Math.round((100 * (k - 1) ** 1.5) / 10) * 10;
}

/**
 * @param {number} n
 * @returns {string}
 */
export function levelTitle(n) {
  const k = Math.max(1, Math.min(MAX_LEVEL, Math.floor(n)));
  return LEVEL_TITLES[Math.floor((k - 1) / 5)];
}

/**
 * @param {number} xp
 */
export function levelFromXp(xp) {
  const x = Math.max(0, Math.floor(xp) || 0);
  let level = 1;
  while (level < MAX_LEVEL && x >= levelThreshold(level + 1)) level++;
  const floor = levelThreshold(level);
  const isMax = level >= MAX_LEVEL;
  const next = isMax ? floor : levelThreshold(level + 1);
  const span = Math.max(1, next - floor);
  return {
    level, title: levelTitle(level), xp: x, floor, next, isMax,
    intoLevel: x - floor, span,
    toNext: isMax ? 0 : next - x,
    pct: isMax ? 100 : Math.min(100, Math.floor(((x - floor) / span) * 100)),
  };
}

/**
 * تفصيل النقاط من الحالة الكاملة.
 * @param {State} state
 * @param {string} today
 */
export function computeXp(state, today) {
  const sessions = state.sessions.filter((s) => s.date <= today);
  const ctx = createContext({ ...state, sessions }, today);
  const { statuses } = getTimeline(ctx);

  const totalMins = sessions.reduce((a, s) => a + s.minutes, 0);
  const run = runningStreaks(statuses, today);
  let doneDays = 0;
  let streakDays = 0;
  for (const [d, st] of statuses) {
    if (!isDone(st)) continue;
    doneDays++;
    if ((run.get(d) || 0) >= XP_STREAK_MIN) streakDays++;
  }
  const weeks = perfectWeekEnds(statuses, today).length;
  const months = monthSummaries(statuses, today)
    .filter((m) => m.closed && m.counted >= MONTH_MIN_DAYS && m.done * 100 >= MONTH_RATE_PCT * m.counted).length;
  const unlocked = Object.keys((state.achievements && state.achievements.unlocked) || {}).filter((id) => BADGE_IDS.has(id)).length;

  const parts = [
    { key: 'time', label: 'وقت المذاكرة', count: totalMins, xp: Math.floor(totalMins / XP_PER_MINUTES) },
    { key: 'days', label: 'أيام مكتملة', count: doneDays, xp: doneDays * XP_DONE_DAY },
    { key: 'streak', label: 'مكافأة السلسلة', count: streakDays, xp: streakDays * XP_STREAK_BONUS },
    { key: 'weeks', label: 'أسابيع مثالية', count: weeks, xp: weeks * XP_PERFECT_WEEK },
    { key: 'months', label: 'أشهر متفوقة', count: months, xp: months * XP_GOOD_MONTH },
    { key: 'badges', label: 'أوسمة مفتوحة', count: unlocked, xp: unlocked * XP_PER_BADGE },
  ];
  const total = parts.reduce((a, p) => a + p.xp, 0);
  return { total, parts };
}

/**
 * مختصر لواجهة الشريط الجانبي والبطل.
 * @param {State} state
 * @param {string} today
 */
export function levelSummary(state, today) {
  const { total, parts } = computeXp(state, today);
  return { ...levelFromXp(total), parts };
}
