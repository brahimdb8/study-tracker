// هيكل التطبيق: شريط جانبي ثابت على الحاسوب (≥1024px)، وشريط سفلي على الجوال مع شريط علوي صغير.
// يُبنى من قائمة الصفحات الواحدة (nav-model.js) فلا تتكرر <nav> في كل HTML. نصوص ثابتة بـ textContent فقط.
import { BRAND, PAGES, pageIdFromPath } from './nav-model.js';
import { showHelp } from './shortcuts.js';
import { levelSummary } from '../core/levels.js';
import { todayStr } from '../core/dates.js';
import { createCredit } from './credits.js';
import { renderLevelChip, renderMiniLevel } from './level-card.js';
import { initThemeToggle } from './theme.js';
import { registerServiceWorker } from '../pwa/register.js';
import { initVisitorStats } from './visitor-stats.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function slot(kind) {
  const s = el('span', 'side-slot');
  s.setAttribute('data-slot', kind);
  return s;
}

function helpButton() {
  const b = el('button', 'side-tool');
  b.type = 'button';
  b.setAttribute('aria-label', 'اختصارات لوحة المفاتيح (؟)');
  b.setAttribute('data-help-btn', '');
  b.append(el('span', 'ico', '⌨️'), el('span', 'lbl', 'الاختصارات'), Object.assign(el('kbd', ''), { textContent: '؟' }));
  b.querySelector('kbd').setAttribute('aria-hidden', 'true');
  b.addEventListener('click', showHelp);
  return b;
}

/** @param {{ active?: string, store?: { getState: () => any, subscribe?: (fn: () => void) => any } }} [opts] */
export function initShell({ active, store } = {}) {
  registerServiceWorker();
  initVisitorStats();
  const current = active || pageIdFromPath(location.pathname);

  const skip = el('a', 'skip-link', 'تخطَّ إلى المحتوى');
  skip.href = '#main';

  // شريط علوي صغير (الجوال فقط): الاسم + الثيم + المساعدة
  const top = el('header', 'topbar');
  top.append(el('span', 'brand', BRAND));
  const topTools = el('div', 'topbar-tools');
  const chipBox = el('span', 'lv-chip-box');
  topTools.append(chipBox, slot('theme'));
  top.appendChild(topTools);

  const side = el('aside', 'sidebar');
  side.setAttribute('aria-label', 'القائمة الرئيسية');
  side.appendChild(el('div', 'brand', BRAND));

  const nav = el('nav', 'side-nav');
  nav.setAttribute('aria-label', 'التنقل بين الصفحات');
  for (const p of PAGES) {
    const a = el('a', `side-link${p.id === current ? ' active' : ''}`);
    a.href = p.href;
    a.setAttribute('aria-keyshortcuts', p.key);
    if (p.id === current) a.setAttribute('aria-current', 'page');
    const kbd = el('kbd', '', p.key);
    kbd.setAttribute('aria-hidden', 'true');
    a.append(el('span', 'ico', p.icon), el('span', 'lbl', p.label), kbd);
    nav.appendChild(a);
  }
  side.appendChild(nav);

  const foot = el('div', 'side-foot');
  const miniBox = el('div', 'lv-mini-box');
  foot.append(miniBox, slot('theme'), helpButton(), createCredit('dev-credit dev-credit-side'));
  side.appendChild(foot);

  document.body.prepend(skip, top, side);
  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'main';
  if (main) {
    main.setAttribute('tabindex', '-1');
    // سطر أسفل المحتوى: دائماً على الجوال، وعلى الحاسوب في الرئيسية والإعدادات فقط (الشريط الجانبي يحمل البصمة)
    const foot2 = createCredit('dev-credit dev-credit-foot');
    if (current === 'home' || current === 'settings') foot2.setAttribute('data-desktop', '');
    main.appendChild(foot2);
  }

  initThemeToggle();

  if (store) {
    const refresh = () => {
      try {
        const lv = levelSummary(store.getState(), todayStr());
        renderMiniLevel(miniBox, lv);
        renderLevelChip(chipBox, lv);
      } catch { /* بطاقة المستوى تحسينية: لا تُسقط الصفحة */ }
    };
    refresh();
    if (typeof store.subscribe === 'function') store.subscribe(refresh);
  }
}
