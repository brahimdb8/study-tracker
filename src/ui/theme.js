// الثيم: تلقائي (يتبع النظام) / فاتح / داكن. تفضيل خاص بالجهاز في localStorage (لا يدخل مخطط البيانات
// ولا يُزامَن لاحقاً، فهو لا يخص حسابك). الألوان نفسها في styles/tokens.css.
// الدوال الأولى نقية (بلا DOM) فتُختبر في Vitest.
export const THEME_KEY = 'studyTracker:theme';
export const THEME_PREFS = ['auto', 'light', 'dark'];
export const THEME_LABEL = { auto: 'تلقائي', light: 'فاتح', dark: 'داكن' };
export const THEME_ICON = { auto: '🌓', light: '☀️', dark: '🌙' };

export const normalizeThemePref = (v) => (THEME_PREFS.includes(v) ? v : 'auto');
export const nextThemePref = (pref) => THEME_PREFS[(THEME_PREFS.indexOf(normalizeThemePref(pref)) + 1) % THEME_PREFS.length];

// الثيم الفعلي: التلقائي يتبع تفضيل النظام (الافتراضي عند غياب أي تفضيل: داكن، وهو مظهر التطبيق الأصلي)
export function resolveTheme(pref, systemPrefersLight) {
  const p = normalizeThemePref(pref);
  return p === 'auto' ? (systemPrefersLight ? 'light' : 'dark') : p;
}

export function readThemePref(storage) {
  try { return normalizeThemePref(storage.getItem(THEME_KEY)); } catch { return 'auto'; }
}

export function writeThemePref(storage, pref) {
  try {
    if (normalizeThemePref(pref) === 'auto') storage.removeItem(THEME_KEY);
    else storage.setItem(THEME_KEY, pref);
  } catch { /* التخزين محجوب: يبقى التغيير للجلسة الحالية */ }
}

// ---------- DOM ----------
export function applyThemePref(pref, root = document.documentElement) {
  const p = normalizeThemePref(pref);
  if (p === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', p);
}

function currentStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

// يحقن زر التبديل في كل خانة [data-slot="theme"] من الشريط (يضعه shell.js)، وإلا في .nav القديمة.
// يُستدعى من كل صفحة (تُعدّ الأزرار المتعددة نسخاً من التفضيل نفسه).
export function initThemeToggle() {
  const storage = currentStorage();
  let pref = storage ? readThemePref(storage) : 'auto';
  applyThemePref(pref);

  const hosts = [...document.querySelectorAll('[data-slot="theme"]')];
  if (!hosts.length) {
    const nav = document.querySelector('.nav');
    if (nav) hosts.push(nav);
  }
  if (!hosts.length) return;

  const buttons = hosts.map((host) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = host.matches('.nav') ? 'nav-link theme-toggle' : 'side-tool theme-toggle';
    btn.addEventListener('click', () => {
      pref = nextThemePref(pref);
      if (storage) writeThemePref(storage, pref);
      applyThemePref(pref);
      render();
    });
    host.appendChild(btn);
    return btn;
  });

  function render() {
    for (const btn of buttons) {
      btn.replaceChildren();
      const ico = document.createElement('span');
      ico.className = 'ico';
      ico.textContent = THEME_ICON[pref];
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = THEME_LABEL[pref];
      btn.append(ico, lbl);
      btn.setAttribute('aria-label', `المظهر: ${THEME_LABEL[pref]}. اضغط للتبديل إلى ${THEME_LABEL[nextThemePref(pref)]}`);
    }
  }
  // تغيير من تبويب آخر
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY || e.key === null) {
      pref = storage ? readThemePref(storage) : 'auto';
      applyThemePref(pref);
      render();
    }
  });
  render();
}
