import '../data/boot.js';
import '../styles/main.css';
import { CATEGORY_LABEL, CATEGORY_ORDER, badgeViews } from '../core/achievements.js';
import { todayStr } from '../core/dates.js';
import { getStore } from '../core/store.js';
import { levelSummary } from '../core/levels.js';
import { badgeIcon } from '../ui/badge-icons.js';
import { renderLevelCard } from '../ui/level-card.js';
import { initUnlockAnnouncer } from '../ui/celebrate.js';
import { initShell } from '../ui/shell.js';
import { initShortcuts } from '../ui/shortcuts.js';
import { flushStoreNotices } from '../ui/status-ui.js';
import { showToast } from '../ui/toast.js';

const store = getStore();
/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const UNIT_TEXT = { يوم: 'يوماً', يوماً: 'يوماً', ساعة: 'ساعة', مواد: 'مواد', أيام: 'أيام', جلسة: 'جلسة', جلسات: 'جلسات', دقيقة: 'دقيقة', '%': '%' };

function progressText(b) {
  if (b.unit === '%') return `${b.value}/${b.target}%`;
  return `${b.value}/${b.target} ${UNIT_TEXT[b.unit] || b.unit}`;
}

function card(b) {
  const open = !!b.unlockedOn;
  const li = el('li', `badge-card cat-${b.cat} ${open ? 'is-open' : 'is-locked'}`);
  if (open) li.appendChild(el('span', 'badge-pill', '✓ مفتوح'));
  const top = el('div', 'badge-top');
  const icon = el('span', 'badge-icon');
  const svg = badgeIcon(b.icon, { size: 30 });
  if (svg) icon.appendChild(svg);
  const titles = el('div', 'badge-titles');
  titles.append(el('strong', 'badge-title', b.title), el('span', 'badge-state', open ? `فُتح في ${b.unlockedOn}` : 'مقفل'));
  top.append(icon, titles);
  li.append(top, el('p', 'badge-desc', b.desc));

  if (!open) {
    const bar = el('div', 'progress');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(b.target));
    bar.setAttribute('aria-valuenow', String(b.value));
    bar.setAttribute('aria-valuetext', progressText(b));
    bar.setAttribute('aria-label', `تقدم وسام ${b.title}`);
    const fill = el('div', 'progress-fill');
    fill.style.width = `${b.pct}%`;
    bar.appendChild(fill);
    li.append(bar, el('p', 'badge-progress', progressText(b)));
  }
  return li;
}

function render() {
  const views = badgeViews(store.getState(), todayStr());
  const opened = views.filter((v) => v.unlockedOn).length;
  renderLevelCard($('ach-level'), levelSummary(store.getState(), todayStr()));
  $('ach-summary').textContent = `فتحت ${opened} من ${views.length} وساماً. الأوسمة تُحسب من سجلك الحالي: إن حذفت جلسات كانت سبب وسام يُسحب تلقائياً، ويعود إن تحقق شرطه من جديد. انقطاع السلسلة الجارية لا يسحب وسام سلسلة سبق تحقيقها.`;
  const root = $('ach-groups');
  root.replaceChildren();
  for (const cat of CATEGORY_ORDER) {
    const group = views.filter((v) => v.cat === cat);
    const sec = el('section', 'badge-group');
    const h = el('h2', 'badge-group-title', CATEGORY_LABEL[cat]);
    const ul = el('ul', 'badge-grid');
    ul.setAttribute('aria-label', CATEGORY_LABEL[cat]);
    for (const b of group) ul.appendChild(card(b));
    sec.append(h, ul);
    root.appendChild(sec);
  }
}

initShell({ active: 'achievements', store });
initShortcuts();
window.addEventListener('storage', (e) => { if (e.key === null || e.key.startsWith('studyTracker:v2')) { store.reload(); render(); } });
store.subscribe(render);
render();
flushStoreNotices(store, showToast);
initUnlockAnnouncer(store);
