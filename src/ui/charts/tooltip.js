// تلميح واحد مشترك لكل الرسوم. المحتوى يُبنى بـ textContent دائماً (الأسماء بيانات غير موثوقة).
let box = null;

function ensure() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'chart-tip';
  box.setAttribute('role', 'status');
  box.hidden = true;
  document.body.appendChild(box);
  return box;
}

/**
 * @param {{title:string, rows:{label:string,value:string,color?:string}[], note?:string}} content
 * @param {{x:number,y:number}} at  إحداثيات الشاشة (clientX/clientY) للنقطة المستهدفة
 */
export function showTip(content, at) {
  const b = ensure();
  b.replaceChildren();
  const title = document.createElement('div');
  title.className = 'chart-tip-title';
  title.textContent = content.title;
  b.appendChild(title);
  for (const r of content.rows) {
    const row = document.createElement('div');
    row.className = 'chart-tip-row';
    if (r.color) {
      const key = document.createElement('span');
      key.className = 'chart-tip-key';
      key.style.background = r.color;
      row.appendChild(key);
    }
    const value = document.createElement('strong');
    value.textContent = r.value;
    const label = document.createElement('span');
    label.textContent = r.label;
    row.append(value, label);
    b.appendChild(row);
  }
  if (content.note) {
    const n = document.createElement('div');
    n.className = 'chart-tip-note';
    n.textContent = content.note;
    b.appendChild(n);
  }
  b.hidden = false;
  const w = b.offsetWidth; const h = b.offsetHeight;
  const vw = document.documentElement.clientWidth;
  let left = at.x - w / 2;
  left = Math.max(8, Math.min(left, vw - w - 8));
  let top = at.y - h - 12;
  if (top < 8) top = at.y + 18; // لا مساحة فوق النقطة: ضعه تحتها
  b.style.left = `${left + window.scrollX}px`;
  b.style.top = `${top + window.scrollY}px`;
}

export function hideTip() {
  if (box) box.hidden = true;
}
