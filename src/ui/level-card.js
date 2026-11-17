// بطاقة المستوى: نسخة مصغّرة للشريط الجانبي ونسخة كاملة (مع تفصيل النقاط) لأعلى صفحة الأوسمة. textContent فقط.
const nf = new Intl.NumberFormat('ar-EG-u-nu-latn');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function bar(s, labelPrefix) {
  const b = el('div', 'progress lv-bar');
  b.setAttribute('role', 'progressbar');
  b.setAttribute('aria-valuemin', '0');
  b.setAttribute('aria-valuemax', '100');
  b.setAttribute('aria-valuenow', String(s.pct));
  b.setAttribute('aria-label', `${labelPrefix}: المستوى ${s.level}`);
  b.setAttribute('aria-valuetext', s.isMax ? 'بلغت أعلى مستوى' : `${s.pct}% نحو المستوى ${s.level + 1}`);
  const f = el('div', 'progress-fill');
  f.style.width = `${s.pct}%`;
  b.appendChild(f);
  return b;
}

const nextText = (s) => (s.isMax ? 'بلغت أعلى مستوى 👑' : `${nf.format(s.toNext)} نقطة للمستوى ${s.level + 1}`);

/** بطاقة مصغّرة (رابط إلى صفحة الأوسمة). @param {any} s ناتج levelSummary */
export function renderMiniLevel(root, s, href = 'achievements.html') {
  const a = el('a', 'lv-mini');
  a.href = href;
  const top = el('div', 'lv-mini-top');
  top.append(el('span', 'lv-badge', `${s.level}`), el('strong', 'lv-title', s.title));
  a.append(top, bar(s, 'تقدم المستوى'), el('span', 'lv-xp', `${nf.format(s.xp)} نقطة · ${nextText(s)}`));
  root.replaceChildren(a);
}

/** شريحة صغيرة للشريط العلوي (جوال). */
export function renderLevelChip(root, s, href = 'achievements.html') {
  const a = el('a', 'lv-chip');
  a.href = href;
  a.append(el('span', 'lv-badge', `${s.level}`), el('span', 'lv-chip-t', s.title));
  root.replaceChildren(a);
}

/** البطاقة الكاملة مع تفصيل النقاط. */
export function renderLevelCard(root, s) {
  const card = el('section', 'level-card');
  card.setAttribute('aria-label', 'مستواك ونقاط الخبرة');
  const head = el('div', 'lv-head');
  head.append(el('span', 'lv-badge lv-badge-lg', `${s.level}`));
  const names = el('div', 'lv-names');
  names.append(el('h2', 'lv-name', `المستوى ${s.level} · ${s.title}`), el('p', 'lv-sub', `${nf.format(s.xp)} نقطة خبرة`));
  head.appendChild(names);
  card.append(head, bar(s, 'تقدم المستوى'), el('p', 'lv-next', nextText(s)));

  const det = el('details', 'lv-details');
  det.appendChild(el('summary', '', 'كيف حُسبت نقاطي؟'));
  const ul = el('ul', 'lv-parts');
  for (const p of s.parts) {
    const li = el('li');
    li.append(el('span', 'lv-part-name', p.label), el('span', 'lv-part-xp', `+${nf.format(p.xp)}`));
    ul.appendChild(li);
  }
  const total = el('li', 'lv-total');
  total.append(el('span', '', 'المجموع'), el('span', 'lv-part-xp', nf.format(s.xp)));
  ul.appendChild(total);
  det.append(ul, el('p', 'hint', 'النقاط والأوسمة تُحسب من سجلك مباشرة: حذف جلسة يخفّض نقاطها، وإن كانت هي سبب وسام سُحب الوسام مع نقاطه.'));
  card.appendChild(det);
  root.replaceChildren(card);
}
