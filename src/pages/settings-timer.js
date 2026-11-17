import { TIMER_LIMITS } from '../core/constants.js';
import { validateTimerSettings } from '../core/pomodoro.js';
import { notifyPermission, requestNotifyPermission } from '../ui/notify.js';
import { flushStoreNotices } from '../ui/status-ui.js';
import { showToast } from '../ui/toast.js';

/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);
const FIELDS = [['focusMins', 'timer-focus'], ['shortMins', 'timer-short'], ['longMins', 'timer-long'], ['longEvery', 'timer-every']];

const PERMISSION_HINT = {
  granted: 'إذن الإشعارات ممنوح ✅',
  denied: 'الإشعارات محظورة لهذا الموقع من إعدادات المتصفح؛ فعّلها من هناك أولاً.',
  default: 'سيُطلب منك الإذن عند الحفظ أو بزر «السماح بالإشعارات».',
  unsupported: 'متصفحك لا يدعم إشعارات الويب.',
};

export function initTimerSettings(store) {
  for (const [key, id] of FIELDS) {
    $(id).min = String(TIMER_LIMITS[key].min);
    $(id).max = String(TIMER_LIMITS[key].max);
  }

  function renderNotifyUi() {
    const perm = notifyPermission();
    $('timer-notify-hint').textContent = `${PERMISSION_HINT[perm]} تظهر الإشعارات والصفحة مفتوحة (حتى في تبويب خلفي)، ولا تصل والمتصفح مغلق.`;
    $('timer-notify-permission').style.display = perm === 'default' ? '' : 'none';
    $('timer-notify').disabled = perm === 'unsupported';
  }

  function render() {
    const t = store.getState().settings.timer;
    for (const [key, id] of FIELDS) $(id).value = String(t[key]);
    $('timer-sound').checked = t.sound;
    $('timer-notify').checked = t.notify && notifyPermission() === 'granted';
    renderNotifyUi();
  }

  function commit(value) {
    const state = store.getState();
    store.commit({ ...state, settings: { ...state.settings, timer: value } });
    flushStoreNotices(store, showToast);
  }

  $('timer-notify-permission').addEventListener('click', async () => {
    const perm = await requestNotifyPermission(); // الاستدعاء مباشر من النقرة
    if (perm === 'granted') {
      $('timer-notify').checked = true;
      showToast('تم منح إذن الإشعارات 🔔 — اضغط «حفظ» لتفعيلها.', 'success');
    } else {
      showToast('لم يُمنح إذن الإشعارات.', 'error');
    }
    renderNotifyUi();
  });

  $('save-timer').addEventListener('click', async () => {
    const res = validateTimerSettings({
      ...Object.fromEntries(FIELDS.map(([key, id]) => [key, Number($(id).value)])),
      sound: $('timer-sound').checked,
      notify: $('timer-notify').checked,
    });
    if (!res.ok) { showToast(/** @type {{error: string}} */ (res).error, 'error'); return; }

    const value = res.value;
    let note = '';
    if (value.notify) {
      let perm = notifyPermission();
      if (perm === 'default') perm = await requestNotifyPermission(); // أول await هو الطلب نفسه
      if (perm !== 'granted') {
        value.notify = false;
        $('timer-notify').checked = false;
        note = perm === 'unsupported' ? ' (الإشعارات غير مدعومة في متصفحك)' : ' (لم يُمنح إذن الإشعارات، فبقيت مطفأة)';
      }
    }
    commit(value);
    renderNotifyUi();
    showToast(`تم حفظ إعدادات المؤقت ⏱️${note}`, note ? 'info' : 'success');
  });

  render();
  return render;
}
