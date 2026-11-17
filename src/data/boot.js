// @ts-check
// أول استيراد في كل صفحة: ينتظر (top-level await) إقلاع IndexedDB قبل أن يستدعي أي وحدة getStore().
// فشل IndexedDB لا يكسر شيئاً: يرجع التطبيق إلى localStorage كما كان.
import { STATE_KEY, configureStorage, getStore } from '../core/store.js';
import { showActionToast } from '../ui/action-toast.js';
import { showToast } from '../ui/toast.js';
import { bootData } from './boot-core.js';
import { clearLegacyLocalCopy } from './idb-storage.js';

/** @type {ReturnType<typeof getStore>|null} */
let storeRef = null;
let writeErrorShown = false;
let remoteToast = false;

const result = await bootData({
  indexedDB: globalThis.indexedDB,
  localStorage: await safeLocalStorage(),
  BroadcastChannel: globalThis.BroadcastChannel,
  stateKey: STATE_KEY,
  onWriteError: () => {
    if (writeErrorShown) return;
    writeErrorShown = true; // مرة واحدة لكل جلسة (تُعاد المحاولة مع كل كتابة لاحقة)
    showToast('تعذّر حفظ آخر تعديلاتك في التخزين الدائم. لا تُغلق الصفحة، وصدّر نسخة احتياطية من الإعدادات للأمان.', 'error');
  },
  onRemote: (key) => {
    if (key !== STATE_KEY || !storeRef) return;
    storeRef.reload(); // الحالة الجديدة تصير مرجع أي حفظ لاحق في هذا التبويب
    if (remoteToast) return;
    remoteToast = true;
    showActionToast('تغيّرت بياناتك من تبويب آخر. حدّث الصفحة لرؤية آخر التعديلات.', 'تحديث', () => location.reload());
  },
});

if (result.storage) configureStorage(result.storage);
storeRef = getStore();
for (const n of result.notices) storeRef.pushNotice(n);

if (result.storage) {
  const storage = result.storage;
  // إفراغ الكتابات المعلّقة عند إخفاء الصفحة أو إغلاقها
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void storage.flush(); });
  window.addEventListener('pagehide', () => { void storage.flush(); });
}

// طلب تخزين دائم مرة واحدة، وبعد أن يصير لدى المستخدم بيانات (فايرفوكس يسأل المستخدم عند الطلب)
requestPersistenceOnce(storeRef);

/** @type {{ backend: 'idb'|'local', migration: { status: string, keys: number }, clearLegacyCopy: () => number, flush: () => Promise<void> }} */
export const bootInfo = {
  backend: result.backend,
  migration: result.migration,
  /** يحذف نسخة localStorage القديمة (بعد ضمان وجود الحالة في IndexedDB). يعيد عدد المفاتيح المحذوفة */
  clearLegacyCopy() {
    if (!result.existing) return 0;
    return clearLegacyLocalCopy({ local: /** @type {any} */ (globalThis.localStorage), existing: result.existing, stateKey: STATE_KEY });
  },
  flush: () => (result.storage ? result.storage.flush() : Promise.resolve()),
};

async function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    ls.getItem('studyTracker:__probe__');
    return ls;
  } catch {
    // localStorage محجوب: بديل في الذاكرة بالواجهة نفسها (يعمل مع IndexedDB للبيانات)
    /** @type {Map<string, string>} */
    const mem = new Map();
    return {
      get length() { return mem.size; },
      key: (/** @type {number} */ i) => [...mem.keys()][i] ?? null,
      getItem: (/** @type {string} */ k) => (mem.has(k) ? /** @type {string} */ (mem.get(k)) : null),
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => { mem.set(k, String(v)); },
      removeItem: (/** @type {string} */ k) => { mem.delete(k); },
    };
  }
}

/** @param {ReturnType<typeof getStore>} store */
function requestPersistenceOnce(store) {
  try {
    const nav = navigator;
    if (!nav.storage || !nav.storage.persist) return;
    if (!store.getState().sessions.length) return;
    if (localStorage.getItem('studyTracker:persistAsked') === '1') return;
    localStorage.setItem('studyTracker:persistAsked', '1');
    void nav.storage.persist();
  } catch { /* غير مدعوم */ }
}
