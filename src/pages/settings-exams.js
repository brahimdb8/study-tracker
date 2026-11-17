import { DAYS_AR, parseDate, todayStr } from '../core/dates.js';
import { addExam, countdownLabel, daysUntil, removeExam } from '../core/exams.js';
import { flushStoreNotices } from '../ui/status-ui.js';
import { showToast } from '../ui/toast.js';
import { showUndoToast } from '../ui/undo.js';

/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);

export function initExams(store) {
  function render() {
    const list = $('exams-list');
    list.replaceChildren();
    const today = todayStr();
    const items = [...store.getState().exams].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!items.length) {
      const p = document.createElement('div');
      p.className = 'empty-note';
      p.textContent = 'لا توجد امتحانات مضافة.';
      list.appendChild(p);
      return;
    }
    for (const e of items) {
      const row = document.createElement('div');
      row.className = 'dayoff-item';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const title = document.createElement('strong');
      title.textContent = e.name;
      const sub = document.createElement('span');
      sub.className = 'sub';
      const days = daysUntil(today, e.date);
      sub.textContent = `${DAYS_AR[parseDate(e.date).getDay()]} ${e.date} — ${days < 0 ? 'انتهى' : countdownLabel(days)}`;
      meta.append(title, sub);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-danger btn-sm';
      del.textContent = 'حذف';
      del.setAttribute('aria-label', `حذف امتحان ${e.name}`);
      del.addEventListener('click', () => {
        const before = store.getState().exams;
        const res = removeExam(before, e.id);
        if (!res.ok) { showToast(res.error, 'error'); return; }
        store.commit({ ...store.getState(), exams: res.exams });
        flushStoreNotices(store, showToast);
        render();
        showUndoToast('تم حذف الامتحان', () => {
          store.commit({ ...store.getState(), exams: before });
          render();
        });
      });
      row.append(meta, del);
      list.appendChild(row);
    }
  }

  $('exam-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const res = addExam(store.getState().exams, { name: $('exam-name').value, date: $('exam-date').value });
    if (!res.ok) { showToast(res.error, 'error'); return; }
    store.commit({ ...store.getState(), exams: res.exams });
    flushStoreNotices(store, showToast);
    $('exam-name').value = '';
    showToast('تمت إضافة الامتحان', 'success');
    render();
  });

  render();
  return render;
}
