import { MAX_FREEZES_PER_MONTH } from '../core/constants.js';
import { isValidDateStr, todayStr } from '../core/dates.js';
import { flushStoreNotices } from '../ui/status-ui.js';
import { showToast } from '../ui/toast.js';
import { showUndoToast } from '../ui/undo.js';
import { bootInfo } from '../data/boot.js';

/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);

export function initData(store, { onImported }) {
  function syncFields() {
    const s = store.getState().settings;
    $('tracking-start').max = todayStr();
    $('tracking-start').value = s.trackingStart;
    $('freezes-input').value = String(s.freezesPerMonth);
  }

  // تبادل الحالة مع نسخة ما قبل الاستيراد (يخدم تراجع الاستيراد والزر الدائم، وهو قابل للتراجع بدوره)
  function undoSwap() {
    const res = store.swapPreImportBackup();
    if (!res.ok) return res;
    flushStoreNotices(store, showToast);
    syncFields();
    onImported();
    syncRestoreButton();
    return { ok: true };
  }

  // حالة التخزين: IndexedDB (الافتراضي) أو الرجوع إلى localStorage. زر حذف النسخة القديمة بعد الترحيل بنقرتين
  function syncStorageInfo() {
    const idb = bootInfo.backend === 'idb';
    $('storage-status').textContent = idb
      ? 'التخزين: IndexedDB (أوسع وأمتن من التخزين القديم، ويعمل دون اتصال).'
      : 'التخزين: النسخة المحلية القديمة (تعذّر فتح IndexedDB في هذا المتصفح). صدّر نسخة احتياطية بانتظام.';
    let legacyLeft = false;
    try { legacyLeft = idb && localStorage.getItem('studyTracker:v2') !== null; } catch { /* محجوب */ }
    $('legacy-clear-row').style.display = legacyLeft ? '' : 'none';
  }
  let armed = false;
  $('legacy-clear-btn').addEventListener('click', () => {
    const btn = $('legacy-clear-btn');
    if (!armed) {
      armed = true;
      btn.textContent = '⚠️ اضغط مرة أخرى للتأكيد (بياناتك محفوظة في IndexedDB)';
      setTimeout(() => { armed = false; btn.textContent = '🧹 حذف النسخة القديمة من المتصفح'; }, 6000);
      return;
    }
    armed = false;
    const n = bootInfo.clearLegacyCopy();
    btn.textContent = '🧹 حذف النسخة القديمة من المتصفح';
    syncStorageInfo();
    showToast(n ? `حُذفت النسخة القديمة (${n} عناصر).` : 'لا توجد نسخة قديمة لحذفها.', 'info');
  });

  function syncRestoreButton() {
    $('restore-backup-row').style.display = store.hasPreImportBackup() ? '' : 'none';
  }

  $('restore-backup-btn').addEventListener('click', () => {
    const res = undoSwap();
    if (!res.ok) { showToast(res.error, 'error'); return; }
    showUndoToast('تمت استعادة النسخة السابقة ↩️', undoSwap, { timeoutMs: 10000 });
  });

  $('save-freezes').addEventListener('click', () => {
    const n = Number($('freezes-input').value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_FREEZES_PER_MONTH) {
      showToast(`أدخل عدداً صحيحاً بين 0 و${MAX_FREEZES_PER_MONTH}.`, 'error');
      return;
    }
    const state = store.getState();
    store.commit({ ...state, settings: { ...state.settings, freezesPerMonth: n } });
    flushStoreNotices(store, showToast);
    showToast(n === 0 ? 'تم تعطيل التجميد التلقائي' : `يُسمح بتجميد ${n} يوم في الشهر ❄️`, 'success');
  });

  $('save-tracking-start').addEventListener('click', () => {
    const value = $('tracking-start').value;
    if (!isValidDateStr(value) || value > todayStr()) {
      showToast('اختر تاريخاً صالحاً لا يتجاوز اليوم.', 'error');
      return;
    }
    const state = store.getState();
    store.commit({ ...state, settings: { ...state.settings, trackingStart: value } });
    flushStoreNotices(store, showToast);
    showToast('تم حفظ بداية التتبع', 'success');
  });

  $('export-btn').addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `study-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('تم تصدير النسخة الاحتياطية 📦', 'success');
  });

  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // بدل confirm(): يُطبَّق الاستيراد فوراً (بعد التحقق من الملف) وتُحفظ نسخة منك، ويمكن التراجع
      const res = store.importJSON(String(reader.result));
      if (!res.ok) { showToast(res.error, 'error'); return; }
      flushStoreNotices(store, showToast);
      syncFields();
      onImported();
      syncRestoreButton();
      showUndoToast('تم الاستيراد ✅ واستُبدلت بياناتك. نسختك السابقة محفوظة.', undoSwap, { timeoutMs: 10000 });
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  syncFields();
  syncRestoreButton();
  syncStorageInfo();
}
