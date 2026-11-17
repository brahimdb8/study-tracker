import { DELIMITERS, dailySummaryToCsv, exportFileName, resolveExportRange, sessionsToCsv } from '../core/export-csv.js';
import { todayStr } from '../core/dates.js';
import { showToast } from '../ui/toast.js';

/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);
const PREF_KEY = 'studyTracker:exportPrefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* لا يهم */ }
}

export function initExport(store) {
  const prefs = loadPrefs();
  const today = todayStr();
  if (DELIMITERS.includes(prefs.delimiter)) $('export-delimiter').value = prefs.delimiter;
  $('export-from').max = today;
  $('export-to').max = today;
  $('export-to').value = today;

  /** @returns {{from: string, to: string, error?: string}} */
  function range() {
    const state = store.getState();
    return /** @type {*} */ (resolveExportRange)($('export-range').value, {
      today, sessions: state.sessions, trackingStart: state.settings.trackingStart,
      from: $('export-from').value, to: $('export-to').value,
    });
  }

  function refresh() {
    const custom = $('export-range').value === 'custom';
    document.querySelectorAll('.export-custom').forEach((/** @type {HTMLElement} */ n) => { n.style.display = custom ? '' : 'none'; });
    const r = range();
    const el = $('export-summary');
    if (r.error) { el.textContent = r.error; return; }
    const n = store.getState().sessions.filter((s) => s.date >= r.from && s.date <= r.to).length;
    el.textContent = `ستُصدَّر ${n} جلسة من ${r.from} إلى ${r.to}.`;
  }

  function download(text, name) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function withRange(fn) {
    const r = range();
    if (r.error) { showToast(r.error, 'error'); return; }
    savePrefs({ delimiter: $('export-delimiter').value });
    fn(r);
  }

  $('export-csv-sessions').addEventListener('click', () => withRange((r) => {
    const state = store.getState();
    download(sessionsToCsv(state, { ...r, delimiter: $('export-delimiter').value }), exportFileName('sessions', r.from, r.to));
    showToast('تم تصدير جلسات CSV 📄', 'success');
  }));
  $('export-csv-days').addEventListener('click', () => withRange((r) => {
    download(dailySummaryToCsv(store.getState(), { ...r, today, delimiter: $('export-delimiter').value }), exportFileName('days', r.from, r.to));
    showToast('تم تصدير الملخص اليومي 📅', 'success');
  }));
  $('export-print').addEventListener('click', () => withRange((r) => {
    const url = `print.html?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`;
    window.open(url, '_blank', 'noopener');
  }));
  for (const id of ['export-range', 'export-from', 'export-to']) $(id).addEventListener('change', refresh);

  refresh();
  return refresh;
}
