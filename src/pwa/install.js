// @ts-check
// تثبيت التطبيق: يلتقط beforeinstallprompt (كروم/إيدج/أندرويد) ويقدّم تعليمات iOS (مشاركة ← إضافة إلى الشاشة الرئيسية).

/** @typedef {Event & { prompt: () => Promise<void>, userChoice: Promise<{ outcome: 'accepted'|'dismissed' }> }} InstallPromptEvent */

/** @type {InstallPromptEvent|null} */
let deferred = null;
let installed = false;
/** @type {Set<() => void>} */
const listeners = new Set();
const notify = () => { for (const fn of listeners) fn(); };

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // نؤجل العرض إلى زر الإعدادات
    deferred = /** @type {InstallPromptEvent} */ (e);
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

/** يعمل التطبيق الآن كتطبيق مثبّت (نافذة مستقلة)؟ */
export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
  } catch { return false; }
}

/** iPhone/iPad (سفاري لا يدعم beforeinstallprompt) */
export function isIos() {
  const ua = navigator.userAgent || '';
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

/** @returns {{ state: 'installed'|'promptable'|'ios'|'manual' }} */
export function getInstallInfo() {
  if (installed || isStandalone()) return { state: 'installed' };
  if (deferred) return { state: 'promptable' };
  if (isIos()) return { state: 'ios' };
  return { state: 'manual' };
}

/** @param {() => void} fn */
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** يعرض نافذة التثبيت الأصلية. يعيد 'accepted' | 'dismissed' | 'unavailable' */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  deferred = null; // الحدث يُستعمل مرة واحدة
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  notify();
  return outcome;
}
