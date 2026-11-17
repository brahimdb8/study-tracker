// بانر الرئيسية: تحية حسب الساعة، تاريخ ميلادي، عبارة اليوم، وشريط سريع (سلسلة/مستوى/حلقة اليوم).
import { createContext } from '../core/context.js';
import { formatMins } from '../core/format.js';
import { greetingForHour, gregorianLabel } from '../core/greeting.js';
import { levelSummary } from '../core/levels.js';
import { targetsForDate } from '../core/plan.js';
import { quoteForDate } from '../core/quotes.js';
import { dayTotals } from '../core/sessions.js';
import { computeStreak, evaluateDay } from '../core/status.js';
import { createProgressRing } from './progress-ring.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function tile(cls, label) {
  const t = el('div', `hero-tile ${cls}`);
  t.appendChild(el('span', 'hero-tile-label', label));
  return t;
}

/**
 * @param {HTMLElement} root
 * @param {{ getState: () => any }} store
 * @param {() => string} getToday
 * @param {() => Date} [getNow]
 */
export function createHero(root, store, getToday, getNow = () => new Date()) {
  const text = el('div', 'hero-text');
  const greet = el('h1', 'hero-greet');
  const date = el('p', 'hero-date');
  const quote = el('p', 'hero-quote');
  text.append(greet, date, quote);

  const strip = el('div', 'hero-strip');
  const streakTile = tile('hero-streak', 'السلسلة');
  const streakVal = el('strong', 'hero-tile-val');
  streakTile.appendChild(streakVal);
  const levelTile = tile('hero-level', 'المستوى');
  const levelVal = el('strong', 'hero-tile-val');
  const levelSub = el('span', 'hero-tile-sub');
  levelTile.append(levelVal, levelSub);
  const goalTile = tile('hero-goal', 'هدف اليوم');
  const ring = createProgressRing({ size: 76, stroke: 9 });
  const goalSub = el('span', 'hero-tile-sub');
  goalTile.append(ring.el, goalSub);
  strip.append(streakTile, levelTile, goalTile);

  root.replaceChildren(text, strip);

  function update() {
    const state = store.getState();
    const today = getToday();
    const ctx = createContext(state, today);
    greet.textContent = greetingForHour(getNow().getHours()).text;
    date.textContent = gregorianLabel(today);
    quote.textContent = quoteForDate(today);

    const streak = computeStreak(ctx);
    streakVal.textContent = `${streak} ${streak >= 3 && streak <= 10 ? 'أيام' : 'يوماً'}`;

    const lv = levelSummary(state, today);
    levelVal.textContent = `${lv.level} · ${lv.title}`;
    levelSub.textContent = lv.isMax ? 'أعلى مستوى' : `${lv.pct}% نحو ${lv.level + 1}`;

    const totals = dayTotals(ctx.index, today);
    const target = targetsForDate(ctx.plan, today).totalMins;
    const st = evaluateDay(today, ctx);
    const noGoal = target === 0 || st === 'rest' || st === 'excused';
    if (noGoal) {
      ring.update(0, '—', 'لا هدف اليوم');
      goalSub.textContent = totals.totalMins ? `${formatMins(totals.totalMins)} (بلا هدف)` : 'يوم بلا هدف';
    } else {
      const pct = Math.min(100, Math.floor((totals.totalMins / target) * 100));
      ring.update(pct, `${pct}%`, 'تقدم هدف اليوم');
      goalSub.textContent = `${formatMins(totals.totalMins)} / ${formatMins(target)}`;
    }
  }
  update();
  return { update };
}
