// @ts-check
// Service Worker (يُبنى كملف مستقل sw.js في جذر dist؛ إضافة Vite تحقن قائمة الملفات والنسخة).
// - تخزين مسبق لكل صفحات التطبيق وأصوله عند التثبيت؛ cache-first بعد ذلك (يعمل دون اتصال).
// - لا skipWaiting تلقائي: النسخة الجديدة تنتظر نقرة المستخدم على «تحديث» (لا نقاطع مؤقتاً جارياً).
// - لا يلمس أي طلب خارج الأصل أو غير GET (التحليلات واتصالات المزامنة المستقبلية تمر كما هي).
import { cacheNameFor, parseManifest, routeRequest, staleCaches } from './sw-core.js';

/** @type {ServiceWorkerGlobalScope} */
// @ts-ignore — self داخل SW
const sw = /** @type {any} */ (self);

const MANIFEST_JSON = '__SW_MANIFEST__';
const VERSION = '__SW_VERSION__';
const MANIFEST = parseManifest(MANIFEST_JSON);
const CACHE = cacheNameFor(VERSION);
const PRECACHED = new Set(MANIFEST.map((e) => e.url));

sw.addEventListener('install', (/** @type {any} */ event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' يتجاوز كاش HTTP كي لا نخزّن نسخة قديمة بالخطأ
    await Promise.all(MANIFEST.map((e) => cache.add(new Request(new URL(e.url, sw.registration.scope).href, { cache: 'reload' }))));
  })());
});

sw.addEventListener('activate', (/** @type {any} */ event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(staleCaches(names, CACHE).map((n) => caches.delete(n)));
    await sw.clients.claim();
  })());
});

sw.addEventListener('message', (/** @type {any} */ event) => {
  const d = event.data;
  if (d && d.type === 'SKIP_WAITING') sw.skipWaiting();
  if (d && d.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION, files: MANIFEST.length });
});

sw.addEventListener('fetch', (/** @type {any} */ event) => {
  const req = event.request;
  const { strategy, key } = routeRequest({ method: req.method, href: req.url, scope: sw.registration.scope, precached: PRECACHED });
  if (strategy !== 'precache' || key === null) {
    // تنقّل إلى صفحة غير مخزَّنة دون اتصال: نعيد index.html المخزَّن بدل صفحة خطأ المتصفح
    if (req.mode === 'navigate') {
      event.respondWith(fetch(req).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(new URL('index.html', sw.registration.scope).href)) || Response.error();
      }));
    }
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(new URL(key, sw.registration.scope).href);
    if (hit) return hit;
    try { return await fetch(req); } catch { return Response.error(); }
  })());
});
