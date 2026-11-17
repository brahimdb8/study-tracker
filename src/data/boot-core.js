// @ts-check
// إقلاع التخزين: يفتح IndexedDB، يرحّل من localStorage إن لزم، ويبني التخزين الهجين. كل اعتماداته تُحقن (للاختبار).
import { MIGRATED_FLAG, createHybridStorage, migrateFromLocal, openDb, readAll } from './idb-storage.js';

/**
 * @typedef {object} BootEnv
 * @property {IDBFactory|undefined} indexedDB
 * @property {import('../core/types.js').StorageLike & { length: number, key: (i: number) => string|null }} localStorage
 * @property {(new (name: string) => any)|undefined} [BroadcastChannel]
 * @property {string} stateKey مفتاح الحالة (STATE_KEY)
 * @property {(key: string) => void} [onRemote]
 * @property {(err: unknown) => void} [onWriteError]
 * @property {number} [openTimeoutMs]
 */

/**
 * @typedef {object} BootResult
 * @property {ReturnType<typeof createHybridStorage>|null} storage null = الرجوع إلى localStorage الافتراضي
 * @property {'idb'|'local'} backend
 * @property {string[]} notices رسائل تُعرض للمستخدم عبر المخزن
 * @property {{ status: string, keys: number }} migration
 * @property {Map<string, string>|null} existing محتوى IndexedDB بعد الترحيل
 */

export const CHANNEL_NAME = 'studyTracker:data';

/**
 * @param {BootEnv} env
 * @returns {Promise<BootResult>}
 */
export async function bootData(env) {
  /** @type {string[]} */
  const notices = [];
  const migratedBefore = (() => { try { return env.localStorage.getItem(MIGRATED_FLAG) === '1'; } catch { return false; } })();

  if (!env.indexedDB) return fallback('no-idb');

  /** @type {IDBDatabase} */
  let db;
  /** @type {Map<string, string>} */
  let existing;
  try {
    db = await openDb(env.indexedDB, { timeoutMs: env.openTimeoutMs });
    existing = await readAll(db);
  } catch {
    return fallback('open-failed');
  }

  let migration = { status: 'none', keys: 0 };
  try {
    migration = await migrateFromLocal({ local: env.localStorage, db, existing, stateKey: env.stateKey });
  } catch {
    // فشل النسخ: لا نخسر شيئاً (localStorage سليم)، نعمل عليه لهذه الجلسة
    try { db.close(); } catch { /* تجاهل */ }
    return fallback('migrate-failed');
  }
  if (migration.status === 'migrated') {
    notices.push('نُقلت بياناتك إلى تخزين أوسع وأمتن في المتصفح (IndexedDB). أبقينا نسخة قديمة احتياطية، ويمكنك حذفها من الإعدادات.');
  } else if (migration.status === 'restored') {
    notices.push('كان التخزين الجديد فارغاً (ربما أخلاه المتصفح)، فاستُعيدت بياناتك من النسخة المحلية القديمة. قد تغيب آخر تعديلاتك قبل ذلك.');
  }

  /** @type {any} */
  let channel = null;
  if (env.BroadcastChannel) {
    try { channel = new env.BroadcastChannel(CHANNEL_NAME); } catch { channel = null; }
  }

  const storage = createHybridStorage({
    local: env.localStorage, initial: existing, db, channel, onWriteError: env.onWriteError, onRemote: env.onRemote,
  });
  return { storage, backend: 'idb', notices, migration, existing };

  /** @param {string} reason */
  function fallback(reason) {
    if (migratedBefore) {
      notices.push('تعذّر فتح التخزين الجديد (IndexedDB) فتعمل الآن على النسخة المحلية القديمة، وقد لا تظهر أحدث بياناتك.');
    }
    return /** @type {BootResult} */ ({ storage: null, backend: 'local', notices, migration: { status: reason, keys: 0 }, existing: null });
  }
}
