import { describe, expect, it } from 'vitest';
import { detectGoalCrossings, parseCelebrated, planCelebration } from '../src/core/celebrations.js';
import { createInitialState } from '../src/core/store.js';
import { session } from './helpers.js';

const base = createInitialState('2026-01-01');
const st = (sessions, weekly = null) => ({
  ...base, sessions,
  plan: weekly ? { versions: [{ ...base.plan.versions[0], weeklyMins: weekly }] } : base.plan,
  settings: { ...base.settings, trackingStart: '2026-01-01', freezesPerMonth: 0 },
});
const TODAY = '2026-11-12'; // الخميس: هدفه 120

describe('detectGoalCrossings', () => {
  it('عبور هدف اليوم من ناقص إلى مكتمل', () => {
    const before = st([session(TODAY, 'morning', 60)]);
    const after = st([session(TODAY, 'morning', 60), session(TODAY, 'evening', 60)]);
    expect(detectGoalCrossings(before, after, TODAY).day).toBe(true);
  });
  it('لا احتفال إن كان مكتملاً من قبل (إضافة جلسة زائدة)', () => {
    const before = st([session(TODAY, 'morning', 120)]);
    const after = st([session(TODAY, 'morning', 120), session(TODAY, 'evening', 30)]);
    expect(detectGoalCrossings(before, after, TODAY).day).toBe(false);
  });
  it('لا احتفال إن بقي ناقصاً', () => {
    expect(detectGoalCrossings(st([]), st([session(TODAY, 'morning', 30)]), TODAY).day).toBe(false);
  });
  it('الحذف (مكتمل ← ناقص) ليس عبوراً', () => {
    expect(detectGoalCrossings(st([session(TODAY, 'morning', 120)]), st([]), TODAY).day).toBe(false);
  });
  it('جلسة ليوم ماضٍ لا تحتفل بيوم اليوم', () => {
    const r = detectGoalCrossings(st([]), st([session('2026-11-10', 'morning', 120)]), TODAY);
    expect(r.day).toBe(false);
  });
  it('عبور هدف الأسبوع إلى 100%', () => {
    const w = 100;
    const before = st([session('2026-11-09', 'morning', 90)], w);
    const after = st([session('2026-11-09', 'morning', 90), session(TODAY, 'morning', 10)], w);
    const r = detectGoalCrossings(before, after, TODAY);
    expect(r.week).toBe(true);
    expect(r.weekKey).toBe('2026-11-09');
  });
  it('أسبوع هدفه صفر لا يحتفل', () => {
    const zero = { ...base, plan: { versions: [{ ...base.plan.versions[0], targets: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { morningMins: 0, eveningMins: 0 }])) }] } };
    const r = detectGoalCrossings(zero, { ...zero, sessions: [session(TODAY, 'morning', 30)] }, TODAY);
    expect(r.week).toBe(false);
    expect(r.day).toBe(false);
  });
});

describe('planCelebration (مرة واحدة لكل يوم/أسبوع)', () => {
  const crossing = { day: true, week: true, weekKey: '2026-11-09' };
  it('أول مرة: يحتفل ويسجّل', () => {
    const p = planCelebration({ day: null, week: null }, crossing, TODAY);
    expect(p).toMatchObject({ day: true, week: true, record: { day: TODAY, week: '2026-11-09' } });
  });
  it('لا يكرر لليوم أو الأسبوع نفسه', () => {
    const p = planCelebration({ day: TODAY, week: '2026-11-09' }, crossing, TODAY);
    expect(p.day).toBe(false);
    expect(p.week).toBe(false);
  });
  it('يوم جديد في الأسبوع نفسه: اليوم يحتفل والأسبوع لا', () => {
    const p = planCelebration({ day: '2026-11-11', week: '2026-11-09' }, crossing, TODAY);
    expect(p.day).toBe(true);
    expect(p.week).toBe(false);
  });
  it('parseCelebrated يتسامح مع التالف', () => {
    expect(parseCelebrated('not json')).toEqual({ day: null, week: null });
    expect(parseCelebrated(null)).toEqual({ day: null, week: null });
    expect(parseCelebrated('{"day":"2026-11-12","week":5}')).toEqual({ day: '2026-11-12', week: null });
  });
});
