import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMER_SETTINGS } from '../src/core/constants.js';
import {
  advance, createIdleState, getView, pause, remainingOf, resume, sanitizePomodoroState,
  sanitizeTimerSettings, startFocus, stop, validateTimerSettings,
} from '../src/core/pomodoro.js';

const MIN = 60_000;
const T0 = new Date(2026, 10, 13, 9, 0, 0).getTime(); // 9:00 صباحاً محلياً
const cfg = (over = {}) => ({ ...DEFAULT_TIMER_SETTINGS, ...over });

// يشغّل تركيزاً كاملاً ويعيد الحالة بعد الانتهاء (استراحة جارية)
function finishFocus(state, now, config = cfg()) {
  return advance(state, now + config.focusMins * MIN, config);
}

describe('بدء التركيز والعدّ', () => {
  it('البدء من idle فقط ويثبّت startedAt والمادة', () => {
    const s = startFocus(createIdleState(), T0, cfg(), 'math');
    expect(s).toMatchObject({ phase: 'focus', running: true, startedAt: T0, subject: 'math', durationSec: 1500 });
    expect(startFocus(s, T0 + 5000, cfg(), 'other')).toBe(s); // لا يعيد البدء أثناء تركيز
  });

  it('العدّ مبني على الساعة: قفزة زمنية (تبويب خلفي) لا تُضيّع الوقت', () => {
    const s = startFocus(createIdleState(), T0, cfg());
    expect(remainingOf(s, T0 + 600_000)).toBe(1500 - 600);
    expect(remainingOf(s, T0 + 5 * 3600_000)).toBe(0);
  });

  it('مادة غير نصية تصبح null', () => {
    expect(startFocus(createIdleState(), T0, cfg(), 42).subject).toBeNull();
  });
});

describe('انتهاء التركيز والتسلسل', () => {
  it('ينتهي التركيز: حدث تسجيل واحد بمعرّف ثابت، ثم استراحة قصيرة تلقائياً', () => {
    const s = startFocus(createIdleState(), T0, cfg(), 'math');
    const r = finishFocus(s, T0);
    expect(r.events[0]).toEqual({
      type: 'focusCompleted', id: `pomo-${T0}`, minutes: 25, startedAt: T0, subject: 'math', early: false,
    });
    expect(r.events[1]).toMatchObject({ type: 'phaseChanged', from: 'focus', to: 'shortBreak' });
    expect(r.state).toMatchObject({ phase: 'shortBreak', running: true, cycle: 1, durationSec: 300, subject: null });
  });

  it('استدعاء advance ثانية بعد المعالجة لا يعيد الحدث (لا تسجيل مزدوج)', () => {
    const s = startFocus(createIdleState(), T0, cfg());
    const first = finishFocus(s, T0);
    const second = advance(first.state, T0 + 25 * MIN + 1000, cfg());
    expect(second.events).toEqual([]);
  });

  it('الاستراحة القصيرة تنتهي إلى idle وتبقي عدّاد الدورة', () => {
    let s = startFocus(createIdleState(), T0, cfg());
    s = finishFocus(s, T0).state;
    const r = advance(s, T0 + 30 * MIN, cfg());
    expect(r.state).toMatchObject({ phase: 'idle', running: false, cycle: 1 });
    expect(r.events).toEqual([{ type: 'phaseChanged', from: 'shortBreak', to: 'idle', at: T0 + 30 * MIN }]);
  });

  it('الاستراحة الطويلة بعد longEvery جلسات ثم تُصفَّر الدورة', () => {
    const c = cfg({ longEvery: 3 });
    let now = T0;
    let s = createIdleState();
    const phases = [];
    for (let i = 0; i < 3; i++) {
      s = startFocus(s, now, c);
      s = advance(s, now + 25 * MIN, c).state;       // انتهى التركيز → استراحة
      phases.push(s.phase);
      now += 25 * MIN + s.durationSec * 1000;         // مرّت الاستراحة كاملة
      s = advance(s, now, c).state;                   // → idle
    }
    expect(phases).toEqual(['shortBreak', 'shortBreak', 'longBreak']);
    expect(s).toMatchObject({ phase: 'idle', cycle: 0, cycleDate: null }); // أُغلقت الدورة
  });

  it('استراحة طويلة بمدتها المضبوطة', () => {
    const c = cfg({ longEvery: 2 });
    let s = startFocus(createIdleState(), T0, c);
    s = advance(s, T0 + 25 * MIN, c).state;
    s = advance(s, T0 + 30 * MIN, c).state; // انتهت القصيرة
    const t1 = T0 + 40 * MIN;
    s = startFocus(s, t1, c);
    s = advance(s, t1 + 25 * MIN, c).state;
    expect(s).toMatchObject({ phase: 'longBreak', durationSec: 15 * 60, cycle: 2 });
  });
});

describe('الغياب الطويل (إغلاق الصفحة)', () => {
  it('انتهى التركيز أثناء الغياب: تُسجَّل جلسة بوقت بدئها وتُحسب الاستراحة من وقتها الفعلي', () => {
    const s = startFocus(createIdleState(), T0, cfg(), 'phy');
    const r = advance(s, T0 + 27 * MIN, cfg()); // الاستراحة بدأت عند 25 د، ومضى منها دقيقتان
    expect(r.events.filter((e) => e.type === 'focusCompleted')).toHaveLength(1);
    expect(r.state.phase).toBe('shortBreak');
    expect(remainingOf(r.state, T0 + 27 * MIN)).toBe(3 * 60);
  });

  it('غياب 3 ساعات: جلسة واحدة فقط (لا جلسات وهمية) ثم idle', () => {
    const s = startFocus(createIdleState(), T0, cfg());
    const r = advance(s, T0 + 3 * 3600_000, cfg());
    expect(r.events.filter((e) => e.type === 'focusCompleted')).toEqual([
      { type: 'focusCompleted', id: `pomo-${T0}`, minutes: 25, startedAt: T0, subject: null, early: false },
    ]);
    expect(r.state).toMatchObject({ phase: 'idle', running: false, cycle: 1 });
    expect(r.events.at(-1)).toMatchObject({ type: 'phaseChanged', to: 'idle', at: T0 + 30 * MIN });
  });
});

describe('الإيقاف المؤقت والاستئناف', () => {
  it('الإيقاف يجمّد الوقت، والاستئناف يكمل، وstartedAt الأول يبقى', () => {
    let s = startFocus(createIdleState(), T0, cfg());
    s = pause(s, T0 + 300_000);
    expect(getView(s, T0 + 9_999_999, cfg()).mode).toBe('paused');
    expect(remainingOf(s, T0 + 9_999_999)).toBe(1500 - 300);
    s = resume(s, T0 + 5_000_000);
    expect(remainingOf(s, T0 + 5_000_000 + 60_000)).toBe(1500 - 300 - 60);
    expect(s.startedAt).toBe(T0);
    const r = stop(s, T0 + 5_000_000 + 60_000);
    expect(r.events[0]).toMatchObject({ minutes: 6, startedAt: T0 }); // 300+60 ثانية = 6 دقائق
  });

  it('المؤقت الموقوف لا ينتهي مهما مرّ الوقت', () => {
    const s = pause(startFocus(createIdleState(), T0, cfg()), T0 + 10 * MIN);
    expect(advance(s, T0 + 10 * 3600_000, cfg()).events).toEqual([]);
  });

  it('إيقاف/استئناف في idle أو بحالة غير مناسبة لا يغيّر شيئاً', () => {
    const idle = createIdleState();
    expect(pause(idle, T0)).toBe(idle);
    expect(resume(idle, T0)).toBe(idle);
    const running = startFocus(idle, T0, cfg());
    expect(resume(running, T0 + 1000)).toBe(running);
  });

  it('الاستراحة تقبل الإيقاف المؤقت أيضاً', () => {
    let s = finishFocus(startFocus(createIdleState(), T0, cfg()), T0).state;
    s = pause(s, T0 + 27 * MIN);
    expect(getView(s, T0 + 99 * MIN, cfg())).toMatchObject({ mode: 'paused', phase: 'shortBreak', remainingSec: 180 });
  });
});

describe('الإنهاء اليدوي', () => {
  it('الإنهاء المبكر يحفظ الدقائق الكاملة المنقضية فقط ولا يبدأ استراحة', () => {
    const s = startFocus(createIdleState(), T0, cfg(), 'x');
    const r = stop(s, T0 + 10 * MIN + 59_000);
    expect(r.events).toEqual([
      { type: 'focusCompleted', id: `pomo-${T0}`, minutes: 10, startedAt: T0, subject: 'x', early: true },
    ]);
    expect(r.state).toMatchObject({ phase: 'idle', cycle: 0 }); // الجلسة المبكرة لا تزيد الدورة
  });

  it('أقل من دقيقة: لا شيء يُحفظ', () => {
    const r = stop(startFocus(createIdleState(), T0, cfg()), T0 + 59_000);
    expect(r.events).toEqual([]);
    expect(r.state.phase).toBe('idle');
  });

  it('بعد الإنهاء المبكر لا يمكن تسجيل الجلسة نفسها مرة ثانية', () => {
    const s = startFocus(createIdleState(), T0, cfg());
    const r = stop(s, T0 + 10 * MIN);
    expect(stop(r.state, T0 + 11 * MIN).events).toEqual([]);
    expect(advance(r.state, T0 + 3 * 3600_000, cfg()).events).toEqual([]);
  });

  it('تخطّي الاستراحة القصيرة يبقي العدّاد، وتخطّي الطويلة يغلق الدورة', () => {
    const c = cfg({ longEvery: 2 });
    let s = finishFocus(startFocus(createIdleState(), T0, c), T0, c).state;
    expect(stop(s, T0 + 26 * MIN).state).toMatchObject({ phase: 'idle', cycle: 1 });

    s = advance(s, T0 + 30 * MIN, c).state;
    s = startFocus(s, T0 + 31 * MIN, c);
    s = advance(s, T0 + 56 * MIN, c).state;
    expect(s.phase).toBe('longBreak');
    expect(stop(s, T0 + 57 * MIN).state).toMatchObject({ phase: 'idle', cycle: 0, cycleDate: null });
  });

  it('الإنهاء في idle لا يفعل شيئاً', () => {
    const idle = createIdleState();
    expect(stop(idle, T0)).toEqual({ state: idle, events: [] });
  });

  it('الإنهاء المبكر بعد إيقاف مؤقت يحسب الوقت الفعلي فقط', () => {
    let s = startFocus(createIdleState(), T0, cfg());
    s = pause(s, T0 + 12 * MIN);
    const r = stop(s, T0 + 5 * 3600_000);
    expect(r.events[0].minutes).toBe(12);
  });
});

describe('تغيير الإعدادات أثناء التشغيل', () => {
  it('الطور الجاري يحتفظ بمدته، والإعداد الجديد يسري على الطور التالي', () => {
    const s = startFocus(createIdleState(), T0, cfg({ focusMins: 25 }));
    const changed = cfg({ focusMins: 50, shortMins: 10 });
    expect(remainingOf(s, T0)).toBe(1500);
    const r = advance(s, T0 + 25 * MIN, changed);
    expect(r.events[0].minutes).toBe(25);            // لا 50
    expect(r.state.durationSec).toBe(10 * 60);       // الاستراحة الجديدة بالإعداد الجديد
  });

  it('في idle يعرض العرض مدة التركيز الحالية', () => {
    expect(getView(createIdleState(), T0, cfg({ focusMins: 40 }))).toMatchObject({ mode: 'idle', remainingSec: 2400, progress: 0 });
  });
});

describe('عدّاد الدورة عبر الأيام', () => {
  it('يُصفَّر عند اليوم الجديد', () => {
    let s = finishFocus(startFocus(createIdleState(), T0, cfg()), T0).state;
    s = advance(s, T0 + 31 * MIN, cfg()).state;
    expect(s.cycle).toBe(1);
    const tomorrow = T0 + 24 * 3600_000;
    expect(advance(s, tomorrow, cfg()).state).toMatchObject({ cycle: 0, cycleDate: null });
    expect(getView(s, tomorrow, cfg()).cycle).toBe(0);
    expect(startFocus(s, tomorrow, cfg()).cycle).toBe(0);
  });
});

describe('getView', () => {
  it('نسبة التقدم أثناء التركيز', () => {
    const s = startFocus(createIdleState(), T0, cfg());
    const v = getView(s, T0 + 375_000, cfg());
    expect(v).toMatchObject({ mode: 'focus', remainingSec: 1125, durationSec: 1500, cycleLength: 4 });
    expect(v.progress).toBeCloseTo(0.25, 5);
  });
});

describe('sanitizeTimerSettings', () => {
  it('غائب → افتراضي بلا حساب تالف', () => {
    expect(sanitizeTimerSettings(undefined)).toEqual({ value: DEFAULT_TIMER_SETTINGS, dropped: 0 });
    expect(sanitizeTimerSettings({})).toEqual({ value: DEFAULT_TIMER_SETTINGS, dropped: 0 });
  });

  it('القيم الصالحة تُحفظ والحدود تُحترم (1..180 للتركيز)', () => {
    const ok = sanitizeTimerSettings({ focusMins: 180, shortMins: 1, longMins: 120, longEvery: 10, sound: false, notify: true });
    expect(ok).toEqual({ value: { focusMins: 180, shortMins: 1, longMins: 120, longEvery: 10, sound: false, notify: true }, dropped: 0 });
  });

  it('تالف: يعود للافتراضي ويُحصى', () => {
    const r = sanitizeTimerSettings({ focusMins: 181, shortMins: 0, longMins: 'x', longEvery: 1.5, sound: 'yes', notify: null });
    expect(r.value).toEqual(DEFAULT_TIMER_SETTINGS);
    expect(r.dropped).toBe(6);
    expect(sanitizeTimerSettings([]).dropped).toBe(1);
    expect(sanitizeTimerSettings('x').dropped).toBe(1);
  });
});

describe('validateTimerSettings (واجهة الإعدادات)', () => {
  const good = { focusMins: 30, shortMins: 5, longMins: 20, longEvery: 4, sound: true, notify: false };
  it('يقبل الصالح', () => expect(validateTimerSettings(good)).toEqual({ ok: true, value: good }));
  it.each([['focusMins', 0], ['focusMins', 181], ['shortMins', 61], ['longMins', 121], ['longEvery', 1], ['longEvery', 11], ['focusMins', 2.5], ['focusMins', NaN]])(
    'يرفض %s = %s برسالة', (key, v) => {
      const r = validateTimerSettings({ ...good, [key]: v });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/بين/);
    },
  );
});

describe('sanitizePomodoroState', () => {
  const run = { phase: 'focus', running: true, durationSec: 1500, remainingSec: 1500, endTime: T0 + 1500_000, startedAt: T0, subject: 's', cycle: 0, cycleDate: null };
  it('صالح يمرّ', () => expect(sanitizePomodoroState(run)).toMatchObject({ phase: 'focus', running: true, subject: 's' }));
  it('تالف يعود null', () => {
    for (const bad of [null, 5, {}, { phase: 'zzz' }, { ...run, durationSec: -5 }, { ...run, durationSec: 30 }, { ...run, startedAt: 'x' },
      { ...run, endTime: 'x' }, { ...run, running: false, remainingSec: 0 }, { ...run, running: false, remainingSec: 99999 }]) {
      expect(sanitizePomodoroState(bad)).toBeNull();
    }
  });
  it('دورة بتاريخ غير صالح تُصفَّر', () => {
    expect(sanitizePomodoroState({ phase: 'idle', cycle: 2, cycleDate: 'nope' })).toMatchObject({ cycle: 0, cycleDate: null });
    expect(sanitizePomodoroState({ phase: 'idle', cycle: 2, cycleDate: '2026-11-13' })).toMatchObject({ cycle: 2, cycleDate: '2026-11-13' });
  });
  it('المادة لا تُحفظ في الاستراحة', () => {
    expect(sanitizePomodoroState({ ...run, phase: 'shortBreak' }).subject).toBeNull();
  });
});
