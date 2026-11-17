import { describe, expect, it } from 'vitest';
import { navigateDate } from '../src/core/calendar-nav.js';
import { csvCell, dailySummaryToCsv, exportFileName, resolveExportRange, sessionsToCsv, toCsv, CSV_BOM } from '../src/core/export-csv.js';
import { shouldShowOnboarding } from '../src/core/onboarding.js';
import { buildReport } from '../src/core/report.js';
import { restoreSession } from '../src/core/sessions.js';
import { STATE_KEY, createInitialState, createStore, PRE_IMPORT_BACKUP_KEY } from '../src/core/store.js';
import { memoryStorage, session } from './helpers.js';

const TODAY = '2026-11-13'; // جمعة
const NOW = () => new Date(2026, 10, 13, 12, 0, 0);

describe('calendar-nav', () => {
  const o = { today: TODAY };
  it('الأسهم في الاتجاه RTL', () => {
    expect(navigateDate('2026-11-10', 'ArrowLeft', o)).toBe('2026-11-11');
    expect(navigateDate('2026-11-10', 'ArrowRight', o)).toBe('2026-11-09');
    expect(navigateDate('2026-11-10', 'ArrowUp', o)).toBe('2026-11-03');
    expect(navigateDate('2026-11-03', 'ArrowDown', o)).toBe('2026-11-10');
  });
  it('لا يتجاوز اليوم ولا min، ويعيد null بلا حركة', () => {
    expect(navigateDate(TODAY, 'ArrowLeft', o)).toBeNull();
    expect(navigateDate('2026-11-12', 'ArrowDown', o)).toBe(TODAY);
    expect(navigateDate('2026-11-02', 'ArrowRight', { ...o, min: '2026-11-02' })).toBeNull();
    expect(navigateDate('2026-11-10', 'x', o)).toBeNull();
  });
  it('Home/End وPageUp/PageDown مع تقصير طول الشهر', () => {
    expect(navigateDate('2026-11-11', 'Home', o)).toBe('2026-11-08'); // الأحد
    expect(navigateDate('2026-11-11', 'End', o)).toBe('2026-11-13');
    expect(navigateDate('2026-03-31', 'PageUp', o)).toBe('2026-02-28');
    expect(navigateDate('2026-11-10', 'PageUp', { ...o, shift: true })).toBe('2025-11-10');
    expect(navigateDate('2026-10-10', 'PageDown', o)).toBe('2026-11-10');
  });
});

describe('restoreSession', () => {
  it('تستعيد، وهي متكررة الأمان، وترفض غير الصالح وتجاوز 24 ساعة', () => {
    const s = session('2026-11-10', 'morning', 60);
    const r = restoreSession([], s);
    expect(r.ok && !r.already && r.sessions).toHaveLength(1);
    const again = restoreSession(r.sessions, s);
    expect(again.already).toBe(true);
    expect(again.sessions).toHaveLength(1);
    expect(restoreSession([], { id: 'x' }).ok).toBe(false);
    const big = restoreSession([session('2026-11-10', 'morning', 1400)], session('2026-11-10', 'evening', 100));
    expect(big.ok).toBe(false);
  });
});

describe('store: تبادل نسخة ما قبل الاستيراد', () => {
  it('تراجع الاستيراد ثم تراجع التراجع بلا فقد', () => {
    const st = memoryStorage();
    const store = createStore(st, { now: NOW });
    const a = { ...store.getState(), sessions: [session('2026-11-10', 'morning', 30)] };
    store.commit(a);
    expect(store.hasPreImportBackup()).toBe(false);
    expect(store.swapPreImportBackup().ok).toBe(false);
    const other = { ...createInitialState(TODAY), sessions: [session('2026-11-09', 'evening', 45)] };
    expect(store.importJSON(JSON.stringify(other)).ok).toBe(true);
    expect(store.getState().sessions[0].minutes).toBe(45);
    expect(store.hasPreImportBackup()).toBe(true);
    expect(store.swapPreImportBackup().ok).toBe(true);
    expect(store.getState().sessions[0].minutes).toBe(30);
    expect(store.swapPreImportBackup().ok).toBe(true);
    expect(store.getState().sessions[0].minutes).toBe(45);
    expect(JSON.parse(st.getItem(STATE_KEY)).sessions[0].minutes).toBe(45);
  });
  it('نسخة تالفة تُرفض دون المساس بالحالة', () => {
    const st = memoryStorage();
    const store = createStore(st, { now: NOW });
    st.setItem(PRE_IMPORT_BACKUP_KEY, '{bad');
    expect(store.swapPreImportBackup().ok).toBe(false);
  });
});

describe('export-csv', () => {
  it('تحييد الصيغ والاقتباس والفاصل', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@x')).toBe("'@x");
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('a;b', ',')).toBe('a;b');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
    expect(csvCell(45)).toBe('45');
    expect(csvCell(null)).toBe('');
  });
  it('BOM وCRLF', () => {
    const out = toCsv([['a', 'b']]);
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out.endsWith('\r\n')).toBe(true);
  });
  it('النطاقات', () => {
    expect(resolveExportRange('month', { today: TODAY })).toEqual({ from: '2026-11-01', to: TODAY });
    expect(resolveExportRange('all', { today: TODAY, sessions: [session('2026-09-05', 'morning', 5)] }).from).toBe('2026-09-05');
    expect(resolveExportRange('custom', { today: TODAY, from: '2026-11-05', to: '2026-11-01' }).error).toBeTruthy();
    expect(resolveExportRange('custom', { today: TODAY, from: '', to: '' }).error).toBeTruthy();
    expect(resolveExportRange('zzz', { today: TODAY }).error).toBeTruthy();
  });
  const state = () => {
    const s = createInitialState(TODAY);
    s.settings.trackingStart = '2026-11-01';
    s.subjects = [{ id: 'm', name: 'رياضيات', color: '#38bdf8', archived: true }];
    s.sessions = [
      session('2026-11-10', 'evening', 60, { subject: 'm', note: '=HYPERLINK("x")' }),
      session('2026-11-10', 'morning', 30, { subject: 'ghost' }),
      session('2026-10-01', 'morning', 20),
    ];
    s.dayMeta['2026-11-10'] = { quality: 'good' };
    return s;
  };
  it('الجلسات: تصفية بالنطاق، مادة مؤرشفة بالاسم، مادة محذوفة فارغة، ملاحظة مُحيَّدة', () => {
    const out = sessionsToCsv(state(), { from: '2026-11-01', to: TODAY });
    const lines = out.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(out).toContain('رياضيات');
    expect(out).toContain("'=HYPERLINK");
    expect(out).not.toContain('2026-10-01');
    expect(out).toContain('جيد');
  });
  it('الملخص اليومي: صف لكل يوم حتى اليوم', () => {
    const out = dailySummaryToCsv(state(), { from: '2026-11-09', to: '2026-11-20', today: TODAY });
    expect(out.trim().split('\r\n')).toHaveLength(1 + 5); // 9..13
  });
  it('اسم الملف', () => {
    expect(exportFileName('sessions', '2026-11-01', TODAY)).toBe('study-sessions-2026-11-01_2026-11-13.csv');
  });
});

describe('report', () => {
  it('مجاميع وتوزيع المواد والأيام', () => {
    const s = createInitialState(TODAY);
    s.settings.trackingStart = '2026-11-01';
    s.subjects = [{ id: 'm', name: 'رياضيات', color: '#38bdf8', archived: false }];
    s.sessions = [
      session('2026-11-10', 'morning', 60, { subject: 'm' }),
      session('2026-11-10', 'evening', 30),
      session('2026-11-11', 'morning', 30, { subject: 'm' }),
      session('2026-10-01', 'morning', 99),
    ];
    const r = buildReport(s, { from: '2026-11-01', to: TODAY, today: TODAY });
    expect(r.totals.mins).toBe(120);
    expect(r.totals.sessions).toBe(3);
    expect(r.totals.daysStudied).toBe(2);
    expect(r.totals.avgPerStudiedDay).toBe(60);
    expect(r.totals.bestDay).toEqual({ date: '2026-11-10', mins: 90 });
    expect(r.bySubject.map((x) => [x.name, x.mins, x.pct])).toEqual([['رياضيات', 90, 75], ['بدون مادة', 30, 25]]);
    expect(r.days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11']);
    expect(r.days[0].sessions).toHaveLength(2);
    expect(r.totals.daysInRange).toBe(13);
    expect(Object.values(r.statusCounts).reduce((a, b) => a + b, 0)).toBe(13);
  });
  it('نطاق فارغ لا يفشل', () => {
    const r = buildReport(createInitialState(TODAY), { from: '2026-11-01', to: TODAY, today: TODAY });
    expect(r.totals.mins).toBe(0);
    expect(r.totals.bestDay).toBeNull();
    expect(r.days).toEqual([]);
  });
});

describe('onboarding', () => {
  it('الأهلية', () => {
    const s = createInitialState(TODAY);
    expect(shouldShowOnboarding(s, false)).toBe(true);
    expect(shouldShowOnboarding(s, true)).toBe(false);
    expect(shouldShowOnboarding({ ...s, sessions: [session(TODAY, 'morning', 5)] }, false)).toBe(false);
    expect(shouldShowOnboarding({ ...s, subjects: [{ id: 'a', name: 'x' }] }, false)).toBe(false);
  });
});
