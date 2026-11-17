import { describe, expect, it } from 'vitest';
import { LEGACY_BACKUP_KEY, PRE_IMPORT_BACKUP_KEY, STATE_KEY, createStore } from '../src/core/store.js';
import { addSession, buildDayIndex } from '../src/core/sessions.js';
import { memoryStorage } from './helpers.js';

const NOW = () => new Date(2026, 10, 12, 10, 0);

describe('store', () => {
  it('أول تشغيل: حالة جديدة محفوظة', () => {
    const st = memoryStorage();
    const store = createStore(st, { now: NOW });
    expect(store.getState().sessions).toEqual([]);
    expect(store.getState().settings.trackingStart).toBe('2026-11-12');
    expect(JSON.parse(st.data[STATE_KEY]).schemaVersion).toBe(5);
  });

  it('ترحيل تلقائي للبيانات القديمة مع نسخة احتياطية وإبقاء الأصل', () => {
    const legacyLogs = JSON.stringify({ '2026-11-10': { morning: 2, evening: 1, quality: 'good' } });
    const st = memoryStorage({ studyLogs: legacyLogs });
    const store = createStore(st, { now: NOW });
    expect(buildDayIndex(store.getState().sessions)['2026-11-10'].totalMins).toBe(180);
    expect(st.data[LEGACY_BACKUP_KEY]).toBeTruthy();
    expect(st.data.studyLogs).toBe(legacyLogs); // الأصل لا يُحذف
    expect(store.takeNotices().length).toBeGreaterThan(0);
  });

  it('الترحيل يحدث مرة واحدة فقط (لا يطغى على بيانات جديدة)', () => {
    const st = memoryStorage({ studyLogs: JSON.stringify({ '2026-11-10': { morning: 1 } }) });
    const a = createStore(st, { now: NOW });
    const added = addSession(a.getState().sessions, { date: '2026-11-11', minutes: 30, period: 'morning' });
    a.commit({ ...a.getState(), sessions: added.sessions });
    const b = createStore(st, { now: NOW }); // إعادة فتح التطبيق
    expect(b.getState().sessions).toHaveLength(2);
  });

  it('بيانات تالفة: تُحفظ نسخة ويبدأ سجل جديد بدل الانهيار', () => {
    const st = memoryStorage({ [STATE_KEY]: '{bad json' });
    const store = createStore(st, { now: NOW });
    expect(store.getState().sessions).toEqual([]);
    expect(Object.keys(st.data).some((k) => k.startsWith(`${STATE_KEY}__corrupt_`))).toBe(true);
  });

  it('عناصر تالفة داخل حالة سليمة تُسقَط مع نسخة احتياطية', () => {
    const state = { schemaVersion: 2, sessions: [{ id: 'a', date: '2026-11-10', period: 'morning', minutes: 30 }, { id: 'b', minutes: -1 }], dayMeta: {}, plan: null, settings: {} };
    const st = memoryStorage({ [STATE_KEY]: JSON.stringify(state) });
    const store = createStore(st, { now: NOW });
    expect(store.getState().sessions).toHaveLength(1);
    expect(store.getState().plan.versions.length).toBe(1); // خطة مفقودة → أساسية
    expect(Object.keys(st.data).some((k) => k.includes('__corrupt_'))).toBe(true);
  });

  it('تصدير ثم استيراد يعيد نفس البيانات', () => {
    const a = createStore(memoryStorage(), { now: NOW });
    const added = addSession(a.getState().sessions, { date: '2026-11-11', minutes: 45, period: 'evening', note: 'فيزياء' });
    a.commit({ ...a.getState(), sessions: added.sessions });
    const text = a.exportJSON();

    const b = createStore(memoryStorage(), { now: NOW });
    expect(b.importJSON(text).ok).toBe(true);
    expect(b.getState().sessions).toEqual(a.getState().sessions);
  });

  it('استيراد تصدير النسخة القديمة (studyLogs) يعمل', () => {
    const store = createStore(memoryStorage(), { now: NOW });
    const res = store.importJSON(JSON.stringify({ version: 2, studyLogs: { '2026-11-10': { morningMins: 60, eveningMins: 30, quality: 'poor' } } }));
    expect(res.ok).toBe(true);
    expect(buildDayIndex(store.getState().sessions)['2026-11-10'].totalMins).toBe(90);
  });

  it('استيراد ملف غير صالح يُرفض دون المساس بالبيانات', () => {
    const st = memoryStorage();
    const store = createStore(st, { now: NOW });
    const before = JSON.stringify(store.getState());
    expect(store.importJSON('not json').ok).toBe(false);
    expect(store.importJSON('{"hello":1}').ok).toBe(false);
    expect(store.importJSON('{"schemaVersion":2}').ok).toBe(false);
    expect(JSON.stringify(store.getState())).toBe(before);
  });

  it('الاستيراد الناجح يحفظ نسخة ما قبله', () => {
    const st = memoryStorage();
    const store = createStore(st, { now: NOW });
    store.importJSON(JSON.stringify({ studyLogs: { '2026-11-10': { morning: 1 } } }));
    expect(st.data[PRE_IMPORT_BACKUP_KEY]).toBeTruthy();
  });

  it('فشل الكتابة (مساحة ممتلئة) لا يكسر التطبيق', () => {
    const st = memoryStorage();
    const store = createStore(st, { now: NOW });
    st.setItem = () => { throw new Error('QuotaExceeded'); };
    expect(store.commit({ ...store.getState() })).toBe(false);
    expect(store.takeNotices().some((n) => n.includes('تعذّر الحفظ'))).toBe(true);
  });
});
