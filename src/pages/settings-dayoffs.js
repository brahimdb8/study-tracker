import { DAY_OFF_TYPES, addDayOff, removeDayOff } from '../core/dayoffs.js';
import { diffDays, todayStr } from '../core/dates.js';
import { flushStoreNotices } from '../ui/status-ui.js';
import { showToast } from '../ui/toast.js';

/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);

export function initDayOffs(store) {
  function render() {
    const list = $('dayoffs-list');
    list.replaceChildren();
    const items = [...store.getState().dayOffs].sort((a, b) => (a.from < b.from ? 1 : -1));

    if (items.length === 0) {
      const p = document.createElement('div');
      p.className = 'empty-note';
      p.textContent = 'لا توجد أيام استثنائية.';
      list.appendChild(p);
      return;
    }

    for (const d of items) {
      const row = document.createElement('div');
      row.className = 'dayoff-item';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const title = document.createElement('strong');
      const days = diffDays(d.from, d.to) + 1;
      title.textContent = `${DAY_OFF_TYPES[d.type]} · ${days === 1 ? 'يوم واحد' : `${days} أيام`}`;
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = `${d.from === d.to ? d.from : `${d.from} ← ${d.to}`}${d.note ? ` — ${d.note}` : ''}`;
      meta.append(title, sub);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-danger btn-sm';
      del.textContent = 'حذف';
      del.addEventListener('click', () => {
        const res = removeDayOff(store.getState().dayOffs, d.id);
        if (!res.ok) { showToast(res.error, 'error'); return; }
        store.commit({ ...store.getState(), dayOffs: res.dayOffs });
        flushStoreNotices(store, showToast);
        showToast('تم الحذف', 'success');
        render();
      });

      row.append(meta, del);
      list.appendChild(row);
    }
  }

  const typeSel = $('dayoff-form-type');
  for (const [value, label] of Object.entries(DAY_OFF_TYPES)) typeSel.appendChild(new Option(label, value));
  $('dayoff-from').value = todayStr();
  $('dayoff-to').value = todayStr();

  $('dayoff-from').addEventListener('change', () => {
    if ($('dayoff-to').value < $('dayoff-from').value) $('dayoff-to').value = $('dayoff-from').value;
  });

  $('dayoff-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = addDayOff(store.getState().dayOffs, {
      from: $('dayoff-from').value,
      to: $('dayoff-to').value,
      type: typeSel.value,
      note: $('dayoff-form-note').value,
    });
    if (!res.ok) { showToast(res.error, 'error'); return; }
    store.commit({ ...store.getState(), dayOffs: res.dayOffs });
    flushStoreNotices(store, showToast);
    $('dayoff-form-note').value = '';
    showToast('تمت إضافة المدى الاستثنائي', 'success');
    render();
  });

  render();
  return render;
}
