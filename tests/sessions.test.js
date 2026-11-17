import { describe, expect, it } from 'vitest';
import { addSession, buildDayIndex, periodFromTimestamp, removeSession, sessionsForDate, updateSession } from '../src/core/sessions.js';

describe('sessions', () => {
  it('ثلاث جلسات 20 دقيقة = 60 دقيقة بالضبط (خطأ التقريب القديم 0.99)', () => {
    let list = [];
    for (let i = 0; i < 3; i++) list = addSession(list, { date: '2026-11-12', minutes: 20, period: 'morning' }).sessions;
    expect(buildDayIndex(list)['2026-11-12'].totalMins).toBe(60);
  });

  it('يرفض المدخلات الخاطئة', () => {
    expect(addSession([], { date: '2026-11-12', minutes: 0, period: 'morning' }).ok).toBe(false);
    expect(addSession([], { date: '2026-11-12', minutes: 1.5, period: 'morning' }).ok).toBe(false);
    expect(addSession([], { date: '2026-11-12', minutes: 30, period: 'night' }).ok).toBe(false);
    expect(addSession([], { date: 'bad', minutes: 30, period: 'morning' }).ok).toBe(false);
    expect(addSession([], { date: '2026-11-12', minutes: 1441, period: 'morning' }).ok).toBe(false);
  });

  it('يمنع تجاوز 24 ساعة في اليوم', () => {
    const a = addSession([], { date: '2026-11-12', minutes: 1000, period: 'morning' }).sessions;
    expect(addSession(a, { date: '2026-11-12', minutes: 500, period: 'evening' }).ok).toBe(false);
    expect(addSession(a, { date: '2026-11-13', minutes: 500, period: 'evening' }).ok).toBe(true);
  });

  it('تعديل وحذف جلسة', () => {
    const a = addSession([], { date: '2026-11-12', minutes: 30, period: 'morning', note: '  رياضيات ' });
    expect(a.session.note).toBe('رياضيات');
    const b = updateSession(a.sessions, a.session.id, { minutes: 45, period: 'evening' });
    expect(b.ok).toBe(true);
    expect(buildDayIndex(b.sessions)['2026-11-12']).toMatchObject({ eveningMins: 45, morningMins: 0 });
    expect(updateSession(b.sessions, 'nope', { minutes: 5 }).ok).toBe(false);
    const c = removeSession(b.sessions, a.session.id);
    expect(c.sessions).toHaveLength(0);
    expect(removeSession(c.sessions, a.session.id).ok).toBe(false);
  });

  it('التعديل لا يحتسب الجلسة نفسها مرتين عند فحص حد اليوم', () => {
    const a = addSession([], { date: '2026-11-12', minutes: 1400, period: 'morning' });
    expect(updateSession(a.sessions, a.session.id, { minutes: 1440 }).ok).toBe(true);
  });

  it('الفترة من وقت البدء: قبل 12 صباحاً وبعده مساءً', () => {
    expect(periodFromTimestamp(new Date(2026, 10, 12, 11, 59).getTime())).toBe('morning');
    expect(periodFromTimestamp(new Date(2026, 10, 12, 12, 0).getTime())).toBe('evening');
  });

  it('ترتيب جلسات اليوم: الصباح أولاً', () => {
    let list = addSession([], { date: '2026-11-12', minutes: 10, period: 'evening' }).sessions;
    list = addSession(list, { date: '2026-11-12', minutes: 20, period: 'morning' }).sessions;
    expect(sessionsForDate(list, '2026-11-12').map((s) => s.period)).toEqual(['morning', 'evening']);
  });
});
