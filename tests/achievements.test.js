import { describe, expect, it } from 'vitest';
import {
  BADGES, STREAK_STEPS, HOURS_STEPS, applyAchievements, badgeViews, badgesUnlockedBetween,
  evaluateAchievements, sanitizeAchievements,
} from '../src/core/achievements.js';
import { addDays, eachDate } from '../src/core/dates.js';
import { targetsForDate } from '../src/core/plan.js';
import { createInitialState } from '../src/core/store.js';
import { dayOff, session } from './helpers.js';

// الخطة الافتراضية: إثنين→خميس 60+60، جمعة 0+120، سبت وأحد 180+120.
const base = createInitialState('2026-01-01');
const mk = (sessions, over = {}) => ({
  ...base,
  sessions,
  settings: { ...base.settings, trackingStart: '2026-01-01', freezesPerMonth: 0, ...(over.settings || {}) },
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'settings')),
});
// جلسات تُتم هدف اليوم بالضبط (صباح + مساء)
function full(date, extra = {}) {
  const t = targetsForDate(base.plan, date);
  const out = [];
  if (t.morningMins) out.push(session(date, 'morning', t.morningMins, extra));
  if (t.eveningMins) out.push(session(date, 'evening', t.eveningMins, extra));
  return out;
}
function fullRange(from, to) {
  const out = [];
  eachDate(from, to, (d) => out.push(...full(d)));
  return out;
}
const ev = (state, today) => evaluateAchievements(state, today);

describe('سلاسل الأيام', () => {
  it('3 أيام متتالية تفتح streak-3 بتاريخ اليوم الثالث لا غير', () => {
    const { earned } = ev(mk(fullRange('2026-11-02', '2026-11-04')), '2026-11-04');
    expect(earned['streak-3']).toBe('2026-11-04');
    expect(earned['streak-7']).toBeUndefined();
  });

  it('يومان فقط: لا وسام والتقدم 2 من 3', () => {
    const { earned, progress } = ev(mk(fullRange('2026-11-02', '2026-11-03')), '2026-11-03');
    expect(earned['streak-3']).toBeUndefined();
    expect(progress['streak-3']).toEqual({ value: 2, target: 3 });
  });

  it('يوم فاشل يقطع السلسلة (2 + فشل + 2 لا تكفي)', () => {
    const s = [...fullRange('2026-11-02', '2026-11-03'), session('2026-11-04', 'morning', 10), ...fullRange('2026-11-05', '2026-11-06')];
    const { earned } = ev(mk(s), '2026-11-20'); // الأسبوع انتهى، فالأربعاء مقصّر
    expect(earned['streak-3']).toBeUndefined();
  });

  it('اليوم الاستثنائي محايد: يومان + إجازة + يوم = 3', () => {
    const s = [...fullRange('2026-11-02', '2026-11-03'), ...full('2026-11-05')];
    const state = mk(s, { dayOffs: [dayOff('2026-11-04', '2026-11-04')] });
    expect(ev(state, '2026-11-05').earned['streak-3']).toBe('2026-11-05');
  });

  it('اليوم المجمَّد محايد ولا يزيد السلسلة', () => {
    const s = [...fullRange('2026-11-02', '2026-11-03'), session('2026-11-04', 'morning', 30), ...full('2026-11-05')];
    const state = mk(s, { settings: { freezesPerMonth: 2 } });
    expect(ev(state, '2026-11-20').earned['streak-3']).toBe('2026-11-05');
  });

  it('اليوم الجاري غير المكتمل لا يقطع السلسلة', () => {
    const s = fullRange('2026-11-02', '2026-11-04');
    const { earned } = ev(mk(s), '2026-11-05'); // اليوم 5 بلا جلسات بعد
    expect(earned['streak-3']).toBe('2026-11-04');
  });

  it('سلسلة 7 و30: الحدّ بالضبط', () => {
    const six = ev(mk(fullRange('2026-11-02', '2026-11-07')), '2026-11-07');
    expect(six.earned['streak-7']).toBeUndefined();
    const seven = ev(mk(fullRange('2026-11-02', '2026-11-08')), '2026-11-08');
    expect(seven.earned['streak-7']).toBe('2026-11-08');
    const thirty = ev(mk(fullRange('2026-10-01', '2026-10-30')), '2026-10-30');
    expect(thirty.earned['streak-30']).toBe('2026-10-30');
    expect(thirty.earned['streak-100']).toBeUndefined();
  });

  it('سلسلة 100', () => {
    const r = ev(mk(fullRange('2026-07-01', '2026-10-08')), '2026-10-08');
    expect(r.earned['streak-100']).toBe('2026-10-08');
  });

  it('يوم قبل بداية التتبع لا يحتسب', () => {
    const state = mk(fullRange('2026-11-02', '2026-11-04'), { settings: { trackingStart: '2026-11-04' } });
    expect(ev(state, '2026-11-04').earned['streak-3']).toBeUndefined();
  });
});

describe('الساعات التراكمية', () => {
  it('599 دقيقة لا تفتح 10 ساعات و600 تفتح', () => {
    expect(ev(mk([session('2026-11-02', 'morning', 599)]), '2026-11-02').earned['hours-10']).toBeUndefined();
    expect(ev(mk([session('2026-11-02', 'morning', 600)]), '2026-11-02').earned['hours-10']).toBe('2026-11-02');
  });

  it('التاريخ هو يوم تجاوز المجموع التراكمي', () => {
    const s = [session('2026-11-02', 'morning', 300), session('2026-11-03', 'morning', 300), session('2026-11-04', 'morning', 300)];
    expect(ev(mk(s), '2026-11-04').earned['hours-10']).toBe('2026-11-03');
  });

  it('كل المصادر تُحتسب (مؤقت/يدوي/مُرحَّل)', () => {
    const s = [session('2026-11-02', 'morning', 200, { source: 'timer' }), session('2026-11-02', 'evening', 200, { source: 'migrated' }), session('2026-11-03', 'morning', 200)];
    expect(ev(mk(s), '2026-11-03').earned['hours-10']).toBe('2026-11-03');
  });

  it('تقدّم الساعات يُقصّ عند الهدف والعتبات الخمس موجودة', () => {
    const r = ev(mk([session('2026-11-02', 'morning', 60)]), '2026-11-02');
    for (const h of HOURS_STEPS) expect(r.progress[`hours-${h}`].target).toBe(h);
  });

  it('1000 ساعة تفتح كل العتبات بتواريخها', () => {
    const s = [];
    let d = '2025-01-01';
    for (let i = 0; i < 84; i++) { s.push(session(d, 'morning', 1440)); d = addDays(d, 1); }
    const r = ev(mk(s), '2026-11-02');
    for (const h of HOURS_STEPS) expect(r.earned[`hours-${h}`]).toBeTruthy();
    expect(r.earned['hours-1000']).toBe(addDays('2025-01-01', 41));
  });

  it('جلسة بتاريخ مستقبلي لا تُحتسب', () => {
    const r = ev(mk([session('2026-12-01', 'morning', 700)]), '2026-11-02');
    expect(r.earned['hours-10']).toBeUndefined();
  });
});

describe('تنوع المواد', () => {
  const subj = (id, archived = false) => ({ id, name: id, color: '#38bdf8', archived });
  it('3 مواد في أسبوع (إثنين→أحد) تفتح بتاريخ الجلسة الثالثة', () => {
    const s = [session('2026-11-02', 'morning', 30, { subject: 'a' }), session('2026-11-04', 'morning', 30, { subject: 'b' }), session('2026-11-08', 'morning', 30, { subject: 'c' })];
    expect(ev(mk(s, { subjects: [subj('a'), subj('b'), subj('c')] }), '2026-11-08').earned['variety-week']).toBe('2026-11-08');
  });

  it('مادتان في أسبوع ومادة في الأسبوع التالي لا تكفي (حدّ الأسبوع)', () => {
    const s = [session('2026-11-08', 'morning', 30, { subject: 'a' }), session('2026-11-08', 'evening', 30, { subject: 'b' }), session('2026-11-09', 'morning', 30, { subject: 'c' })];
    const r = ev(mk(s, { subjects: [subj('a'), subj('b'), subj('c')] }), '2026-11-09');
    expect(r.earned['variety-week']).toBeUndefined();
    expect(r.progress['variety-week']).toEqual({ value: 2, target: 3 });
  });

  it('جلسات بلا مادة لا تُحتسب', () => {
    const s = [session('2026-11-02', 'morning', 30), session('2026-11-03', 'morning', 30), session('2026-11-04', 'morning', 30)];
    expect(ev(mk(s), '2026-11-04').earned['variety-week']).toBeUndefined();
  });

  it('كل المواد النشطة في شهر: يُفتح عند دراسة آخر مادة', () => {
    const s = [session('2026-11-02', 'morning', 30, { subject: 'a' }), session('2026-11-20', 'morning', 30, { subject: 'b' })];
    const r = ev(mk(s, { subjects: [subj('a'), subj('b')] }), '2026-11-20');
    expect(r.earned['variety-month']).toBe('2026-11-20');
  });

  it('مادة نشطة لم تُدرس هذا الشهر: لا وسام', () => {
    const s = [session('2026-11-02', 'morning', 30, { subject: 'a' }), session('2026-11-20', 'morning', 30, { subject: 'b' })];
    const r = ev(mk(s, { subjects: [subj('a'), subj('b'), subj('c')] }), '2026-11-20');
    expect(r.earned['variety-month']).toBeUndefined();
    expect(r.progress['variety-month']).toEqual({ value: 2, target: 3 });
  });

  it('المواد المؤرشفة لا تُطلب', () => {
    const s = [session('2026-11-02', 'morning', 30, { subject: 'a' }), session('2026-11-20', 'morning', 30, { subject: 'b' })];
    const r = ev(mk(s, { subjects: [subj('a'), subj('b'), subj('c', true)] }), '2026-11-20');
    expect(r.earned['variety-month']).toBe('2026-11-20');
  });

  it('مادة نشطة واحدة لا تكفي (الحد الأدنى مادتان)', () => {
    const s = [session('2026-11-02', 'morning', 30, { subject: 'a' })];
    expect(ev(mk(s, { subjects: [subj('a')] }), '2026-11-02').earned['variety-month']).toBeUndefined();
  });

  it('مادتان في شهرين مختلفين لا تفتحان', () => {
    const s = [session('2026-10-30', 'morning', 30, { subject: 'a' }), session('2026-11-02', 'morning', 30, { subject: 'b' })];
    expect(ev(mk(s, { subjects: [subj('a'), subj('b')] }), '2026-11-02').earned['variety-month']).toBeUndefined();
  });
});

describe('عادات: أسبوع كامل', () => {
  it('أسبوع منتهٍ كل أيامه مكتملة: يُفتح بتاريخ الأحد', () => {
    const r = ev(mk(fullRange('2026-11-02', '2026-11-08')), '2026-11-09');
    expect(r.earned['habit-week']).toBe('2026-11-08');
  });

  it('الأسبوع الجاري لا يُحتسب مهما اكتمل', () => {
    const r = ev(mk(fullRange('2026-11-02', '2026-11-08')), '2026-11-08');
    expect(r.earned['habit-week']).toBeUndefined();
  });

  it('يوم مقصّر واحد يمنعه', () => {
    const s = [...fullRange('2026-11-02', '2026-11-05'), ...fullRange('2026-11-07', '2026-11-08'), session('2026-11-06', 'morning', 10)];
    expect(ev(mk(s), '2026-11-10').earned['habit-week']).toBeUndefined();
  });

  it('الأيام الاستثنائية تُستثنى (5 مستهدفة مكتملة تكفي)', () => {
    const s = fullRange('2026-11-04', '2026-11-08');
    const state = mk(s, { dayOffs: [dayOff('2026-11-02', '2026-11-03')] });
    expect(ev(state, '2026-11-10').earned['habit-week']).toBe('2026-11-08');
  });

  it('أقل من 3 أيام مستهدفة: لا يُفتح', () => {
    const s = fullRange('2026-11-07', '2026-11-08');
    const state = mk(s, { dayOffs: [dayOff('2026-11-02', '2026-11-06')] });
    expect(ev(state, '2026-11-10').earned['habit-week']).toBeUndefined();
  });

  it('أسبوع يبدأ قبل بداية التتبع لا يُحتسب', () => {
    const state = mk(fullRange('2026-11-04', '2026-11-08'), { settings: { trackingStart: '2026-11-04' } });
    expect(ev(state, '2026-11-10').earned['habit-week']).toBeUndefined();
  });
});

describe('عادات: شهر ≥90%', () => {
  it('شهر منتهٍ مكتمل 100%', () => {
    const r = ev(mk(fullRange('2026-10-01', '2026-10-31')), '2026-11-05');
    expect(r.earned['habit-month']).toBe('2026-10-31');
  });

  it('28 من 31 يوماً (90.3%) يكفي', () => {
    const s = fullRange('2026-10-01', '2026-10-31').filter((x) => !['2026-10-01', '2026-10-02', '2026-10-03'].includes(x.date));
    // الأيام الثلاثة الأولى بلا جلسات: تعويض الأسبوع غير ممكن، فهي مقصّرة
    expect(ev(mk(s), '2026-11-05').earned['habit-month']).toBe('2026-10-31');
  });

  it('27 من 31 (87%) لا يكفي', () => {
    const s = fullRange('2026-10-01', '2026-10-31').filter((x) => !['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].includes(x.date));
    expect(ev(mk(s), '2026-11-05').earned['habit-month']).toBeUndefined();
  });

  it('الشهر الجاري لا يُحتسب قبل نهايته', () => {
    const r = ev(mk(fullRange('2026-11-01', '2026-11-13')), '2026-11-14');
    expect(r.earned['habit-month']).toBeUndefined();
    expect(r.progress['habit-month'].value).toBe(90);
  });

  it('أقل من 10 أيام مستهدفة: لا يُفتح', () => {
    const state = mk(fullRange('2026-10-24', '2026-10-31'), { settings: { trackingStart: '2026-10-24' } });
    expect(ev(state, '2026-11-05').earned['habit-month']).toBeUndefined();
  });
});

describe('عادات: 5 صباحات متتالية', () => {
  const morning = (d, m) => session(d, 'morning', m);
  it('5 أيام تبلغ هدف الصباح', () => {
    const s = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => morning(d, 60));
    s.push(morning('2026-11-06', 15)); // الجمعة: هدف الصباح 0 فأي دقائق تكفي
    expect(ev(mk(s), '2026-11-06').earned['habit-morning']).toBe('2026-11-06');
  });

  it('4 أيام لا تكفي', () => {
    const s = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => morning(d, 60));
    const r = ev(mk(s), '2026-11-05');
    expect(r.earned['habit-morning']).toBeUndefined();
    expect(r.progress['habit-morning']).toEqual({ value: 4, target: 5 });
  });

  it('يوم أقل من هدف الصباح يكسر التتابع', () => {
    const s = [morning('2026-11-02', 60), morning('2026-11-03', 60), morning('2026-11-04', 59), morning('2026-11-05', 60), morning('2026-11-06', 15)];
    expect(ev(mk(s), '2026-11-06').earned['habit-morning']).toBeUndefined();
  });

  it('جلسات المساء لا تحتسب صباحاً', () => {
    const s = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d) => session(d, 'evening', 120));
    expect(ev(mk(s), '2026-11-06').earned['habit-morning']).toBeUndefined();
  });

  it('يوم بلا جلسات في المنتصف يكسر التتابع', () => {
    const s = ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07'].map((d) => morning(d, 180));
    expect(ev(mk(s), '2026-11-07').earned['habit-morning']).toBeUndefined();
  });
});

describe('applyAchievements: فتح مكرر وسحب تلقائي وإعادة الحساب (تقييم ديناميكي)', () => {
  const sessions = fullRange('2026-11-02', '2026-11-04');

  it('يفتح الجديد مرة واحدة ويعيد نفس كائن الحالة بعدها (تطابقي)', () => {
    const r1 = applyAchievements(mk(sessions), '2026-11-04');
    expect(r1.newly).toContain('streak-3');
    expect(r1.revoked).toEqual([]);
    expect(r1.state.achievements.unlocked['streak-3']).toBe('2026-11-04');
    const r2 = applyAchievements(r1.state, '2026-11-04');
    expect(r2.newly).toEqual([]);
    expect(r2.revoked).toEqual([]);
    expect(r2.state).toBe(r1.state);
  });

  it('حذف الجلسات يسحب الأوسمة التي لم تعد مستحقة، وعودتها تفتحها من جديد', () => {
    const r1 = applyAchievements(mk(sessions), '2026-11-04');
    expect(r1.state.achievements.unlocked['streak-3']).toBeDefined();
    const emptied = { ...r1.state, sessions: [] };
    const r2 = applyAchievements(emptied, '2026-11-30');
    expect(r2.revoked).toEqual(expect.arrayContaining(['streak-3', 'first-session']));
    expect(r2.state.achievements.unlocked['streak-3']).toBeUndefined();
    expect(Object.keys(r2.state.achievements.unlocked)).toEqual([]);
    // تعود الجلسات: يُفتح الوسام من جديد
    const r3 = applyAchievements({ ...r2.state, sessions }, '2026-11-04');
    expect(r3.newly).toContain('streak-3');
    expect(r3.state.achievements.unlocked['streak-3']).toBe('2026-11-04');
  });

  it('حذف جلسة واحدة من سلسلة يسحب الوسام الذي كانت شرطه فقط', () => {
    const r1 = applyAchievements(mk(sessions), '2026-11-04');
    const withoutMiddle = { ...r1.state, sessions: sessions.filter((s) => s.date !== '2026-11-03') };
    const r2 = applyAchievements(withoutMiddle, '2026-11-04');
    expect(r2.revoked).toContain('streak-3');
    expect(r2.revoked).not.toContain('first-session');
  });

  it('انكسار السلسلة الجارية لا يسحب وسام سلسلة سبق تحقيقها في السجل (تقييم على أفضل سلسلة)', () => {
    const r1 = applyAchievements(mk(sessions), '2026-11-04');
    const later = applyAchievements(r1.state, '2026-11-30'); // أيام بلا دراسة بعد السلسلة
    expect(later.state.achievements.unlocked['streak-3']).toBe('2026-11-04');
    expect(later.revoked).not.toContain('streak-3');
  });

  it('التاريخ يُعاد اشتقاقه من السجل لا من المخزَّن', () => {
    const state = { ...mk(sessions), achievements: { unlocked: { 'streak-3': '2026-01-01' } } };
    const r = applyAchievements(state, '2026-11-04');
    expect(r.state.achievements.unlocked['streak-3']).toBe('2026-11-04');
    expect(r.newly).not.toContain('streak-3'); // كان مفتوحاً: ليس «جديداً»
  });

  it('وسام مخزَّن بلا جلسات (استيراد/بيانات قديمة) يُسحب، والمستحق فعلاً يُفتح', () => {
    const imported = { ...mk(fullRange('2026-11-02', '2026-11-08')), achievements: { unlocked: { 'hours-100': '2026-02-02' } } };
    const r = applyAchievements(imported, '2026-11-08');
    expect(r.revoked).toContain('hours-100');
    expect(r.state.achievements.unlocked['hours-100']).toBeUndefined();
    expect(r.state.achievements.unlocked['streak-7']).toBe('2026-11-08');
  });

  it('مجموعة الأوسمة المخزَّنة بعد التطبيق = المستحق من التقييم تماماً (على حالات متنوعة)', () => {
    const cases = [[], sessions, fullRange('2026-11-02', '2026-11-08'), fullRange('2026-10-01', '2026-11-20')];
    for (const ss of cases) {
      const state = { ...mk(ss), achievements: { unlocked: { 'hours-100': '2026-01-01', 'streak-30': '2026-01-02' } } };
      const today = '2026-11-20';
      const { earned } = ev(state, today);
      const r = applyAchievements(state, today);
      expect(r.state.achievements.unlocked).toEqual(earned);
      expect(applyAchievements(r.state, today).state).toBe(r.state);
    }
  });

  it('حالة بلا حقل achievements (استيراد قديم) تُعالج', () => {
    const { achievements, ...rest } = mk(sessions);
    const r = applyAchievements(rest, '2026-11-04');
    expect(r.state.achievements.unlocked['streak-3']).toBe('2026-11-04');
  });
});

describe('sanitizeAchievements', () => {
  it('يسقط المعرّفات المجهولة والتواريخ الفاسدة ويعدّها', () => {
    const { value, dropped } = sanitizeAchievements({ unlocked: { 'streak-3': '2026-11-04', bogus: '2026-11-04', 'hours-10': '2026-13-45', 'hours-50': 5 } });
    expect(value.unlocked).toEqual({ 'streak-3': '2026-11-04' });
    expect(dropped).toBe(3);
  });
  it('غياب الحقل ليس تالفاً', () => {
    expect(sanitizeAchievements(undefined)).toEqual({ value: { unlocked: {} }, dropped: 0 });
  });
  it('قيم من نوع خاطئ', () => {
    expect(sanitizeAchievements({ unlocked: [1] }).dropped).toBe(1);
    expect(sanitizeAchievements('x').value.unlocked).toEqual({});
  });
});

describe('badgeViews وعدد الأوسمة', () => {
  it('32 وساماً بمعرّفات فريدة: 4 بدايات + 8 سلاسل + 8 ساعات + 7 عادات + 5 التزام', () => {
    expect(BADGES).toHaveLength(32);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(32);
    const count = (c) => BADGES.filter((b) => b.cat === c).length;
    expect([count('start'), count('streak'), count('hours'), count('habit'), count('commit')]).toEqual([4, 8, 8, 7, 5]);
    expect(STREAK_STEPS).toEqual([3, 7, 14, 30, 60, 100, 180, 365]);
    expect(HOURS_STEPS).toEqual([10, 25, 50, 100, 250, 500, 1000, 2000]);
  });

  it('المفتوح 100% بتاريخه والمقفل بنسبة تقدمه', () => {
    const state = { ...mk(fullRange('2026-11-02', '2026-11-04')), achievements: { unlocked: { 'streak-3': '2026-11-04' } } };
    const v = Object.fromEntries(badgeViews(state, '2026-11-04').map((b) => [b.id, b]));
    expect(v['streak-3']).toMatchObject({ unlockedOn: '2026-11-04', pct: 100 });
    expect(v['streak-7']).toMatchObject({ unlockedOn: null, value: 3, target: 7, pct: 43 });
  });

  it('badgesUnlockedBetween يفلتر بالمدى', () => {
    const state = { ...base, achievements: { unlocked: { 'streak-3': '2026-11-04', 'streak-7': '2026-12-04' } } };
    expect(badgesUnlockedBetween(state, '2026-11-01', '2026-11-30').map((b) => b.id)).toEqual(['streak-3']);
  });
});
