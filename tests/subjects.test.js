import { describe, expect, it } from 'vitest';
import { SUBJECT_COLORS, activeSubjects, addSubject, removeSubject, sanitizeSubjects, subjectUsage, updateSubject } from '../src/core/subjects.js';
import { session } from './helpers.js';

const withTwo = () => {
  let list = [];
  list = addSubject(list, { name: 'رياضيات' }).subjects;
  list = addSubject(list, { name: 'فيزياء', color: SUBJECT_COLORS[3] }).subjects;
  return list;
};

describe('subjects', () => {
  it('إضافة مادة بلون افتراضي دوّار ولون مخصص', () => {
    const list = withTwo();
    expect(list).toHaveLength(2);
    expect(list[0].color).toBe(SUBJECT_COLORS[0]);
    expect(list[1].color).toBe(SUBJECT_COLORS[3]);
    expect(list[0].archived).toBe(false);
  });

  it('يرفض الاسم الفارغ والطويل والمكرر (دون اعتبار حالة الأحرف)', () => {
    const list = withTwo();
    expect(addSubject(list, { name: '   ' }).ok).toBe(false);
    expect(addSubject(list, { name: 'x'.repeat(31) }).ok).toBe(false);
    expect(addSubject(list, { name: 'رياضيات' }).ok).toBe(false);
    expect(addSubject([{ id: 'a', name: 'Math', color: '#38bdf8', archived: false }], { name: 'math' }).ok).toBe(false);
  });

  it('تنظيف المسافات الزائدة في الاسم', () => {
    expect(addSubject([], { name: '  علوم   الحاسوب ' }).subject.name).toBe('علوم الحاسوب');
  });

  it('تعديل الاسم واللون والأرشفة', () => {
    const list = withTwo();
    const id = list[0].id;
    const r = updateSubject(list, id, { name: 'جبر', color: SUBJECT_COLORS[5], archived: true });
    expect(r.subject).toMatchObject({ name: 'جبر', color: SUBJECT_COLORS[5], archived: true });
    expect(activeSubjects(r.subjects)).toHaveLength(1);
    expect(updateSubject(list, id, { name: 'فيزياء' }).ok).toBe(false);          // مكرر
    expect(updateSubject(list, id, { name: 'رياضيات' }).ok).toBe(true);          // نفس اسمه مسموح
    expect(updateSubject(list, 'nope', { name: 'x' }).ok).toBe(false);
  });

  it('لون غير معتمد يُتجاهل', () => {
    const list = withTwo();
    expect(updateSubject(list, list[0].id, { color: '#123456' }).subject.color).toBe(list[0].color);
  });

  it('لا يُحذف ما عليه جلسات، ويُحذف ما بلا جلسات', () => {
    const list = withTwo();
    const used = [session('2026-11-10', 'morning', 30, { subject: list[0].id })];
    expect(removeSubject(list, used, list[0].id).ok).toBe(false);
    const r = removeSubject(list, used, list[1].id);
    expect(r.ok).toBe(true);
    expect(r.subjects).toHaveLength(1);
    expect(subjectUsage(used, list[0].id)).toEqual({ count: 1, minutes: 30 });
  });

  it('حد أقصى 30 مادة', () => {
    let list = [];
    for (let i = 0; i < 30; i++) list = addSubject(list, { name: `م${i}` }).subjects;
    expect(addSubject(list, { name: 'زائدة' }).ok).toBe(false);
  });

  it('sanitizeSubjects: يسقط التالف والمكرر ويصلح اللون', () => {
    const { list, dropped } = sanitizeSubjects([
      { id: 'a', name: 'أ', color: 'bad', archived: 1 },
      { id: 'a', name: 'ب' },           // id مكرر
      { id: 'c', name: 'أ' },           // اسم مكرر
      { id: 'd' },                      // بلا اسم
      null,
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', archived: true });
    expect(SUBJECT_COLORS).toContain(list[0].color);
    expect(dropped).toBe(4);
    expect(sanitizeSubjects(undefined)).toEqual({ list: [], dropped: 0 });
  });
});
