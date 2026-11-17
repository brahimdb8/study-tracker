import { describe, expect, it } from 'vitest';
import {
  cumulativeSeries, dailySeries, heatmapYear, hourHistogram, intensityLevel, monthComparison,
  monthHighlights, monthlySeries, qualityVsMinutes, rangeFor, subjectBreakdown, weeklyReport, weeklySeries,
} from '../src/core/analytics.js';
import { monthStats } from '../src/core/stats.js';
import { updateSession } from '../src/core/sessions.js';
import { ctxFor, dayOff, session } from './helpers.js';

const TODAY = '2026-11-12'; // خميس

describe('dailySeries', () => {
  it('يعيد كل أيام الشهر مع الأيام المستقبلية معلَّمة', () => {
    const ctx = ctxFor([session('2026-11-02', 'morning', 60), session('2026-11-02', 'evening', 30)], { today: TODAY });
    const d = dailySeries(2026, 10, ctx);
    expect(d).toHaveLength(30);
    expect(d[1]).toMatchObject({ day: 2, morning: 60, evening: 30, total: 90, future: false });
    expect(d[12].future).toBe(true);
    expect(d[11].future).toBe(false);
  });
  it('هدف الأيام الاستثنائية صفر', () => {
    const ctx = ctxFor([], { today: TODAY, dayOffs: [dayOff('2026-11-03', '2026-11-03')] });
    const d = dailySeries(2026, 10, ctx);
    expect(d[2].target).toBe(0);
    expect(d[1].target).toBe(120); // الإثنين 60+60
  });
  it('الأيام قبل بداية التتبع بلا هدف', () => {
    const ctx = ctxFor([], { today: TODAY, trackingStart: '2026-11-05' });
    expect(dailySeries(2026, 10, ctx)[3].target).toBe(0);
  });
});

describe('cumulativeSeries / highlights', () => {
  it('التراكمي لا يتجاوز اليوم ولا إسقاط قبل 5 أيام', () => {
    const ctx = ctxFor([session('2026-11-01', 'morning', 100)], { today: '2026-11-03' });
    const c = cumulativeSeries(dailySeries(2026, 10, ctx), ctx);
    expect(c.points[2].actual).toBe(100);
    expect(c.points[3].actual).toBeNull();
    expect(c.projection).toBeNull();
  });
  it('الإسقاط بعد 5 أيام فأكثر في الشهر الجاري فقط', () => {
    const ctx = ctxFor([session('2026-11-01', 'morning', 60), session('2026-11-02', 'morning', 60)], { today: '2026-11-10' });
    const c = cumulativeSeries(dailySeries(2026, 10, ctx), ctx);
    expect(c.projection.rate).toBe(12);
    expect(c.projection.final).toBe(120 + 12 * 20);
    const past = ctxFor([session('2026-10-01', 'morning', 60)], { today: TODAY });
    expect(cumulativeSeries(dailySeries(2026, 9, past), past).projection).toBeNull();
  });
  it('أبرز ما في الشهر', () => {
    const ctx = ctxFor([session('2026-11-01', 'morning', 30), session('2026-11-02', 'morning', 90)], { today: TODAY });
    const h = monthHighlights(dailySeries(2026, 10, ctx));
    expect(h).toMatchObject({ studiedDays: 2, elapsedDays: 12, avgPerStudiedDay: 60 });
    expect(h.bestDay).toEqual({ date: '2026-11-02', mins: 90 });
  });
  it('شهر فارغ لا ينهار', () => {
    const ctx = ctxFor([], { today: TODAY });
    expect(monthHighlights(dailySeries(2026, 10, ctx)).bestDay).toBeNull();
  });
});

describe('weekly / monthly series', () => {
  it('N أسبوعاً بالأقدم أولاً وآخرها الحالي', () => {
    const ctx = ctxFor([session('2026-11-10', 'morning', 50)], { today: TODAY });
    const w = weeklySeries(ctx, 4);
    expect(w).toHaveLength(4);
    expect(w[3]).toMatchObject({ weekStart: '2026-11-09', studied: 50, current: true });
    expect(w[0].weekStart).toBe('2026-10-19');
  });
  it('12 شهراً تنتهي بالحالي وتطابق monthStats', () => {
    const ctx = ctxFor([session('2026-10-05', 'morning', 200)], { today: TODAY });
    const m = monthlySeries(ctx, {}, 12);
    expect(m).toHaveLength(12);
    expect(m[11]).toMatchObject({ year: 2026, month: 10, current: true });
    expect(m[10].studied).toBe(monthStats(2026, 9, ctx).studiedMins);
    expect(m[0]).toMatchObject({ year: 2025, month: 11 });
  });
});

describe('heatmapYear', () => {
  it('53 عموداً × 7 أيام، الأخير أسبوع اليوم، والمستقبل معلَّم', () => {
    const ctx = ctxFor([session(TODAY, 'morning', 80)], { today: TODAY });
    const h = heatmapYear(ctx);
    expect(h.columns).toHaveLength(53);
    const last = h.columns[52].cells;
    expect(last.map((c) => c.date)[0]).toBe('2026-11-09');
    expect(last[3]).toMatchObject({ date: TODAY, mins: 80 });
    expect(last[4].future).toBe(true);
    expect(last[4].status).toBe('future');
    expect(h.max).toBe(80);
  });
  it('مستويات الكثافة', () => {
    expect([0, 10, 30, 60, 100].map((m) => intensityLevel(m, 100))).toEqual([0, 1, 2, 3, 4]);
    expect(intensityLevel(5, 0)).toBe(0);
  });
});

describe('subjectBreakdown', () => {
  const subs = [{ id: 'a', name: 'رياضيات', color: '#38bdf8', archived: false }];
  it('يجمع المواد وبلا مادة ويرتب تنازلياً', () => {
    const ss = [
      session('2026-11-01', 'morning', 60, { subject: 'a' }),
      session('2026-11-02', 'morning', 30),
      session('2026-11-03', 'morning', 30, { subject: 'a' }),
      session('2026-09-01', 'morning', 500, { subject: 'a' }),
    ];
    const r = subjectBreakdown(ss, subs, { from: '2026-11-01', to: TODAY });
    expect(r.total).toBe(120);
    expect(r.rows[0]).toMatchObject({ id: 'a', mins: 90, count: 2, pct: 75, name: 'رياضيات' });
    expect(r.rows[1]).toMatchObject({ id: null, name: 'بدون مادة', pct: 25 });
  });
  it('نطاق فارغ', () => {
    expect(subjectBreakdown([], subs, { from: '2026-11-01', to: TODAY })).toEqual({ rows: [], total: 0 });
  });
  it('rangeFor', () => {
    const ctx = ctxFor([], { today: TODAY });
    expect(rangeFor('month', ctx)).toEqual({ from: '2026-11-01', to: TODAY });
    expect(rangeFor('30', ctx).from).toBe('2026-10-14');
    expect(rangeFor('all', ctx, [{ date: '2026-03-01' }]).from).toBe('2026-03-01');
  });
});

describe('hourHistogram', () => {
  const at = (h, m = 0) => new Date(2026, 10, 10, h, m).getTime();
  it('يوزّع الجلسة عبر الساعات', () => {
    const r = hourHistogram([session('2026-11-10', 'morning', 90, { startedAt: at(9, 30) })], { from: '2026-11-01', to: TODAY });
    expect(r.hours[9]).toBe(30);
    expect(r.hours[10]).toBe(60);
    expect(r.timedMins).toBe(90);
  });
  it('يلتفّ عند منتصف الليل', () => {
    const r = hourHistogram([session('2026-11-10', 'evening', 120, { startedAt: at(23, 0) })], { from: '2026-11-01', to: TODAY });
    expect(r.hours[23]).toBe(60);
    expect(r.hours[0]).toBe(60);
  });
  it('غير الموقّتة تُعدّ منفصلة وأفضل نافذة 3 ساعات', () => {
    const r = hourHistogram([
      session('2026-11-10', 'morning', 60, { startedAt: at(8) }),
      session('2026-11-10', 'morning', 60, { startedAt: at(9) }),
      session('2026-11-10', 'evening', 45),
    ], { from: '2026-11-01', to: TODAY });
    expect(r.untimedMins).toBe(45);
    expect(r.bestWindow).toEqual({ start: 7, mins: 120 });
  });
  it('بلا بيانات موقّتة لا نافذة', () => {
    expect(hourHistogram([], { from: '2026-11-01', to: TODAY }).bestWindow).toBeNull();
  });
});

describe('quality / comparison / weekly report', () => {
  it('متوسط الدقائق لكل تقييم', () => {
    const ctx = ctxFor([session('2026-11-01', 'morning', 100), session('2026-11-02', 'morning', 50)], { today: TODAY });
    const dm = { '2026-11-01': { quality: 'good' }, '2026-11-02': { quality: 'good' }, '2026-11-03': { quality: 'poor' } };
    const q = qualityVsMinutes(ctx, dm, { from: '2026-11-01', to: TODAY });
    expect(q.find((x) => x.key === 'good')).toEqual({ key: 'good', days: 2, avgMins: 75 });
    expect(q.find((x) => x.key === 'poor')).toEqual({ key: 'poor', days: 1, avgMins: 0 });
  });
  it('مقارنة الشهر تقصّ السابق عند اليوم نفسه', () => {
    const ctx = ctxFor([
      session('2026-10-05', 'morning', 100), session('2026-10-25', 'morning', 900), session('2026-11-05', 'morning', 150),
    ], { today: TODAY });
    const c = monthComparison(2026, 10, ctx);
    expect(c.prev.studiedMins).toBe(100);
    expect(c.diffPct).toBe(50);
    expect(c.sameSpan).toBe(12);
    const old = monthComparison(2026, 9, ctx);
    expect(old.sameSpan).toBeNull();
    expect(old.prev.studiedMins).toBe(0);
    expect(old.diffPct).toBeNull();
  });
  it('تقرير الأسبوع', () => {
    const ctx = ctxFor([session('2026-11-09', 'morning', 60), session('2026-11-02', 'morning', 30), session('2026-11-14', 'morning', 99)], { today: TODAY });
    const r = weeklyReport(ctx);
    expect(r.thisTotal).toBe(60);
    expect(r.lastToDate).toBe(30);
    expect(r.diffToDate).toBe(30);
    expect(r.thisWeek[4].mins).toBeNull();
    expect(r.todayIndex).toBe(3);
    expect(r.lastTotal).toBe(30 + 99 * 0);
  });
});

describe('updateSession startedAt + monthStats maxDay', () => {
  it('يعدّل وقت البدء ويرفض غير الصالح', () => {
    const s = [session('2026-11-01', 'morning', 30)];
    const ok = updateSession(s, s[0].id, { startedAt: 12345 });
    expect(ok.session.startedAt).toBe(12345);
    expect(updateSession(s, s[0].id, { startedAt: NaN }).ok).toBe(false);
    expect(updateSession(s, s[0].id, { startedAt: null }).session.startedAt).toBeNull();
  });
  it('maxDay يقصّ الأيام', () => {
    const ctx = ctxFor([session('2026-11-02', 'morning', 10), session('2026-11-20', 'morning', 10)], { today: '2026-11-25' });
    expect(monthStats(2026, 10, ctx, {}, { maxDay: 10 }).studiedMins).toBe(10);
    expect(monthStats(2026, 10, ctx).studiedMins).toBe(20);
  });
});
