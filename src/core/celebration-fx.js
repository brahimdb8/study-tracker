// @ts-check
// خطة الاحتفال البصري — نقية وحتمية (بذرة ثابتة): أشرطة رقيقة تنطلق من الأركان وتتساقط بنعومة،
// كرات ضوء ناعمة تصعد وتتلاشى، وبريق يتلألأ حول بطاقة التهنئة. لا DOM هنا: الواجهة تحوّل الخطة إلى WAAPI.

/** @typedef {{ t: number, x: number, y: number, rot: number, sy: number, op: number, sc: number }} Frame */
/** @typedef {{ kind: 'ribbon'|'orb'|'spark', color: number, w: number, h: number, delay: number, duration: number, frames: Frame[] }} Piece */

export const FX_COLORS = 5;
export const FX_KINDS = {
  day: { ribbons: 30, orbs: 12, sparks: 8 },
  week: { ribbons: 46, orbs: 18, sparks: 14 },
  badge: { ribbons: 38, orbs: 16, sparks: 12 },
};
export const FX_MAX_MS = 5200;

/** مولّد أعداد شبه عشوائي حتمي. @param {number} seed @returns {() => number} */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {number} a @param {number} b @param {number} k */
const lerp = (a, b, k) => a + (b - a) * k;
/** @param {number} n */
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {{ kind?: keyof typeof FX_KINDS, width: number, height: number, seed?: number }} o
 * @returns {{ pieces: Piece[], totalMs: number }}
 */
export function buildFxPlan({ kind = 'day', width, height, seed = 1 }) {
  const cfg = FX_KINDS[kind] || FX_KINDS.day;
  const rnd = mulberry32(seed);
  const W = Math.max(240, width);
  const H = Math.max(320, height);
  /** @type {Piece[]} */
  const pieces = [];

  // ---- أشرطة: مدفعان من الأسفل (يسار/يمين)، وللوسام انطلاقة مركزية مزدوجة ----
  for (let i = 0; i < cfg.ribbons; i++) {
    const fromLeft = kind === 'badge' ? i % 2 === 0 : i % 2 === 0;
    const ox = kind === 'badge' ? (fromLeft ? W * 0.38 : W * 0.62) : (fromLeft ? W * 0.03 : W * 0.97);
    const oy = H * (kind === 'badge' ? 0.92 : 0.96);
    const spread = kind === 'badge' ? lerp(62, 118, rnd()) : lerp(52, 80, rnd()); // زاوية من الأفق
    const ang = ((fromLeft ? spread : 180 - spread) * Math.PI) / 180;
    const speed = H * lerp(0.9, 1.45, rnd());                                   // px/s
    const vx = Math.cos(ang) * speed;
    const vy = -Math.sin(ang) * speed;
    const g = H * 1.15;
    const drag = lerp(0.9, 1.5, rnd());
    const sway = lerp(10, 26, rnd());
    const swayF = lerp(2, 4.2, rnd());
    const phase = rnd() * Math.PI * 2;
    const rot0 = rnd() * 360;
    const rotV = lerp(-260, 260, rnd());
    const flip = lerp(4, 9, rnd());
    const duration = lerp(2.5, 3.6, rnd());
    const delay = rnd() * 0.22;
    const N = 9;
    /** @type {Frame[]} */
    const frames = [];
    for (let s = 0; s <= N; s++) {
      const k = s / N; const t = k * duration;
      const x = ox + (vx * (1 - Math.exp(-drag * t))) / drag + sway * Math.sin(swayF * t + phase) * k;
      const y = oy + vy * t + 0.5 * g * t * t * 0.55;
      frames.push({
        t: k, x: round1(x), y: round1(y), rot: round1(rot0 + rotV * t),
        sy: round1(Math.max(0.2, Math.abs(Math.cos(flip * t + phase)))),
        op: k < 0.68 ? 1 : round1(Math.max(0, 1 - (k - 0.68) / 0.32)), sc: 1,
      });
    }
    pieces.push({
      kind: 'ribbon', color: Math.floor(rnd() * FX_COLORS), w: round1(lerp(5, 8, rnd())), h: round1(lerp(16, 28, rnd())),
      delay: round1(delay * 1000), duration: Math.round(duration * 1000), frames,
    });
  }

  // ---- كرات ضوء: تصعد ببطء وتتأرجح ثم تتلاشى ----
  for (let i = 0; i < cfg.orbs; i++) {
    const x0 = lerp(W * 0.06, W * 0.94, rnd());
    const y0 = H * lerp(1.0, 1.1, rnd());
    const y1 = H * lerp(0.12, 0.55, rnd());
    const size = round1(lerp(14, 40, rnd()));
    const sway = lerp(16, 46, rnd());
    const f = lerp(1.2, 2.4, rnd());
    const ph = rnd() * Math.PI * 2;
    const duration = lerp(3.2, 4.6, rnd());
    const delay = rnd() * 0.7;
    const N = 8;
    /** @type {Frame[]} */
    const frames = [];
    for (let s = 0; s <= N; s++) {
      const k = s / N;
      frames.push({
        t: k, x: round1(x0 + sway * Math.sin(f * k * Math.PI * 2 + ph)), y: round1(lerp(y0, y1, 1 - (1 - k) ** 2)), rot: 0, sy: 1,
        op: round1(k < 0.25 ? (k / 0.25) * 0.85 : 0.85 * (1 - (k - 0.25) / 0.75)), sc: round1(lerp(0.6, 1.15, k)),
      });
    }
    pieces.push({ kind: 'orb', color: Math.floor(rnd() * FX_COLORS), w: size, h: size, delay: round1(delay * 1000), duration: Math.round(duration * 1000), frames });
  }

  // ---- بريق: يتلألأ حول منطقة بطاقة التهنئة (أعلى الوسط) ----
  for (let i = 0; i < cfg.sparks; i++) {
    const x = lerp(W * 0.2, W * 0.8, rnd());
    const y = lerp(H * 0.08, H * 0.42, rnd());
    const size = round1(lerp(10, 24, rnd()));
    const duration = lerp(0.9, 1.5, rnd());
    const delay = lerp(0.1, 1.3, rnd());
    /** @type {Frame[]} */
    const frames = [0, 0.5, 1].map((k) => ({ t: k, x: round1(x), y: round1(y), rot: round1(k * 90), sy: 1, op: k === 0.5 ? 1 : 0, sc: k === 0.5 ? 1 : 0 }));
    pieces.push({ kind: 'spark', color: Math.floor(rnd() * FX_COLORS), w: size, h: size, delay: round1(delay * 1000), duration: Math.round(duration * 1000), frames });
  }

  const totalMs = Math.min(FX_MAX_MS, Math.max(...pieces.map((p) => p.delay + p.duration)) + 200);
  return { pieces, totalMs };
}

/** نص بطاقة التهنئة لأوسمة جديدة. @param {string[]} titles */
export function badgeCheer(titles) {
  if (titles.length === 1) return { title: 'وسام جديد! 🏅', message: titles[0] };
  const shown = titles.slice(0, 3).join('، ');
  return { title: `${titles.length} أوسمة جديدة! 🏅`, message: titles.length > 3 ? `${shown} وغيرها` : shown };
}
