import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMER_SETTINGS } from '../src/core/constants.js';
import {
  SCHEMA2_BACKUP_KEY, SCHEMA3_BACKUP_KEY, STATE_KEY, createInitialState, createStore, sanitizeState,
} from '../src/core/store.js';
import { memoryStorage } from './helpers.js';

const NOW = () => new Date(2026, 10, 13, 12, 0, 0);

const v3State = (over = {}) => ({
  schemaVersion: 3,
  sessions: [
    { id: 'a', date: '2026-11-10', period: 'morning', minutes: 90, startedAt: null, source: 'manual', subject: 'math', note: '', createdAt: 1 },
  ],
  dayMeta: { '2026-11-10': { quality: 'good' } },
  subjects: [{ id: 'math', name: 'رياضيات', color: '#38bdf8', archived: false }],
  dayOffs: [{ id: 'd1', from: '2026-11-11', to: '2026-11-11', type: 'sick', note: '' }],
  plan: { versions: [{ effectiveFrom: '0000-01-01', targets: { 0: { morningMins: 0, eveningMins: 0 }, 1: { morningMins: 60, eveningMins: 60 }, 2: { morningMins: 60, eveningMins: 60 }, 3: { morningMins: 60, eveningMins: 60 }, 4: { morningMins: 60, eveningMins: 60 }, 5: { morningMins: 60, eveningMins: 60 }, 6: { morningMins: 60, eveningMins: 60 } }, weeklyMins: 600 }] },
  settings: { trackingStart: '2026-11-01', freezesPerMonth: 3 },
  ...over,
});

describe('ترقية المخطط 3 → 4', () => {
  it('تحفظ كل بيانات المرحلة 3 وتضيف settings.timer بالافتراضي', () => {
    const st = memoryStorage({ [STATE_KEY]: JSON.stringify(v3State()) });
    const s = createStore(st, { now: NOW }).getState();
    expect(s.schemaVersion).toBe(5);
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0]).toMatchObject({ id: 'a', minutes: 90, subject: 'math' });
    expect(s.subjects).toHaveLength(1);
    expect(s.dayOffs).toHaveLength(1);
    expect(s.dayMeta['2026-11-10']).toEqual({ quality: 'good' });
    expect(s.plan.versions[0].weeklyMins).toBe(600);
    expect(s.settings).toEqual({ trackingStart: '2026-11-01', freezesPerMonth: 3, timer: DEFAULT_TIMER_SETTINGS });
  });

  it('تحفظ نسخة الأصل (schema3) مرة واحدة وتكتب الحالة الجديدة وتُشعر المستخدم', () => {
    const raw = JSON.stringify(v3State());
    const st = memoryStorage({ [STATE_KEY]: raw });
    const store = createStore(st, { now: NOW });
    expect(st.data[SCHEMA3_BACKUP_KEY]).toBe(raw);
    expect(st.data[SCHEMA2_BACKUP_KEY]).toBeUndefined();
    expect(JSON.parse(st.data[STATE_KEY]).schemaVersion).toBe(5);
    const notices = store.takeNotices();
    expect(notices[0]).toMatch(/الإصدار 5/);
    expect(notices[0]).toMatch(/نسخة/);
    expect(notices.slice(1).every((n) => /فُتح/.test(n))).toBe(true); // قد يتبعه إشعار أوسمة مجمّع
  });

  it('إعادة الفتح لا تكرر الترقية ولا تستبدل النسخة الاحتياطية', () => {
    const raw = JSON.stringify(v3State());
    const st = memoryStorage({ [STATE_KEY]: raw });
    createStore(st, { now: NOW });
    const second = createStore(st, { now: NOW });
    expect(st.data[SCHEMA3_BACKUP_KEY]).toBe(raw);
    expect(second.takeNotices()).toEqual([]);
  });

  it('نسخة schema3 موجودة مسبقاً لا تُستبدل', () => {
    const st = memoryStorage({ [STATE_KEY]: JSON.stringify(v3State()), [SCHEMA3_BACKUP_KEY]: 'قديمة' });
    createStore(st, { now: NOW });
    expect(st.data[SCHEMA3_BACKUP_KEY]).toBe('قديمة');
  });

  it('الإصدار 2 يمر مباشرة إلى 4 بنسخة schema2 فقط', () => {
    const v2 = { schemaVersion: 2, sessions: [{ id: 'a', date: '2026-11-10', period: 'morning', minutes: 30 }], dayMeta: {}, plan: null, settings: {} };
    const raw = JSON.stringify(v2);
    const st = memoryStorage({ [STATE_KEY]: raw });
    const store = createStore(st, { now: NOW });
    expect(st.data[SCHEMA2_BACKUP_KEY]).toBe(raw);
    expect(st.data[SCHEMA3_BACKUP_KEY]).toBeUndefined();
    expect(store.getState().schemaVersion).toBe(5);
    expect(store.getState().settings.timer).toEqual(DEFAULT_TIMER_SETTINGS);
  });

  it('استيراد ملف v3 يُرقّى ويُحفظ ما قبل الاستيراد', () => {
    const store = createStore(memoryStorage(), { now: NOW });
    const res = store.importJSON(JSON.stringify({ ...v3State(), exportedAt: 'x' }));
    expect(res.ok).toBe(true);
    expect(store.getState().schemaVersion).toBe(5);
    expect(store.getState().sessions).toHaveLength(1);
    expect(store.getState().settings.timer).toEqual(DEFAULT_TIMER_SETTINGS);
  });
});

describe('settings.timer في المخطط 4', () => {
  const v4 = (timer) => ({ ...v3State(), schemaVersion: 4, settings: { trackingStart: '2026-11-01', freezesPerMonth: 2, timer } });

  it('الحالة الجديدة تحمل الإعدادات الافتراضية (نسخة مستقلة لا مشتركة)', () => {
    const a = createInitialState('2026-11-13');
    const b = createInitialState('2026-11-13');
    expect(a.settings.timer).toEqual(DEFAULT_TIMER_SETTINGS);
    a.settings.timer.focusMins = 99;
    expect(b.settings.timer.focusMins).toBe(25);
  });

  it('قيم صالحة تُحفظ كما هي ذهاباً وإياباً (تصدير/استيراد)', () => {
    const timer = { focusMins: 50, shortMins: 10, longMins: 30, longEvery: 3, sound: false, notify: true };
    const a = createStore(memoryStorage(), { now: NOW });
    a.commit({ ...a.getState(), settings: { ...a.getState().settings, timer } });
    const b = createStore(memoryStorage(), { now: NOW });
    expect(b.importJSON(a.exportJSON()).ok).toBe(true);
    expect(b.getState().settings.timer).toEqual(timer);
  });

  it('قيم تالفة: تعود للافتراضي وتُحصى ويُحفظ الأصل ويظهر إشعار', () => {
    const raw = JSON.stringify(v4({ focusMins: 5000, shortMins: 5, longMins: -1, longEvery: 4, sound: 'x', notify: false }));
    const st = memoryStorage({ [STATE_KEY]: raw });
    const store = createStore(st, { now: NOW });
    expect(store.getState().settings.timer).toEqual({ ...DEFAULT_TIMER_SETTINGS, shortMins: 5, notify: false });
    expect(Object.keys(st.data).some((k) => k.includes('__corrupt_'))).toBe(true);
    expect(store.takeNotices().join(' ')).toMatch(/3 عنصراً/);
  });

  it('sanitizeState على v5 بلا timer يضيف الافتراضي دون عدّه تالفاً', () => {
    const res = sanitizeState({ ...v3State(), schemaVersion: 5 }, '2026-11-13');
    expect(res.ok).toBe(true);
    expect(res.dropped).toBe(0);
    expect(res.upgradedFrom).toBeNull();
    expect(res.state.settings.timer).toEqual(DEFAULT_TIMER_SETTINGS);
  });

  it('إصدار غير مدعوم (6 أو 1) ما زال مرفوضاً', () => {
    expect(sanitizeState({ schemaVersion: 6, sessions: [] }).ok).toBe(false);
    expect(sanitizeState({ schemaVersion: 1, sessions: [] }).ok).toBe(false);
  });
});
