// إشعارات منبثقة بدل alert (لا تعطّل الواجهة ولا توقف المؤقت)
export function showToast(message, type = 'info') {
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
  t.className = `toast toast-${type}`;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add('toast-hide');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}
