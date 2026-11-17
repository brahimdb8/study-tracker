// @ts-check
// ثوابت مشتركة (حدود وقيم افتراضية)
export const SCHEMA_VERSION = 5;

export const DEFAULT_FREEZES_PER_MONTH = 2;
export const MAX_FREEZES_PER_MONTH = 10;

export const MAX_SUBJECTS = 30;
export const MAX_SUBJECT_NAME = 30;

export const MAX_DAY_OFFS = 500;
export const MAX_DAY_OFF_SPAN_DAYS = 366;
export const MAX_DAY_OFF_NOTE = 100;

export const MAX_EXAMS = 20;
export const MAX_EXAM_NAME = 40;

// أقصى مدى رجوع لحساب الخط الزمني للحالات والسلسلة (أيام)
export const TIMELINE_MAX_DAYS = 1830;

// ---- المؤقت (بومودورو) — المرحلة 4 ----
export const DEFAULT_TIMER_SETTINGS = Object.freeze({
  focusMins: 25,
  shortMins: 5,
  longMins: 15,
  longEvery: 4,
  sound: true,   // نغمة عند نهاية الطور (كان المؤقت القديم يصدر نغمة دائماً)
  notify: false, // إشعارات المتصفح تتطلب إذنك، فهي مطفأة افتراضياً
});

// حدود كل حقل (أعداد صحيحة)
export const TIMER_LIMITS = Object.freeze({
  focusMins: { min: 1, max: 180 },
  shortMins: { min: 1, max: 60 },
  longMins: { min: 1, max: 120 },
  longEvery: { min: 2, max: 10 },
});
