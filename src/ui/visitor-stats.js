// تحليلات زيارات اختيارية (Cloudflare Web Analytics: بلا كوكيز). لا تُرسل أي بيانات دراسة؛ تقيس الزيارات فقط.
// تعمل فقط إن بُني الموقع بمتغير VITE_ANALYTICS_TOKEN، ولا يحمّلها المتصفح دون اتصال أو مع الرفض.
import { VISITOR_STATS_KEY, isOptedOut, shouldLoadVisitorStats } from '../core/visitor-stats.js';

const TOKEN = String(import.meta.env.VITE_ANALYTICS_TOKEN || '').trim();

/** هل بُني هذا الإصدار مع تحليلات؟ */
export const hasVisitorStats = TOKEN.length > 0;

export function readOptOut() {
  try { return isOptedOut(localStorage.getItem(VISITOR_STATS_KEY)); } catch { return false; }
}
export function writeOptOut(off) {
  try {
    if (off) localStorage.setItem(VISITOR_STATS_KEY, 'off'); else localStorage.removeItem(VISITOR_STATS_KEY);
  } catch { /* لا يهم */ }
}

let started = false;

function inject() {
  try {
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: TOKEN }));
    s.addEventListener('error', () => s.remove()); // فشل صامت
    document.head.appendChild(s);
  } catch { /* فشل صامت: لا يعطّل التطبيق */ }
}

/** يُستدعى مرة لكل صفحة؛ يؤجل التحميل إلى ما بعد اكتمال الصفحة وخمول المتصفح. */
export function initVisitorStats() {
  if (!TOKEN || started) return;
  const ok = shouldLoadVisitorStats({
    token: TOKEN,
    doNotTrack: navigator.doNotTrack || window['doNotTrack'],
    optedOut: readOptOut(),
    online: navigator.onLine !== false,
  });
  if (!ok) return;
  started = true;
  const run = () => ('requestIdleCallback' in window ? window.requestIdleCallback(inject, { timeout: 4000 }) : setTimeout(inject, 1500));
  if (document.readyState === 'complete') run(); else window.addEventListener('load', run, { once: true });
}
