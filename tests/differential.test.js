// اختبار مقارنة: المحرك الجديد بلا ميزات المرحلة 2 (بلا تجميد ولا أيام استثنائية ولا هدف أسبوعي،
// وكل يوم هدفه موجب) يجب أن يعطي نفس حالة كل يوم ونفس السلسلة التي كان يعطيها محرك المرحلة 1.
// المرجع: tests/oracle/status-v1.js (نسخة حرفية من status.js قبل التعديل).
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/core/dates.js';
import { normalizePlan } from '../src/core/plan.js';
import { buildDayIndex } from '../src/core/sessions.js';
import { computeStreak, evaluateDay } from '../src/core/status.js';
import { computeStreak as oldStreak, evaluateDay as oldEvaluate } from './oracle/status-v1.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scenario(seed) {
  const r = rng(seed);
  const pick = (n) => Math.floor(r() * n);
  const today = addDays('2026-03-01', pick(300));
  const trackingStart = addDays(today, -pick(70));

  // خطة: نسخة أو نسختان، كل يوم هدفه بين 30 و400 د
  const mkTargets = () => {
    const t = {};
    for (let d = 0; d <= 6; d++) t[d] = { morningMins: 15 * (1 + pick(10)), eveningMins: 15 * (1 + pick(10)) };
    return t;
  };
  const versions = [{ effectiveFrom: '0000-01-01', targets: mkTargets(), weeklyMins: null }];
  if (r() < 0.5) versions.push({ effectiveFrom: addDays(today, -pick(40)), targets: mkTargets(), weeklyMins: null });
  const plan = normalizePlan({ versions });

  const sessions = [];
  for (let i = -75; i <= 3; i++) {
    const date = addDays(today, i);
    if (r() < 0.65) {
      const parts = 1 + pick(3);
      for (let p = 0; p < parts; p++) {
        sessions.push({
          id: `s${seed}-${i}-${p}`, date, period: r() < 0.5 ? 'morning' : 'evening',
          minutes: 5 + pick(240), startedAt: null, source: 'manual', subject: null, note: '', createdAt: 0,
        });
      }
    }
  }
  return { today, trackingStart, plan, index: buildDayIndex(sessions) };
}

describe('مقارنة مع محرك المرحلة 1', () => {
  it('نفس حالة كل يوم ونفس السلسلة في 400 سيناريو عشوائي', () => {
    const mismatches = [];
    for (let seed = 1; seed <= 400; seed++) {
      const { today, trackingStart, plan, index } = scenario(seed);
      const oldCtx = { index, plan, trackingStart, today };
      const newCtx = { index, plan, trackingStart, today, dayOffs: [], freezesPerMonth: 0 };

      for (let i = -85; i <= 4; i++) {
        const d = addDays(today, i);
        const a = oldEvaluate(d, oldCtx);
        const b = evaluateDay(d, newCtx);
        if (a !== b) mismatches.push(`seed=${seed} ${d}: قديم=${a} جديد=${b}`);
      }
      const s1 = oldStreak(oldCtx);
      const s2 = computeStreak(newCtx);
      if (s1 !== s2) mismatches.push(`seed=${seed} streak: قديم=${s1} جديد=${s2}`);
      if (mismatches.length > 10) break;
    }
    expect(mismatches).toEqual([]);
  });

  it('التجميد وحده هو ما يغيّر النتائج: مع رصيد > 0 لا يظهر إلا frozen بدل default/failed', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { today, trackingStart, plan, index } = scenario(seed);
      const oldCtx = { index, plan, trackingStart, today };
      const frozenCtx = { index, plan, trackingStart, today, dayOffs: [], freezesPerMonth: 2 };
      for (let i = -85; i <= 4; i++) {
        const d = addDays(today, i);
        const a = oldEvaluate(d, oldCtx);
        const b = evaluateDay(d, frozenCtx);
        if (a !== b) {
          // الفرق الوحيد المسموح: يوم كان default/failed صار frozen
          expect(b, `seed=${seed} ${d}`).toBe('frozen');
          expect(['default', 'failed'], `seed=${seed} ${d}`).toContain(a);
        }
      }
      // وتجميد الأيام لا يُنقص السلسلة أبداً
      expect(computeStreak(frozenCtx)).toBeGreaterThanOrEqual(oldStreak(oldCtx));
    }
  });
});
