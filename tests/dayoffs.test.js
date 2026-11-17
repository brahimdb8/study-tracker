import { describe, expect, it } from 'vitest';
import { addDayOff, buildDayOffIndex, removeDateFromDayOffs, removeDayOff, sanitizeDayOffs } from '../src/core/dayoffs.js';
import { dayOff } from './helpers.js';

describe('dayoffs', () => {
  it('إضافة مدى صالح', () => {
    const r = addDayOff([], { from: '2026-11-10', to: '2026-11-12', type: 'sick', note: ' زكام ' });
    expect(r.ok).toBe(true);
    expect(r.dayOff).toMatchObject({ from: '2026-11-10', to: '2026-11-12', type: 'sick', note: 'زكام' });
  });

  it('يرفض المدخلات الخاطئة', () => {
    expect(addDayOff([], { from: '2026-11-12', to: '2026-11-10', type: 'sick' }).ok).toBe(false);
    expect(addDayOff([], { from: 'bad', to: '2026-11-10', type: 'sick' }).ok).toBe(false);
    expect(addDayOff([], { from: '2026-11-10', to: '2026-11-10', type: 'party' }).ok).toBe(false);
    expect(addDayOff([], { from: '2026-01-01', to: '2027-12-31', type: 'vacation' }).ok).toBe(false); // أطول من 366
    expect(addDayOff([], { from: '2026-01-01', to: '2026-12-31', type: 'vacation' }).ok).toBe(true);  // 365 يوماً
  });

  it('الفهرس يغطي كل أيام المدى، ويعبر الأشهر', () => {
    const idx = buildDayOffIndex([dayOff('2026-10-30', '2026-11-02')]);
    expect([...idx.keys()]).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('عند التداخل يُفضَّل الأقدم في القائمة', () => {
    const a = dayOff('2026-11-10', '2026-11-12', 'sick', 'a');
    const b = dayOff('2026-11-11', '2026-11-13', 'exam', 'b');
    const idx = buildDayOffIndex([a, b]);
    expect(idx.get('2026-11-11').type).toBe('sick');
    expect(idx.get('2026-11-13').type).toBe('exam');
  });

  it('حذف مدى بالمعرّف', () => {
    const a = dayOff('2026-11-10', '2026-11-12');
    expect(removeDayOff([a], a.id).dayOffs).toEqual([]);
    expect(removeDayOff([a], 'x').ok).toBe(false);
  });

  it('إزالة يوم من مدى: يوم واحد / البداية / النهاية / الوسط', () => {
    expect(removeDateFromDayOffs([dayOff('2026-11-10', '2026-11-10')], '2026-11-10').dayOffs).toEqual([]);

    const start = removeDateFromDayOffs([dayOff('2026-11-10', '2026-11-14')], '2026-11-10').dayOffs;
    expect(start).toHaveLength(1);
    expect(start[0]).toMatchObject({ from: '2026-11-11', to: '2026-11-14' });

    const end = removeDateFromDayOffs([dayOff('2026-11-10', '2026-11-14')], '2026-11-14').dayOffs;
    expect(end[0]).toMatchObject({ from: '2026-11-10', to: '2026-11-13' });

    const mid = removeDateFromDayOffs([dayOff('2026-11-10', '2026-11-14')], '2026-11-12').dayOffs;
    expect(mid).toHaveLength(2);
    expect(mid[0]).toMatchObject({ from: '2026-11-10', to: '2026-11-11' });
    expect(mid[1]).toMatchObject({ from: '2026-11-13', to: '2026-11-14' });
    expect(mid[0].id).not.toBe(mid[1].id);
  });

  it('إزالة يوم غير مستثنى تُرفض', () => {
    expect(removeDateFromDayOffs([dayOff('2026-11-10', '2026-11-12')], '2026-11-20').ok).toBe(false);
  });

  it('sanitizeDayOffs يسقط التالف والمكرر', () => {
    const good = dayOff('2026-11-10', '2026-11-12');
    const { list, dropped } = sanitizeDayOffs([good, good, { id: 'x', from: '2026-11-12', to: '2026-11-10', type: 'sick' }, null]);
    expect(list).toHaveLength(1);
    expect(dropped).toBe(3);
  });
});
