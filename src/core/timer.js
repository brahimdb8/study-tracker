// @ts-check
// حفظ حالة المؤقت واستعادتها (طبقة رقيقة فوق pomodoro.js).
// الحالة تُحفظ تحت مفتاح مستقل عن بيانات التطبيق الرئيسية، فلا تُلمس الجلسات من هنا أبداً:
// تسجيل الجلسة يتم في الصفحة عبر حدث focusCompleted ومعرّف ثابت (pomo-<startedAt>).
//
// المرحلة 4 استبدلت createTimer القديم بآلة pomodoro. هذا الملف يحوّل أيضاً
// مؤقت المرحلة 1–3 الجاري (المفتاح studyTracker:timer) إلى طور تركيز فلا تضيع جلسة في منتصفها.
/** @typedef {import('./types.js').StorageLike} StorageLike */
/** @typedef {import('./pomodoro.js').PomodoroState} PomodoroState */
import {
  MAX_PHASE_SEC, createIdleState, sanitizePomodoroState,
} from './pomodoro.js';

export const POMODORO_KEY = 'studyTracker:pomodoro';
export const LEGACY_TIMER_KEY = 'studyTracker:timer';
export const POMODORO_STORE_VERSION = 1;

/** @param {PomodoroState} s */
const isIdleClean = (s) => s.phase === 'idle' && s.cycle === 0;

/** @param {StorageLike|null|undefined} storage @param {PomodoroState} state */
export function savePomodoro(storage, state) {
  if (!storage) return;
  try {
    if (isIdleClean(state)) storage.removeItem(POMODORO_KEY);
    else storage.setItem(POMODORO_KEY, JSON.stringify({ v: POMODORO_STORE_VERSION, ...state }));
  } catch { /* لا يهم: التخزين محجوب أو ممتلئ */ }
}

// يحوّل حمولة المؤقت القديم { duration, remaining, endTime, startedAt, running } (بالثواني) إلى حالة تركيز، أو null
/**
 * @param {Record<string, any>|null|undefined} saved
 * @returns {PomodoroState|null}
 */
export function convertLegacyTimer(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const { duration, remaining } = saved;
  if (!Number.isFinite(duration) || duration < 60 || duration > MAX_PHASE_SEC) return null;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;

  const durationSec = Math.round(duration);
  /** @type {PomodoroState} */
  const common = { ...createIdleState(), phase: 'focus', durationSec, subject: null };

  if (saved.running === true && Number.isFinite(saved.endTime)) {
    const startedAt = Number.isFinite(saved.startedAt) ? saved.startedAt : saved.endTime - durationSec * 1000;
    return { ...common, running: true, endTime: saved.endTime, remainingSec: durationSec, startedAt };
  }
  const rem = Math.min(Math.ceil(remaining), durationSec);
  const startedAt = Number.isFinite(saved.startedAt) ? saved.startedAt : null;
  if (startedAt === null) return null; // موقوف بلا وقت بدء: لا يمكن نسبه إلى يوم
  return { ...common, running: false, endTime: null, remainingSec: rem, startedAt };
}

/**
 * @param {StorageLike} storage
 * @param {string} key
 * @returns {{ raw: string|null, data: Record<string, any>|null, bad?: boolean }|null}
 */
function readJSON(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? { raw, data: JSON.parse(raw) } : null;
  } catch {
    return { raw: null, data: null, bad: true };
  }
}

// يعيد { state, migratedLegacy }. التالف يُهمل ويُمسح (ولا يعطّل الصفحة).
/** @param {StorageLike|null|undefined} storage @returns {{ state: PomodoroState, migratedLegacy: boolean }} */
export function loadPomodoro(storage) {
  const idle = { state: createIdleState(), migratedLegacy: false };
  if (!storage) return idle;

  const current = readJSON(storage, POMODORO_KEY);
  if (current) {
    const state = current.bad ? null : sanitizePomodoroState(current.data);
    if (!state) { try { storage.removeItem(POMODORO_KEY); } catch { /* لا يهم */ } }
    else {
      try { storage.removeItem(LEGACY_TIMER_KEY); } catch { /* لا يهم */ }
      return { state, migratedLegacy: false };
    }
  }

  const legacy = readJSON(storage, LEGACY_TIMER_KEY);
  if (legacy) {
    const state = legacy.bad ? null : convertLegacyTimer(legacy.data);
    if (state) {
      savePomodoro(storage, state);       // نكتب الجديد أولاً ثم نحذف القديم: لا نافذة يضيع فيها شيء
      try { storage.removeItem(LEGACY_TIMER_KEY); } catch { /* لا يهم */ }
      return { state, migratedLegacy: true };
    }
    try { storage.removeItem(LEGACY_TIMER_KEY); } catch { /* لا يهم */ }
  }
  return idle;
}
