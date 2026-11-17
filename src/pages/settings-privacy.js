// خيار رفض إحصاءات الزيارات (يظهر فقط إن كان الموقع مبنياً بمفتاح تحليلات).
import { hasVisitorStats, readOptOut, writeOptOut } from '../ui/visitor-stats.js';

export function initVisitorStatsSetting() {
  const sec = document.getElementById('visitor-stats');
  if (!sec || !hasVisitorStats) return;
  sec.hidden = false;
  const box = /** @type {HTMLInputElement} */ (document.getElementById('visitor-stats-off'));
  box.checked = readOptOut();
  box.addEventListener('change', () => writeOptOut(box.checked));
}
