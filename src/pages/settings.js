import '../data/boot.js';
import '../styles/main.css';
import { getStore } from '../core/store.js';
import { flushStoreNotices } from '../ui/status-ui.js';
import { initUnlockAnnouncer } from '../ui/celebrate.js';
import { initShell } from '../ui/shell.js';
import { initShortcuts } from '../ui/shortcuts.js';
import { showToast } from '../ui/toast.js';
import { initData } from './settings-data.js';
import { initDayOffs } from './settings-dayoffs.js';
import { initExams } from './settings-exams.js';
import { initMotion } from './settings-motion.js';
import { initPlan } from './settings-plan.js';
import { initSubjects } from './settings-subjects.js';
import { initExport } from './settings-export.js';
import { openTour } from '../ui/onboarding.js';
import { initTimerSettings } from './settings-timer.js';
import { initInstall } from './settings-install.js';
import { initVisitorStatsSetting } from './settings-privacy.js';

const store = getStore();
initShell({ active: 'settings', store });
initShortcuts();

const renderPlan = initPlan(store);
const renderSubjects = initSubjects(store);
const renderDayOffs = initDayOffs(store);
const renderExams = initExams(store);
initMotion();
document.getElementById('tour-replay').addEventListener('click', () => openTour(store, { onDone: () => renderSubjects() }));
const renderTimerSettings = initTimerSettings(store);
initInstall();
initVisitorStatsSetting();
const renderExport = initExport(store);

// بعد الاستيراد تُعاد رسم كل الأقسام من الحالة الجديدة
initData(store, {
  onImported() {
    renderPlan();
    renderSubjects();
    renderDayOffs();
    renderExams();
    renderTimerSettings();
    renderExport();
  },
});

flushStoreNotices(store, showToast);
initUnlockAnnouncer(store);
