// اختصارات لوحة المفاتيح:
//   N جلسة جديدة · T بدء/إيقاف مؤقت/استئناف المؤقت · 1..4 الصفحات · ؟ نافذة المساعدة
// القواعد (resolveShortcut نقية ومختبرة):
//  - لا تعمل أثناء الكتابة في الحقول (input/textarea/select/contentEditable) ولا مع أي نافذة مفتوحة.
//  - لا تعمل مع Ctrl/⌘/Alt (فلا تتعارض مع Ctrl/⌘+Z للتراجع ولا اختصارات المتصفح). Shift مسموح لعلامة ؟ فقط.
//  - تعتمد e.code قبل e.key، فتعمل مع تخطيط لوحة المفاتيح العربي أيضاً.
//  - تنقل التقويم (الأسهم/Home/End/PageUp/PageDown) لا يتأثر: مفاتيحه مختلفة تماماً.
import { PAGES } from './nav-model.js';

export const HELP_ROWS = [
  { keys: ['N'], text: 'جلسة جديدة (تفتح نموذج الإضافة في الرئيسية)' },
  { keys: ['T'], text: 'المؤقت: بدء التركيز، أو إيقاف مؤقت/استئناف إن كان جارياً (الإنهاء والحفظ بالزر فقط)' },
  ...PAGES.map((p) => ({ keys: [p.key], text: `صفحة ${p.label}` })),
  { keys: ['Ctrl/⌘', 'Z'], text: 'التراجع عن آخر حذف أو استيراد معلّق' },
  { keys: ['؟'], text: 'عرض هذه النافذة' },
  { keys: ['← → ↑ ↓', 'Home', 'End'], text: 'التنقل بين أيام التقويم' },
  { keys: ['Esc'], text: 'إغلاق النوافذ' },
];

const CODE_DIGITS = { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4' };

/**
 * @param {{ key?: string, code?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean, repeat?: boolean, isComposing?: boolean }} ev
 * @param {{ typing?: boolean, dialogOpen?: boolean }} [ctx]
 * @returns {null | { type: 'new-session' } | { type: 'toggle-timer' } | { type: 'help' } | { type: 'goto', href: string, id: string }}
 */
export function resolveShortcut(ev, { typing = false, dialogOpen = false } = {}) {
  if (typing || dialogOpen || ev.repeat || ev.isComposing) return null;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null;

  const key = ev.key || '';
  const isHelp = key === '?' || key === '؟' || (ev.code === 'Slash' && ev.shiftKey);
  if (isHelp) return { type: 'help' };
  if (ev.shiftKey) return null;

  if (ev.code === 'KeyN' || key.toLowerCase() === 'n') return { type: 'new-session' };
  if (ev.code === 'KeyT' || key.toLowerCase() === 't') return { type: 'toggle-timer' };

  const digit = CODE_DIGITS[ev.code] || (/^[1-4]$/.test(key) ? key : null);
  if (digit) {
    const page = PAGES.find((p) => p.key === digit);
    if (page) return { type: 'goto', href: page.href, id: page.id };
  }
  return null;
}

/** هل الحدث موجَّه إلى عنصر كتابة؟ */
export function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute && el.getAttribute('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
}

// ---------- DOM ----------
let helpOpen = null;

export function showHelp() {
  if (helpOpen) return;
  const opener = /** @type {HTMLElement|null} */ (document.activeElement);
  const backdrop = document.createElement('div');
  backdrop.className = 'ob-backdrop help-backdrop';
  const dlg = document.createElement('div');
  dlg.className = 'ob-dialog help-dialog';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'help-title');
  const h = document.createElement('h2');
  h.id = 'help-title';
  h.textContent = '⌨️ اختصارات لوحة المفاتيح';
  const list = document.createElement('dl');
  list.className = 'help-list';
  for (const row of HELP_ROWS) {
    const dt = document.createElement('dt');
    row.keys.forEach((k, i) => {
      if (i) dt.append(' + ');
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      dt.appendChild(kbd);
    });
    const dd = document.createElement('dd');
    dd.textContent = row.text;
    list.append(dt, dd);
  }
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'الاختصارات لا تعمل أثناء الكتابة في الحقول.';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn-primary';
  close.textContent = 'إغلاق';
  dlg.append(h, list, note, close);
  backdrop.appendChild(dlg);
  document.body.appendChild(backdrop);

  function done() {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    helpOpen = null;
    if (opener && opener.focus) opener.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); return; }
    if (e.key === 'Tab') { e.preventDefault(); close.focus(); } // زر واحد فقط: الفخ بسيط
  }
  close.addEventListener('click', done);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) done(); });
  document.addEventListener('keydown', onKey, true);
  helpOpen = { done };
  close.focus();
}

const dialogIsOpen = () => !!document.querySelector('[aria-modal="true"]');

/**
 * @param {{ onNewSession?: () => void, onToggleTimer?: () => void }} [handlers] تمررها الرئيسية فقط
 */
export function initShortcuts({ onNewSession, onToggleTimer } = {}) {
  document.addEventListener('keydown', (e) => {
    const action = resolveShortcut(e, { typing: isTypingTarget(e.target), dialogOpen: dialogIsOpen() });
    if (!action) return;
    if (action.type === 'help') { e.preventDefault(); showHelp(); return; }
    if (action.type === 'goto') {
      const here = location.pathname.split('/').pop() || 'index.html';
      if (here === action.href) return;
      e.preventDefault();
      location.href = action.href;
      return;
    }
    if (action.type === 'new-session') {
      e.preventDefault();
      if (onNewSession) onNewSession(); else location.href = 'index.html#new';
      return;
    }
    if (action.type === 'toggle-timer') {
      e.preventDefault();
      if (onToggleTimer) onToggleTimer(); else location.href = 'index.html#timer';
    }
  });
}
