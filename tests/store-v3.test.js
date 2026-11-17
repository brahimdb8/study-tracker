import { describe, expect, it } from 'vitest';
import { addDayOff } from '../src/core/dayoffs.js';
import { createInitialPlan } from '../src/core/plan.js';
import { addSession, buildDayIndex } from '../src/core/sessions.js';
import { SCHEMA2_BACKUP_KEY, STATE_KEY, createStore, sanitizeState } from '../src/core/store.js';
import { addSubject } from '../src/core/subjects.js';
import { memoryStorage } from './helpers.js';

const NOW = () => new Date(2026, 10, 12, 10, 0);

// حالة كما كتبتها المرحلة 1 (مخطط 2): بلا subjects / dayOffs / freezesPerMonth / weeklyMins
function phase1State() {
  const plan = JSON.parse(JSON.stringify(createInitialPlan()));
  delete plan.versions[0].weeklyMins;
  return {
    schemaVersion: 2,
    sessions: [
      { id: 'a', date: '2026-11-10', period: 'morning', minutes: 90, startedAt: null, source: 'manual', subject: null, note: 'فيزياء', createdAt: 1 },
      { id: 'b', date: '2026-11-10', period: 'evening', minutes: 45, startedAt: 1760000000000, source: 'timer', subject: null, note: '', createdAt: 2 },
    ],
    dayMeta: { '2026-11-10': { quality: 'good' } },
    plan,
    settings: { trackingStart: '2026-11-01' },
  };
}

describe('ترقية المخطط 2 → 4 (مسار المرحلة 2 داخل ترقية المرحلة 4)', () => {
  it('تحافظ على كل بيانات المرحلة 1 وتضيف الحقول الجديدة بقيمها الافتراضية', () => {
    const raw = JSON.stringify(phase1State());
    const st = memoryStorage({ [STATE_KEY]: raw });
    const store = createStore(st, { now: NOW });
    const s = store.getState();

    expect(s.schemaVersion).toBe(5);
    expect(s.sessions.map((x) => [x.id, x.minutes, x.note])).toEqual([['a', 90, 'فيزياء'], ['b', 45, '']]);
    expect(s.sessions[1].startedAt).toBe(1760000000000);
    expect(s.dayMeta['2026-11-10']).toEqual({ quality: 'good' });
    expect(s.settings.trackingStart).toBe('2026-11-01');
    expect(s.settings.freezesPerMonth).toBe(2);
    expect(s.subjects).toEqual([]);
    expect(s.dayOffs).toEqual([]);
    expect(s.plan.versions[0].weeklyMins).toBeNull();
    expect(buildDayIndex(s.sessions)['2026-11-10'].totalMins).toBe(135);
  });

  it('تحفظ نسخة الأصل مرة واحدة وتكتب الحالة الجديدة', () => {
    const raw = JSON.stringify(phase1State());
    const st = memoryStorage({ [STATE_KEY]: raw });
    const store = createStore(st, { now: NOW });
    expect(st.data[SCHEMA2_BACKUP_KEY]).toBe(raw);
    expect(JSON.parse(st.data[STATE_KEY]).schemaVersion).toBe(5);
    expect(store.takeNotices().some((n) => n.includes('الإصدار 5'))).toBe(true);
  });

  it('إعادة الفتح لا تكرر الترقية ولا تستبدل النسخة الاحتياطية', () => {
    const raw = JSON.stringify(phase1State());
    const st = memoryStorage({ [STATE_KEY]: raw });
    createStore(st, { now: NOW });
    const second = createStore(st, { now: NOW });
    expect(st.data[SCHEMA2_BACKUP_KEY]).toBe(raw);
    expect(second.takeNotices()).toEqual([]);
  });

  it('استيراد ملف تصدير من المرحلة 1 يُرقّى', () => {
    const store = createStore(memoryStorage(), { now: NOW });
    const res = store.importJSON(JSON.stringify({ ...phase1State(), exportedAt: 'x' }));
    expect(res.ok).toBe(true);
    expect(store.getState().schemaVersion).toBe(5);
    expect(store.getState().sessions).toHaveLength(2);
  });

  it('إصدار غير مدعوم (مثلاً 99) يُرفض', () => {
    expect(sanitizeState({ schemaVersion: 99, sessions: [] }).ok).toBe(false);
    expect(sanitizeState({ schemaVersion: 1, sessions: [] }).ok).toBe(false);
  });
});

describe('حقول المرحلة 2', () => {
  it('تصدير ثم استيراد يحفظ المواد والأيام الاستثنائية والتجميد والجلسات بموادها', () => {
    const a = createStore(memoryStorage(), { now: NOW });
    let s = a.getState();
    const subj = addSubject(s.subjects, { name: 'كيمياء' });
    const sess = addSession(s.sessions, { date: '2026-11-11', minutes: 30, period: 'morning', subject: subj.subject.id });
    const off = addDayOff(s.dayOffs, { from: '2026-11-12', to: '2026-11-13', type: 'sick', note: 'زكام' });
    a.commit({ ...s, subjects: subj.subjects, sessions: sess.sessions, dayOffs: off.dayOffs, settings: { ...s.settings, freezesPerMonth: 4 } });

    const b = createStore(memoryStorage(), { now: NOW });
    expect(b.importJSON(a.exportJSON()).ok).toBe(true);
    expect(b.getState().subjects).toEqual(a.getState().subjects);
    expect(b.getState().dayOffs).toEqual(a.getState().dayOffs);
    expect(b.getState().sessions).toEqual(a.getState().sessions);
    expect(b.getState().settings.freezesPerMonth).toBe(4);
  });

  it('مرجع مادة غير موجودة يُصلح إلى null مع نسخة احتياطية', () => {
    const state = { ...phase1State(), schemaVersion: 3, subjects: [], dayOffs: [], settings: { trackingStart: '2026-11-01', freezesPerMonth: 2 } };
    state.sessions[0].subject = 'ghost';
    const st = memoryStorage({ [STATE_KEY]: JSON.stringify(state) });
    const store = createStore(st, { now: NOW });
    expect(store.getState().sessions[0].subject).toBeNull();
    expect(Object.keys(st.data).some((k) => k.includes('__corrupt_'))).toBe(true);
  });

  it('رصيد تجميد غير صالح يعود للافتراضي', () => {
    for (const bad of [99, -1, 1.5, 'x', null]) {
      const state = { ...phase1State(), schemaVersion: 3, settings: { trackingStart: '2026-11-01', freezesPerMonth: bad } };
      const res = sanitizeState(state, '2026-11-12');
      expect(res.state.settings.freezesPerMonth, String(bad)).toBe(2);
    }
    expect(sanitizeState({ ...phase1State(), schemaVersion: 3, settings: { trackingStart: '2026-11-01', freezesPerMonth: 0 } }, '2026-11-12').state.settings.freezesPerMonth).toBe(0);
  });

  it('أيام استثنائية تالفة تُسقَط', () => {
    const state = {
      ...phase1State(), schemaVersion: 3,
      dayOffs: [{ id: 'ok', from: '2026-11-10', to: '2026-11-11', type: 'exam' }, { id: 'bad', from: '2026-11-12', to: '2026-11-10', type: 'exam' }],
    };
    const res = sanitizeState(state, '2026-11-12');
    expect(res.state.dayOffs).toHaveLength(1);
    expect(res.dropped).toBe(1);
  });
});
