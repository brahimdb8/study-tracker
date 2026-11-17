import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOTION_KEY, motionAllowed, normalizeMotionPref, readMotionPref, writeMotionPref } from '../src/ui/celebrate.js';
import { PAGES, pageIdFromPath } from '../src/ui/nav-model.js';
import { HELP_ROWS, isTypingTarget, resolveShortcut } from '../src/ui/shortcuts.js';

const ev = (o) => ({ key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...o });
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('resolveShortcut', () => {
  it('N وT بالحرف أو بالرمز المادي (يعمل مع التخطيط العربي)', () => {
    expect(resolveShortcut(ev({ key: 'n', code: 'KeyN' }))).toEqual({ type: 'new-session' });
    expect(resolveShortcut(ev({ key: 'ي', code: 'KeyN' }))).toEqual({ type: 'new-session' }); // مفتاح N في تخطيط عربي
    expect(resolveShortcut(ev({ key: 'T', code: 'KeyT' }))).toEqual({ type: 'toggle-timer' });
    expect(resolveShortcut(ev({ key: 'ف', code: 'KeyT' }))).toEqual({ type: 'toggle-timer' });
  });
  it('1..4 تنقل إلى الصفحات (بما فيها لوحة الأرقام)', () => {
    expect(resolveShortcut(ev({ key: '1', code: 'Digit1' }))).toEqual({ type: 'goto', href: 'index.html', id: 'home' });
    expect(resolveShortcut(ev({ key: '2', code: 'Digit2' })).href).toBe('analytics.html');
    expect(resolveShortcut(ev({ key: '3', code: 'Digit3' })).href).toBe('achievements.html');
    expect(resolveShortcut(ev({ key: '4', code: 'Numpad4' })).href).toBe('settings.html');
    expect(resolveShortcut(ev({ key: '5', code: 'Digit5' }))).toBeNull();
  });
  it('؟ تفتح المساعدة (؟ العربية، ? اللاتينية، أو Shift+/)', () => {
    expect(resolveShortcut(ev({ key: '?', shiftKey: true }))).toEqual({ type: 'help' });
    expect(resolveShortcut(ev({ key: '؟', code: 'KeyZ', shiftKey: true }))).toEqual({ type: 'help' });
    expect(resolveShortcut(ev({ key: '/', code: 'Slash', shiftKey: true }))).toEqual({ type: 'help' });
  });
  it('لا تعمل أثناء الكتابة ولا مع نافذة مفتوحة ولا مع التكرار', () => {
    expect(resolveShortcut(ev({ key: 'n', code: 'KeyN' }), { typing: true })).toBeNull();
    expect(resolveShortcut(ev({ key: '1', code: 'Digit1' }), { dialogOpen: true })).toBeNull();
    expect(resolveShortcut(ev({ key: '?', shiftKey: true }), { typing: true })).toBeNull();
    expect(resolveShortcut(ev({ key: 'n', code: 'KeyN', repeat: true }))).toBeNull();
    expect(resolveShortcut(ev({ key: 'n', code: 'KeyN', isComposing: true }))).toBeNull();
  });
  it('لا تتعارض مع Ctrl/⌘/Alt (التراجع Ctrl+Z وغيره)', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
      expect(resolveShortcut(ev({ key: 'z', code: 'KeyZ', [mod]: true }))).toBeNull();
      expect(resolveShortcut(ev({ key: 'n', code: 'KeyN', [mod]: true }))).toBeNull();
      expect(resolveShortcut(ev({ key: '1', code: 'Digit1', [mod]: true }))).toBeNull();
    }
  });
  it('Shift مع غير ؟ لا يفعل شيئاً', () => {
    expect(resolveShortcut(ev({ key: 'N', code: 'KeyN', shiftKey: true }))).toBeNull();
  });
  it('مفاتيح تنقل التقويم لا تُلتقط', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' ', 'Escape', 'Tab']) {
      expect(resolveShortcut(ev({ key, code: key }))).toBeNull();
    }
  });
  it('isTypingTarget', () => {
    const t = (tagName, extra = {}) => ({ tagName, getAttribute: () => null, isContentEditable: false, ...extra });
    expect(isTypingTarget(t('INPUT'))).toBe(true);
    expect(isTypingTarget(t('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(t('SELECT'))).toBe(true);
    expect(isTypingTarget(t('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(t('DIV', { getAttribute: () => 'textbox' }))).toBe(true);
    expect(isTypingTarget(t('BUTTON'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
  it('نافذة المساعدة تسرد كل الاختصارات', () => {
    const text = HELP_ROWS.map((r) => r.keys.join('+') + r.text).join('|');
    for (const k of ['N', 'T', '1', '2', '3', '4', '؟', 'Ctrl/⌘']) expect(text).toContain(k);
  });
});

describe('نموذج التنقل', () => {
  it('4 صفحات بأرقام 1..4 فريدة وروابط فريدة', () => {
    expect(PAGES.map((p) => p.key)).toEqual(['1', '2', '3', '4']);
    expect(new Set(PAGES.map((p) => p.href)).size).toBe(4);
  });
  it('pageIdFromPath', () => {
    expect(pageIdFromPath('/app/analytics.html')).toBe('analytics');
    expect(pageIdFromPath('/achievements.html')).toBe('achievements');
    expect(pageIdFromPath('/')).toBe('home');
    expect(pageIdFromPath('/x/unknown.html')).toBe('home');
  });
});

describe('تفضيل الحركة', () => {
  const mem = () => { const d = {}; return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; };
  it('normalize: أي قيمة غير off تعني auto', () => {
    expect(normalizeMotionPref('off')).toBe('off');
    for (const v of [null, undefined, '', 'on', 'x', 1]) expect(normalizeMotionPref(v)).toBe('auto');
  });
  it('motionAllowed: يُحترم النظام والمفتاح معاً', () => {
    expect(motionAllowed('auto', false)).toBe(true);
    expect(motionAllowed('auto', true)).toBe(false);
    expect(motionAllowed('off', false)).toBe(false);
    expect(motionAllowed('off', true)).toBe(false);
  });
  it('قراءة/كتابة: off يُخزَّن وauto يحذف المفتاح، والتخزين المعطوب لا يرمي', () => {
    const st = mem();
    expect(readMotionPref(st)).toBe('auto');
    writeMotionPref('off', st);
    expect(st.d[MOTION_KEY]).toBe('off');
    expect(readMotionPref(st)).toBe('off');
    writeMotionPref('auto', st);
    expect(MOTION_KEY in st.d).toBe(false);
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    expect(readMotionPref(bad)).toBe('auto');
    expect(() => writeMotionPref('off', bad)).not.toThrow();
  });
});

describe('حراس بنيوية للمرحلة 6', () => {
  const pages = ['index.html', 'analytics.html', 'settings.html', 'achievements.html'];
  it('كل صفحة: سكربت head للثيم والحركة، وbody.has-shell، وmain#main، ولا <nav> ثابتة', () => {
    for (const p of pages) {
      const html = read(p);
      expect(html, p).toContain('studyTracker:theme');
      expect(html, p).toContain('studyTracker:motion');
      expect(html, p).toContain('<body class="has-shell">');
      expect(html, p).toContain('<main class="container');
      expect(html, p).toContain('id="main"');
      expect(html, p).not.toContain('<nav');
    }
  });
  it('الرؤوس تسبق الرسم: سكربت الـhead قبل أي <link>/<script type=module>', () => {
    for (const p of pages) {
      const html = read(p);
      expect(html.indexOf('studyTracker:motion')).toBeLessThan(html.indexOf('type="module"'));
    }
  });
  it('vite يبني الصفحات الخمس', () => {
    const cfg = read('vite.config.js');
    for (const n of ['index', 'analytics', 'achievements', 'settings', 'print']) expect(cfg).toContain(`${n}.html`);
  });
  it('print.html بلا هيكل (يبقى نظيفاً للطباعة)', () => {
    const html = read('print.html');
    expect(html).not.toContain('has-shell');
  });
  it('ممنوع innerHTML/outerHTML/insertAdjacentHTML في src كله', () => {
    const walk = (dir) => readdirSync(dir).flatMap((f) => {
      const full = `${dir}/${f}`;
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
    });
    const root = new URL('../src', import.meta.url).pathname;
    for (const f of walk(root)) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });
  it('src/core نقي: بلا document/window/localStorage', () => {
    const root = new URL('../src/core', import.meta.url).pathname;
    for (const f of readdirSync(root)) {
      const code = readFileSync(`${root}/${f}`, 'utf8').replace(/\/\/.*$/gm, '');
      // store.js وحده يلتقط التخزين الافتراضي عبر globalThis (يُحقن في الاختبارات)
      const re = f === 'store.js' ? /\bdocument\.|\bwindow\./ : /\bdocument\.|\bwindow\.|\blocalStorage\b/;
      expect(code, f).not.toMatch(re);
    }
  });
  it('CSS: تعطيل الحركة يدوياً وتقليلها من النظام موجودان', () => {
    const css = read('src/styles/main.css');
    expect(css).toContain(':root[data-motion="off"]');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('prefers-reduced-motion: no-preference');
  });
  it('الزر الحاصل على الاحتفال محصور: burst لا يُنشأ إلا عبر motionOk', () => {
    const code = read('src/ui/celebrate.js');
    expect(code).toMatch(/export function burst\([^)]*\) \{\s*if \(!motionOk\(\)\) return false;/);
  });
});
