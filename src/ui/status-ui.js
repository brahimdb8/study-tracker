// ربط حالات النواة (core) بألوان العرض ونصوصه
export const STATUS_CLASS = {
  completed: 'bg-success',
  compensated: 'bg-compensated',
  failed: 'bg-danger',
  frozen: 'bg-frozen',
  excused: 'bg-excused',
  rest: 'bg-rest',
  default: 'bg-default',
  future: 'bg-future',
};

export const STATUS_LABEL = {
  completed: 'مكتمل',
  compensated: 'معوّض',
  failed: 'غير مكتمل',
  frozen: 'مجمّد (حماية للسلسلة)',
  excused: 'يوم استثنائي',
  rest: 'يوم راحة (هدفه صفر)',
  default: 'بدون حكم',
  future: 'مستقبل',
};

// رمز نصي لكل حالة: المعنى لا يعتمد على اللون وحده (المصدر الوحيد لكل الصفحات)
export const STATUS_SYMBOL = {
  completed: '✓',
  compensated: '≈',
  failed: '✕',
  frozen: '❄',
  excused: '☾',
  rest: '–',
  default: '',
  future: '',
};

// تسميات قصيرة لدليل الألوان
export const STATUS_SHORT = {
  completed: 'مكتمل',
  compensated: 'معوّض',
  failed: 'غير مكتمل',
  frozen: 'مجمّد',
  excused: 'استثنائي',
  rest: 'راحة',
  default: 'بدون حكم',
  future: 'مستقبل',
};

export function statusText(status) {
  const sym = STATUS_SYMBOL[status];
  return sym ? `${sym} ${STATUS_LABEL[status]}` : STATUS_LABEL[status];
}

// دليل الحالات (لون + رمز + اسم) يُبنى من المصدر نفسه، textContent فقط
export function renderStatusLegend(container) {
  const frag = document.createDocumentFragment();
  for (const status of ['completed', 'compensated', 'failed', 'frozen', 'excused', 'rest', 'default', 'future']) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const box = document.createElement('span');
    box.className = `color-box ${STATUS_CLASS[status]}`;
    box.setAttribute('aria-hidden', 'true');
    box.textContent = STATUS_SYMBOL[status];
    const label = document.createElement('span');
    label.textContent = STATUS_SHORT[status];
    item.append(box, label);
    frag.appendChild(item);
  }
  container.replaceChildren(frag);
}

export const QUALITY_OPTIONS = [
  ['none', 'بدون تقييم'],
  ['excellent', '🔥 ممتاز وعالي التركيز'],
  ['good', '🟢 جيد ومثمر'],
  ['average', '🟡 متوسط (يحتاج تحسين)'],
  ['poor', '🔴 ضعيف / مشتت'],
];

// تنبيهات التخزين التي تجمعها طبقة store (ترحيل، بيانات تالفة...)
export function flushStoreNotices(store, showToast) {
  for (const n of store.takeNotices()) showToast(n, 'info');
}

// نقطة لون المادة + اسمها (textContent فقط)
export function subjectChip(subject) {
  const chip = document.createElement('span');
  chip.className = 'subject-chip';
  const dot = document.createElement('span');
  dot.className = 'subject-dot';
  dot.style.background = subject ? subject.color : 'var(--faint)';
  const name = document.createElement('span');
  name.textContent = subject ? subject.name : 'بدون مادة';
  chip.append(dot, name);
  return chip;
}
