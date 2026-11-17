// يحرس styles/tokens.css: الكتلتان الفاتحتان متطابقتان، وكل ثيم يعرّف الرموز نفسها،
// وحدود التباين محقَّقة (نص 4.5:1، مكوّنات 3:1) في الثيمين.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function decls(body) {
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const darkBlock = /^:root \{([\s\S]*?)\n\}/m.exec(css)[1];
const mediaBlock = /@media \(prefers-color-scheme: light\) \{\s*:root:where\(:not\(\[data-theme="dark"\]\)\) \{([\s\S]*?)\n {2}\}\n\}/.exec(css)[1];
const lightBlock = /:root\[data-theme="light"\] \{([\s\S]*?)\n\}/.exec(css)[1];
const dark = decls(darkBlock);
const light = decls(lightBlock);

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('tokens.css', () => {
  it('كتلة prefers-color-scheme الفاتحة مطابقة لكتلة [data-theme=light]', () => {
    expect(decls(mediaBlock)).toEqual(light);
  });

  it('الثيمان يعرّفان الرموز نفسها', () => {
    const d = Object.keys(dark).sort();
    const l = Object.keys(light).sort();
    expect(l).toEqual(d);
    expect(d.length).toBeGreaterThan(60);
  });

  const TEXT = [
    ['text', 'bg'], ['text', 'panel'], ['muted', 'bg'], ['muted', 'panel'], ['faint', 'bg'], ['faint', 'panel'],
    ['ink2', 'bg'], ['ink2', 'panel'], ['accent', 'bg'], ['accent', 'panel'], ['good', 'bg'], ['good', 'panel'],
    ['warn', 'bg'], ['warn', 'panel'], ['bad', 'bg'], ['bad', 'panel'],
    ['on-accent', 'btn-primary'], ['on-accent', 'btn-warning'], ['on-accent', 'btn-danger'], ['on-accent', 'border-strong'],
    ['toast-fg', 'toast-bg'], ['on-accent', 'toast-ok-bg'], ['on-accent', 'toast-err-bg'], ['text', 'tip-bg'], ['muted', 'tip-bg'],
    ...['ok', 'comp', 'bad', 'frozen', 'excused'].flatMap((k) => [[`st-${k}-fg`, `st-${k}-bg`], [`st-${k}-on`, `st-${k}-bd`]]),
    ['delta-up', 'bg'], ['delta-down', 'bg'],
    // المرحلة 6.5: كل تدرج يُختبر عند طرفيه
    ['on-hero', 'hero-a'], ['on-hero', 'hero-b'], ['on-hero-2', 'hero-a'], ['on-hero-2', 'hero-b'],
    ['text', 'card-a'], ['text', 'card-b'], ['muted', 'card-a'], ['muted', 'card-b'], ['accent', 'card-a'], ['accent', 'card-b'],
    ...['primary', 'warning', 'danger'].flatMap((k) => [['on-accent', `grad-${k}-a`], ['on-accent', `grad-${k}-b`]]),
  ];
  const NONTEXT = [
    ['border-strong', 'bg'], ['border-strong', 'panel'], ['ring-focus', 'bg'], ['ring-focus', 'panel'], ['ring-break', 'bg'], ['ring-break', 'panel'],
    ['st-ok-bd', 'bg'], ['st-comp-bd', 'bg'], ['st-bad-bd', 'bg'], ['st-frozen-bd', 'bg'], ['st-excused-bd', 'bg'],
    ['c-morning', 'bg'], ['c-evening', 'bg'], ['c-main', 'bg'], ['c-target', 'bg'],
    ['ring-hero', 'hero-a'], ['ring-hero', 'hero-b'], ['c-best', 'card-a'], ['c-best', 'card-b'],
    ...['start', 'streak', 'hours', 'habit', 'commit'].flatMap((k) => ['bg', 'panel', 'card-b'].map((b) => [`cat-${k}`, b])),
  ];

  for (const [name, t] of [['داكن', dark], ['فاتح', light]]) {
    it(`${name}: النصوص ≥ 4.5:1`, () => {
      for (const [f, b] of TEXT) expect(ratio(t[f], t[b]), `${f} على ${b}`).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name}: رموز المرحلة 6.5 موجودة وتدرجاتها متمايزة الطرفين`, () => {
      for (const k of ['hero', 'card', 'grad-primary', 'grad-warning', 'grad-danger']) {
        const a = t[k.includes('grad') ? `${k}-a` : `${k}-a`]; const b = t[`${k}-b`];
        expect(a, k).toMatch(/^#/); expect(b, k).toMatch(/^#/); expect(a).not.toBe(b);
      }
      expect(t['glow-gold']).toMatch(/^rgba/);
    });
    it(`${name}: المكوّنات غير النصية ≥ 3:1`, () => {
      for (const [f, b] of NONTEXT) expect(ratio(t[f], t[b]), `${f} على ${b}`).toBeGreaterThanOrEqual(3);
    });
  }
});
