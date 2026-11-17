// الجولة التعريفية المصوّرة (7 خطوات). تظهر تلقائياً للمستخدم الجديد، وتُعاد من الإعدادات في أي وقت.
// الخطوة الثانية تتيح اختيار المواد (اختياري) وتُحفظ عند الإنهاء؛ لا تمس الخطة الأسبوعية.
import { ONBOARDED_KEY, SUGGESTED_SUBJECTS, shouldShowOnboarding } from '../core/onboarding.js';
import { addSubject } from '../core/subjects.js';
import { buildTourSteps, tourKeyAction, tourNext, tourPrev } from '../core/tour.js';
import { tourArt } from './tour-art.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function readFlag() { try { return localStorage.getItem(ONBOARDED_KEY) === '1'; } catch { return false; } }
function setFlag() { try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* لا يهم */ } }

/**
 * يفتح الجولة فوراً (بغض النظر عن الأهلية).
 * @param {{ getState: () => any, commit: (s: any) => any }} store
 * @param {{ onDone?: () => void }} [opts]
 */
export function openTour(store, { onDone } = {}) {
  if (document.querySelector('.ob-backdrop')) return;
  const steps = buildTourSteps();
  const opener = /** @type {HTMLElement|null} */ (document.activeElement);
  const chosen = new Set();
  let step = 0;

  const backdrop = el('div', 'ob-backdrop');
  const dlg = el('div', 'ob-dialog');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'ob-title');
  backdrop.appendChild(dlg);

  function close(finished) {
    setFlag();
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (opener && opener.focus) opener.focus();
    if (finished && onDone) onDone();
  }

  function finish() {
    if (chosen.size) {
      let subjects = store.getState().subjects;
      for (const name of chosen) {
        const res = addSubject(subjects, { name });
        if (res.ok) subjects = res.subjects;
      }
      store.commit({ ...store.getState(), subjects });
    }
    close(true);
  }

  const go = (dir) => { step = dir === 'next' ? tourNext(step, steps.length) : tourPrev(step); draw(); };

  function focusables() { return [...dlg.querySelectorAll('button:not([disabled])')]; }
  function onKey(e) {
    const act = tourKeyAction(e.key);
    if (act === 'close') { e.preventDefault(); close(false); return; }
    if (act === 'next' || act === 'prev') {
      e.preventDefault();
      if (act === 'next' && step === steps.length - 1) return;
      go(act);
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function draw() {
    const s = steps[step];
    const last = step === steps.length - 1;
    const dots = el('div', 'ob-dots');
    dots.setAttribute('aria-hidden', 'true');
    steps.forEach((_, i) => dots.appendChild(el('span', `ob-dot${i === step ? ' on' : i < step ? ' done' : ''}`)));
    const count = el('p', 'ob-count', `الخطوة ${step + 1} من ${steps.length}`);
    count.setAttribute('aria-live', 'polite');
    const art = tourArt(s.art);
    const h = el('h2', '', s.title);
    h.id = 'ob-title';
    const kids = [dots, count];
    if (art) kids.push(art);
    kids.push(h, el('p', 'ob-body', s.body));
    if (s.subjects) {
      const chips = el('div', 'ob-chips');
      const existing = new Set(store.getState().subjects.map((x) => x.name));
      for (const name of SUGGESTED_SUBJECTS) {
        if (existing.has(name)) continue;
        const b = el('button', 'ob-chip', name);
        b.type = 'button';
        b.setAttribute('aria-pressed', chosen.has(name) ? 'true' : 'false');
        b.addEventListener('click', () => {
          if (chosen.has(name)) chosen.delete(name); else chosen.add(name);
          b.setAttribute('aria-pressed', chosen.has(name) ? 'true' : 'false');
        });
        chips.appendChild(b);
      }
      if (chips.children.length) kids.push(chips);
    }
    const actions = el('div', 'ob-actions');
    const left = el('div', 'ob-actions-side');
    const skip = el('button', 'btn btn-secondary btn-sm', last ? 'إغلاق' : 'تخطي الجولة');
    skip.type = 'button';
    skip.addEventListener('click', () => close(false));
    left.appendChild(skip);
    const right = el('div', 'ob-actions-side');
    const prev = el('button', 'btn btn-secondary btn-sm', '→ السابق');
    prev.type = 'button';
    prev.disabled = step === 0;
    prev.addEventListener('click', () => go('prev'));
    const next = el('button', 'btn btn-primary btn-sm', last ? 'ابدأ ✅' : 'التالي ←');
    next.type = 'button';
    next.addEventListener('click', () => { if (last) finish(); else go('next'); });
    right.append(prev, next);
    actions.append(left, right);
    kids.push(actions);
    dlg.replaceChildren(...kids);
    next.focus();
  }

  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(backdrop);
  draw();
}

/** الظهور التلقائي للمستخدم الجديد فقط. */
/** @param {*} store @param {{onDone?: () => void}} [opts] */
export function initOnboarding(store, { onDone } = {}) {
  if (!shouldShowOnboarding(store.getState(), readFlag())) return;
  openTour(store, { onDone });
}
