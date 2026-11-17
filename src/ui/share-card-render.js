// رسم بطاقة الإنجازات على canvas (1080×1350) ثم تحويلها إلى PNG. بلا innerHTML ولا مكتبات.
// البطاقة داكنة ثابتة عمداً (تبدو متسقة عند المشاركة بغض النظر عن ثيم التطبيق). الألوان معتمدة بـ validate_palette:
// صباح #c98500 ومساء #9085e9 على السطح #1e293b. كل المعنى مرفق بنص (لا اعتماد على اللون وحده).
import { formatMins } from '../core/format.js';

export const CARD_W = 1080;
export const CARD_H = 1350;
const C = {
  bg: '#0f172a', panel: '#1e293b', text: '#f1f5f9', muted: '#cbd5e1', faint: '#94a3b8',
  morning: '#c98500', evening: '#9085e9', track: '#334155', accent: '#3987e5',
};
const FONT = '"Segoe UI", Tahoma, "Noto Naskh Arabic", "Noto Sans Arabic", Arial, system-ui, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, { size = 36, weight = 'normal', color = C.text, align = 'right' } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {ReturnType<typeof import('../core/share-card.js').buildShareModel>} m
 */
export function drawShareCard(canvas, m) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  ctx.direction = 'rtl';
  const PAD = 72;
  const R = CARD_W - PAD; // الحافة اليمنى (RTL)

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  text(ctx, '📚 متتبع المذاكرة', R, 120, { size: 38, weight: 'bold', color: C.muted });
  text(ctx, m.title, R, 205, { size: 64, weight: 'bold' });
  text(ctx, m.rangeLabel, R, 262, { size: 36, color: C.faint });

  // البطاقة الرئيسية: إجمالي الوقت
  roundRect(ctx, PAD, 310, CARD_W - PAD * 2, 290, 32);
  ctx.fillStyle = C.panel; ctx.fill();
  text(ctx, 'إجمالي وقت المذاكرة', R - 40, 380, { size: 34, color: C.muted });
  text(ctx, formatMins(m.totalMins), R - 40, 480, { size: 100, weight: 'bold' });
  text(ctx, `صباحاً ${formatMins(m.morningMins)} · مساءً ${formatMins(m.eveningMins)}`, R - 40, 567, { size: 30, color: C.faint });

  // ثلاث خانات
  const stats = [
    [`${m.doneDays} من ${m.targetedDays}`, 'أيام أنجزت هدفها'],
    [`${m.streak}`, 'سلسلة الأيام 🔥'],
    [`${m.badges.length}`, 'أوسمة فُتحت 🏅'],
  ];
  const bw = (CARD_W - PAD * 2 - 40) / 3;
  stats.forEach(([big, small], i) => {
    const x = R - (i + 1) * bw - i * 20;
    roundRect(ctx, x, 630, bw, 170, 28);
    ctx.fillStyle = C.panel; ctx.fill();
    text(ctx, big, x + bw / 2, 710, { size: 54, weight: 'bold', align: 'center' });
    text(ctx, small, x + bw / 2, 764, { size: 26, color: C.muted, align: 'center' });
  });

  // أعمدة الأيام (مكدّسة صباح/مساء)
  const chartTop = 880; const chartH = 210; const chartX = PAD; const chartW = CARD_W - PAD * 2;
  text(ctx, 'الدقائق في كل يوم', R, 855, { size: 30, weight: 'bold', color: C.muted });
  ctx.fillStyle = C.track; ctx.fillRect(chartX, chartTop + chartH, chartW, 3);
  const n = m.days.length;
  const slot = chartW / n;
  const barW = Math.max(6, Math.min(70, slot * 0.64));
  m.days.forEach((d, i) => {
    const cx = R - i * slot - slot / 2; // الأول يميناً
    const mh = (d.morning / m.maxDayMins) * chartH;
    const eh = (d.evening / m.maxDayMins) * chartH;
    if (d.future) { ctx.fillStyle = C.track; ctx.fillRect(cx - barW / 2, chartTop + chartH - 6, barW, 6); return; }
    ctx.fillStyle = C.morning; ctx.fillRect(cx - barW / 2, chartTop + chartH - mh, barW, mh);
    ctx.fillStyle = C.evening; ctx.fillRect(cx - barW / 2, chartTop + chartH - mh - eh - (mh && eh ? 2 : 0), barW, eh);
  });
  // مفتاح الألوان بنص
  ctx.fillStyle = C.morning; ctx.fillRect(R - 24, 1122, 24, 24);
  text(ctx, 'صباحاً', R - 36, 1143, { size: 28, color: C.muted });
  ctx.fillStyle = C.evening; ctx.fillRect(R - 190, 1122, 24, 24);
  text(ctx, 'مساءً', R - 202, 1143, { size: 28, color: C.muted });

  // المواد (اختيارية) أو الأوسمة
  let y = 1215;
  if (m.subjects.length) {
    text(ctx, 'أكثر المواد: ' + m.subjects.map((s) => `${s.name} ${formatMins(s.mins)}`).join(' · '), R, y, { size: 30, color: C.muted });
    y += 56;
  }
  if (m.badges.length) {
    text(ctx, 'أوسمة الفترة: ' + m.badges.slice(0, 4).map((b) => b.title).join(' · '), R, y, { size: 30, color: C.muted });
  } else if (!m.subjects.length) {
    text(ctx, 'كل يوم خطوة، واستمرارك هو الإنجاز ✨', R, y, { size: 30, color: C.muted });
  }
  text(ctx, 'study-tracker', PAD + 4, CARD_H - 50, { size: 24, color: C.faint, align: 'left' });
}

/** @param {HTMLCanvasElement} canvas @returns {Promise<Blob|null>} */
export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
