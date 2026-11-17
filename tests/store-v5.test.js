import { describe, expect, it } from 'vitest';
import {
  BADGE_AUDIT_BACKUP_KEY, SCHEMA4_BACKUP_KEY, SCHEMA3_BACKUP_KEY, SCHEMA2_BACKUP_KEY, STATE_KEY, createStore, sanitizeState,
} from '../src/core/store.js';
import { memoryStorage } from './helpers.js';

const NOW = () => new Date(2026, 10, 14, 12, 0, 0);
const sess = (id, date, minutes, period = 'morning') => ({ id, date, period, minutes, startedAt: null, source: 'manual', subject: null, note: '', createdAt: 1 });

const v4State = (over = {}) => ({
  schemaVersion: 4,
  sessions: [sess('a', '2026-11-10', 700)], // 11 ساعة: يستحق hours-10
  dayMeta: {}, subjects: [], dayOffs: [],
  plan: { versions: [{ effectiveFrom: '0000-01-01', targets: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { morningMins: 60, eveningMins: 60 }])), weeklyMins: null }] },
  settings: { trackingStart: '2026-11-01', freezesPerMonth: 2, timer: { focusMins: 25, shortMins: 5, longMins: 15, longEvery: 4, sound: true, notify: false } },
  ...over,
});

describe('ترقية المخطط 4 → 5', () => {
  it('تحفظ كل البيانات وتضيف exams وachievements', () => {
    const st = memoryStorage({ [STATE_KEY]: JSON.stringify(v4State()) });
    const s = createStore(st, { now: NOW }).getState();
    expect(s.schemaVersion).toBe(5);
    expect(s.sessions).toHaveLength(1);
    expect(s.exams).toEqual([]);
    expect(s.settings.timer.focusMins).toBe(25);
    expect(s.settings.freezesPerMonth).toBe(2);
  });

  it('تحفظ نسخة الأصل مرة واحدة ولا تكتب فوقها لاحقاً', () => {
    const raw = JSON.stringify(v4State());
    const st = memoryStorage({ [STATE_KEY]: raw });
    createStore(st, { now: NOW });
    expect(st.data[SCHEMA4_BACKUP_KEY]).toBe(raw);
    expect(st.data[SCHEMA3_BACKUP_KEY]).toBeUndefined();
    expect(JSON.parse(st.data[STATE_KEY]).schemaVersion).toBe(5);
    // فتح ثانٍ: لا ترقية ولا إعادة كتابة للنسخة
    createStore(st, { now: NOW });
    expect(st.data[SCHEMA4_BACKUP_KEY]).toBe(raw);
  });

  it('إشعار الترقية + فتح الأوسمة المستحقة من السجل بصمت (إشعار مجمّع بلا takeUnlocks)', () => {
    const store = createStore(memoryStorage({ [STATE_KEY]: JSON.stringify(v4State()) }), { now: NOW });
    const notices = store.takeNotices();
    expect(notices[0]).toMatch(/الإصدار 5/);
    expect(notices.some((n) => /فُتح .*(وسام|أوسمة)/.test(n))).toBe(true);
    expect(store.getState().achievements.unlocked['hours-10']).toBe('2026-11-10'); // تاريخ الشرط لا تاريخ اليوم
    expect(store.takeUnlocks()).toEqual([]);
  });

  it('الإصدار 3 والإصدار 2 يمران إلى 5 بنسخ أصولهما', () => {
    const v3 = { ...v4State(), schemaVersion: 3 };
    delete v3.settings.timer;
    const st3 = memoryStorage({ [STATE_KEY]: JSON.stringify(v3) });
    createStore(st3, { now: NOW });
    expect(st3.data[SCHEMA3_BACKUP_KEY]).toBeTruthy();
    const v2 = { schemaVersion: 2, sessions: [sess('a', '2026-11-10', 30)], dayMeta: {}, plan: null, settings: {} };
    const st2 = memoryStorage({ [STATE_KEY]: JSON.stringify(v2) });
    const s = createStore(st2, { now: NOW }).getState();
    expect(st2.data[SCHEMA2_BACKUP_KEY]).toBeTruthy();
    expect(s.schemaVersion).toBe(5);
  });

  it('sanitizeState: upgradedFrom=4 ولا عناصر تالفة عند غياب الحقلين', () => {
    const r = sanitizeState(v4State(), '2026-11-14');
    expect(r.ok).toBe(true);
    expect(r.upgradedFrom).toBe(4);
    expect(r.dropped).toBe(0);
  });
});

describe('المخطط 5: التنظيف', () => {
  const v5 = (over = {}) => ({ ...v4State(), schemaVersion: 5, exams: [], achievements: { unlocked: {} }, ...over });
  it('أوسمة وامتحانات تالفة تُسقط وتُحصى وتُحفظ نسخة الأصل', () => {
    const raw = JSON.stringify(v5({
      achievements: { unlocked: { 'streak-3': '2026-11-04', bogus: '2026-11-04' } },
      exams: [{ id: 'e1', name: 'فيزياء', date: '2026-12-01' }, { id: 'e2', name: '', date: 'x' }],
    }));
    const st = memoryStorage({ [STATE_KEY]: raw });
    const store = createStore(st, { now: NOW });
    expect(store.getState().exams).toHaveLength(1);
    // 'streak-3' بلا جلسات تدعمه: يُسحب عند التحميل (تقييم ديناميكي) والمجهول 'bogus' يُسقط
    expect(store.getState().achievements.unlocked['streak-3']).toBeUndefined();
    expect(store.getState().achievements.unlocked.bogus).toBeUndefined();
    expect(Object.keys(st.data).some((k) => k.includes('__corrupt_'))).toBe(true);
    expect(store.takeNotices().join(' ')).toMatch(/2 عنصراً/);
  });
  it('إصدار 6 مرفوض', () => {
    expect(sanitizeState({ ...v5(), schemaVersion: 6 }).ok).toBe(false);
  });
});

describe('فتح الأوسمة أثناء الاستخدام', () => {
  it('commit يفتح وسام الساعات مرة واحدة ويُسلَّم عبر takeUnlocks ويُحفظ', () => {
    const st = memoryStorage();
    const store = createStore(st, { now: NOW });
    expect(store.takeUnlocks()).toEqual([]);
    store.commit({ ...store.getState(), sessions: [sess('w', '2026-11-13', 5)] });
    store.takeUnlocks();
    store.commit({ ...store.getState(), sessions: [...store.getState().sessions, sess('x', '2026-11-14', 600)] });
    expect(store.takeUnlocks()).toContain('hours-10');
    expect(store.takeUnlocks()).toEqual([]);
    store.commit({ ...store.getState(), sessions: [...store.getState().sessions, sess('y', '2026-11-14', 10, 'evening')] });
    expect(store.takeUnlocks()).toEqual([]); // لا فتح مكرر
    expect(JSON.parse(st.data[STATE_KEY]).achievements.unlocked['hours-10']).toBe('2026-11-14');
  });

  it('حذف الجلسة المسبِّبة يسحب الوسام تلقائياً مع إشعار ونسخة أمان مرة واحدة', () => {
    const st = memoryStorage();
    const store = createStore(st, { now: NOW });
    store.commit({ ...store.getState(), sessions: [sess('x', '2026-11-14', 600)] });
    store.takeUnlocks(); store.takeNotices();
    store.commit({ ...store.getState(), sessions: [] });
    expect(store.getState().achievements.unlocked['hours-10']).toBeUndefined();
    expect(store.takeNotices().join(' ')).toMatch(/سُحب/);
    const backup = JSON.parse(st.data[BADGE_AUDIT_BACKUP_KEY]);
    expect(backup.achievements.unlocked['hours-10']).toBe('2026-11-14'); // الحالة كما كانت قبل السحب
    expect(JSON.parse(st.data[STATE_KEY]).achievements.unlocked['hours-10']).toBeUndefined();
  });

  it('إعادة الجلسة بعد الحذف تعيد فتح الوسام (ويُعلَن كفتح جديد)', () => {
    const store = createStore(memoryStorage(), { now: NOW });
    store.commit({ ...store.getState(), sessions: [sess('x', '2026-11-14', 600)] });
    store.commit({ ...store.getState(), sessions: [] });
    store.takeUnlocks(); store.takeNotices();
    store.commit({ ...store.getState(), sessions: [sess('x2', '2026-11-14', 600)] });
    expect(store.getState().achievements.unlocked['hours-10']).toBe('2026-11-14');
    // عدة أوسمة تعود دفعة واحدة: إشعار مجمّع بدل سيل احتفالات
    expect(store.takeNotices().join(' ') + store.takeUnlocks().join(' ')).toMatch(/فُتح|hours-10/);
  });

  it('حذف جلسة لا تؤثر على أي وسام لا يسحب شيئاً ولا يُنتج إشعاراً', () => {
    const store = createStore(memoryStorage(), { now: NOW });
    store.commit({ ...store.getState(), sessions: [sess('x', '2026-11-14', 600), sess('y', '2026-11-14', 5, 'evening')] });
    store.takeUnlocks(); store.takeNotices();
    store.commit({ ...store.getState(), sessions: store.getState().sessions.filter((s) => s.id !== 'y') });
    expect(store.getState().achievements.unlocked['hours-10']).toBe('2026-11-14');
    expect(store.takeNotices()).toEqual([]);
  });

  it('reload من تبويب آخر لا يصنع إشعارات فتح', () => {
    const st = memoryStorage();
    const a = createStore(st, { now: NOW });
    const b = createStore(st, { now: NOW });
    a.commit({ ...a.getState(), sessions: [sess('x', '2026-11-14', 600)] });
    b.reload();
    expect(b.takeUnlocks()).toEqual([]);
    expect(b.getState().achievements.unlocked['hours-10']).toBe('2026-11-14');
  });
});

describe('الاستيراد والأوسمة', () => {
  it('تصدير v5 ثم استيراد: التواريخ كما هي ولا إشعارات فتح', () => {
    const a = createStore(memoryStorage(), { now: NOW });
    a.commit({ ...a.getState(), sessions: [sess('x', '2026-11-10', 600)], exams: [{ id: 'e', name: 'امتحان', date: '2026-12-01' }] });
    const json = a.exportJSON();
    const b = createStore(memoryStorage(), { now: NOW });
    expect(b.importJSON(json).ok).toBe(true);
    expect(b.getState().achievements.unlocked['hours-10']).toBe('2026-11-10');
    expect(b.getState().exams).toHaveLength(1);
    expect(b.takeUnlocks()).toEqual([]);
  });

  it('استيراد ملف v4: يُقبل ويُعاد حساب الأوسمة المستحقة مع إشعار مجمّع', () => {
    const store = createStore(memoryStorage(), { now: NOW });
    store.takeNotices();
    expect(store.importJSON(JSON.stringify(v4State())).ok).toBe(true);
    expect(store.getState().schemaVersion).toBe(5);
    expect(store.getState().achievements.unlocked['hours-10']).toBe('2026-11-10');
    expect(store.takeNotices().some((n) => /وسام|أوسمة/.test(n))).toBe(true);
  });

  it('استيراد ملف v5 فيه وسام مخزَّن بلا جلسات تدعمه: يُسحب مع إشعار (التقييم من السجل)', () => {
    const store = createStore(memoryStorage(), { now: NOW });
    store.takeNotices();
    const file = { ...v4State({ sessions: [] }), schemaVersion: 5, exams: [], achievements: { unlocked: { 'streak-30': '2026-05-05' } } };
    expect(store.importJSON(JSON.stringify(file)).ok).toBe(true);
    expect(store.getState().achievements.unlocked['streak-30']).toBeUndefined();
    expect(store.takeNotices().join(' ')).toMatch(/سُحب/);
  });

  it('استيراد ملف v2 يُقبل ويُرقّى إلى 5', () => {
    const store = createStore(memoryStorage(), { now: NOW });
    const v2 = { schemaVersion: 2, sessions: [sess('a', '2026-11-10', 30)], dayMeta: {}, plan: null, settings: {} };
    expect(store.importJSON(JSON.stringify(v2)).ok).toBe(true);
    expect(store.getState().schemaVersion).toBe(5);
  });

  it('استعادة نسخة ما قبل الاستيراد تُبقي الأوسمة المدعومة بجلساتها', () => {
    const store = createStore(memoryStorage(), { now: NOW });
    store.commit({ ...store.getState(), sessions: [sess('x', '2026-11-10', 600)] });
    store.importJSON(JSON.stringify({ ...v4State({ sessions: [] }) }));
    expect(store.swapPreImportBackup().ok).toBe(true);
    expect(store.getState().achievements.unlocked['hours-10']).toBe('2026-11-10');
  });
});
