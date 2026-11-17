// إضافة Vite: تحقن في sw.js قائمة الملفات المبنية (مع بصمة محتوى لكل ملف) ونسخة الكاش.
// النسخة = هاش المحتوى الكلي، فتتغير فقط حين يتغير ملف فعلاً (لا كاش جديد بلا داعٍ).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SW_ENTRY = 'sw';
const SKIP_PUBLIC = new Set(['_headers', '_redirects']); // ملفات استضافة لا تخدم المتصفح

/** @param {string|Uint8Array} data */
const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 12);

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

/** @returns {import('vite').Plugin} */
export function swManifest() {
  let publicDir = '';
  return {
    name: 'study-tracker-sw-manifest',
    apply: 'build',
    configResolved(cfg) { publicDir = cfg.publicDir; },
    // order: post — بعد أن تُصدِر إضافة Vite صفحات HTML (وإلا غابت عن القائمة)
    generateBundle: { order: 'post', handler(_opts, bundle) {
      const swKey = Object.keys(bundle).find((k) => bundle[k].type === 'chunk' && /** @type {any} */ (bundle[k]).name === SW_ENTRY);
      if (!swKey) throw new Error('sw entry غير موجود في الحزمة');
      /** @type {{ url: string, revision: string }[]} */
      const entries = [];
      for (const [fileName, out] of Object.entries(bundle)) {
        if (fileName === swKey || fileName.endsWith('.map')) continue;
        const body = out.type === 'chunk' ? out.code : out.source;
        entries.push({ url: fileName, revision: hash(body) });
      }
      if (publicDir) {
        try {
          for (const file of walk(publicDir)) {
            const rel = relative(publicDir, file).split(sep).join('/');
            if (SKIP_PUBLIC.has(rel)) continue;
            entries.push({ url: rel, revision: hash(readFileSync(file)) });
          }
        } catch { /* لا مجلد public */ }
      }
      entries.sort((a, b) => a.url.localeCompare(b.url));
      const version = hash(entries.map((e) => `${e.url}:${e.revision}`).join('|'));
      const chunk = /** @type {any} */ (bundle[swKey]);
      const hasBoth = /("|'|`)__SW_MANIFEST__\1/.test(chunk.code) && /("|'|`)__SW_VERSION__\1/.test(chunk.code);
      if (!hasBoth) throw new Error('placeholder مفقود في sw (المانيفست أو النسخة)');
      const replaced = chunk.code
        .replace(/(["'`])__SW_MANIFEST__\1/, () => JSON.stringify(JSON.stringify(entries)))
        .replace(/(["'`])__SW_VERSION__\1/, () => JSON.stringify(version));
      if (replaced === chunk.code) throw new Error('لم تُحقن قائمة الـ SW (placeholder مفقود)');
      chunk.code = replaced;
    } },
  };
}
