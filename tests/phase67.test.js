import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FX_COLORS, FX_KINDS, FX_MAX_MS, badgeCheer, buildFxPlan, mulberry32 } from '../src/core/celebration-fx.js';

const plan = (o = {}) => buildFxPlan({ kind: 'day', width: 1280, height: 800, seed: 7, ...o });
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('خطة الاحتفال البصري (نقية)', () => {
  it('حتمية: نفس البذرة = نفس الخطة، وبذرة أخرى تختلف', () => {
    expect(plan()).toEqual(plan());
    expect(plan({ seed: 8 })).not.toEqual(plan());
    const a = mulberry32(3); const b = mulberry32(3);
    expect([a(), a()]).toEqual([b(), b()]);
  });
  it.each(Object.keys(FX_KINDS))('أعداد القطع حسب النوع: %s', (kind) => {
    const p = plan({ kind }).pieces;
    const cfg = FX_KINDS[kind];
    expect(p.filter((x) => x.kind === 'ribbon')).toHaveLength(cfg.ribbons);
    expect(p.filter((x) => x.kind === 'orb')).toHaveLength(cfg.orbs);
    expect(p.filter((x) => x.kind === 'spark')).toHaveLength(cfg.sparks);
  });
  it('الأسبوع أغنى من اليوم', () => {
    expect(plan({ kind: 'week' }).pieces.length).toBeGreaterThan(plan({ kind: 'day' }).pieces.length);
  });
  it('كل الأرقام منتهية، والألوان ضمن النطاق، والإطارات مرتبة من 0 إلى 1', () => {
    for (const p of plan({ kind: 'badge' }).pieces) {
      expect(p.color).toBeGreaterThanOrEqual(0); expect(p.color).toBeLessThan(FX_COLORS);
      expect(p.duration).toBeGreaterThan(0); expect(p.delay).toBeGreaterThanOrEqual(0);
      expect(p.frames[0].t).toBe(0); expect(p.frames[p.frames.length - 1].t).toBe(1);
      for (let i = 0; i < p.frames.length; i++) {
        const f = p.frames[i];
        for (const v of Object.values(f)) expect(Number.isFinite(v)).toBe(true);
        expect(f.op).toBeGreaterThanOrEqual(0); expect(f.op).toBeLessThanOrEqual(1);
        if (i) expect(f.t).toBeGreaterThan(p.frames[i - 1].t);
      }
    }
  });
  it('الأشرطة: مدفع اليسار يتجه يميناً ومدفع اليمين يساراً، وتبدأ من أسفل الشاشة', () => {
    const ribbons = plan().pieces.filter((x) => x.kind === 'ribbon');
    const left = ribbons.filter((r) => r.frames[0].x < 640); const right = ribbons.filter((r) => r.frames[0].x >= 640);
    expect(left.length).toBeGreaterThan(5); expect(right.length).toBeGreaterThan(5);
    const mid = (r) => r.frames[3];
    expect(left.every((r) => mid(r).x > r.frames[0].x)).toBe(true);
    expect(right.every((r) => mid(r).x < r.frames[0].x)).toBe(true);
    expect(ribbons.every((r) => r.frames[0].y > 700)).toBe(true);
  });
  it('تتلاشى كل القطع في النهاية (opacity 0) وزمن الكل محدود', () => {
    const { pieces, totalMs } = plan({ kind: 'week' });
    for (const p of pieces) expect(p.frames[p.frames.length - 1].op).toBe(0);
    expect(totalMs).toBeLessThanOrEqual(FX_MAX_MS);
    expect(totalMs).toBeGreaterThan(2000);
  });
  it('كرات الضوء تصعد (y ينقص) والبريق يتلألأ (0→1→0)', () => {
    for (const p of plan().pieces) {
      if (p.kind === 'orb') expect(p.frames[p.frames.length - 1].y).toBeLessThan(p.frames[0].y);
      if (p.kind === 'spark') expect(p.frames.map((f) => f.sc)).toEqual([0, 1, 0]);
    }
  });
  it('شاشة صغيرة لا تكسر الخطة', () => {
    const p = buildFxPlan({ kind: 'day', width: 100, height: 100, seed: 2 });
    expect(p.pieces.length).toBeGreaterThan(0);
    for (const x of p.pieces) for (const f of x.frames) expect(Number.isFinite(f.x + f.y)).toBe(true);
  });
  it('نص بطاقة الأوسمة: مفرد/عدة/أكثر من 3', () => {
    expect(badgeCheer(['أ'])).toEqual({ title: 'وسام جديد! 🏅', message: 'أ' });
    expect(badgeCheer(['أ', 'ب']).title).toContain('2 أوسمة');
    expect(badgeCheer(['أ', 'ب', 'ج', 'د']).message).toBe('أ، ب، ج وغيرها');
  });
});

describe('حراسة الواجهة', () => {
  it('core/celebration-fx نقي، وcelebrate.js بلا innerHTML ويحرس burst بالحركة', () => {
    expect(strip(readFileSync('src/core/celebration-fx.js', 'utf8'))).not.toMatch(/\b(document|window|localStorage)\b/);
    const ui = strip(readFileSync('src/ui/celebrate.js', 'utf8'));
    expect(ui).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    expect(ui).toMatch(/export function burst\([^)]*\) \{\s*if \(!motionOk\(\)\) return false;/);
    expect(ui).toMatch(/if \(!motionOk\(\)\) \{ showToast\(message, 'success'\); return; \}/);
  });
  it('المخطط 5 لم يتغير', () => {
    expect(readFileSync('src/core/constants.js', 'utf8')).toMatch(/SCHEMA_VERSION = 5/);
  });
});
