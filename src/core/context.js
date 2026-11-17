// @ts-check
// يبني سياق الحساب الذي تستهلكه status/stats من الحالة المخزنة.
// أنشئ سياقاً جديداً عند كل عرض (يُخزَّن عليه الخط الزمني المحسوب).
import { DEFAULT_FREEZES_PER_MONTH } from './constants.js';
import { buildDayIndex } from './sessions.js';

/**
 * @param {import('./types.js').State} state
 * @param {string} today
 * @returns {import('./types.js').EvalCtx}
 */
export function createContext(state, today) {
  const freezes = state.settings && Number.isInteger(state.settings.freezesPerMonth)
    ? state.settings.freezesPerMonth
    : DEFAULT_FREEZES_PER_MONTH;
  return {
    index: buildDayIndex(state.sessions),
    plan: state.plan,
    trackingStart: state.settings.trackingStart,
    today,
    dayOffs: state.dayOffs || [],
    freezesPerMonth: freezes,
  };
}
