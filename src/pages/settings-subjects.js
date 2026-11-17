import { formatMins } from '../core/format.js';
import { SUBJECT_COLORS, addSubject, removeSubject, subjectUsage, updateSubject } from '../core/subjects.js';
import { flushStoreNotices } from '../ui/status-ui.js';
import { showToast } from '../ui/toast.js';

/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);

export function initSubjects(store) {
  let newColor = SUBJECT_COLORS[0];

  function commit(patch) {
    store.commit({ ...store.getState(), ...patch });
    flushStoreNotices(store, showToast);
  }

  function renderSwatches() {
    const box = $('subject-swatches');
    box.replaceChildren();
    for (const color of SUBJECT_COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `swatch${color === newColor ? ' active' : ''}`;
      b.style.background = color;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(color === newColor));
      b.setAttribute('aria-label', `اللون ${color}`);
      b.addEventListener('click', () => { newColor = color; renderSwatches(); });
      box.appendChild(b);
    }
  }

  function render() {
    const { subjects, sessions } = store.getState();
    const list = $('subjects-list');
    list.replaceChildren();

    if (subjects.length === 0) {
      const p = document.createElement('div');
      p.className = 'empty-note';
      p.textContent = 'لا توجد مواد بعد.';
      list.appendChild(p);
      return;
    }

    for (const s of subjects) {
      const usage = subjectUsage(sessions, s.id);
      const row = document.createElement('div');
      row.className = `subject-row${s.archived ? ' archived' : ''}`;

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'subject-dot clickable';
      dot.style.background = s.color;
      dot.title = 'انقر لتغيير اللون';
      dot.setAttribute('aria-label', `تغيير لون ${s.name}`);
      dot.addEventListener('click', () => {
        const next = SUBJECT_COLORS[(SUBJECT_COLORS.indexOf(s.color) + 1) % SUBJECT_COLORS.length];
        const res = updateSubject(store.getState().subjects, s.id, { color: next });
        if (res.ok) { commit({ subjects: res.subjects }); render(); }
      });

      const name = document.createElement('input');
      name.type = 'text';
      name.maxLength = 30;
      name.value = s.name;
      name.setAttribute('aria-label', 'اسم المادة');
      name.addEventListener('change', () => {
        const res = updateSubject(store.getState().subjects, s.id, { name: name.value });
        if (!res.ok) { showToast(res.error, 'error'); name.value = s.name; return; }
        commit({ subjects: res.subjects });
        showToast('تم تعديل الاسم', 'success');
        render();
      });

      const meta = document.createElement('span');
      meta.className = 'subject-meta';
      meta.textContent = usage.count > 0 ? `${usage.count} جلسة · ${formatMins(usage.minutes)}` : 'بلا جلسات';

      const archive = document.createElement('button');
      archive.type = 'button';
      archive.className = 'btn btn-secondary btn-sm';
      archive.textContent = s.archived ? 'استعادة' : 'أرشفة';
      archive.addEventListener('click', () => {
        const res = updateSubject(store.getState().subjects, s.id, { archived: !s.archived });
        if (res.ok) { commit({ subjects: res.subjects }); render(); }
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-danger btn-sm';
      del.textContent = 'حذف';
      del.disabled = usage.count > 0;
      del.title = usage.count > 0 ? 'عليها جلسات؛ استخدم الأرشفة' : 'حذف المادة';
      del.addEventListener('click', () => {
        const res = removeSubject(store.getState().subjects, store.getState().sessions, s.id);
        if (!res.ok) { showToast(res.error, 'error'); return; }
        commit({ subjects: res.subjects });
        showToast('تم حذف المادة', 'success');
        render();
      });

      row.append(dot, name, meta, archive, del);
      list.appendChild(row);
    }
  }

  $('subject-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = addSubject(store.getState().subjects, { name: $('subject-name').value, color: newColor });
    if (!res.ok) { showToast(res.error, 'error'); return; }
    commit({ subjects: res.subjects });
    $('subject-name').value = '';
    newColor = SUBJECT_COLORS[res.subjects.length % SUBJECT_COLORS.length];
    renderSwatches();
    showToast('تمت إضافة المادة', 'success');
    render();
  });

  renderSwatches();
  render();
  return render;
}
