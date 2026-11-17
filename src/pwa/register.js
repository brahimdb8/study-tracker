// @ts-check
// تسجيل الـ Service Worker + إشعار «نسخة جديدة جاهزة». لا تحديث تلقائي: المستخدم يقرر (قد يكون مؤقت يعمل الآن).
import { showActionToast } from '../ui/action-toast.js';

let registered = false;
let updatePrompted = false;
/** @type {Promise<ServiceWorkerRegistration|null>|null} */
let regPromise = null;

/** هل البيئة تدعم SW وليست وضع التطوير؟ */
function enabled() {
  if (!('serviceWorker' in navigator)) return false;
  const env = /** @type {any} */ (import.meta).env;
  return !(env && env.DEV);
}

/** @param {ServiceWorker} worker */
function promptUpdate(worker) {
  if (updatePrompted) return;
  updatePrompted = true;
  showActionToast('نسخة جديدة من التطبيق جاهزة.', 'تحديث', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
}

/** @param {ServiceWorkerRegistration} reg */
function watch(reg) {
  if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(w);
    });
  });
}

/** يسجّل الـ SW مرة واحدة لكل صفحة (آمن للاستدعاء المتكرر). */
export function registerServiceWorker() {
  if (registered || !enabled()) return;
  registered = true;
  let hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // أول تثبيت يستولي على الصفحة (claim) دون إعادة تحميل، ثم يُحسب وجود متحكم؛
    // وكل تغيير بعده (تحديث وافق عليه المستخدم) يعيد التحميل مرة واحدة
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  const start = () => {
    regPromise = navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href)
      .then((reg) => {
        watch(reg);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
        return reg;
      })
      .catch(() => null);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

/**
 * جاهزية العمل دون اتصال: true حين يكون SW نشطاً (التخزين المسبق اكتمل عند التفعيل).
 * @returns {Promise<boolean>}
 */
export async function isOfflineReady() {
  if (!enabled()) return false;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => { setTimeout(() => resolve(null), 4000); }),
    ]);
    return !!(reg && /** @type {ServiceWorkerRegistration} */ (reg).active);
  } catch { return false; }
}

/** يفحص وجود نسخة جديدة الآن (زر في الإعدادات). يعيد false إن لم يتوفر SW. */
export async function checkForUpdate() {
  if (!regPromise) return false;
  const reg = await regPromise;
  if (!reg) return false;
  try { await reg.update(); return true; } catch { return false; }
}
