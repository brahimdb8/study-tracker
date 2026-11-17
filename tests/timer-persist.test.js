import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMER_SETTINGS } from '../src/core/constants.js';
import { advance, createIdleState, pause, remainingOf, startFocus } from '../src/core/pomodoro.js';
import {
  LEGACY_TIMER_KEY, POMODORO_KEY, convertLegacyTimer, loadPomodoro, savePomodoro,
} from '../src/core/timer.js';
import { memoryStorage } from './helpers.js';

const T0 = new Date(2026, 10, 13, 9, 0, 0).getTime();
const cfg = DEFAULT_TIMER_SETTINGS;

describe('حفظ المؤقت واستعادته', () => {
  it('استعادة بعد إغلاق الصفحة أثناء التشغيل', () => {
    const st = memoryStorage();
    savePomodoro(st, startFocus(createIdleState(), T0, { ...cfg, focusMins: 30 }, 'math'));

    const { state, migratedLegacy } = loadPomodoro(st);
    expect(migratedLegacy).toBe(false);
    expect(state).toMatchObject({ phase: 'focus', running: true, subject: 'math', startedAt: T0 });
    expect(remainingOf(state, T0 + 600_000)).toBe(30 * 60 - 600);
  });

  it('انتهى أثناء الغياب: الاستعادة ثم advance تعطي جلسة واحدة بوقت بدئها', () => {
    const st = memoryStorage();
    savePomodoro(st, startFocus(createIdleState(), T0, cfg));
    const { state } = loadPomodoro(st);
    const r = advance(state, T0 + 3 * 3600_000, cfg);
    expect(r.events.filter((e) => e.type === 'focusCompleted')).toEqual([
      { type: 'focusCompleted', id: `pomo-${T0}`, minutes: 25, startedAt: T0, subject: null, early: false },
    ]);
    // بعد معالجتها وحفظ النتيجة، إعادة التحميل لا تعيد الحدث
    savePomodoro(st, r.state);
    const again = advance(loadPomodoro(st).state, T0 + 3 * 3600_000, cfg);
    expect(again.events).toEqual([]);
  });

  it('الموقوف مؤقتاً يُستعاد موقوفاً بوقته المتبقي', () => {
    const st = memoryStorage();
    savePomodoro(st, pause(startFocus(createIdleState(), T0, cfg), T0 + 5 * 60_000));
    const { state } = loadPomodoro(st);
    expect(state).toMatchObject({ running: false, remainingSec: 20 * 60 });
  });

  it('idle نظيف يمسح المفتاح؛ idle بدورة جارية يبقى محفوظاً', () => {
    const st = memoryStorage();
    savePomodoro(st, startFocus(createIdleState(), T0, cfg));
    savePomodoro(st, createIdleState());
    expect(st.data[POMODORO_KEY]).toBeUndefined();

    savePomodoro(st, { ...createIdleState(), cycle: 2, cycleDate: '2026-11-13' });
    expect(loadPomodoro(st).state).toMatchObject({ phase: 'idle', cycle: 2, cycleDate: '2026-11-13' });
  });

  it('حالة مخزنة تالفة تُتجاهل وتُمسح', () => {
    for (const raw of ['{"phase":"focus","durationSec":-5}', 'not json', '{"phase":"nope"}', 'null', '[]']) {
      const st = memoryStorage({ [POMODORO_KEY]: raw });
      const { state } = loadPomodoro(st);
      expect(state).toEqual(createIdleState());
      expect(st.data[POMODORO_KEY]).toBeUndefined();
    }
  });

  it('بلا تخزين: idle بلا أخطاء', () => {
    expect(loadPomodoro(null).state).toEqual(createIdleState());
    expect(() => savePomodoro(null, createIdleState())).not.toThrow();
  });

  it('تخزين يرمي أخطاء لا يكسر الحفظ', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(() => savePomodoro(broken, startFocus(createIdleState(), T0, cfg))).not.toThrow();
    expect(loadPomodoro(broken).state).toEqual(createIdleState());
  });
});

describe('تحويل مؤقت المرحلة 1–3 الجاري', () => {
  const legacyRunning = { duration: 1800, remaining: 1800, endTime: T0 + 1800_000, startedAt: T0, running: true };

  it('مؤقت جارٍ يصبح تركيزاً جارياً بوقته ووقت بدئه، ويُحذف القديم', () => {
    const st = memoryStorage({ [LEGACY_TIMER_KEY]: JSON.stringify(legacyRunning) });
    const { state, migratedLegacy } = loadPomodoro(st);
    expect(migratedLegacy).toBe(true);
    expect(state).toMatchObject({ phase: 'focus', running: true, durationSec: 1800, startedAt: T0, endTime: T0 + 1800_000, subject: null });
    expect(st.data[LEGACY_TIMER_KEY]).toBeUndefined();
    expect(JSON.parse(st.data[POMODORO_KEY]).phase).toBe('focus'); // كُتب الجديد
  });

  it('مؤقت موقوف يبقى موقوفاً بوقته المتبقي', () => {
    const st = memoryStorage({ [LEGACY_TIMER_KEY]: JSON.stringify({ duration: 1500, remaining: 900, endTime: null, startedAt: T0, running: false }) });
    expect(loadPomodoro(st).state).toMatchObject({ phase: 'focus', running: false, remainingSec: 900, startedAt: T0 });
  });

  it('مؤقت انتهى أثناء التحديث يُسجَّل مرة واحدة (معرّف pomo-startedAt)', () => {
    const st = memoryStorage({ [LEGACY_TIMER_KEY]: JSON.stringify(legacyRunning) });
    const { state } = loadPomodoro(st);
    const r = advance(state, T0 + 2 * 3600_000, cfg);
    expect(r.events[0]).toMatchObject({ type: 'focusCompleted', id: `pomo-${T0}`, minutes: 30, startedAt: T0 });
  });

  it('إن وُجد الجديد والقديم معاً: الجديد يفوز ويُحذف القديم', () => {
    const st = memoryStorage({ [LEGACY_TIMER_KEY]: JSON.stringify(legacyRunning) });
    savePomodoro(st, startFocus(createIdleState(), T0 + 1000, cfg));
    const { state, migratedLegacy } = loadPomodoro(st);
    expect(migratedLegacy).toBe(false);
    expect(state.startedAt).toBe(T0 + 1000);
    expect(st.data[LEGACY_TIMER_KEY]).toBeUndefined();
  });

  it('قديم تالف يُهمل ويُمسح', () => {
    for (const raw of ['{"duration":-5}', 'oops', '{"duration":1500,"remaining":0}']) {
      const st = memoryStorage({ [LEGACY_TIMER_KEY]: raw });
      expect(loadPomodoro(st).state).toEqual(createIdleState());
      expect(st.data[LEGACY_TIMER_KEY]).toBeUndefined();
    }
  });

  it('convertLegacyTimer: موقوف بلا startedAt أو مدة خارج الحدود → null', () => {
    expect(convertLegacyTimer({ duration: 1500, remaining: 900, running: false })).toBeNull();
    expect(convertLegacyTimer({ ...legacyRunning, duration: 99999 })).toBeNull();
    expect(convertLegacyTimer(null)).toBeNull();
  });
});
