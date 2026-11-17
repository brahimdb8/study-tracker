// إشعار «تراجع» بدل confirm(): الإجراء يُنفَّذ فوراً، ويبقى زر التراجع متاحاً لبضع ثوانٍ.
// - يتوقف العدّ التنازلي أثناء تمرير المؤشر أو تركيز لوحة المفاتيح على الإشعار (لا يختفي تحت يدك).
// - Ctrl/⌘+Z خارج حقول الإدخال يتراجع عن آخر إجراء معلّق (طريق لمستخدم لوحة المفاتيح).
// - الرسالة داخل منطقة aria-live فيُعلَن الإجراء لقارئ الشاشة.
import { showToast } from './toast.js';

const pending = []; // الأحدث في النهاية

function getBox() {
  let box = document.getElementById('toast-container');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-container';
    box.className = 'toast-container';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  return box;
}

/**
 * @param {string} message نص الإجراء المنفَّذ ("تم حذف الجلسة")
 * @param {() => ({ok: boolean, error?: string} | void)} onUndo ينفّذ التراجع؛ يُعيد {ok:false,error} عند الفشل
 * @param {{timeoutMs?: number, actionLabel?: string}} [opts]
 */
export function showUndoToast(message, onUndo, { timeoutMs = 6000, actionLabel = 'تراجع' } = {}) {
  const box = getBox();
  const t = document.createElement('div');
  t.className = 'toast toast-info toast-undo';
  const text = document.createElement('span');
  text.textContent = message;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'undo-btn';
  btn.textContent = `↩️ ${actionLabel}`;
  t.append(text, btn);
  box.appendChild(t);

  let timer = null;
  let done = false;
  const entry = { undo: null };

  function close() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    const i = pending.indexOf(entry);
    if (i >= 0) pending.splice(i, 1);
    t.classList.add('toast-hide');
    setTimeout(() => t.remove(), 300);
  }
  function arm() {
    clearTimeout(timer);
    timer = setTimeout(close, timeoutMs);
  }
  function undo() {
    if (done) return;
    close();
    const res = onUndo();
    if (res && res.ok === false) showToast(res.error || 'تعذّر التراجع.', 'error');
    else showToast('تم التراجع ↩️', 'success');
  }

  entry.undo = undo;
  pending.push(entry);
  btn.addEventListener('click', undo);
  t.addEventListener('mouseenter', () => clearTimeout(timer));
  t.addEventListener('mouseleave', arm);
  t.addEventListener('focusin', () => clearTimeout(timer));
  t.addEventListener('focusout', arm);
  arm();
  return { undo, dismiss: close };
}

// Ctrl/⌘+Z: آخر إجراء معلّق (لا يعمل داخل الحقول كي لا يعطّل تراجع الكتابة الأصلي)
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
  const target = /** @type {HTMLElement|null} */ (e.target);
  const tag = target && target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
  const last = pending[pending.length - 1];
  if (!last) return;
  e.preventDefault();
  last.undo();
});
