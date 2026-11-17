// @ts-check
// آلة حالات بومودورو — نقية بلا DOM ولا تخزين ولا ساعة خفية: كل دالة تستقبل `now` (مللي ثانية).
//
// الحالة (state) كائن عادي لا يُعدَّل بل تُرجع الدوال نسخة جديدة:
//   { phase: 'idle'|'focus'|'shortBreak'|'longBreak',
//     running, durationSec, remainingSec, endTime, startedAt, subject, cycle, cycleDate }
//
// - الحالة المعروضة «paused» مشتقّة: أي طور غير idle وليس جارياً (انظر getView).
// - endTime (مللي ثانية) يُعتمد عليه أثناء الجريان؛ remainingSec يُعتمد عليه أثناء الإيقاف المؤقت.
// - الدوال لا تنفّذ آثاراً جانبية: ما يجب فعله (تسجيل جلسة، إشعار...) يعود في قائمة `events`.
//
// أحداث:
//   { type: 'focusCompleted', id, minutes, startedAt, subject, early }  ← جلسة تُسجَّل
//   { type: 'phaseChanged', from, to, at }                              ← للإشعار والصوت
/** @typedef {import('./types.js').TimerSettings} TimerSettings */
/** @typedef {'idle'|'focus'|'shortBreak'|'longBreak'} PomodoroPhase */
/**
 * @typedef {object} PomodoroState
 * @property {PomodoroPhase} phase
 * @property {boolean} running
 * @property {number} durationSec
 * @property {number} remainingSec
 * @property {number|null} endTime
 * @property {number|null} startedAt
 * @property {string|null} subject
 * @property {number} cycle
 * @property {string|null} cycleDate
 */
/**
 * @typedef {{ type: 'focusCompleted', id: string, minutes: number, startedAt: number|null, subject: string|null, early: boolean }
 *   | { type: 'phaseChanged', from: PomodoroPhase, to: PomodoroPhase, at: number }} PomodoroEvent
 */
import { DEFAULT_TIMER_SETTINGS, TIMER_LIMITS } from './constants.js';
import { formatDate, isValidDateStr } from './dates.js';

/** @type {PomodoroPhase[]} */
export const PHASES = ['idle', 'focus', 'shortBreak', 'longBreak'];
export const MAX_PHASE_SEC = 180 * 60;
const MAX_CYCLE = TIMER_LIMITS.longEvery.max;

// ---------- إعدادات المؤقت ----------

/** @type {Array<'focusMins'|'shortMins'|'longMins'|'longEvery'>} */
const LIMIT_KEYS = /** @type {Array<'focusMins'|'shortMins'|'longMins'|'longEvery'>} */ (Object.keys(TIMER_LIMITS));

/** @param {unknown} v */
const isBool = (v) => typeof v === 'boolean';
/** @param {number} v @param {{ min: number, max: number }} limits */
const inRange = (v, { min, max }) => Number.isInteger(v) && v >= min && v <= max;

// تنظيف settings.timer: الحقل المفقود يأخذ الافتراضي بصمت،
// والحقل الموجود وغير الصالح يأخذ الافتراضي ويُحصى في dropped (فيظهر إشعار للمستخدم).
/**
 * @param {Record<string, any>|null|undefined} raw مدخل غير موثوق (JSON مخزَّن)
 * @returns {{ value: TimerSettings, dropped: number }}
 */
export function sanitizeTimerSettings(raw) {
  /** @type {TimerSettings} */
  const out = { ...DEFAULT_TIMER_SETTINGS };
  if (raw === undefined || raw === null) return { value: out, dropped: 0 };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { value: out, dropped: 1 };

  let dropped = 0;
  for (const key of LIMIT_KEYS) {
    if (raw[key] === undefined) continue;
    if (inRange(raw[key], TIMER_LIMITS[key])) out[key] = raw[key];
    else dropped++;
  }
  for (const key of /** @type {const} */ (['sound', 'notify'])) {
    if (raw[key] === undefined) continue;
    if (isBool(raw[key])) out[key] = raw[key];
    else dropped++;
  }
  return { value: out, dropped };
}

// تحقق صارم لواجهة الإعدادات: يعيد { ok, value } أو { ok:false, error }
/**
 * @param {Record<string, any>} input مدخل الواجهة (قيم غير موثوقة)
 * @returns {{ ok: true, value: TimerSettings } | { ok: false, error: string }}
 */
export function validateTimerSettings(input) {
  /** @type {Record<string, string>} */
  const labels = { focusMins: 'مدة التركيز', shortMins: 'الاستراحة القصيرة', longMins: 'الاستراحة الطويلة', longEvery: 'الاستراحة الطويلة بعد (جلسات)' };
  for (const key of LIMIT_KEYS) {
    if (!inRange(input[key], TIMER_LIMITS[key])) {
      const { min, max } = TIMER_LIMITS[key];
      return { ok: false, error: `${labels[key]}: أدخل عدداً صحيحاً بين ${min} و${max}.` };
    }
  }
  return {
    ok: true,
    value: {
      focusMins: input.focusMins,
      shortMins: input.shortMins,
      longMins: input.longMins,
      longEvery: input.longEvery,
      sound: input.sound === true,
      notify: input.notify === true,
    },
  };
}

// ---------- الحالة ----------

/** @returns {PomodoroState} */
export function createIdleState() {
  return {
    phase: 'idle', running: false, durationSec: 0, remainingSec: 0,
    endTime: null, startedAt: null, subject: null, cycle: 0, cycleDate: null,
  };
}

/** @param {string} phase */
export const isBreakPhase = (phase) => phase === 'shortBreak' || phase === 'longBreak';

/** @param {PomodoroState} state @param {number} now */
export function remainingOf(state, now) {
  if (state.phase === 'idle') return 0;
  return state.running ? Math.max(0, Math.ceil((/** @type {number} */ (state.endTime) - now) / 1000)) : state.remainingSec;
}

// صفر عند اليوم الجديد: الدورة تخص يوماً واحداً
/** @param {PomodoroState} state @param {number} now @returns {PomodoroState} */
function normalizeCycle(state, now) {
  if (state.cycle > 0 && state.cycleDate !== formatDate(new Date(now))) {
    return { ...state, cycle: 0, cycleDate: null };
  }
  return state;
}

/**
 * @param {PomodoroState} state
 * @param {{ at: number, config: TimerSettings, cycle: number, cycleDate: string|null }} opts
 * @returns {PomodoroState}
 */
function startBreak(state, { at, config, cycle, cycleDate }) {
  const long = cycle >= config.longEvery;
  const sec = (long ? config.longMins : config.shortMins) * 60;
  return {
    ...state,
    phase: long ? 'longBreak' : 'shortBreak',
    running: true,
    durationSec: sec,
    remainingSec: sec,
    endTime: at + sec * 1000,
    startedAt: at,
    subject: null,
    cycle,
    cycleDate,
  };
}

/** @param {PomodoroState} state @returns {PomodoroState} */
function afterBreak(state) {
  // الاستراحة الطويلة تُغلق الدورة؛ القصيرة تُبقي العدّاد
  const cycle = state.phase === 'longBreak' ? 0 : state.cycle;
  return {
    ...createIdleState(),
    cycle,
    cycleDate: cycle > 0 ? state.cycleDate : null,
  };
}

// يتقدّم بالحالة إلى اللحظة now: يعالج كل طور انتهى (حتى لو انتهى أكثر من طور أثناء الغياب).
// كل انتقال يُحسب من وقته الفعلي (endTime) لا من وقت الاستدعاء، فلا جلسات وهمية ولا وقت مفقود.
/**
 * @param {PomodoroState} state
 * @param {number} now
 * @param {TimerSettings} config
 * @returns {{ state: PomodoroState, events: PomodoroEvent[] }}
 */
export function advance(state, now, config) {
  /** @type {PomodoroEvent[]} */
  const events = [];
  let s = normalizeCycle(state, now);

  for (let guard = 0; guard < 16 && s.running && now >= /** @type {number} */ (s.endTime); guard++) {
    const at = /** @type {number} */ (s.endTime);
    if (s.phase === 'focus') {
      const cycle = s.cycle + 1;
      events.push({
        type: 'focusCompleted',
        id: `pomo-${s.startedAt}`,
        minutes: Math.floor(s.durationSec / 60),
        startedAt: s.startedAt,
        subject: s.subject,
        early: false,
      });
      s = startBreak(s, { at, config, cycle, cycleDate: formatDate(new Date(at)) });
      events.push({ type: 'phaseChanged', from: 'focus', to: s.phase, at });
    } else {
      const from = s.phase;
      s = afterBreak(s);
      events.push({ type: 'phaseChanged', from, to: 'idle', at });
    }
  }
  return { state: s, events };
}

// بدء تركيز جديد (من idle فقط). subject: معرّف المادة أو null.
/**
 * @param {PomodoroState} state
 * @param {number} now
 * @param {TimerSettings} config
 * @param {unknown} [subject]
 * @returns {PomodoroState}
 */
export function startFocus(state, now, config, subject = null) {
  if (state.phase !== 'idle') return state;
  const s = normalizeCycle(state, now);
  const sec = config.focusMins * 60;
  return {
    ...s,
    phase: 'focus',
    running: true,
    durationSec: sec,
    remainingSec: sec,
    endTime: now + sec * 1000,
    startedAt: now,
    subject: typeof subject === 'string' ? subject : null,
  };
}

/** @param {PomodoroState} state @param {number} now @returns {PomodoroState} */
export function pause(state, now) {
  if (state.phase === 'idle' || !state.running) return state;
  return { ...state, running: false, remainingSec: remainingOf(state, now), endTime: null };
}

/** @param {PomodoroState} state @param {number} now @returns {PomodoroState} */
export function resume(state, now) {
  if (state.phase === 'idle' || state.running) return state;
  return { ...state, running: true, endTime: now + state.remainingSec * 1000 };
}

// إنهاء الطور الحالي يدوياً:
//  - تركيز: تُحفظ الدقائق الكاملة المنقضية إن بلغت دقيقة (ثم idle بلا استراحة ولا زيادة في الدورة)
//  - استراحة: تخطٍّ (الاستراحة الطويلة تُغلق الدورة)
/**
 * @param {PomodoroState} state
 * @param {number} now
 * @returns {{ state: PomodoroState, events: PomodoroEvent[] }}
 */
export function stop(state, now) {
  if (state.phase === 'idle') return { state, events: [] };

  if (state.phase === 'focus') {
    const elapsedSec = state.durationSec - remainingOf(state, now);
    const minutes = Math.floor(Math.max(0, elapsedSec) / 60);
    /** @type {PomodoroEvent[]} */
    const events = [];
    if (minutes >= 1) {
      events.push({
        type: 'focusCompleted',
        id: `pomo-${state.startedAt}`,
        minutes,
        startedAt: state.startedAt,
        subject: state.subject,
        early: true,
      });
    }
    return {
      state: { ...createIdleState(), cycle: state.cycle, cycleDate: state.cycle > 0 ? state.cycleDate : null },
      events,
    };
  }

  return {
    state: afterBreak(state),
    events: [{ type: 'phaseChanged', from: state.phase, to: 'idle', at: now }],
  };
}

// ---------- العرض ----------

// mode: idle | focus | shortBreak | longBreak | paused (الطور في phase دائماً)
/** @param {PomodoroState} state @param {number} now @param {TimerSettings} config */
export function getView(state, now, config) {
  const s = normalizeCycle(state, now);
  const phase = s.phase;
  const remainingSec = phase === 'idle' ? config.focusMins * 60 : remainingOf(s, now);
  const durationSec = phase === 'idle' ? config.focusMins * 60 : s.durationSec;
  const progress = phase === 'idle' || durationSec <= 0 ? 0 : Math.min(1, Math.max(0, 1 - remainingSec / durationSec));
  return {
    mode: phase !== 'idle' && !s.running ? 'paused' : phase,
    phase,
    running: s.running,
    remainingSec,
    durationSec,
    progress,
    cycle: s.cycle,
    cycleLength: config.longEvery,
    subject: s.subject,
  };
}

// ---------- التحقق من حالة مخزَّنة (يستعملها timer.js) ----------

// يعيد حالة صالحة أو null إن كانت تالفة
/**
 * @param {Record<string, any>|null|undefined} raw مدخل غير موثوق (JSON مخزَّن)
 * @returns {PomodoroState|null}
 */
export function sanitizePomodoroState(raw) {
  if (!raw || typeof raw !== 'object' || !PHASES.includes(raw.phase)) return null;

  const cycle = Number.isInteger(raw.cycle) && raw.cycle >= 0 && raw.cycle <= MAX_CYCLE ? raw.cycle : 0;
  const cycleDate = cycle > 0 && isValidDateStr(raw.cycleDate) ? raw.cycleDate : null;
  const base = { ...createIdleState(), cycle: cycleDate ? cycle : 0, cycleDate };

  if (raw.phase === 'idle') return base;

  const dur = raw.durationSec;
  if (!Number.isInteger(dur) || dur < 60 || dur > MAX_PHASE_SEC) return null;
  if (!Number.isFinite(raw.startedAt)) return null;

  const common = {
    ...base,
    phase: raw.phase,
    durationSec: dur,
    startedAt: raw.startedAt,
    subject: raw.phase === 'focus' && typeof raw.subject === 'string' ? raw.subject : null,
  };

  if (raw.running === true) {
    if (!Number.isFinite(raw.endTime)) return null;
    return { ...common, running: true, remainingSec: dur, endTime: raw.endTime };
  }
  if (!Number.isFinite(raw.remainingSec) || raw.remainingSec <= 0 || raw.remainingSec > dur) return null;
  return { ...common, running: false, remainingSec: Math.ceil(raw.remainingSec), endTime: null };
}
