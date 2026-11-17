// إشعار بزر إجراء (مثل «تحديث»). لا يسجَّل ضمن Ctrl+Z، ويبقى حتى النقر أو الإغلاق (قرار المستخدم لا مؤقت).
// نصوص ثابتة عبر textContent فقط.

/**
 * @param {string} message
 * @param {string} actionLabel
 * @param {() => void} onAction
 * @returns {{ close: () => void }}
 */
export function showActionToast(message, actionLabel, onAction) {
  let box = document.getElementById('toast-container');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-container';
    box.className = 'toast-container';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast toast-info toast-action';
  const text = document.createElement('span');
  text.textContent = message;
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'undo-btn toast-action-btn';
  go.textContent = actionLabel;
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'undo-btn toast-dismiss-btn';
  dismiss.setAttribute('aria-label', 'إغلاق الإشعار');
  dismiss.textContent = '✕';
  t.append(text, go, dismiss);
  box.appendChild(t);

  let done = false;
  function close() {
    if (done) return;
    done = true;
    t.classList.add('toast-hide');
    setTimeout(() => t.remove(), 300);
  }
  go.addEventListener('click', () => { close(); onAction(); });
  dismiss.addEventListener('click', close);
  return { close };
}
