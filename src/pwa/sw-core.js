// @ts-check
// منطق الـ Service Worker الصافي (بلا self ولا caches) فيُختبر في Node. sw.js يستعمله ويربطه بالأحداث.

export const CACHE_PREFIX = 'st-precache-';

/** @param {string} version */
export function cacheNameFor(version) {
  return `${CACHE_PREFIX}${version}`;
}

/**
 * الكاشات التي تُحذف عند التفعيل: كاشات التطبيق القديمة فقط (لا نلمس كاشات غيرنا).
 * @param {string[]} names
 * @param {string} current
 */
export function staleCaches(names, current) {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current);
}

/**
 * يحوّل مسار الطلب إلى مفتاح التخزين المسبق: يحذف query/hash، والمجلد الجذر يصير index.html.
 * (print.html?from=…&to=… و index.html#x تطابقان الصفحة المخزَّنة.)
 * @param {string} href رابط مطلق
 * @param {string} scope نطاق الـ SW (مطلق وينتهي بـ /)
 * @returns {string|null} مسار نسبي للنطاق، أو null إن كان خارج النطاق/أصل آخر
 */
export function toScopedPath(href, scope) {
  let u; let s;
  try { u = new URL(href); s = new URL(scope); } catch { return null; }
  if (u.origin !== s.origin || !u.pathname.startsWith(s.pathname)) return null;
  let rel = u.pathname.slice(s.pathname.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  return rel;
}

/**
 * @typedef {'precache'|'network'} Strategy
 * @param {{ method: string, href: string, scope: string, precached: Set<string> }} req
 * @returns {{ strategy: Strategy, key: string|null }}
 * precache: cache-first من التخزين المسبق (صفحات وأصول مبصومة). network: يمرّ الطلب كما هو (لا respondWith).
 */
export function routeRequest({ method, href, scope, precached }) {
  if (method !== 'GET') return { strategy: 'network', key: null };
  const key = toScopedPath(href, scope);
  if (key === null || !precached.has(key)) return { strategy: 'network', key };
  return { strategy: 'precache', key };
}

/**
 * قائمة التخزين المسبق من نص الإدخال المحقون: يتحمل غير المحقون (تطوير) فيعيد [].
 * @param {string} json
 * @returns {{ url: string, revision: string }[]}
 */
export function parseManifest(json) {
  if (typeof json !== 'string' || !json.startsWith('[')) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.url === 'string' && typeof e.revision === 'string') : [];
  } catch { return []; }
}
