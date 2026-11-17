import { describe, expect, it } from 'vitest';
import { buildShareModel, shareFileName } from '../src/core/share-card.js';
import { createInitialState } from '../src/core/store.js';
import { session } from './helpers.js';

const base = createInitialState('2026-01-01');
const subjects = [{ id: 'm', name: 'رياضيات', color: '#38bdf8', archived: false }, { id: 'p', name: 'فيزياء', color: '#22c55e', archived: false }];
const TODAY = '2026-11-12'; // الخميس
const state = {
  ...base, subjects,
  settings: { ...base.settings, trackingStart: '2026-01-01', freezesPerMonth: 0 },
  sessions: [
    session('2026-11-09', 'morning', 60, { subject: 'm' }), session('2026-11-09', 'evening', 60, { subject: 'p' }),
    session('2026-11-10', 'evening', 30, { subject: 'm' }),
    session('2026-11-02', 'morning', 45),
  ],
  achievements: { unlocked: { 'streak-3': '2026-11-11', 'hours-10': '2026-10-01' } },
};

describe('buildShareModel', () => {
  it('أسبوعي: مدى إثنين→أحد وإجماليات صحيحة وأيام المستقبل مميّزة', () => {
    const m = buildShareModel(state, TODAY, { period: 'week' });
    expect(m.from).toBe('2026-11-09');
    expect(m.to).toBe('2026-11-15');
    expect(m.days).toHaveLength(7);
    expect(m.totalMins).toBe(150);
    expect(m.morningMins).toBe(60);
    expect(m.eveningMins).toBe(90);
    expect(m.days.filter((d) => d.future)).toHaveLength(3);
    expect(m.doneDays).toBe(1); // الإثنين فقط (120 ≥ 120)
  });
  it('شهري: كل أيام الشهر وجلسة 2 نوفمبر تدخل', () => {
    const m = buildShareModel(state, TODAY, { period: 'month' });
    expect(m.days).toHaveLength(30);
    expect(m.totalMins).toBe(195);
    expect(m.rangeLabel).toBe('نوفمبر 2026');
  });
  it('أسماء المواد مخفية افتراضياً', () => {
    expect(buildShareModel(state, TODAY).subjects).toEqual([]);
    expect(buildShareModel(state, TODAY).hideSubjects).toBe(true);
  });
  it('إظهار المواد: مرتبة تنازلياً بالدقائق', () => {
    const m = buildShareModel(state, TODAY, { hideSubjects: false });
    expect(m.subjects).toEqual([{ name: 'رياضيات', mins: 90 }, { name: 'فيزياء', mins: 60 }]);
  });
  it('الأوسمة ضمن المدى فقط', () => {
    expect(buildShareModel(state, TODAY, { period: 'week' }).badges.map((b) => b.id)).toEqual(['streak-3']);
    expect(buildShareModel(state, TODAY, { period: 'month' }).badges.map((b) => b.id)).toEqual(['streak-3']);
  });
  it('maxDayMins لا يقل عن 1 (لا قسمة على صفر) وحالة فارغة', () => {
    const m = buildShareModel(base, TODAY);
    expect(m.maxDayMins).toBe(1);
    expect(m.totalMins).toBe(0);
    expect(m.badges).toEqual([]);
  });
  it('اسم الملف', () => {
    expect(shareFileName(buildShareModel(state, TODAY, { period: 'week' }))).toBe('study-week-2026-11-15.png');
  });
});
