// خدمات المتصفح الخاصة بالمؤقت: النغمات، إشعارات المتصفح، Wake Lock، ونبض خلفي.
// كلها اختيارية وتتحمّل غياب الدعم بصمت (لا تكسر المؤقت أبداً).

// ---------- الصوت ----------
let audioCtx = null;

// يُستدعى من نقرة المستخدم (المتصفحات تمنع الصوت قبل أي تفاعل)
export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* لا صوت */ }
}

const TONES = {
  focusEnd: [[587.33, 0, 0.35], [783.99, 0.4, 0.5]],  // صاعدة: أنجزت
  breakEnd: [[659.25, 0, 0.3], [523.25, 0.35, 0.45]], // هابطة: عُد للعمل
};

export function playTone(kind) {
  try {
    unlockAudio();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    for (const [freq, offset, dur] of TONES[kind] || TONES.focusEnd) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0 + offset);
      gain.gain.setValueAtTime(0.25, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + offset + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + dur + 0.05);
    }
  } catch { /* لا صوت */ }
}

// ---------- إشعارات المتصفح ----------
// 'granted' | 'denied' | 'default' | 'unsupported'
export function notifyPermission() {
  try {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  } catch { return 'unsupported'; }
}

// يجب استدعاؤها مباشرة من نقرة المستخدم
export async function requestNotifyPermission() {
  if (notifyPermission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch { return notifyPermission(); }
}

// tag ثابت: إشعار الطور الجديد يحلّ محل القديم (ولا يتكرر لو فتحت الصفحة في تبويبين)
export function showNotification(title, body, tag = 'study-timer') {
  if (notifyPermission() !== 'granted') return false;
  try {
    const n = new Notification(title, /** @type {NotificationOptions} */ ({ body, tag, lang: 'ar', dir: 'rtl', renotify: true }));
    n.onclick = () => { try { window.focus(); n.close(); } catch { /* لا يهم */ } };
    return true;
  } catch { return false; }
}

// ---------- Wake Lock ----------
// set(true) أثناء التركيز الجاري فقط. المتصفح يحرّر القفل عند إخفاء التبويب، فنعيد طلبه عند العودة.
export function createWakeLock() {
  let sentinel = null;
  let wanted = false;
  let pending = false;

  async function acquire() {
    if (!wanted || sentinel || pending || document.hidden || !('wakeLock' in navigator)) return;
    pending = true;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!wanted) { s.release().catch(() => {}); return; }
      sentinel = s;
      s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
    } catch { /* مرفوض أو غير مدعوم */ } finally { pending = false; }
  }

  function release() {
    const s = sentinel;
    sentinel = null;
    if (s) s.release().catch(() => {});
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) acquire(); });

  return {
    set(want) {
      if (want === wanted) return;
      wanted = want;
      if (want) acquire(); else release();
    },
    isHeld: () => sentinel !== null,
  };
}

// ---------- نبض خلفي ----------
// مؤقتات الصفحة في تبويب مخفي تُخنق (قد تصل إلى مرة كل دقيقة)، فيتأخر إشعار نهاية الطور.
// مؤقت داخل Worker لا يُخنق بالدرجة نفسها؛ إن لم يتوفر نعود إلى setInterval.
export function startBackgroundTicker(cb, ms = 1000) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = () => cb();
    return () => { worker.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const id = setInterval(cb, ms);
    return () => clearInterval(id);
  }
}
