import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BADGES, CATEGORY_ORDER, evaluateAchievements } from '../src/core/achievements.js';
import { greetingForHour, gregorianLabel } from '../src/core/greeting.js';
import {
  LEVEL_TITLES, MAX_LEVEL, computeXp, levelFromXp, levelSummary, levelThreshold, levelTitle,
} from '../src/core/levels.js';
import { QUOTES, quoteForDate } from '../src/core/quotes.js';
import { addDays, eachDate } from '../src/core/dates.js';
import { targetsForDate } from '../src/core/plan.js';
import { createInitialState } from '../src/core/store.js';
import { session } from './helpers.js';

const base = createInitialState('2026-01-01');
const mk = (sessions, over = {}) => ({
  ...base, sessions,
  settings: { ...base.settings, trackingStart: '2026-01-01', freezesPerMonth: 0 },
  ...over,
});
const full = (date) => {
  const t = targetsForDate(base.plan, date);
  const out = [];
  if (t.morningMins) out.push(session(date, 'morning', t.morningMins));
  if (t.eveningMins) out.push(session(date, 'evening', t.eveningMins));
  return out;
};
const range = (a, b) => { const o = []; eachDate(a, b, (d) => o.push(...full(d))); return o; };
const ev = (s, today) => evaluateAchievements(s, today);
const timer = (date, period, minutes, id) => session(date, period, minutes, { source: 'timer', id });

describe('أوسمة البدايات', () => {
  it('أول جلسة', () => {
    expect(ev(mk([session('2026-11-03', 'morning', 5)]), '2026-11-05').earned['first-session']).toBe('2026-11-03');
    expect(ev(mk([]), '2026-11-05').earned['first-session']).toBeUndefined();
  });
  it('أول يوم مكتمل بتاريخه', () => {
    expect(ev(mk(full('2026-11-03')), '2026-11-05').earned['first-day']).toBe('2026-11-03');
  });
  it('خمس جلسات مؤقت ≥15 دقيقة (الأقصر والمدخلة يدوياً لا تُحتسب)', () => {
    const s = [timer('2026-11-02', 'morning', 15, 'a'), timer('2026-11-02', 'morning', 14, 'b'),
      session('2026-11-03', 'morning', 30), timer('2026-11-03', 'evening', 20, 'c'),
      timer('2026-11-04', 'morning', 25, 'd'), timer('2026-11-05', 'morning', 30, 'e')];
    const r = ev(mk(s), '2026-11-06');
    expect(r.earned['pomodoro-5']).toBeUndefined();
    expect(r.progress['pomodoro-5']).toEqual({ value: 4, target: 5 });
    const r2 = ev(mk([...s, timer('2026-11-06', 'morning', 16, 'f')]), '2026-11-06');
    expect(r2.earned['pomodoro-5']).toBe('2026-11-06');
  });
  it('أسبوع نشط: 4 أيام مختلفة في إثنين→أحد', () => {
    const s = ['2026-11-02', '2026-11-03', '2026-11-05'].map((d) => session(d, 'morning', 10));
    expect(ev(mk(s), '2026-11-08').earned['first-week']).toBeUndefined();
    expect(ev(mk([...s, session('2026-11-08', 'morning', 10)]), '2026-11-08').earned['first-week']).toBe('2026-11-08');
    // أيام موزعة على أسبوعين لا تكفي
    const split = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].map((d) => session(d, 'morning', 10));
    expect(ev(mk(split), '2026-11-12').earned['first-week']).toBeUndefined();
  });
});

describe('أوسمة العادات الجديدة', () => {
  it('ماراثون: 360 دقيقة في يوم واحد', () => {
    expect(ev(mk([session('2026-11-03', 'morning', 359)]), '2026-11-05').earned['habit-marathon']).toBeUndefined();
    expect(ev(mk([session('2026-11-03', 'morning', 200), session('2026-11-03', 'evening', 160)]), '2026-11-05').earned['habit-marathon']).toBe('2026-11-03');
  });
  it('دقة الساعة: 4 جلسات مؤقت ≥20 دقيقة في يوم', () => {
    const s = [1, 2, 3].map((i) => timer('2026-11-03', 'morning', 20, `t${i}`));
    expect(ev(mk(s), '2026-11-05').earned['habit-precise']).toBeUndefined();
    expect(ev(mk([...s, timer('2026-11-03', 'evening', 25, 't4')]), '2026-11-05').earned['habit-precise']).toBe('2026-11-03');
    expect(ev(mk([...s, timer('2026-11-03', 'evening', 19, 't4')]), '2026-11-05').earned['habit-precise']).toBeUndefined();
  });
  it('أسبوع ذهبي: 1500 دقيقة في أسبوع واحد', () => {
    const s = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d) => session(d, 'morning', 300));
    expect(ev(mk(s), '2026-11-08').earned['habit-golden-week']).toBe('2026-11-06');
    expect(ev(mk(s.slice(0, 4)), '2026-11-08').earned['habit-golden-week']).toBeUndefined();
  });
  it('عطلة نشطة: السبت والأحد كلاهما منجز في الأسبوع نفسه (ثابت)', () => {
    const sat = full('2026-11-07'); const sun = full('2026-11-08');
    expect(ev(mk([...sat, ...sun]), '2026-11-10').earned['habit-holiday']).toBe('2026-11-08');
    expect(ev(mk(sat), '2026-11-10').earned['habit-holiday']).toBeUndefined();
    // أحد من أسبوع آخر لا يكفي
    expect(ev(mk([...sat, ...full('2026-11-15')]), '2026-11-16').earned['habit-holiday']).toBeUndefined();
  });
  it('الصباح 5 و15 يوماً وساهر الليل 5 أيام', () => {
    const mornings = []; let d = '2026-11-01';
    for (let i = 0; i < 15; i++) { mornings.push(session(d, 'morning', 400)); d = addDays(d, 1); }
    const r = ev(mk(mornings), '2026-11-15');
    expect(r.earned['habit-morning']).toBe('2026-11-05');
    expect(r.earned['habit-morning-15']).toBe('2026-11-15');
    const nights = []; d = '2026-11-01';
    for (let i = 0; i < 5; i++) { nights.push(session(d, 'evening', 400)); d = addDays(d, 1); }
    expect(ev(mk(nights), '2026-11-10').earned['habit-night']).toBe('2026-11-05');
    expect(ev(mk(nights.slice(0, 4)), '2026-11-10').earned['habit-night']).toBeUndefined();
  });
  it('شهر حديدي: كل الأيام المستهدفة منجزة في شهر مغلق', () => {
    const s = range('2026-01-01', '2026-01-31');
    const r = ev(mk(s, { settings: { ...base.settings, trackingStart: '2026-01-01', freezesPerMonth: 0 } }), '2026-02-05');
    expect(r.earned['habit-iron-month']).toBe('2026-01-31');
    expect(r.earned['habit-month']).toBe('2026-01-31');
    // يوم ناقص: منتظم نعم، حديدي لا
    const missing = s.filter((x) => x.date !== '2026-01-14');
    const r2 = ev(mk(missing), '2026-02-05');
    expect(r2.earned['habit-month']).toBe('2026-01-31');
    expect(r2.earned['habit-iron-month']).toBeUndefined();
  });
});

describe('مستويات الخبرة', () => {
  it('العتبات: 40 مستوى، متزايدة، مقرّبة لـ10، الأول 0', () => {
    expect(levelThreshold(1)).toBe(0);
    expect(levelThreshold(2)).toBe(100);
    expect(levelThreshold(3)).toBe(280);
    expect(levelThreshold(40)).toBe(24360);
    let prev = -1;
    for (let n = 1; n <= MAX_LEVEL; n++) { const t = levelThreshold(n); expect(t % 10).toBe(0); expect(t).toBeGreaterThan(prev); prev = t; }
  });
  it('8 ألقاب كل 5 مستويات', () => {
    expect(LEVEL_TITLES).toHaveLength(8);
    expect(levelTitle(1)).toBe('مبتدئ'); expect(levelTitle(5)).toBe('مبتدئ');
    expect(levelTitle(6)).toBe('مثابر'); expect(levelTitle(36)).toBe('حكيم'); expect(levelTitle(40)).toBe('حكيم');
  });
  it('levelFromXp: حدود المستوى والتقدم والسقف', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, pct: 0, next: 100 });
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100)).toMatchObject({ level: 2, floor: 100 });
    expect(levelFromXp(190)).toMatchObject({ level: 2, pct: 50, toNext: 90 });
    expect(levelFromXp(10 ** 7)).toMatchObject({ level: 40, pct: 100, isMax: true, toNext: 0 });
    expect(levelFromXp(-5).level).toBe(1);
  });
  it('XP: دقائق/6 + 50 لكل يوم منجز + 25 للسلسلة ≥3 + أسبوع مثالي + 60 لكل وسام', () => {
    // 3 أيام كاملة متتالية (إثنين→أربعاء): 120 دقيقة لكل منها
    const s = range('2026-11-02', '2026-11-04');
    const total = s.reduce((a, x) => a + x.minutes, 0);
    const state = mk(s, { achievements: { unlocked: { 'streak-3': '2026-11-04', 'first-day': '2026-11-02' } } });
    const { total: xp, parts } = computeXp(state, '2026-11-04');
    const by = Object.fromEntries(parts.map((p) => [p.key, p]));
    expect(by.time.xp).toBe(Math.floor(total / 6));
    expect(by.days.xp).toBe(150);
    expect(by.streak.xp).toBe(25);          // اليوم الثالث فقط
    expect(by.weeks.xp).toBe(0);
    expect(by.badges.xp).toBe(120);
    expect(xp).toBe(Math.floor(total / 6) + 150 + 25 + 120);
  });
  it('أسبوع مثالي منتهٍ +150، وشهر ≥90% مغلق +400', () => {
    const wk = computeXp(mk(range('2026-11-02', '2026-11-08')), '2026-11-10');
    expect(wk.parts.find((p) => p.key === 'weeks').xp).toBe(150);
    const mo = computeXp(mk(range('2026-01-01', '2026-01-31')), '2026-02-05');
    expect(mo.parts.find((p) => p.key === 'months').xp).toBe(400);
  });
  it('حذف الجلسات يخفّض XP، ونقاط الوسام المخزّن تبقى', () => {
    const state = mk([session('2026-11-03', 'morning', 60)], { achievements: { unlocked: { 'first-session': '2026-11-03' } } });
    const a = computeXp(state, '2026-11-05').total;
    const b = computeXp({ ...state, sessions: [] }, '2026-11-05').total;
    expect(a).toBe(10 + 60);
    expect(b).toBe(60);
  });
  it('معرّف وسام مجهول لا يضيف نقاطاً، وجلسة مستقبلية لا تُحتسب', () => {
    const state = mk([session('2026-12-01', 'morning', 600)], { achievements: { unlocked: { 'nope': '2026-11-03' } } });
    expect(computeXp(state, '2026-11-05').total).toBe(0);
  });
  it('levelSummary يجمع المستوى والتفصيل', () => {
    const r = levelSummary(mk([]), '2026-11-05');
    expect(r.level).toBe(1);
    expect(r.parts).toHaveLength(6);
  });
});

describe('التحية والتاريخ والاقتباسات', () => {
  it('أربع فترات بحدودها الدقيقة', () => {
    const at = (h) => greetingForHour(h).text;
    expect([4, 5, 11, 12, 16, 17, 21, 22, 23, 0, 3].map(at)).toEqual([
      'سهرة التركيز', 'صباح الهمة', 'صباح الهمة', 'ظهيرة العزم', 'ظهيرة العزم',
      'مساء الإنجاز', 'مساء الإنجاز', 'سهرة التركيز', 'سهرة التركيز', 'سهرة التركيز', 'سهرة التركيز',
    ]);
  });
  it('تاريخ ميلادي فقط بصيغة واضحة (بلا هجري)', () => {
    expect(gregorianLabel('2026-11-15')).toBe('الأحد 15 نوفمبر 2026');
    expect(gregorianLabel('2026-02-28')).toContain('فبراير');
  });
  it('40 عبارة فريدة وحتمية لكل يوم وتدور على الأيام', () => {
    expect(QUOTES).toHaveLength(40);
    expect(new Set(QUOTES).size).toBe(40);
    expect(quoteForDate('2026-11-15')).toBe(quoteForDate('2026-11-15'));
    const seen = new Set(); let d = '2026-11-01';
    for (let i = 0; i < 40; i++) { seen.add(quoteForDate(d)); d = addDays(d, 1); }
    expect(seen.size).toBe(40);
  });
});

describe('حراسة النقاء وعدم تغيير المخطط', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it.each(['levels', 'quotes', 'greeting', 'badge-defs', 'achievements'])('core/%s بلا DOM ولا تخزين', (f) => {
    const src = strip(readFileSync(`src/core/${f}.js`, 'utf8'));
    expect(src).not.toMatch(/\b(document|window|localStorage|navigator)\b/);
  });
  it('المخطط 5 باقٍ وكتالوج 5 فئات', () => {
    expect(base.schemaVersion).toBe(5);
    expect(CATEGORY_ORDER).toHaveLength(5);
    expect(new Set(BADGES.map((b) => b.cat))).toEqual(new Set(CATEGORY_ORDER));
  });
});

describe('أيقونات الأوسمة والواجهة (فحص ساكن)', () => {
  const strip2 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('لكل وسام أيقونة معرّفة ولا أيقونة يتيمة', async () => {
    const src = readFileSync('src/ui/badge-icons.js', 'utf8');
    const keys = [...src.matchAll(/^ {2}'?([\w-]+)'?: \[/gm)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(32);
    expect(new Set(BADGES.map((b) => b.icon))).toEqual(new Set(keys));
  });
  it.each(['badge-icons', 'hero', 'level-card', 'progress-ring', 'shell'])('ui/%s بلا innerHTML', (f) => {
    expect(strip2(readFileSync(`src/ui/${f}.js`, 'utf8'))).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });
  it('لا إيموجي في كتالوج الأوسمة (الأيقونات SVG)', () => {
    for (const b of BADGES) expect(/\p{Extended_Pictographic}/u.test(b.icon + b.title)).toBe(false);
  });
});
