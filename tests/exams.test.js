import { describe, expect, it } from 'vitest';
import { MAX_EXAMS, MAX_EXAM_NAME } from '../src/core/constants.js';
import { addExam, countdownLabel, daysUntil, removeExam, sanitizeExams, upcomingExams } from '../src/core/exams.js';

describe('exams', () => {
  it('إضافة امتحان صالح وتنظيف الاسم', () => {
    const r = addExam([], { name: '  امتحان   الفيزياء ', date: '2026-12-01' });
    expect(r.ok).toBe(true);
    expect(r.exam).toMatchObject({ name: 'امتحان الفيزياء', date: '2026-12-01' });
    expect(r.exams).toHaveLength(1);
  });
  it('رفض اسم فارغ أو طويل أو تاريخ فاسد', () => {
    expect(addExam([], { name: ' ', date: '2026-12-01' }).ok).toBe(false);
    expect(addExam([], { name: 'ا'.repeat(MAX_EXAM_NAME + 1), date: '2026-12-01' }).ok).toBe(false);
    expect(addExam([], { name: 'ا'.repeat(MAX_EXAM_NAME), date: '2026-12-01' }).ok).toBe(true);
    expect(addExam([], { name: 'x', date: '2026-02-30' }).ok).toBe(false);
    expect(addExam([], { name: 'x' }).ok).toBe(false);
  });
  it('الحد الأقصى للامتحانات', () => {
    let list = [];
    for (let i = 0; i < MAX_EXAMS; i++) list = addExam(list, { name: `e${i}`, date: '2026-12-01' }).exams;
    expect(addExam(list, { name: 'زائد', date: '2026-12-01' }).ok).toBe(false);
  });
  it('الحذف', () => {
    const { exams, exam } = addExam([], { name: 'a', date: '2026-12-01' });
    expect(removeExam(exams, exam.id).exams).toEqual([]);
    expect(removeExam(exams, 'nope').ok).toBe(false);
  });
  it('الأيام المتبقية: اليوم 0، غداً 1، الماضي سالب، وعبر نهاية الشهر', () => {
    expect(daysUntil('2026-11-14', '2026-11-14')).toBe(0);
    expect(daysUntil('2026-11-14', '2026-11-15')).toBe(1);
    expect(daysUntil('2026-11-30', '2026-12-02')).toBe(2);
    expect(daysUntil('2026-11-14', '2026-11-13')).toBe(-1);
  });
  it('upcomingExams: يستبعد الماضي ويرتب الأقرب أولاً مع الأيام', () => {
    const exams = [
      { id: '1', name: 'ب', date: '2026-12-10' }, { id: '2', name: 'قديم', date: '2026-11-01' },
      { id: '3', name: 'أ', date: '2026-11-20' }, { id: '4', name: 'اليوم', date: '2026-11-14' },
    ];
    const up = upcomingExams(exams, '2026-11-14');
    expect(up.map((e) => e.id)).toEqual(['4', '3', '1']);
    expect(up.map((e) => e.days)).toEqual([0, 6, 26]);
  });
  it('نص العد التنازلي بصياغة عربية', () => {
    expect(countdownLabel(0)).toBe('اليوم');
    expect(countdownLabel(1)).toBe('غداً');
    expect(countdownLabel(2)).toBe('بعد يومين');
    expect(countdownLabel(3)).toBe('بعد 3 أيام');
    expect(countdownLabel(10)).toBe('بعد 10 أيام');
    expect(countdownLabel(11)).toBe('بعد 11 يوماً');
  });
  it('sanitizeExams: يسقط التالف والمكرر ويعدّه، وغياب الحقل ليس تالفاً', () => {
    const { list, dropped } = sanitizeExams([
      { id: 'a', name: 'جيد', date: '2026-12-01' }, { id: 'a', name: 'مكرر', date: '2026-12-02' },
      { id: 'b', name: '', date: '2026-12-01' }, { id: 'c', name: 'x', date: 'bad' }, null,
    ]);
    expect(list).toEqual([{ id: 'a', name: 'جيد', date: '2026-12-01' }]);
    expect(dropped).toBe(4);
    expect(sanitizeExams(undefined)).toEqual({ list: [], dropped: 0 });
    expect(sanitizeExams('x').dropped).toBe(1);
  });
});
