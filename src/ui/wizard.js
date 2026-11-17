// معالج الترحيب التفاعلي للمستخدم الجديد: ترحيب ← المواد ← الساعات الأسبوعية ← ملخص.
// كل النصوص عبر textContent، ولا innerHTML. التطبيق على الحالة يتم بدالة نقية في core/wizard.js.
import { ONBOARDED_KEY, SUGGESTED_SUBJECTS, shouldShowOnboarding } from '../core/onboarding.js';
import { MAX_SUBJECT_NAME } from '../core/constants.js';
import { DEFAULT_WEEKLY_HOURS, applyWizard, cleanSubjectNames, distributeWeekly, parseWeeklyHours } from '../core/wizard.js';
import { DAYS_AR, WEEK_ORDER } from '../core/dates.js';
import { openTour } from './onboarding.js';
import { showToast } from './toast.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function readFlag() { try { return localStorage.getItem(ONBOARDED_KEY) === '1'; } catch { return false; } }
function setFlag() { try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* لا يهم */ } }

const STEPS = ['welcome', 'subjects', 'hours', 'summary'];

/**
 * @param {{ getState: () => any, commit: (s: any) => any }} store
 * @param {{ onDone?: () => void }} [opts]
 */
export function openWizard(store, { onDone } = {}) {
  if (document.querySelector('.ob-backdrop')) return;
  const opener = /** @type {HTMLElement|null} */ (document.activeElement);
  /** @type {string[]} */
  let picked = [];
  let hoursText = String(DEFAULT_WEEKLY_HOURS);
  let step = 0;

  const backdrop = el('div', 'ob-backdrop');
  const dlg = el('div', 'ob-dialog');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'ob-title');
  dlg.dataset.wizard = '1';
  backdrop.appendChild(dlg);

  function close() {
    setFlag();
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (opener && opener.focus) opener.focus();
  }

  function finish(thenTour) {
    const parsed = parseWeeklyHours(hoursText);
    const res = applyWizard(store.getState(), { subjects: picked, weeklyMins: parsed.ok ? parsed.mins : null });
    store.commit(res.state);
    close();
    const bits = [];
    if (res.addedSubjects) bits.push(`${res.addedSubjects} مادة`);
    if (res.planApplied && parsed.ok) bits.push(`خطة ${parsed.hours} ساعة أسبوعياً`);
    showToast(bits.length ? `تم الإعداد: ${bits.join(' + ')} ✅` : 'تم تخطي الإعداد، يمكنك ضبطه من الإعدادات.', 'success');
    if (onDone) onDone();
    if (thenTour) openTour(store, { onDone });
  }

  function focusables() { return [...dlg.querySelectorAll('button:not([disabled]), input')]; }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const header = (title) => {
    const dots = el('div', 'ob-dots');
    dots.setAttribute('aria-hidden', 'true');
    STEPS.forEach((_, i) => dots.appendChild(el('span', `ob-dot${i === step ? ' on' : i < step ? ' done' : ''}`)));
    const count = el('p', 'ob-count', `الخطوة ${step + 1} من ${STEPS.length}`);
    count.setAttribute('aria-live', 'polite');
    const h = el('h2', '', title);
    h.id = 'ob-title';
    return [dots, count, h];
  };

  /** @returns {HTMLElement[]} */
  function body() {
    if (STEPS[step] === 'welcome') {
      return [
        ...header('مرحباً بك في متتبع المذاكرة 👋'),
        el('p', 'ob-body', 'سنجهّز الموقع لك في أقل من دقيقة: تضيف موادك الدراسية، ثم تحدد كم ساعة تخطط لمذاكرتها أسبوعياً، فنبني لك خطة جاهزة. بياناتك تبقى في متصفحك فقط، وتستطيع تغيير كل شيء لاحقاً من الإعدادات.'),
      ];
    }
    if (STEPS[step] === 'subjects') {
      const kids = [...header('ما موادك الدراسية؟'), el('p', 'ob-body', 'اختر من المقترحات أو اكتب اسم مادتك وأضفها. يمكنك تخطي هذه الخطوة وإضافة المواد لاحقاً.')];
      const chips = el('div', 'ob-chips');
      for (const name of SUGGESTED_SUBJECTS) {
        const b = el('button', 'ob-chip', name);
        b.type = 'button';
        b.setAttribute('aria-pressed', picked.includes(name) ? 'true' : 'false');
        b.addEventListener('click', () => {
          picked = picked.includes(name) ? picked.filter((x) => x !== name) : cleanSubjectNames([...picked, name]);
          b.setAttribute('aria-pressed', picked.includes(name) ? 'true' : 'false');
          renderPicked();
        });
        chips.appendChild(b);
      }
      kids.push(chips);
      const row = el('div', 'ob-add-row');
      const label = el('label', 'field-label', 'مادة أخرى');
      label.htmlFor = 'ob-subject-input';
      const input = el('input');
      input.type = 'text'; input.id = 'ob-subject-input'; input.maxLength = MAX_SUBJECT_NAME;
      const add = el('button', 'btn btn-secondary btn-sm', 'إضافة');
      add.type = 'button';
      const err = el('p', 'ob-error', '');
      err.setAttribute('role', 'alert');
      const doAdd = () => {
        const v = input.value.trim().replace(/\s+/g, ' ');
        if (!v) return;
        if (picked.some((x) => x.toLocaleLowerCase() === v.toLocaleLowerCase())) { err.textContent = 'أضفت هذه المادة بالفعل.'; return; }
        err.textContent = '';
        picked = cleanSubjectNames([...picked, v]);
        input.value = '';
        for (const c of chips.children) { if (c.textContent === v) c.setAttribute('aria-pressed', 'true'); }
        renderPicked();
        input.focus();
      };
      add.addEventListener('click', doAdd);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
      row.append(label, input, add);
      const list = el('ul', 'ob-picked');
      list.setAttribute('aria-label', 'المواد المختارة');
      function renderPicked() {
        list.replaceChildren(...picked.map((n) => {
          const li = el('li', 'ob-picked-item');
          li.appendChild(el('span', '', n));
          const rm = el('button', 'ob-remove', '✕');
          rm.type = 'button';
          rm.setAttribute('aria-label', `إزالة ${n}`);
          rm.addEventListener('click', () => {
            picked = picked.filter((x) => x !== n);
            for (const c of chips.children) { if (c.textContent === n) c.setAttribute('aria-pressed', 'false'); }
            renderPicked();
          });
          li.appendChild(rm);
          return li;
        }));
      }
      renderPicked();
      kids.push(row, err, list);
      return kids;
    }
    if (STEPS[step] === 'hours') {
      const kids = [...header('كم ساعة تخطط للمذاكرة أسبوعياً؟'), el('p', 'ob-body', 'اكتب مجموع ساعاتك المخططة في الأسبوع، وسنوزعها على أيامه (نهاية الأسبوع أثقل). تعدّل التفاصيل لاحقاً من الإعدادات.')];
      const label = el('label', 'field-label', 'ساعات الأسبوع');
      label.htmlFor = 'ob-hours-input';
      const input = el('input');
      input.type = 'text'; input.inputMode = 'decimal'; input.id = 'ob-hours-input'; input.value = hoursText;
      input.setAttribute('aria-describedby', 'ob-hours-preview');
      const preview = el('div', 'ob-preview');
      preview.id = 'ob-hours-preview';
      preview.setAttribute('aria-live', 'polite');
      const draw = () => {
        hoursText = input.value;
        const p = parseWeeklyHours(hoursText);
        if ('error' in p) { preview.replaceChildren(el('p', 'ob-error', p.error)); next.disabled = true; return; }
        next.disabled = false;
        const t = distributeWeekly(p.mins);
        const table = el('table', 'ob-table');
        const cap = el('caption', 'sr-only', 'توزيع الساعات على أيام الأسبوع');
        const tr = el('tr'); const tr2 = el('tr');
        for (const dow of WEEK_ORDER) {
          tr.appendChild(el('th', '', DAYS_AR[dow]));
          const m = t[dow].morningMins + t[dow].eveningMins;
          tr2.appendChild(el('td', '', `${Math.round((m / 60) * 10) / 10}`));
        }
        table.append(cap, tr, tr2);
        preview.replaceChildren(el('p', 'ob-body', `الإجمالي: ${p.hours} ساعة، بمعدل ${Math.round((p.hours / 7) * 10) / 10} ساعة يومياً.`), table);
      };
      input.addEventListener('input', draw);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !next.disabled) { e.preventDefault(); go(1); } });
      kids.push(label, input, preview);
      queueMicrotask(draw);
      return kids;
    }
    const p = parseWeeklyHours(hoursText);
    const kids = [...header('كل شيء جاهز ✅'), el('p', 'ob-body', 'هذا ما سنضبطه لك:')];
    const ul = el('ul', 'ob-summary');
    ul.appendChild(el('li', '', picked.length ? `المواد (${picked.length}): ${picked.join('، ')}` : 'المواد: لم تختر مواداً (يمكنك إضافتها لاحقاً)'));
    ul.appendChild(el('li', '', p.ok ? `الخطة: ${p.hours} ساعة أسبوعياً، تسري من اليوم` : 'الخطة: الافتراضية'));
    kids.push(ul);
    return kids;
  }

  /** @type {HTMLButtonElement} */
  let next;
  const go = (d) => { step = Math.min(STEPS.length - 1, Math.max(0, step + d)); draw(); };

  function draw() {
    const last = step === STEPS.length - 1;
    const kids = body();
    const actions = el('div', 'ob-actions');
    const left = el('div', 'ob-actions-side');
    const skip = el('button', 'btn btn-secondary btn-sm', last ? 'إغلاق' : 'تخطي الإعداد');
    skip.type = 'button';
    skip.addEventListener('click', () => (last ? finish(false) : close()));
    left.appendChild(skip);
    const right = el('div', 'ob-actions-side');
    const prev = el('button', 'btn btn-secondary btn-sm', '→ السابق');
    prev.type = 'button'; prev.disabled = step === 0;
    prev.addEventListener('click', () => go(-1));
    next = /** @type {HTMLButtonElement} */ (el('button', 'btn btn-primary btn-sm', last ? 'ابدأ المذاكرة ✅' : 'التالي ←'));
    next.type = 'button'; next.id = 'ob-next';
    next.addEventListener('click', () => { if (last) finish(false); else go(1); });
    right.append(prev);
    if (last) {
      const tour = el('button', 'btn btn-secondary btn-sm', 'ابدأ مع جولة سريعة');
      tour.type = 'button';
      tour.addEventListener('click', () => finish(true));
      right.append(tour);
    }
    right.append(next);
    actions.append(left, right);
    kids.push(actions);
    dlg.replaceChildren(...kids);
    const firstInput = dlg.querySelector('input');
    (firstInput || next).focus();
  }

  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(backdrop);
  draw();
}

/** الظهور التلقائي للمستخدم الجديد فقط. */
/** @param {*} store @param {{onDone?: () => void}} [opts] */
export function initWizard(store, { onDone } = {}) {
  if (!shouldShowOnboarding(store.getState(), readFlag())) return;
  openWizard(store, { onDone });
}
