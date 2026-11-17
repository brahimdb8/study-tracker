// نافذة «بطاقة إنجازاتي»: اختيار أسبوع/شهر، إخفاء أسماء المواد (افتراضي)، معاينة، حفظ أو مشاركة PNG.
import { buildShareModel, shareFileName } from '../core/share-card.js';
import { todayStr } from '../core/dates.js';
import { canvasToBlob, drawShareCard } from './share-card-render.js';
import { showToast } from './toast.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function openShareDialog(store) {
  const opener = /** @type {HTMLElement|null} */ (document.activeElement);
  /** @type {'week'|'month'} */
  let period = 'week';
  let hideSubjects = true;

  const backdrop = el('div', 'ob-backdrop');
  const dlg = el('div', 'ob-dialog share-dialog');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'share-title');
  const h = el('h2', '', '🖼️ بطاقة إنجازاتي');
  h.id = 'share-title';

  const periodRow = el('div', 'filter-row');
  periodRow.setAttribute('role', 'group');
  periodRow.setAttribute('aria-label', 'الفترة');
  /** @type {['week'|'month', string][]} */
  const periodDefs = [['week', 'هذا الأسبوع'], ['month', 'هذا الشهر']];
  const chips = periodDefs.map(([v, label]) => {
    const b = el('button', 'chip', label);
    b.type = 'button';
    b.addEventListener('click', () => { period = v; draw(); });
    periodRow.appendChild(b);
    return [v, b];
  });

  const hideRow = el('label', 'check-row');
  const hideBox = document.createElement('input');
  hideBox.type = 'checkbox';
  hideBox.checked = true;
  hideBox.addEventListener('change', () => { hideSubjects = hideBox.checked; draw(); });
  hideRow.append(hideBox, el('span', '', 'إخفاء أسماء المواد من البطاقة'));

  const canvas = document.createElement('canvas');
  canvas.className = 'share-canvas';
  canvas.setAttribute('role', 'img');

  const actions = el('div', 'backup-actions');
  const save = el('button', 'btn btn-primary', 'حفظ كصورة ⬇️');
  save.type = 'button';
  const share = el('button', 'btn btn-secondary', 'مشاركة 📤');
  share.type = 'button';
  const close = el('button', 'btn btn-secondary', 'إغلاق');
  close.type = 'button';
  actions.append(save, share, close);

  dlg.append(h, periodRow, hideRow, canvas, actions);
  backdrop.appendChild(dlg);
  document.body.appendChild(backdrop);

  let model = null;
  function draw() {
    model = buildShareModel(store.getState(), todayStr(), { period, hideSubjects });
    drawShareCard(canvas, model);
    canvas.setAttribute('aria-label', `${model.title} (${model.rangeLabel}): ${model.doneDays} أيام أنجزت هدفها، وسلسلة ${model.streak}.`);
    for (const [v, b] of chips) b.setAttribute('aria-pressed', String(v === period));
  }

  async function blob() {
    const b = await canvasToBlob(canvas);
    if (!b) showToast('تعذّر إنشاء الصورة.', 'error');
    return b;
  }
  save.addEventListener('click', async () => {
    const b = await blob();
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = shareFileName(model);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('تم حفظ الصورة', 'success');
  });
  share.addEventListener('click', async () => {
    const b = await blob();
    if (!b) return;
    const file = new File([b], shareFileName(model), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: model.title }); } catch { /* ألغى المستخدم */ }
    } else {
      showToast('المشاركة المباشرة غير مدعومة هنا؛ استعمل «حفظ كصورة».', 'info');
    }
  });

  function done() {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (opener && opener.focus) opener.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); return; }
    if (e.key === 'Tab') { // فخ تركيز بسيط داخل النافذة
      const f = [...dlg.querySelectorAll('button, input')].filter((n) => !n.disabled);
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  close.addEventListener('click', done);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) done(); });
  document.addEventListener('keydown', onKey, true);
  draw();
  chips[0][1].focus();
}
