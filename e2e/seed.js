// بيانات بذرية حتمية (تاريخ ثابت) تُحقن في localStorage قبل تحميل الصفحة.
// تُمرَّر عبر sanitizeState فإن كانت غير صالحة يفشل الاختبار فوراً.
import { addDays, todayStr } from '../src/core/dates.js';
import { createInitialState, sanitizeState } from '../src/core/store.js';

export const FIXED_NOW = new Date('2026-11-16T10:00:00');
export const TODAY = todayStr(FIXED_NOW);

let n = 0;
function sess(date, period, minutes, subject = null) {
  n += 1;
  return { id: `seed-${n}`, date, period, minutes, startedAt: null, source: 'manual', subject, note: '', createdAt: n };
}

/** حالة فارغة (مستخدم جديد) */
export function emptyState() {
  return createInitialState(TODAY);
}

/** حالة غنية: ~40 يوماً من الجلسات، مادتان، امتحان قادم */
export function richState() {
  const state = createInitialState(TODAY);
  state.settings.trackingStart = addDays(TODAY, -40);
  state.subjects = [
    { id: 'sub-math', name: 'الرياضيات', color: '#38bdf8', archived: false },
    { id: 'sub-phys', name: 'الفيزياء', color: '#22c55e', archived: false },
  ];
  state.exams = [{ id: 'exam-1', name: 'امتحان الفصل', date: addDays(TODAY, 21) }];
  for (let i = 40; i >= 1; i--) {
    const d = addDays(TODAY, -i);
    if (i % 7 === 0) continue; // أيام راحة بلا جلسات
    state.sessions.push(sess(d, 'morning', 60 + (i % 4) * 15, i % 2 ? 'sub-math' : 'sub-phys'));
    state.sessions.push(sess(d, 'evening', 45 + (i % 3) * 20, i % 3 ? 'sub-phys' : 'sub-math'));
  }
  const res = sanitizeState(JSON.parse(JSON.stringify(state)), TODAY);
  if (!res.ok) throw new Error(`بيانات بذرية غير صالحة: ${res.error}`);
  return res.state;
}
