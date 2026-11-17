// المرحلة 8أ: طبقة IndexedDB (بمحاكي fake-indexeddb) — المحوّل المتزامن، الترحيل، التبويبات، الإقلاع، والتكامل مع المخزن.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { bootData } from '../src/data/boot-core.js';
import {
  MIGRATED_FLAG, clearLegacyLocalCopy, createHybridStorage, isDataKey, localDataKeys, migrateFromLocal, openDb, readAll, writeBatch,
} from '../src/data/idb-storage.js';
import { STATE_KEY, createStore } from '../src/core/store.js';

const NOW = () => new Date('2026-11-16T10:00:00');
const tick = () => new Promise((r) => setTimeout(r, 5));

/** localStorage وهمي بواجهة length/key */
function fakeLocal(init = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}

/** قناة وهمية: رسائل تصل للأطراف الأخرى فقط (كسلوك BroadcastChannel) */
function channelPair() {
  const a = { onmessage: null, postMessage: (m) => queueMicrotask(() => b.onmessage && b.onmessage({ data: m })) };
  const b = { onmessage: null, postMessage: (m) => queueMicrotask(() => a.onmessage && a.onmessage({ data: m })) };
  return [a, b];
}

const stateJson = (sessions = []) => JSON.stringify({ schemaVersion: 5, sessions, dayMeta: {}, subjects: [], dayOffs: [], exams: [], achievements: { unlocked: {} }, plan: null, settings: {} });

describe('تصنيف المفاتيح', () => {
  it('الحالة والنسخ الاحتياطية بيانات، والمفاتيح لكل جهاز وغير المسبوقة ليست كذلك', () => {
    for (const k of [STATE_KEY, 'studyTracker:backup:schema4', 'studyTracker:preImportBackup', `${STATE_KEY}__corrupt_123`, 'studyTracker:backup:preBadgeAudit']) expect(isDataKey(k), k).toBe(true);
    for (const k of ['studyTracker:theme', 'studyTracker:onboarded', 'studyTracker:exportPrefs', 'studyTracker:pomodoro', 'studyTracker:motion', 'studyTracker:celebrated', MIGRATED_FLAG, 'studyLogs', 'trackingStart']) expect(isDataKey(k), k).toBe(false);
  });
});

describe('IndexedDB: فتح وقراءة وكتابة', () => {
  it('كتابة دفعة ثم قراءتها كلها، والحذف بـ null، وتبقى بعد إعادة الفتح', async () => {
    const f = new IDBFactory();
    const db = await openDb(f);
    await writeBatch(db, new Map([['a', '1'], ['b', '2']]));
    await writeBatch(db, new Map([['a', null], ['c', '3']]));
    db.close();
    const db2 = await openDb(f);
    expect([...(await readAll(db2))]).toEqual([['b', '2'], ['c', '3']]);
  });

  it('فتح بلا مصنع أو بمهلة منتهية يفشل برسالة', async () => {
    const hanging = { open: () => ({}) }; // لا يستدعي أي callback أبداً
    await expect(openDb(/** @type {any} */ (hanging), { timeoutMs: 20 })).rejects.toThrow(/timeout/);
  });
});

describe('التخزين الهجين', () => {
  async function make(opts = {}) {
    const f = new IDBFactory();
    const db = await openDb(f);
    const local = fakeLocal();
    const s = createHybridStorage({ local, initial: new Map(), db, ...opts });
    return { f, db, local, s };
  }

  it('القراءة متزامنة فور الكتابة، والحفظ في IndexedDB بعد الإفراغ', async () => {
    const { db, s } = await make();
    s.setItem(STATE_KEY, 'X');
    expect(s.getItem(STATE_KEY)).toBe('X');
    expect(s.pendingCount()).toBe(1);
    await s.flush();
    expect(s.pendingCount()).toBe(0);
    expect((await readAll(db)).get(STATE_KEY)).toBe('X');
  });

  it('كتابات متتالية لنفس المفتاح تُدمج: القيمة الأخيرة فقط', async () => {
    const { db, s } = await make();
    s.setItem(STATE_KEY, '1'); s.setItem(STATE_KEY, '2'); s.setItem(STATE_KEY, '3');
    expect(s.pendingCount()).toBe(1);
    await s.flush();
    expect((await readAll(db)).get(STATE_KEY)).toBe('3');
  });

  it('removeItem يحذف من الذاكرة ومن IndexedDB', async () => {
    const { db, s } = await make();
    s.setItem('studyTracker:preImportBackup', 'B');
    await s.flush();
    s.removeItem('studyTracker:preImportBackup');
    expect(s.getItem('studyTracker:preImportBackup')).toBeNull();
    await s.flush();
    expect((await readAll(db)).has('studyTracker:preImportBackup')).toBe(false);
  });

  it('المفاتيح لكل جهاز تذهب إلى localStorage فقط ولا تدخل IndexedDB', async () => {
    const { db, local, s } = await make();
    s.setItem('studyTracker:theme', 'dark');
    s.setItem('studyTracker:pomodoro', '{}');
    s.setItem('studyLogs', '{}'); // مفتاح النسخة القديمة (بلا بادئة)
    await s.flush();
    expect(local.getItem('studyTracker:theme')).toBe('dark');
    expect(local.getItem('studyLogs')).toBe('{}');
    expect(s.getItem('studyTracker:theme')).toBe('dark');
    expect([...(await readAll(db)).keys()]).toEqual([]);
    expect(s.pendingCount()).toBe(0);
  });

  it('فشل الكتابة: يُبلَّغ، وتبقى القيمة في الذاكرة وتُعاد في الطابور وتنجح لاحقاً', async () => {
    const f = new IDBFactory();
    const realDb = await openDb(f);
    let broken = true;
    const flaky = { transaction: (...a) => { if (broken) throw new Error('quota'); return realDb.transaction(...a); } };
    const errors = [];
    const s = createHybridStorage({ local: fakeLocal(), initial: new Map(), db: /** @type {any} */ (flaky), onWriteError: (e) => errors.push(e) });
    s.setItem(STATE_KEY, 'V');
    await s.flush();
    expect(errors).toHaveLength(1);
    expect(s.getItem(STATE_KEY)).toBe('V');
    expect(s.pendingCount()).toBe(1);
    broken = false;
    await s.flush();
    expect((await readAll(realDb)).get(STATE_KEY)).toBe('V');
  });

  it('تبويبان: التعديل يصل للآخر مع onRemote ولا يرتد للمرسل، ويُتجاهل غير البيانات', async () => {
    const f = new IDBFactory();
    const dbA = await openDb(f);
    const [chA, chB] = channelPair();
    const remoteA = vi.fn(); const remoteB = vi.fn();
    const a = createHybridStorage({ local: fakeLocal(), initial: new Map(), db: dbA, channel: chA, onRemote: remoteA });
    const b = createHybridStorage({ local: fakeLocal(), initial: new Map(), db: dbA, channel: chB, onRemote: remoteB });
    a.setItem(STATE_KEY, 'from-a');
    await a.flush(); await tick();
    expect(b.getItem(STATE_KEY)).toBe('from-a');
    expect(remoteB).toHaveBeenCalledWith(STATE_KEY);
    expect(remoteA).not.toHaveBeenCalled();
    // رسائل غير صالحة أو لمفاتيح الجهاز لا تُطبَّق
    chB.onmessage({ data: { key: 'studyTracker:theme', value: 'x' } });
    chB.onmessage({ data: { key: STATE_KEY, value: 42 } });
    chB.onmessage({ data: null });
    expect(b.getItem(STATE_KEY)).toBe('from-a');
    expect(remoteB).toHaveBeenCalledTimes(1);
    // حذف عن بُعد
    a.removeItem(STATE_KEY); await a.flush(); await tick();
    expect(b.getItem(STATE_KEY)).toBeNull();
  });
});

describe('الترحيل من localStorage', () => {
  it('ينسخ كل مفاتيح البيانات ويضع العلم ولا يحذف الأصل ولا يمس مفاتيح الجهاز', async () => {
    const db = await openDb(new IDBFactory());
    const local = fakeLocal({ [STATE_KEY]: stateJson(), 'studyTracker:backup:schema4': 'OLD', 'studyTracker:theme': 'dark', studyLogs: '{}' });
    const existing = new Map();
    const r = await migrateFromLocal({ local, db, existing, stateKey: STATE_KEY });
    expect(r).toEqual({ status: 'migrated', keys: 2 });
    expect(local.getItem(STATE_KEY)).not.toBeNull(); // النسخة القديمة باقية
    expect(local.getItem(MIGRATED_FLAG)).toBe('1');
    const stored = await readAll(db);
    expect([...stored.keys()].sort()).toEqual([STATE_KEY, 'studyTracker:backup:schema4'].sort());
    expect(existing.get(STATE_KEY)).toBe(stateJson());
  });

  it('التشغيل الثاني لا يكرر (IndexedDB فيها الحالة)', async () => {
    const db = await openDb(new IDBFactory());
    const local = fakeLocal({ [STATE_KEY]: stateJson() });
    const existing = new Map();
    await migrateFromLocal({ local, db, existing, stateKey: STATE_KEY });
    expect((await migrateFromLocal({ local, db, existing, stateKey: STATE_KEY })).status).toBe('none');
  });

  it('IndexedDB أُخليت والعلم موجود: استعادة (restored) من النسخة المحلية', async () => {
    const db = await openDb(new IDBFactory());
    const local = fakeLocal({ [STATE_KEY]: stateJson(), [MIGRATED_FLAG]: '1' });
    expect((await migrateFromLocal({ local, db, existing: new Map(), stateKey: STATE_KEY })).status).toBe('restored');
  });

  it('لا حالة في localStorage: لا شيء يُرحَّل', async () => {
    const db = await openDb(new IDBFactory());
    const local = fakeLocal({ 'studyTracker:theme': 'dark', studyLogs: '{}' });
    expect(await migrateFromLocal({ local, db, existing: new Map(), stateKey: STATE_KEY })).toEqual({ status: 'none', keys: 0 });
    expect(local.getItem(MIGRATED_FLAG)).toBeNull();
  });

  it('حذف النسخة القديمة: فقط إن كانت الحالة في IndexedDB، ولا يمس مفاتيح الجهاز', () => {
    const local = fakeLocal({ [STATE_KEY]: 'S', 'studyTracker:backup:x': 'B', 'studyTracker:theme': 'dark', studyLogs: '{}' });
    expect(clearLegacyLocalCopy({ local, existing: new Map(), stateKey: STATE_KEY })).toBe(0);
    expect(local.getItem(STATE_KEY)).toBe('S');
    expect(clearLegacyLocalCopy({ local, existing: new Map([[STATE_KEY, 'S']]), stateKey: STATE_KEY })).toBe(2);
    expect(localDataKeys(local)).toEqual([]);
    expect(local.getItem('studyTracker:theme')).toBe('dark');
    expect(local.getItem('studyLogs')).toBe('{}');
  });
});

describe('bootData', () => {
  it('بلا IndexedDB: يرجع إلى localStorage (storage=null) بلا إشعار لمستخدم جديد', async () => {
    const r = await bootData({ indexedDB: undefined, localStorage: fakeLocal(), stateKey: STATE_KEY });
    expect(r.storage).toBeNull();
    expect(r.backend).toBe('local');
    expect(r.notices).toEqual([]);
  });

  it('بلا IndexedDB لمن رُحّلت بياناته سابقاً: إشعار صريح بأنه على النسخة القديمة', async () => {
    const r = await bootData({ indexedDB: undefined, localStorage: fakeLocal({ [MIGRATED_FLAG]: '1' }), stateKey: STATE_KEY });
    expect(r.storage).toBeNull();
    expect(r.notices.join(' ')).toMatch(/النسخة المحلية القديمة/);
  });

  it('فتح معلّق (مهلة) يرجع إلى localStorage', async () => {
    const hanging = { open: () => ({}) };
    const r = await bootData({ indexedDB: /** @type {any} */ (hanging), localStorage: fakeLocal(), stateKey: STATE_KEY, openTimeoutMs: 20 });
    expect(r.storage).toBeNull();
    expect(r.migration.status).toBe('open-failed');
  });

  it('أول إقلاع بعد التحديث: ترحيل + إشعار + تخزين هجين يعمل', async () => {
    const local = fakeLocal({ [STATE_KEY]: stateJson([{ id: 'a' }]) });
    const r = await bootData({ indexedDB: new IDBFactory(), localStorage: local, stateKey: STATE_KEY });
    expect(r.backend).toBe('idb');
    expect(r.migration.status).toBe('migrated');
    expect(r.notices.join(' ')).toMatch(/IndexedDB/);
    expect(r.storage.getItem(STATE_KEY)).toBe(stateJson([{ id: 'a' }]));
  });

  it('مستخدم جديد: لا ترحيل ولا إشعارات', async () => {
    const r = await bootData({ indexedDB: new IDBFactory(), localStorage: fakeLocal(), stateKey: STATE_KEY });
    expect(r.migration.status).toBe('none');
    expect(r.notices).toEqual([]);
  });
});

describe('التكامل مع المخزن (createStore فوق التخزين الهجين)', () => {
  const sess = (id, date, minutes) => ({ id, date, period: 'morning', minutes, startedAt: null, source: 'manual', subject: null, note: '', createdAt: 1 });

  it('الحفظ يذهب إلى IndexedDB ويُقرأ بعد «إعادة تحميل» (تخزين جديد من القاعدة نفسها)', async () => {
    const f = new IDBFactory();
    const local = fakeLocal();
    const r1 = await bootData({ indexedDB: f, localStorage: local, stateKey: STATE_KEY });
    const store1 = createStore(r1.storage, { now: NOW });
    store1.commit({ ...store1.getState(), sessions: [sess('x', '2026-11-15', 90)] });
    await r1.storage.flush();

    const r2 = await bootData({ indexedDB: f, localStorage: local, stateKey: STATE_KEY });
    const store2 = createStore(r2.storage, { now: NOW });
    expect(store2.getState().sessions.map((s) => s.id)).toEqual(['x']);
    // لا شيء من الحالة كُتب في localStorage
    expect(local.getItem(STATE_KEY)).toBeNull();
  });

  it('ترحيل من localStorage يحفظ كل الجلسات بلا فقدان ويُبقي الأصل', async () => {
    const sessions = Array.from({ length: 50 }, (_, i) => sess(`s${i}`, '2026-11-10', 10 + i));
    const local = fakeLocal({ [STATE_KEY]: JSON.stringify({ ...JSON.parse(stateJson()), sessions }) });
    const f = new IDBFactory();
    const r = await bootData({ indexedDB: f, localStorage: local, stateKey: STATE_KEY });
    const store = createStore(r.storage, { now: NOW });
    expect(store.getState().sessions).toHaveLength(50);
    expect(JSON.parse(local.getItem(STATE_KEY)).sessions).toHaveLength(50);
  });

  it('بيانات النسخة القديمة (studyLogs) تُرحَّل عبر المخزن ثم تُحفظ حالتها في IndexedDB', async () => {
    const local = fakeLocal({ studyLogs: JSON.stringify({ '2026-11-10': { morning: 60, evening: 30 } }) });
    const f = new IDBFactory();
    const r = await bootData({ indexedDB: f, localStorage: local, stateKey: STATE_KEY });
    const store = createStore(r.storage, { now: NOW });
    expect(store.getState().sessions.length).toBeGreaterThan(0);
    await r.storage.flush();
    expect((await readAll(await openDb(f))).has(STATE_KEY)).toBe(true);
  });

  it('تبويبان: تعديل في الأول يصل للثاني عبر reload()', async () => {
    const f = new IDBFactory();
    const [chA, chB] = channelPair();
    const db = await openDb(f);
    const stA = createHybridStorage({ local: fakeLocal(), initial: new Map(), db, channel: chA });
    const stB = createHybridStorage({ local: fakeLocal(), initial: new Map(), db, channel: chB });
    const a = createStore(stA, { now: NOW });
    const b = createStore(stB, { now: NOW });
    a.commit({ ...a.getState(), sessions: [sess('only-a', '2026-11-15', 30)] });
    await stA.flush(); await tick();
    b.reload();
    expect(b.getState().sessions.map((s) => s.id)).toEqual(['only-a']);
  });
});
