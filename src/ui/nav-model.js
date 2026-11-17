// نموذج التنقل المشترك (نقي، بلا DOM): قائمة الصفحات وأرقام اختصاراتها.
// يستعمله shell.js (الشريط) وshortcuts.js (الاختصارات)، فلا يتكرر في أي مكان آخر.
export const PAGES = [
  { id: 'home', href: 'index.html', label: 'الرئيسية', icon: '🏠', key: '1' },
  { id: 'analytics', href: 'analytics.html', label: 'التحليلات', icon: '📊', key: '2' },
  { id: 'achievements', href: 'achievements.html', label: 'الأوسمة', icon: '🏅', key: '3' },
  { id: 'settings', href: 'settings.html', label: 'الإعدادات', icon: '⚙️', key: '4' },
];

export const BRAND = '📚 متتبع المذاكرة';

/** معرّف الصفحة الحالية من اسم الملف (index.html أو الجذر = home). */
export function pageIdFromPath(pathname) {
  const file = String(pathname || '').split('/').pop() || 'index.html';
  const hit = PAGES.find((p) => p.href === file);
  return hit ? hit.id : 'home';
}
