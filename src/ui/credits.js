// بصمة المطوّر: نص ثابت + رابط انستغرام خارجي آمن. textContent فقط.
import { DEV_CONTACT_TEXT, DEV_TAGLINE, INSTAGRAM_URL } from '../core/credits.js';

/** @param {string} [cls] */
export function createCredit(cls = 'dev-credit') {
  const box = document.createElement('p');
  box.className = cls;
  const tag = document.createElement('span');
  tag.className = 'dev-credit-tag';
  tag.textContent = `${DEV_TAGLINE} 💙`;
  const a = document.createElement('a');
  a.href = INSTAGRAM_URL;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.append(document.createTextNode(DEV_CONTACT_TEXT));
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = ' (رابط خارجي، يُفتح في تبويب جديد)';
  a.appendChild(sr);
  box.append(tag, a);
  return box;
}
