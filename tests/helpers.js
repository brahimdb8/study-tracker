import { createInitialPlan } from '../src/core/plan.js';
import { buildDayIndex } from '../src/core/sessions.js';

// تخزين وهمي في الذاكرة
export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

let counter = 0;
export function session(date, period, minutes, extra = {}) {
  counter += 1;
  return {
    id: `t${counter}`, date, period, minutes,
    startedAt: null, source: 'manual', subject: null, note: '', createdAt: counter,
    ...extra,
  };
}

// سياق الحساب. الافتراضي: بلا تجميد وبلا أيام استثنائية (يطابق سلوك المرحلة 1).
export function ctxFor(sessions, {
  today, trackingStart = '2026-01-01', plan = createInitialPlan(), dayOffs = [], freezesPerMonth = 0,
}) {
  return { index: buildDayIndex(sessions), plan, trackingStart, today, dayOffs, freezesPerMonth };
}

export function dayOff(from, to, type = 'vacation', id = `d-${from}-${to}`) {
  return { id, from, to, type, note: '' };
}
