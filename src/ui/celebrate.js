// الحيوية البصرية: تفضيل الحركة (لكل جهاز) + احتفال خفيف + إعلان فتح الأوسمة.
// الحركة تُحترم دائماً: prefers-reduced-motion من النظام، ومفتاح «تعطيل الحركة» في الإعدادات.
// الاحتفال بلا مكتبات وبلا innerHTML: عناصر span تُحرَّك بـ WAAPI من خطة نقية وتُزال تلقائياً.
import { badgeById } from '../core/achievements.js';
import { CELEBRATED_KEY, detectGoalCrossings, parseCelebrated, planCelebration } from '../core/celebrations.js';
import { badgeCheer, buildFxPlan } from '../core/celebration-fx.js';
import { badgeIcon } from './badge-icons.js';
import { showToast } from './toast.js';

export const MOTION_KEY = 'studyTracker:motion'; // لكل جهاز، لا يُزامَن في المرحلة 9
export const MOTION_PREFS = ['auto', 'off'];

/** @param {unknown} v */
export function normalizeMotionPref(v) { return v === 'off' ? 'off' : 'auto'; }

/** هل تُسمح الحركة؟ pref: 'auto'|'off'، systemReduced: نتيجة prefers-reduced-motion. */
export function motionAllowed(pref, systemReduced) {
  return normalizeMotionPref(pref) !== 'off' && !systemReduced;
}

function storage() { try { return window.localStorage; } catch { return null; } }

export function readMotionPref(st = storage()) {
  try { return normalizeMotionPref(st && st.getItem(MOTION_KEY)); } catch { return 'auto'; }
}
export function writeMotionPref(pref, st = storage()) {
  try { if (st) { if (pref === 'off') st.setItem(MOTION_KEY, 'off'); else st.removeItem(MOTION_KEY); } } catch { /* لا يهم */ }
}
export function applyMotionPref(pref, root = document.documentElement) {
  if (normalizeMotionPref(pref) === 'off') root.setAttribute('data-motion', 'off');
  else root.removeAttribute('data-motion');
}
const systemReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
export const motionOk = () => motionAllowed(readMotionPref(), systemReduced());

function fxColors() {
  const cs = getComputedStyle(document.documentElement);
  return [1, 2, 3, 4, 5].map((i) => cs.getPropertyValue(`--fx-${i}`).trim() || '#f59e0b');
}

/**
 * احتفال بصري: أشرطة رقيقة + كرات ضوء + بريق (خطة نقية في core/celebration-fx.js تُحوَّل إلى WAAPI).
 * يُتجاهل كلياً إن كانت الحركة معطّلة.
 * @param {'day'|'week'|'badge'} [kind]
 */
export function burst(kind = 'day') {
  if (!motionOk()) return false;
  const plan = buildFxPlan({ kind, width: window.innerWidth, height: window.innerHeight, seed: (Date.now() % 100000) + 1 });
  const colors = fxColors();
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  const anims = [];
  for (const p of plan.pieces) {
    const n = document.createElement('span');
    n.className = `fx-${p.kind}`;
    n.style.width = `${p.w}px`;
    n.style.height = `${p.h}px`;
    n.style.setProperty('--fx-c', colors[p.color % colors.length]);
    layer.appendChild(n);
    if (typeof n.animate !== 'function') continue;
    const frames = p.frames.map((f) => ({
      offset: f.t,
      opacity: f.op,
      transform: `translate(${f.x}px, ${f.y}px) translate(-50%, -50%) rotate(${f.rot}deg) scale(${f.sc}, ${f.sc * f.sy})`,
    }));
    anims.push(n.animate(frames, { duration: p.duration, delay: p.delay, easing: 'linear', fill: 'both' }));
  }
  document.body.appendChild(layer);
  const remove = () => layer.remove();
  setTimeout(remove, plan.totalMs + 300);
  Promise.allSettled(anims.map((a) => a.finished)).then(remove);
  return true;
}

/** بطاقة تهنئة دافئة داخل منطقة حيّة (role=status) لتُقرأ لقارئ الشاشة. */
function showCheer({ title, message, icon }) {
  let live = document.getElementById('cheer-live');
  if (!live) {
    live = document.createElement('div');
    live.id = 'cheer-live';
    live.className = 'cheer-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
  }
  const card = document.createElement('div');
  card.className = 'cheer-card';
  if (icon) {
    const ic = document.createElement('span');
    ic.className = 'cheer-icon';
    ic.appendChild(icon);
    card.appendChild(ic);
  }
  const txt = document.createElement('div');
  const h = document.createElement('strong');
  h.className = 'cheer-title';
  h.textContent = title;
  const m = document.createElement('p');
  m.className = 'cheer-msg';
  m.textContent = message;
  txt.append(h, m);
  card.appendChild(txt);
  live.appendChild(card);
  if (typeof card.animate === 'function') {
    card.animate([
      { opacity: 0, transform: 'translateY(-26px) scale(0.94)' },
      { opacity: 1, transform: 'translateY(4px) scale(1.02)', offset: 0.55 },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
  }
  setTimeout(() => {
    const out = typeof card.animate === 'function'
      ? card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px) scale(0.98)' }], { duration: 450, fill: 'forwards' })
      : null;
    if (out) out.finished.then(() => card.remove(), () => card.remove()); else card.remove();
  }, 3600);
}

/**
 * احتفال: بطاقة تهنئة + احتفال بصري. مع تعطيل الحركة: إشعار نصي فقط (يُقرأ دائماً).
 * @param {string} message
 * @param {{ title?: string, kind?: 'day'|'week'|'badge', icon?: Element|null }} [opts]
 */
export function celebrate(message, { title = 'أحسنت! 🎉', kind = 'day', icon = null } = {}) {
  if (!motionOk()) { showToast(message, 'success'); return; }
  showCheer({ title, message, icon });
  burst(kind);
}

// ---------- أهداف اليوم/الأسبوع ----------
function celebratedStorage() { return storage(); }

/** يُستدعى من الرئيسية بعد كل commit: يحتفل عند عبور الهدف أثناء الاستخدام الحي فقط (مرة لكل يوم/أسبوع). */
export function celebrateGoals(before, after, today) {
  const crossing = detectGoalCrossings(before, after, today);
  if (!crossing.day && !crossing.week) return;
  const st = celebratedStorage();
  let raw = null;
  try { raw = st && st.getItem(CELEBRATED_KEY); } catch { /* لا يهم */ }
  const plan = planCelebration(parseCelebrated(raw), crossing, today);
  if (!plan.day && !plan.week) return;
  try { if (st) st.setItem(CELEBRATED_KEY, JSON.stringify(plan.record)); } catch { /* لا يهم */ }
  if (plan.week) celebrate('🎉 أتممت هدف الأسبوع! عمل رائع.', { title: 'أسبوع مكتمل!', kind: 'week' });
  else celebrate('🎯 أتممت هدف اليوم!', { title: 'يوم مكتمل!', kind: 'day' });
}

// ---------- الأوسمة ----------
/** يعلن الأوسمة المفتوحة حديثاً (إشعار + احتفال) الآن وعند كل commit لاحق. */
export function initUnlockAnnouncer(store) {
  function drain() {
    const ids = store.takeUnlocks();
    const badges = ids.map((id) => badgeById(id)).filter(Boolean);
    if (!badges.length) return;
    if (!motionOk()) {
      badges.forEach((b) => showToast(`🏅 وسام جديد: ${b.title}`, 'success'));
      return;
    }
    const cheer = badgeCheer(badges.map((b) => b.title));
    celebrate(cheer.message, { title: cheer.title, kind: 'badge', icon: badges.length === 1 ? badgeIcon(badges[0].icon, { size: 34 }) : null });
  }
  store.subscribe(drain);
  drain();
}
