import { DAYS_AR, WEEK_ORDER, todayStr } from '../core/dates.js';
import { formatMins } from '../core/format.js';
import { cancelPendingChange, currentVersion, pendingVersion, schedulePlanChange } from '../core/plan.js';
import { flushStoreNotices } from '../ui/status-ui.js';
import { showToast } from '../ui/toast.js';

/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);
const toHours = (mins) => Math.round((mins / 60) * 100) / 100;
const toMins = (hours) => Math.round((Number(hours) || 0) * 60);

function readTargetsFromForm() {
  /** @type {Record<number, {morningMins: number, eveningMins: number}>} */
  const targets = {};
  for (const dow of WEEK_ORDER) {
    targets[dow] = {
      morningMins: Math.min(1440, Math.max(0, toMins($(`plan-m-${dow}`).value))),
      eveningMins: Math.min(1440, Math.max(0, toMins($(`plan-e-${dow}`).value))),
    };
  }
  return targets;
}

function readWeeklyFromForm() {
  const raw = $('plan-weekly').value.trim();
  return raw === '' ? null : toMins(raw);
}

function updateTotals() {
  let sum = 0;
  for (const dow of WEEK_ORDER) {
    const total = toMins($(`plan-m-${dow}`).value) + toMins($(`plan-e-${dow}`).value);
    sum += total;
    $(`plan-t-${dow}`).textContent = formatMins(total);
  }
  $('plan-weekly-hint').textContent = `(تلقائي = ${formatMins(sum)})`;
}

export function initPlan(store) {
  function render() {
    const today = todayStr();
    const { plan } = store.getState();
    const pending = pendingVersion(plan, today);
    const shown = pending || currentVersion(plan, today);

    $('plan-intro').textContent =
      'عدّل الساعات المستهدفة لكل يوم. التعديل لا يمسّ الأسبوع الجاري ولا الأيام الماضية، بل يسري من بداية الأسبوع القادم (الإثنين). الهدف الإرشادي للصباح والمساء لا يؤثر على التقييم، والمجموع هو المعتمد.';

    const rows = document.createDocumentFragment();
    for (const dow of WEEK_ORDER) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = DAYS_AR[dow];

      const mk = (id, mins, label) => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number'; input.id = id; input.min = '0'; input.max = '24'; input.step = '0.25';
        input.value = String(toHours(mins));
        input.setAttribute('aria-label', label);
        input.addEventListener('input', updateTotals);
        td.appendChild(input);
        return td;
      };
      const total = document.createElement('td');
      total.id = `plan-t-${dow}`;
      tr.append(
        name,
        mk(`plan-m-${dow}`, shown.targets[dow].morningMins, `${DAYS_AR[dow]} صباحاً`),
        mk(`plan-e-${dow}`, shown.targets[dow].eveningMins, `${DAYS_AR[dow]} مساءً`),
        total,
      );
      rows.appendChild(tr);
    }
    $('plan-rows').replaceChildren(rows);
    $('plan-weekly').value = shown.weeklyMins ? String(toHours(shown.weeklyMins)) : '';
    updateTotals();

    if (pending) {
      $('pending-banner').style.display = 'flex';
      $('pending-text').textContent = `⏳ لديك تعديل مجدول يبدأ يوم ${pending.effectiveFrom}. الجدول أدناه يعرضه.`;
    } else {
      $('pending-banner').style.display = 'none';
    }
  }

  $('plan-weekly').addEventListener('input', updateTotals);

  $('save-plan').addEventListener('click', () => {
    const state = store.getState();
    const { plan, effectiveFrom } = schedulePlanChange(state.plan, readTargetsFromForm(), todayStr(), readWeeklyFromForm());
    store.commit({ ...state, plan });
    flushStoreNotices(store, showToast);
    showToast(
      effectiveFrom
        ? `تمت الجدولة: تسري الخطة الجديدة من ${effectiveFrom} 🗓️`
        : 'لا فرق عن الخطة السارية، ولم يُجدوَل شيء.',
      effectiveFrom ? 'success' : 'info',
    );
    render();
  });

  $('cancel-pending').addEventListener('click', () => {
    const state = store.getState();
    store.commit({ ...state, plan: cancelPendingChange(state.plan, todayStr()) });
    showToast('أُلغي التعديل المجدول', 'success');
    render();
  });

  render();
  return render;
}
