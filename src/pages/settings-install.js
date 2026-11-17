// بطاقة «التطبيق والعمل دون اتصال»: حالة الجاهزية، رقم الإصدار، التثبيت، والتحقق من التحديث. نصوص بـ textContent فقط.
import { getInstallInfo, onInstallChange, promptInstall } from '../pwa/install.js';
import { checkForUpdate, isOfflineReady } from '../pwa/register.js';
import { showToast } from '../ui/toast.js';

/** @type {(id: string) => any} */ // عناصر DOM متنوعة فنوعها ديناميكي
const $ = (id) => document.getElementById(id);

const HINTS = {
  installed: 'التطبيق مثبّت ويعمل في نافذته الخاصة.',
  promptable: 'يمكنك تثبيته ليفتح من الشاشة الرئيسية أو سطح المكتب كتطبيق مستقل.',
  ios: 'على iPhone/iPad: اضغط زر المشاركة في سفاري ثم «إضافة إلى الشاشة الرئيسية».',
  manual: 'إن لم يظهر زر التثبيت، افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» إن توفّر.',
};

export function initInstall() {
  $('pwa-version').textContent = `إصدار التطبيق: ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'تطوير'}`;

  isOfflineReady().then((ready) => {
    $('pwa-status').textContent = ready
      ? '✅ جاهز للعمل دون اتصال: كل الصفحات محفوظة على جهازك، وبياناتك تبقى في المتصفح.'
      : 'العمل دون اتصال غير مفعّل بعد (يُفعَّل بعد أول تحميل كامل من الموقع المنشور، ولا يعمل في وضع التطوير).';
  });

  function renderInstall() {
    const { state } = getInstallInfo();
    $('pwa-install-btn').style.display = state === 'promptable' ? '' : 'none';
    $('pwa-install-hint').textContent = HINTS[state];
  }
  renderInstall();
  onInstallChange(renderInstall);

  $('pwa-install-btn').addEventListener('click', async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') showToast('تم تثبيت التطبيق 🎉', 'info');
    renderInstall();
  });

  $('pwa-update-btn').addEventListener('click', async () => {
    const ok = await checkForUpdate();
    showToast(ok ? 'تم التحقق: إن وُجد تحديث سيظهر إشعار «تحديث».' : 'التحقق من التحديث غير متاح الآن (يعمل على النسخة المنشورة وبالاتصال).', 'info');
  });
}
