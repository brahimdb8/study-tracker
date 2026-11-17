// @ts-check
// أهلية الشاشة التعريفية: نقية. تظهر لمن لا جلسات ولا مواد لديه ولم يُنهها/يتخطّها من قبل.
export const ONBOARDED_KEY = 'studyTracker:onboarded';

/**
 * @param {Pick<import('./types.js').State, 'sessions'|'subjects'>} state
 * @param {unknown} flag
 * @returns {boolean}
 */
export function shouldShowOnboarding(state, flag) {
  if (flag) return false;
  return state.sessions.length === 0 && state.subjects.length === 0;
}

export const SUGGESTED_SUBJECTS = ['الرياضيات', 'الفيزياء', 'الكيمياء', 'الأحياء', 'اللغة العربية', 'اللغة الإنجليزية'];
