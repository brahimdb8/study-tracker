// @ts-check
// طبقة التخزين المتينة (المرحلة 8): IndexedDB خلف واجهة متزامنة.
//
// الفكرة: store.js يتوقع storage متزامناً (getItem/setItem/removeItem). نقرأ كل مفاتيح البيانات من IndexedDB
// مرة واحدة قبل بدء الصفحة إلى Map في الذاكرة، فتبقى القراءة متزامنة، وكل كتابة تُسجَّل في الذاكرة فوراً
// ثم تُحفظ في IndexedDB بالخلفية (دفعة واحدة لكل دورة). مفاتيح «لكل جهاز» (الثيم والجولة والمؤقت...)
// تبقى في localStorage ولا تدخل IndexedDB أبداً (لن تُزامَن في المرحلة 9).
//
// الوحدة بلا اعتماد على window: كل ما تحتاجه (indexedDB وlocalStorage وBroadcastChannel) يُحقن، فتُختبر في Node.

/** @typedef {import('../core/types.js').StorageLike} StorageLike */

export const DB_NAME = 'studyTracker';
export const DB_VERSION = 1;
export const STORE_NAME = 'kv';
export const KEY_PREFIX = 'studyTracker:';
/** علم لكل جهاز: نُقلت البيانات من localStorage إلى IndexedDB */
export const MIGRATED_FLAG = 'studyTracker:idbMigrated';

/** مفاتيح لكل جهاز تبقى في localStorage (لا تُزامَن لاحقاً) */
export const DEVICE_KEYS = new Set([
  'studyTracker:theme',
  'studyTracker:onboarded',
  'studyTracker:exportPrefs',
  'studyTracker:pomodoro',
  'studyTracker:timer', // مؤقت المراحل 1–3 (يُقرأ مرة للتحويل)
  'studyTracker:motion',
  'studyTracker:celebrated',
  'studyTracker:analytics', // تفضيل تحليلات الزيارات (المرحلة 8)
  'studyTracker:installDismissed',
  'studyTracker:persistAsked',
  MIGRATED_FLAG,
]);

/**
 * مفتاح بيانات (يُحفظ في IndexedDB)؟ مفاتيح التطبيق غير الخاصة بالجهاز فقط:
 * الحالة والنسخ الاحتياطية ونسخ التالف. مفاتيح النسخة القديمة (studyLogs...) بلا بادئة فتبقى في localStorage.
 * @param {string} key
 */
export function isDataKey(key) {
  return key.startsWith(KEY_PREFIX) && !DEVICE_KEYS.has(key);
}

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

/**
 * يفتح القاعدة (مع مهلة: بعض المتصفحات في الوضع الخاص تعلّق الطلب).
 * @param {IDBFactory} factory
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<IDBDatabase>}
 */
export function openDb(factory, { timeoutMs = 4000 } = {}) {
  const opening = new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('IndexedDB open timeout')), timeoutMs); });
  return /** @type {Promise<IDBDatabase>} */ (Promise.race([opening, timeout]).finally(() => clearTimeout(timer)));
}

/**
 * كل الأزواج المخزَّنة (قيم نصية).
 * @param {IDBDatabase} db
 * @returns {Promise<Map<string, string>>}
 */
export async function readAll(db) {
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const [keys, values] = await Promise.all([promisify(store.getAllKeys()), promisify(store.getAll())]);
  /** @type {Map<string, string>} */
  const out = new Map();
  keys.forEach((k, i) => { if (typeof k === 'string' && typeof values[i] === 'string') out.set(k, values[i]); });
  return out;
}

/**
 * يكتب دفعة في معاملة واحدة (ذرّية): القيمة null = حذف.
 * @param {IDBDatabase} db
 * @param {Map<string, string|null>} batch
 */
export async function writeBatch(db, batch) {
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (const [k, v] of batch) {
    if (v === null) store.delete(k);
    else store.put(v, k);
  }
  await txDone(tx);
}

/**
 * مفاتيح البيانات الموجودة في localStorage (للترحيل والاستعادة).
 * @param {{ length: number, key: (i: number) => string|null }} local
 */
export function localDataKeys(local) {
  /** @type {string[]} */
  const keys = [];
  for (let i = 0; i < local.length; i++) {
    const k = local.key(i);
    if (k && isDataKey(k)) keys.push(k);
  }
  return keys;
}

/**
 * ترحيل لمرة واحدة من localStorage إلى IndexedDB، أو استعادة منه إن أُخليت IndexedDB.
 * لا يحذف شيئاً من localStorage (تبقى النسخة القديمة شبكة أمان).
 * @param {{ local: StorageLike & { length: number, key: (i: number) => string|null }, db: IDBDatabase, existing: Map<string, string>, stateKey: string }} p
 * @returns {Promise<{ status: 'none'|'migrated'|'restored', keys: number }>}
 */
export async function migrateFromLocal({ local, db, existing, stateKey }) {
  if (existing.has(stateKey)) return { status: 'none', keys: 0 };
  const keys = localDataKeys(local);
  if (!keys.includes(stateKey)) return { status: 'none', keys: 0 };
  /** @type {Map<string, string|null>} */
  const batch = new Map();
  for (const k of keys) {
    const v = local.getItem(k);
    if (typeof v === 'string') batch.set(k, v);
  }
  await writeBatch(db, batch);
  for (const [k, v] of batch) if (typeof v === 'string') existing.set(k, v);
  const wasMigratedBefore = local.getItem(MIGRATED_FLAG) === '1';
  local.setItem(MIGRATED_FLAG, '1');
  return { status: wasMigratedBefore ? 'restored' : 'migrated', keys: batch.size };
}

/**
 * يحذف نسخة localStorage القديمة (مفاتيح البيانات فقط) بعد التأكد أن IndexedDB فيها الحالة. يعيد عدد المحذوف.
 * @param {{ local: StorageLike & { length: number, key: (i: number) => string|null }, existing: Map<string, string>, stateKey: string }} p
 */
export function clearLegacyLocalCopy({ local, existing, stateKey }) {
  if (!existing.has(stateKey)) return 0;
  const keys = localDataKeys(local);
  for (const k of keys) local.removeItem(k);
  return keys.length;
}

/**
 * @typedef {object} HybridOptions
 * @property {StorageLike} local مفاتيح لكل جهاز (localStorage)
 * @property {Map<string, string>} initial محتوى IndexedDB المقروء
 * @property {IDBDatabase} db
 * @property {{ postMessage: (m: any) => void, onmessage: ((e: { data: any }) => void) | null } | null} [channel]
 * @property {(err: unknown) => void} [onWriteError]
 * @property {(key: string) => void} [onRemote] يُستدعى حين يتغير مفتاح بيانات من تبويب آخر
 * @property {(fn: () => void) => void} [schedule] جدولة الإفراغ (الافتراضي setTimeout 0)
 */

/**
 * @param {HybridOptions} o
 * @returns {StorageLike & { flush: () => Promise<void>, backend: 'idb', pendingCount: () => number }}
 */
export function createHybridStorage({ local, initial, db, channel = null, onWriteError = () => {}, onRemote = () => {}, schedule = (fn) => { setTimeout(fn, 0); } }) {
  const cache = new Map(initial);
  /** @type {Map<string, string|null>} */
  const pending = new Map();
  let scheduled = false;
  /** @type {Promise<void>} */
  let inflight = Promise.resolve();

  function flush() {
    scheduled = false;
    if (!pending.size) return inflight;
    const batch = new Map(pending);
    pending.clear();
    inflight = inflight
      .then(() => writeBatch(db, batch))
      .then(() => {
        if (channel) for (const [key, value] of batch) channel.postMessage({ key, value });
      })
      .catch((err) => {
        // لم تُحفظ: أعدها إلى الطابور (إلا إن جاءت قيمة أحدث) لتُعاد المحاولة مع أول كتابة تالية
        for (const [k, v] of batch) if (!pending.has(k)) pending.set(k, v);
        onWriteError(err);
      });
    return inflight;
  }

  function queue() {
    if (scheduled) return;
    scheduled = true;
    schedule(() => { void flush(); });
  }

  if (channel) {
    channel.onmessage = (e) => {
      const m = e && e.data;
      if (!m || typeof m.key !== 'string' || !isDataKey(m.key)) return;
      if (typeof m.value === 'string') cache.set(m.key, m.value);
      else if (m.value === null) cache.delete(m.key);
      else return;
      onRemote(m.key);
    };
  }

  return {
    backend: 'idb',
    flush,
    pendingCount: () => pending.size,
    getItem(key) {
      if (!isDataKey(key)) return local.getItem(key);
      return cache.has(key) ? /** @type {string} */ (cache.get(key)) : null;
    },
    setItem(key, value) {
      if (!isDataKey(key)) { local.setItem(key, value); return; }
      const v = String(value);
      cache.set(key, v);
      pending.set(key, v);
      queue();
    },
    removeItem(key) {
      if (!isDataKey(key)) { local.removeItem(key); return; }
      cache.delete(key);
      pending.set(key, null);
      queue();
    },
  };
}
