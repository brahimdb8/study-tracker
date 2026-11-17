// المرحلة 8ب: PWA — منطق الـ Service Worker الصافي، وإضافة Vite (قائمة التخزين المسبق)، وmanifest والأيقونات.
import { build } from 'vite';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cacheNameFor, parseManifest, routeRequest, staleCaches, toScopedPath } from '../src/pwa/sw-core.js';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const SCOPE = 'https://app.example/';

describe('sw-core: المسارات والتوجيه', () => {
  it('toScopedPath: يحذف query وhash ويحوّل الجذر إلى index.html ويرفض الأصول الأخرى', () => {
    expect(toScopedPath('https://app.example/print.html?from=2026-11-01&to=2026-11-15', SCOPE)).toBe('print.html');
    expect(toScopedPath('https://app.example/index.html#x', SCOPE)).toBe('index.html');
    expect(toScopedPath('https://app.example/', SCOPE)).toBe('index.html');
    expect(toScopedPath('https://app.example/assets/a-1.js', SCOPE)).toBe('assets/a-1.js');
    expect(toScopedPath('https://other.example/index.html', SCOPE)).toBeNull();
    expect(toScopedPath('not a url', SCOPE)).toBeNull();
  });

  it('toScopedPath: يعمل تحت مسار فرعي (نشر في مجلد)', () => {
    expect(toScopedPath('https://app.example/study/analytics.html', 'https://app.example/study/')).toBe('analytics.html');
    expect(toScopedPath('https://app.example/other/x.html', 'https://app.example/study/')).toBeNull();
  });

  it('routeRequest: cache-first للمخزَّن مسبقاً فقط وGET فقط', () => {
    const precached = new Set(['index.html', 'print.html', 'assets/a-1.js']);
    const r = (method, href) => routeRequest({ method, href, scope: SCOPE, precached });
    expect(r('GET', 'https://app.example/').strategy).toBe('precache');
    expect(r('GET', 'https://app.example/print.html?from=1').key).toBe('print.html');
    expect(r('GET', 'https://app.example/assets/a-1.js').strategy).toBe('precache');
    expect(r('POST', 'https://app.example/index.html').strategy).toBe('network');
    expect(r('GET', 'https://app.example/unknown.html').strategy).toBe('network');
    // أصول خارجية (التحليلات، المزامنة لاحقاً) لا تُمس أبداً
    expect(r('GET', 'https://static.cloudflareinsights.com/beacon.min.js').strategy).toBe('network');
    expect(r('GET', 'https://abc.supabase.co/rest/v1/x').strategy).toBe('network');
  });

  it('staleCaches: يحذف كاشات التطبيق القديمة فقط ولا يمس كاشات غيره', () => {
    const cur = cacheNameFor('v2');
    expect(staleCaches([cacheNameFor('v1'), cur, 'other-app-cache', 'workbox-x'], cur)).toEqual([cacheNameFor('v1')]);
  });

  it('parseManifest: يتحمل غير المحقون والتالف', () => {
    expect(parseManifest('__SW_MANIFEST__')).toEqual([]);
    expect(parseManifest('[oops')).toEqual([]);
    expect(parseManifest('[{"url":"a","revision":"1"},{"url":5},null]')).toEqual([{ url: 'a', revision: '1' }]);
  });
});

describe('البناء: sw.js وقائمة التخزين المسبق', () => {
  /** @type {string} */
  let out;
  /** @type {string} */
  let sw;
  /** @type {{url: string, revision: string}[]} */
  let entries;
  let version;

  async function buildTo(dir) {
    await build({ root, logLevel: 'silent', build: { outDir: dir, emptyOutDir: true } });
  }
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'st-build-'));
    await buildTo(out);
    sw = readFileSync(join(out, 'sw.js'), 'utf8');
    // الإدخال هو نص JSON داخل literal: نستخرجه بتقييم الـ literal نفسه
    const lit = sw.match(/"(\[\{(?:\\.|[^"\\])*\}\])"/);
    entries = JSON.parse(JSON.parse(`"${lit[1]}"`));
    version = sw.match(/(["'`])([0-9a-f]{12})\1/)[2];
  }, 120_000);
  afterAll(() => { if (out) rmSync(out, { recursive: true, force: true }); });

  it('sw.js في الجذر باسم ثابت، بلا placeholders، بنسخة من 12 خانة', () => {
    expect(existsSync(join(out, 'sw.js'))).toBe(true);
    expect(sw).not.toMatch(/__SW_(MANIFEST|VERSION)__/);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('القائمة تشمل الصفحات الخمس وmanifest والأيقونات وكل ملفات assets، وكل ملف فيها موجود فعلاً', () => {
    const urls = entries.map((e) => e.url);
    for (const p of ['index.html', 'analytics.html', 'achievements.html', 'settings.html', 'print.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon.svg']) {
      expect(urls, p).toContain(p);
    }
    const assets = readdirSync(join(out, 'assets'));
    for (const a of assets) expect(urls, `assets/${a}`).toContain(`assets/${a}`);
    for (const u of urls) expect(existsSync(join(out, u)), u).toBe(true);
    expect(urls).not.toContain('sw.js');
    expect(urls).not.toContain('_headers');
    expect(entries.every((e) => /^[0-9a-f]{12}$/.test(e.revision))).toBe(true);
  });

  it('البناء حتمي: بناءان متتاليان بالنسخة نفسها (لا كاش جديد بلا تغيير)', async () => {
    const out2 = mkdtempSync(join(tmpdir(), 'st-build2-'));
    try {
      await buildTo(out2);
      const sw2 = readFileSync(join(out2, 'sw.js'), 'utf8');
      expect(sw2.match(/(["'`])([0-9a-f]{12})\1/)[2]).toBe(version);
      expect(sw2).toBe(sw);
    } finally { rmSync(out2, { recursive: true, force: true }); }
  }, 120_000);

  it('رؤوس Netlify: sw.js وmanifest بلا كاش طويل، والأصول المبصومة immutable', () => {
    const h = read('public/_headers');
    expect(h).toMatch(/\/sw\.js\s+Cache-Control: no-cache/);
    expect(h).toMatch(/\/manifest\.webmanifest\s+Cache-Control: no-cache/);
    expect(h).toMatch(/\/assets\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  });
});

describe('manifest والأيقونات والصفحات', () => {
  const m = JSON.parse(read('public/manifest.webmanifest'));

  it('حقول manifest الأساسية: عربي RTL مستقل داخل النطاق', () => {
    expect(m.lang).toBe('ar');
    expect(m.dir).toBe('rtl');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('./index.html');
    expect(m.scope).toBe('./');
    expect(m.name).toBeTruthy();
    expect(m.short_name.length).toBeLessThanOrEqual(12);
  });

  it('الأيقونات: 192 و512 و512 maskable موجودة وبالأبعاد المعلنة فعلاً', () => {
    const size = (p) => { const b = readFileSync(join(root, 'public', p)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    const byPurpose = (purpose, sizes) => m.icons.find((i) => i.purpose === purpose && i.sizes === sizes);
    for (const [purpose, sizes] of [['any', '192x192'], ['any', '512x512'], ['maskable', '512x512']]) {
      const icon = byPurpose(purpose, sizes);
      expect(icon, `${purpose} ${sizes}`).toBeTruthy();
      const [w, h] = sizes.split('x').map(Number);
      expect(size(icon.src), icon.src).toEqual([w, h]);
    }
    expect(size('icons/apple-touch-icon.png')).toEqual([180, 180]);
  });

  it('الصفحات الخمس تربط manifest وthemeColor والأيقونة', () => {
    for (const p of ['index', 'analytics', 'achievements', 'settings', 'print']) {
      const html = read(`${p}.html`);
      expect(html, p).toContain('rel="manifest" href="manifest.webmanifest"');
      expect(html, p).toContain('name="theme-color"');
      expect(html, p).toContain('rel="apple-touch-icon"');
    }
  });

  it('لا innerHTML في طبقات data وpwa وبطاقة الإعدادات', () => {
    const files = [];
    for (const dir of ['src/data', 'src/pwa']) for (const f of readdirSync(join(root, dir))) files.push(`${dir}/${f}`);
    files.push('src/pages/settings-install.js', 'src/ui/action-toast.js');
    for (const f of files) expect(read(f), f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });

  it('مجلد public لا يحوي ملفات ضخمة بلا داعٍ (< 400KB لكل أيقونة)', () => {
    for (const f of readdirSync(join(root, 'public/icons'))) expect(statSync(join(root, 'public/icons', f)).size, f).toBeLessThan(400_000);
  });
});
