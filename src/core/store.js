// @ts-check
// طبقة التخزين: حالة واحدة موحّدة بنسخة مخطط (schemaVersion).
// تُحقن فيها واجهة storage (getItem/setItem/removeItem) فيسهل اختبارها،
// وفي المرحلة 7 يمكن استبدالها بـ IndexedDB دون المساس بباقي الكود.
//
// ملاحظة: اسم المفتاح 'studyTracker:v2' تسمية تاريخية لمساحة التخزين، وليس رقم المخطط.
// رقم المخطط داخل الحالة نفسها (schemaVersion). الإصدارات 2 و3 و4 تُرقَّى تلقائياً إلى 5.
import { applyAchievements, badgeById, createInitialAchievements, sanitizeAchievements } from './achievements.js';
import { DEFAULT_FREEZES_PER_MONTH, DEFAULT_TIMER_SETTINGS, MAX_FREEZES_PER_MONTH, SCHEMA_VERSION } from './constants.js';
import { sanitizeDayOffs } from './dayoffs.js';
import { sanitizeExams } from './exams.js';
import { isValidDateStr, todayStr } from './dates.js';
import { QUALITIES, migrateLegacy } from './migrate.js';
import { createInitialPlan, normalizePlan } from './plan.js';
import { sanitizeTimerSettings } from './pomodoro.js';
import { isValidSession } from './sessions.js';
import { sanitizeSubjects } from './subjects.js';

/** @typedef {import('./types.js').State} State */
/** @typedef {import('./types.js').Session} Session */
/** @typedef {import('./types.js').StorageLike} StorageLike */
/** @typedef {{ ok: false, error: string }} Failure */
/** @typedef {{ ok: true, dropped: number, upgradedFrom: number|null, state: State }} SanitizeOk */

export { SCHEMA_VERSION };

export const STATE_KEY = 'studyTracker:v2';
export const LEGACY_BACKUP_KEY = 'studyTracker:legacyBackup';
export const SCHEMA2_BACKUP_KEY = 'studyTracker:backup:schema2';
export const SCHEMA3_BACKUP_KEY = 'studyTracker:backup:schema3';
export const SCHEMA4_BACKUP_KEY = 'studyTracker:backup:schema4';
export const PRE_IMPORT_BACKUP_KEY = 'studyTracker:preImportBackup';
// نسخة تُحفظ مرة واحدة قبل أول سحب وسام بالتقييم الديناميكي (شبكة أمان ضد أي فقدان مفاجئ)
export const BADGE_AUDIT_BACKUP_KEY = 'studyTracker:backup:preBadgeAudit';
export const LEGACY_KEYS = ['studyLogs', 'monthlyCustomTargets', 'monthlyTargetsLocked', 'trackingStart'];

// إصدارات المخطط التي نقبلها ونرقّيها إلى الحالي
const UPGRADABLE_FROM = [2, 3, 4];

/** @param {string} [today] @returns {State} */
export function createInitialState(today = todayStr()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    sessions: [],
    dayMeta: {},
    subjects: [],
    dayOffs: [],
    exams: [],
    achievements: createInitialAchievements(),
    plan: createInitialPlan(),
    settings: { trackingStart: today, freezesPerMonth: DEFAULT_FREEZES_PER_MONTH, timer: { ...DEFAULT_TIMER_SETTINGS } },
  };
}

// تنظيف الحالة (وترقيتها من الإصدارات 2 و3 و4): يسقط/يصلح العناصر التالفة ويعيد عددها
/**
 * @param {Record<string, any>} raw مدخل غير موثوق (JSON مخزَّن أو مستورد)
 * @param {string} [today]
 * @returns {Failure | SanitizeOk}
 */
export function sanitizeState(raw, today = todayStr()) {
  const version = raw && typeof raw === 'object' ? raw.schemaVersion : undefined;
  if (version !== SCHEMA_VERSION && !UPGRADABLE_FROM.includes(version)) {
    return { ok: false, error: 'ملف غير صالح أو بإصدار غير مدعوم.' };
  }
  if (!Array.isArray(raw.sessions)) return { ok: false, error: 'سجل الجلسات مفقود.' };

  let dropped = 0;

  const subjectsRes = sanitizeSubjects(raw.subjects);
  dropped += subjectsRes.dropped;
  const subjectIds = new Set(subjectsRes.list.map((s) => s.id));

  const dayOffsRes = sanitizeDayOffs(raw.dayOffs);
  dropped += dayOffsRes.dropped;

  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Session[]} */
  const sessions = [];
  for (const s of raw.sessions) {
    if (!isValidSession(s) || seen.has(s.id)) { dropped++; continue; }
    seen.add(s.id);
    let subject = typeof s.subject === 'string' ? s.subject : null;
    if (subject !== null && !subjectIds.has(subject)) { subject = null; dropped++; } // مرجع مادة غير موجودة
    sessions.push({
      id: s.id,
      date: s.date,
      period: s.period,
      minutes: s.minutes,
      startedAt: s.startedAt ?? null,
      source: typeof s.source === 'string' ? s.source : 'manual',
      subject,
      note: typeof s.note === 'string' ? s.note.slice(0, 200) : '',
      createdAt: Number.isFinite(s.createdAt) ? s.createdAt : 0,
    });
  }

  /** @type {Record<string, {quality: string}>} */
  const dayMeta = {};
  const metaSrc = raw.dayMeta && typeof raw.dayMeta === 'object' ? raw.dayMeta : {};
  for (const [date, meta] of Object.entries(metaSrc)) {
    if (isValidDateStr(date) && meta && QUALITIES.includes(meta.quality)) dayMeta[date] = { quality: meta.quality };
    else dropped++;
  }

  const dates = [...sessions.map((s) => s.date), ...Object.keys(dayMeta)].sort();
  const rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  let trackingStart = isValidDateStr(rawSettings.trackingStart) ? rawSettings.trackingStart : (dates[0] || today);
  if (dates.length && dates[0] < trackingStart) trackingStart = dates[0];

  const f = rawSettings.freezesPerMonth;
  const freezesPerMonth = Number.isInteger(f) && f >= 0 && f <= MAX_FREEZES_PER_MONTH ? f : DEFAULT_FREEZES_PER_MONTH;

  const timerRes = sanitizeTimerSettings(rawSettings.timer);
  dropped += timerRes.dropped;

  const examsRes = sanitizeExams(raw.exams);
  dropped += examsRes.dropped;
  const achRes = sanitizeAchievements(raw.achievements);
  dropped += achRes.dropped;

  return {
    ok: true,
    dropped,
    upgradedFrom: version === SCHEMA_VERSION ? null : version,
    state: {
      schemaVersion: SCHEMA_VERSION,
      sessions,
      dayMeta,
      subjects: subjectsRes.list,
      dayOffs: dayOffsRes.list,
      exams: examsRes.list,
      achievements: achRes.value,
      plan: normalizePlan(raw.plan),
      settings: { trackingStart, freezesPerMonth, timer: timerRes.value },
    },
  };
}

const MASS_UNLOCK_MAX = 3;

/** @param {number} n */
function badgeCountText(n) {
  if (n === 1) return 'وسام واحد';
  if (n === 2) return 'وسامان';
  return n <= 10 ? `${n} أوسمة` : `${n} وساماً`;
}

/** @returns {StorageLike} */
function resolveStorage() {
  try {
    // التخزين الافتراضي الوحيد المسموح: يُحقن غيره في الاختبارات
    // eslint-disable-next-line no-restricted-properties
    const ls = /** @type {any} */ (globalThis).localStorage;
    if (ls) {
      const probe = '__probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch { /* محجوب */ }
  // بديل في الذاكرة إذا كان التخزين محجوباً (وضع خاص مثلاً)
  /** @type {Map<string, string>} */
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? /** @type {string} */ (mem.get(k)) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

/** @type {ReturnType<typeof createStore>|null} */
let singleton = null;
/** @type {StorageLike|null} */
let configured = null;

/**
 * يضبط التخزين المستعمل في getStore/getStorage (يُستدعى مرة واحدة عند الإقلاع قبل أول getStore).
 * @param {StorageLike} storage
 */
export function configureStorage(storage) {
  if (singleton) throw new Error('configureStorage يجب أن يسبق أول getStore()');
  configured = storage;
}

export function getStorage() {
  return configured || resolveStorage();
}

export function getStore() {
  if (!singleton) singleton = createStore(getStorage());
  return singleton;
}

/**
 * @param {StorageLike} storage
 * @param {{ now?: () => Date }} [opts]
 */
export function createStore(storage, { now = () => new Date() } = {}) {
  /** @type {Set<(state: State) => void>} */
  const listeners = new Set();
  /** @type {State} */
  let state = /** @type {State} */ (/** @type {unknown} */ (undefined)); // يُملأ في init() قبل أي استخدام
  /** @type {unknown} */
  let lastError = null;
  /** @type {string[]} */
  const notices = [];
  /** @type {string[]} */
  const unlocks = [];

  const today = () => todayStr(now());

  /** @param {string} key @param {string} value */
  function safeWrite(key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch (e) {
      lastError = e;
      return false;
    }
  }

  /** @param {string} key */
  function readRaw(key) {
    try { return storage.getItem(key); } catch { return null; }
  }

  function persist() {
    const ok = safeWrite(STATE_KEY, JSON.stringify(state));
    if (!ok) notices.push('تعذّر الحفظ في المتصفح (قد تكون المساحة ممتلئة أو التخزين محجوباً).');
    return ok;
  }

  function loadLegacy() {
    /** @type {Record<string, string>} */
    const raws = {};
    /** @type {Record<string, any>} */ // JSON قديم غير موثوق
    const parsed = {};
    for (const key of LEGACY_KEYS) {
      const raw = readRaw(key);
      if (raw === null) continue;
      raws[key] = raw;
      try { parsed[key] = JSON.parse(raw); } catch { /* تالف: يُتجاهل */ }
    }
    return { raws, parsed, found: Object.keys(raws).length > 0 };
  }

  // يطابق الأوسمة مع السجل الحالي (فتح المستحق وسحب غير المستحق). silent: إشعار مجمّع بدل إشعار لكل وسام (ترقية/استيراد/استعادة).
  /** @param {{ silent?: boolean }} [opts] */
  function refreshAchievements({ silent = false } = {}) {
    const res = applyAchievements(state, today());
    if (res.state === state) return 0;
    if (res.revoked.length && readRaw(BADGE_AUDIT_BACKUP_KEY) === null) {
      safeWrite(BADGE_AUDIT_BACKUP_KEY, JSON.stringify(state)); // قبل أول سحب: نسخة بالحالة كما كانت
    }
    state = res.state;
    // أكثر من 3 دفعة واحدة (أول استخدام بعد التحديث مثلاً): إشعار مجمّع بدل سيل احتفالات
    if (res.newly.length) {
      if (silent || res.newly.length > MASS_UNLOCK_MAX) notices.push(`🏅 فُتح ${badgeCountText(res.newly.length)} من سجلك.`);
      else unlocks.push(...res.newly);
    }
    // السحب يُعلَن دائماً (لا يُكتم حتى في الوضع الصامت): المستخدم يجب أن يعرف لماذا اختفى وسام
    if (res.revoked.length === 1) {
      const b = badgeById(res.revoked[0]);
      notices.push(`↩️ سُحب وسام «${b ? b.title : res.revoked[0]}» لأن سجلك الحالي لم يعد يحققه (قد يعود إن تحقق الشرط من جديد).`);
    } else if (res.revoked.length > 1) {
      notices.push(`↩️ سُحب ${badgeCountText(res.revoked.length)} لأن سجلك الحالي لم يعد يحققها (قد تعود إن تحقق الشرط من جديد).`);
    }
    return res.newly.length + res.revoked.length;
  }

  function init() {
    const raw = readRaw(STATE_KEY);
    if (raw !== null) {
      let parsed = null;
      let parseFailed = false;
      try { parsed = JSON.parse(raw); } catch { parseFailed = true; }

      /** @type {Failure | SanitizeOk} */
      const result = parseFailed ? /** @type {Failure} */ ({ ok: false }) : sanitizeState(parsed, today());
      if (result.ok) {
        state = result.state;
        if (result.upgradedFrom) {
          // ترقية المخطط: نحتفظ بالأصل مرة واحدة قبل أي كتابة (لكل إصدار مفتاح نسخة خاص به)
          const backupKey = result.upgradedFrom === 2 ? SCHEMA2_BACKUP_KEY
            : result.upgradedFrom === 3 ? SCHEMA3_BACKUP_KEY : SCHEMA4_BACKUP_KEY;
          if (readRaw(backupKey) === null) safeWrite(backupKey, raw);
          notices.push(result.upgradedFrom === 2
            ? 'تم تحديث بياناتك إلى الإصدار 5 (المواد والأيام الاستثنائية وإعدادات المؤقت والأوسمة والامتحانات)، وحُفظت نسخة من الأصل.'
            : result.upgradedFrom === 3
              ? 'تم تحديث بياناتك إلى الإصدار 5 (إعدادات المؤقت والأوسمة والامتحانات)، وحُفظت نسخة من الأصل.'
              : 'تم تحديث بياناتك إلى الإصدار 5 (الأوسمة والامتحانات)، وحُفظت نسخة من الأصل.');
        }
        if (result.dropped > 0) {
          safeWrite(`${STATE_KEY}__corrupt_${Date.now()}`, raw);
          notices.push(`تم تجاهل أو إصلاح ${result.dropped} عنصراً غير صالح، وحُفظت نسخة من الأصل.`);
        }
        // الأوسمة: بعد الترقية يُفتح المستحق من السجل بصمت مع إشعار مجمّع، وفيما عدا ذلك تُعلَن الجديدة
        refreshAchievements({ silent: !!result.upgradedFrom });
        persist();
        return;
      }
      safeWrite(`${STATE_KEY}__corrupt_${Date.now()}`, raw);
      notices.push('وُجدت بيانات تالفة؛ حُفظت منها نسخة وبدأ سجل جديد.');
    }

    const legacy = loadLegacy();
    if (legacy.found) {
      if (readRaw(LEGACY_BACKUP_KEY) === null) safeWrite(LEGACY_BACKUP_KEY, JSON.stringify(legacy.raws));
      state = migrateLegacy(legacy.parsed, today());
      notices.push('تم ترحيل بياناتك القديمة إلى النظام الجديد، وحُفظت نسخة من الأصل.');
    } else {
      state = createInitialState(today());
    }
    refreshAchievements({ silent: legacy.found });
    persist();
  }

  init();

  function emit() {
    for (const fn of listeners) fn(state);
  }

  return {
    getState: () => state,
    /** @param {State} next */
    commit(next) {
      state = next;
      refreshAchievements();
      const ok = persist();
      emit();
      return ok;
    },
    // إعادة القراءة (مثلاً عند تغيّر البيانات من تبويب آخر)
    reload() {
      const raw = readRaw(STATE_KEY);
      if (raw === null) return;
      try {
        const res = sanitizeState(JSON.parse(raw), today());
        if (res.ok) { state = res.state; emit(); }
      } catch { /* تجاهل */ }
    },
    /** @param {(state: State) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    takeNotices() {
      return notices.splice(0, notices.length);
    },
    // إشعار من خارج المخزن (مثل نتيجة ترحيل التخزين) يُعرض مع بقية الإشعارات
    /** @param {string} message */
    pushNotice(message) {
      notices.push(message);
    },
    // معرّفات الأوسمة المفتوحة حديثاً (تُسحب مرة واحدة لتُعرض كإشعار واحتفال)
    takeUnlocks() {
      return unlocks.splice(0, unlocks.length);
    },
    getLastError: () => lastError,

    exportJSON() {
      return JSON.stringify({ ...state, exportedAt: new Date(now()).toISOString() }, null, 2);
    },

    // هل توجد نسخة ما قبل آخر استيراد/استعادة؟
    hasPreImportBackup() {
      return readRaw(PRE_IMPORT_BACKUP_KEY) !== null;
    },

    // تبادل الحالة الحالية مع نسخة ما قبل الاستيراد (تراجع الاستيراد، وتراجع التراجع بالاستدعاء نفسه).
    // الحالة الحالية تُحفظ نسخةً جديدة قبل الاستبدال فلا يضيع شيء في أي اتجاه.
    swapPreImportBackup() {
      const raw = readRaw(PRE_IMPORT_BACKUP_KEY);
      if (raw === null) return { ok: false, error: 'لا توجد نسخة سابقة للاستعادة.' };
      let next;
      try {
        const res = sanitizeState(JSON.parse(raw), today());
        if (!res.ok) return { ok: false, error: 'النسخة السابقة تالفة ولا يمكن استعادتها.' };
        next = res.state;
      } catch {
        return { ok: false, error: 'النسخة السابقة تالفة ولا يمكن استعادتها.' };
      }
      safeWrite(PRE_IMPORT_BACKUP_KEY, JSON.stringify(state));
      state = next;
      refreshAchievements({ silent: true });
      persist();
      emit();
      return { ok: true };
    },

    // يقبل نسخة بمخطط 2 أو 3 أو 4 أو 5 أو تصدير النسخة القديمة (فيه studyLogs)
    /** @param {string} text */
    importJSON(text) {
      let data;
      try { data = JSON.parse(text); } catch { return { ok: false, error: 'الملف ليس JSON صالحاً.' }; }
      if (!data || typeof data !== 'object') return { ok: false, error: 'محتوى الملف غير صالح.' };

      let next;
      if (data.schemaVersion !== undefined) {
        const res = sanitizeState(data, today());
        if (!res.ok) return res;
        next = res.state;
      } else if (data.studyLogs && typeof data.studyLogs === 'object') {
        next = migrateLegacy(data, today());
      } else {
        return { ok: false, error: 'الملف ليس نسخة احتياطية من هذا التطبيق.' };
      }

      safeWrite(PRE_IMPORT_BACKUP_KEY, JSON.stringify(state)); // أمان: نسخة ما قبل الاستيراد
      state = next;
      refreshAchievements({ silent: true }); // إعادة الحساب بعد الاستيراد: إضافة فقط
      persist();
      emit();
      return { ok: true };
    },
  };
}
