import '../data/boot.js';
import '../styles/main.css';
import { createContext } from '../core/context.js';
import { DAY_OFF_TYPES, addDayOff, removeDateFromDayOffs } from '../core/dayoffs.js';
import { DAYS_AR, MONTHS_AR, daysInMonth, formatDate, monthKeyOf, parseDate, shiftMonth, todayStr } from '../core/dates.js';
import { formatMins } from '../core/format.js';
import { countdownLabel, upcomingExams } from '../core/exams.js';
import { targetsForDate } from '../core/plan.js';
import {
  PERIOD_LABEL, SOURCE_LABEL, addSession, dayTotals, periodFromTimestamp,
  removeSession, restoreSession, sessionsForDate, splitMins, updateSession,
} from '../core/sessions.js';
import { computeStreak, dayOffFor, evaluateDay, freezeInfo, weekProgress } from '../core/status.js';
import { STATE_KEY, getStorage, getStore } from '../core/store.js';
import { subjectById } from '../core/subjects.js';
import {
  advance, createIdleState, getView, pause, resume, startFocus, stop,
} from '../core/pomodoro.js';
import { POMODORO_KEY, loadPomodoro, savePomodoro } from '../core/timer.js';
import {
  createWakeLock, notifyPermission, playTone, showNotification, startBackgroundTicker, unlockAudio,
} from '../ui/notify.js';
import { createRing } from '../ui/timer-ring.js';
import { NAV_KEYS, navigateDate } from '../core/calendar-nav.js';
import {
  QUALITY_OPTIONS, STATUS_CLASS, STATUS_LABEL, STATUS_SYMBOL, flushStoreNotices, renderStatusLegend, statusText, subjectChip,
} from '../ui/status-ui.js';
import { initWizard } from '../ui/wizard.js';
import { celebrateGoals, initUnlockAnnouncer } from '../ui/celebrate.js';
import { createHero } from '../ui/hero.js';
import { initShell } from '../ui/shell.js';
import { initShortcuts } from '../ui/shortcuts.js';
import { showToast } from '../ui/toast.js';
import { showUndoToast } from '../ui/undo.js';

const store = getStore();
const storage = getStorage();
/** @type {(id: string) => any} */ // عناصر DOM متنوعة (input/button...) فنوعها ديناميكي
const $ = (id) => document.getElementById(id);

let today = todayStr();
let view = { year: new Date().getFullYear(), month: new Date().getMonth() };
let selected = today;
let editingId = null;
let hero = null;
let lastSubject = null; // آخر مادة اخترتها (تبقى مختارة للجلسة التالية)

// ---------- سياق الحساب ----------
function context() {
  return createContext(store.getState(), today);
}

function commitPatch(patch) {
  const before = store.getState();
  const ok = store.commit({ ...before, ...patch });
  flushStoreNotices(store, showToast);
  celebrateGoals(before, store.getState(), today); // احتفال عند عبور هدف اليوم/الأسبوع (حياً فقط، مرة لكل يوم/أسبوع)
  return ok;
}

// ---------- التقويم (شبكة ARIA + تنقل بلوحة المفاتيح) ----------
const WEEKDAY_HEADERS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
let focusDate = null; // اليوم الذي يحمل tabindex=0 (roving tabindex)

function makeCell(role = 'gridcell') {
  const cell = document.createElement('div');
  cell.setAttribute('role', role);
  return cell;
}

function renderCalendar(ctx) {
  const grid = $('calendar-grid');
  const hadFocus = grid.contains(document.activeElement);
  $('calendar-month-year').textContent = `${MONTHS_AR[view.month]} ${view.year}`;
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', `تقويم ${MONTHS_AR[view.month]} ${view.year}`);

  const n = daysInMonth(view.year, view.month);
  const dateOf = (day) => formatDate(new Date(view.year, view.month, day));
  const statuses = [];
  for (let day = 1; day <= n; day++) statuses[day] = evaluateDay(dateOf(day), ctx);

  // أي زر يدخل في ترتيب Tab: التركيز الحالي، ثم المحدد، ثم اليوم، ثم أول يوم متاح
  const inView = (d) => d && Number(d.slice(0, 4)) === view.year && Number(d.slice(5, 7)) - 1 === view.month;
  const enabled = (d) => statuses[Number(d.slice(8, 10))] !== 'future';
  const tabDate = [focusDate, selected, today].find((d) => inView(d) && enabled(d))
    || dateOf(statuses.findIndex((st, i) => i > 0 && st !== 'future') || 1);

  const rows = document.createDocumentFragment();
  const head = document.createElement('div');
  head.className = 'calendar-row';
  head.setAttribute('role', 'row');
  WEEKDAY_HEADERS.forEach((h) => {
    const c = makeCell('columnheader');
    c.className = 'calendar-day-header';
    c.textContent = h;
    head.appendChild(c);
  });
  rows.appendChild(head);

  const first = new Date(view.year, view.month, 1).getDay();
  const total = Math.ceil((first + n) / 7) * 7;
  let row = null;
  for (let i = 0; i < total; i++) {
    if (i % 7 === 0) {
      row = document.createElement('div');
      row.className = 'calendar-row';
      row.setAttribute('role', 'row');
      rows.appendChild(row);
    }
    const cell = makeCell();
    const day = i - first + 1;
    if (day >= 1 && day <= n) {
      const dateStr = dateOf(day);
      const status = statuses[day];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `calendar-day-btn ${STATUS_CLASS[status]}${dateStr === selected ? ' selected' : ''}${dateStr === today ? ' is-today' : ''}`;
      btn.dataset.date = dateStr;
      btn.tabIndex = dateStr === tabDate ? 0 : -1;
      btn.disabled = status === 'future';
      const num = document.createElement('span');
      num.className = 'day-num';
      num.textContent = String(day);
      const sym = document.createElement('span');
      sym.className = 'day-sym';
      sym.setAttribute('aria-hidden', 'true');
      sym.textContent = STATUS_SYMBOL[status];
      btn.append(num, sym);
      btn.setAttribute('aria-label', `${day} ${MONTHS_AR[view.month]}${dateStr === today ? ' (اليوم)' : ''} — ${STATUS_LABEL[status]}`);
      btn.setAttribute('aria-pressed', String(dateStr === selected));
      if (dateStr === today) btn.setAttribute('aria-current', 'date');
      if (status !== 'future') btn.addEventListener('click', () => { focusDate = dateStr; selectDate(dateStr); });
      cell.appendChild(btn);
    } else {
      cell.setAttribute('aria-hidden', 'true');
    }
    row.appendChild(cell);
  }
  grid.replaceChildren(rows);

  // أبقِ التركيز على الشبكة بعد إعادة الرسم (تنقل بالأسهم أو اختيار بـ Enter)
  if (hadFocus) grid.querySelector('.calendar-day-btn[tabindex="0"]')?.focus();
}

function onCalendarKeydown(e) {
  const btn = e.target.closest?.('.calendar-day-btn');
  if (!btn || !NAV_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const next = navigateDate(btn.dataset.date, e.key, { today, shift: e.shiftKey });
  if (!next) return;
  focusDate = next;
  view = { year: Number(next.slice(0, 4)), month: Number(next.slice(5, 7)) - 1 };
  renderCalendar(context());
  // renderCalendar أعاد التركيز إلى tabindex=0، وهو focusDate إن كان في الشهر المعروض
}

function selectDate(dateStr) {
  selected = dateStr;
  editingId = null;
  render();
  resetForm();
}

// ---------- ملخص وأسبوع ----------
function renderSummary(ctx) {
  $('current-streak').textContent = `${computeStreak(ctx)} أيام 🔥`;

  const fz = freezeInfo(ctx, monthKeyOf(today));
  $('freeze-info').textContent = fz.allowance > 0
    ? `❄️ تجميد هذا الشهر: استُخدم ${fz.used} من ${fz.allowance}`
    : 'التجميد التلقائي معطّل';

  const status = evaluateDay(selected, ctx);
  const target = targetsForDate(ctx.plan, selected);
  const totals = dayTotals(ctx.index, selected);
  const el = $('day-target-status');
  if (status === 'excused' || status === 'rest') {
    el.textContent = `${formatMins(totals.totalMins)} (بلا هدف)`;
    el.style.color = 'var(--accent)';
  } else {
    el.textContent = `${formatMins(totals.totalMins)} / ${formatMins(target.totalMins)}`;
    el.style.color = totals.totalMins >= target.totalMins ? 'var(--good)' : 'var(--accent)';
  }
}

function renderWeek(ctx) {
  const wp = weekProgress(selected, ctx);
  const isCurrent = wp.weekStart <= today && today <= wp.weekEnd;
  $('week-title').textContent = isCurrent ? 'تقدّم هذا الأسبوع' : `الأسبوع ${wp.weekStart} ← ${wp.weekEnd}`;

  const bar = $('week-bar');
  bar.style.width = `${wp.pct}%`;
  bar.classList.toggle('full', wp.pct >= 100);
  $('week-progress').setAttribute('aria-valuenow', String(wp.pct));

  let text = `${formatMins(wp.studiedMins)} من ${formatMins(wp.targetMins)}`;
  if (wp.targetMins === 0) text += ' — لا هدف لهذا الأسبوع';
  else if (wp.remainingMins === 0) text += ' — أنجزت هدف الأسبوع ✅';
  else if (wp.daysLeft > 0) text += ` — المتبقي ${formatMins(wp.remainingMins)} خلال ${wp.daysLeft} أيام`;
  else text += ` — لم يكتمل (ناقص ${formatMins(wp.remainingMins)})`;
  $('week-text').textContent = text;
}

// ---------- اليوم المحدد ----------
function renderDayStatus(ctx) {
  const status = evaluateDay(selected, ctx);
  const off = dayOffFor(ctx, selected);
  let text = `الحالة: ${statusText(status)}`;
  if (off) text += ` — ${DAY_OFF_TYPES[off.type]}${off.note ? `: ${off.note}` : ''}`;
  $('day-status-line').textContent = text;

  $('dayoff-type').style.display = off ? 'none' : '';
  $('dayoff-apply').style.display = off ? 'none' : '';
  $('dayoff-remove').style.display = off ? '' : 'none';
}

function renderDay(ctx) {
  $('entry-date').textContent = `${DAYS_AR[parseDate(selected).getDay()]} (${selected})`;

  const t = targetsForDate(ctx.plan, selected);
  $('day-target-hint').textContent =
    `الهدف: ${formatMins(t.totalMins)} (صباحاً ${formatMins(t.morningMins)} · مساءً ${formatMins(t.eveningMins)} — إرشادي، والتقييم يعتمد على المجموع)`;
  renderDayStatus(ctx);

  const state = store.getState();
  const list = $('sessions-list');
  const sessions = sessionsForDate(state.sessions, selected);
  list.replaceChildren();

  if (sessions.length === 0) {
    const li = document.createElement('li');
    li.className = 'session-empty';
    li.textContent = 'لا توجد جلسات في هذا اليوم.';
    list.appendChild(li);
  }

  for (const s of sessions) {
    const li = document.createElement('li');
    li.className = `session-item${s.id === editingId ? ' editing' : ''}`;

    const main = document.createElement('div');
    main.className = 'session-main';
    const title = document.createElement('span');
    title.className = 'session-title';
    title.textContent = `${formatMins(s.minutes)} · ${PERIOD_LABEL[s.period]}`;
    main.appendChild(title);

    if (s.subject) main.appendChild(subjectChip(subjectById(state.subjects, s.subject)));

    const sub = document.createElement('span');
    sub.className = 'session-sub';
    const parts = [SOURCE_LABEL[s.source] || s.source];
    if (s.note) parts.push(s.note); // textContent فلا خطر حقن HTML
    sub.textContent = parts.join(' — ');
    main.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'session-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-secondary btn-sm';
    edit.textContent = 'تعديل';
    edit.addEventListener('click', () => startEdit(s.id));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-danger btn-sm';
    del.textContent = 'حذف';
    del.addEventListener('click', () => deleteSession(s.id));
    actions.append(edit, del);

    li.append(main, actions);
    list.appendChild(li);
  }

  const meta = state.dayMeta[selected];
  $('day-quality-select').value = meta ? meta.quality : 'none';
}

function render() {
  const ctx = context();
  renderCalendar(ctx);
  renderSummary(ctx);
  renderWeek(ctx);
  renderDay(ctx);
  renderExam();
  if (hero) hero.update();
}

// ---------- العد التنازلي للامتحان ----------
function renderExam() {
  const box = $('exam-card');
  const list = upcomingExams(store.getState().exams, today);
  box.replaceChildren();
  const link = (href, label) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    return a;
  };
  if (!list.length) {
    box.classList.add('exam-empty');
    const p = document.createElement('p');
    p.className = 'exam-empty-text';
    p.append('📝 لا امتحانات قادمة. ', link('settings.html#exams', 'أضف امتحاناً لتتابع العد التنازلي'));
    box.appendChild(p);
    return;
  }
  box.classList.remove('exam-empty');
  const e = list[0];
  const num = document.createElement('div');
  num.className = 'exam-days';
  const big = document.createElement('strong');
  big.textContent = e.days === 0 ? '🎯' : String(e.days);
  const unit = document.createElement('span');
  unit.textContent = e.days === 0 ? 'اليوم' : e.days === 1 ? 'يوم' : e.days === 2 ? 'يومان' : e.days <= 10 ? 'أيام' : 'يوماً';
  num.append(big, unit);

  const info = document.createElement('div');
  info.className = 'exam-info';
  const name = document.createElement('h3');
  name.textContent = `📝 ${e.name}`;
  const when = document.createElement('p');
  when.className = 'exam-when';
  when.textContent = `${DAYS_AR[parseDate(e.date).getDay()]} ${e.date} — ${countdownLabel(e.days)}${e.days === 0 ? '، بالتوفيق 🍀' : ''}`;
  info.append(name, when);
  if (list.length > 1) {
    const more = document.createElement('p');
    more.className = 'hint';
    const n = list.length - 1;
    more.append(`+${n} ${n === 1 ? 'امتحان آخر' : n === 2 ? 'امتحانان آخران' : 'امتحانات أخرى'} · `, link('settings.html#exams', 'إدارة الامتحانات'));
    info.appendChild(more);
  }
  box.append(num, info);
}

// ---------- أيام استثنائية ----------
function onApplyDayOff() {
  const state = store.getState();
  const res = addDayOff(state.dayOffs, { from: selected, to: selected, type: $('dayoff-type').value });
  if (!res.ok) { showToast(res.error, 'error'); return; }
  commitPatch({ dayOffs: res.dayOffs });
  render();
  showToast('تم تحديد اليوم كاستثنائي', 'success');
}

function onRemoveDayOff() {
  const res = removeDateFromDayOffs(store.getState().dayOffs, selected);
  if (!res.ok) { showToast(res.error, 'error'); return; }
  commitPatch({ dayOffs: res.dayOffs });
  render();
  showToast('أُزيل الاستثناء عن هذا اليوم', 'success');
}

// ---------- نموذج الجلسة ----------
function defaultPeriod() {
  return new Date().getHours() < 12 ? 'morning' : 'evening';
}

function populateSubjectSelect(selectedId) {
  const { subjects } = store.getState();
  const sel = $('session-subject');
  sel.replaceChildren();
  sel.appendChild(new Option('بدون مادة', ''));
  for (const s of subjects) {
    if (!s.archived || s.id === selectedId) sel.appendChild(new Option(s.archived ? `${s.name} (مؤرشفة)` : s.name, s.id));
  }
  sel.value = selectedId && subjects.some((s) => s.id === selectedId) ? selectedId : '';
}

function resetForm() {
  editingId = null;
  const { subjects } = store.getState();
  const keep = lastSubject && subjects.some((s) => s.id === lastSubject && !s.archived) ? lastSubject : null;
  $('session-hours').value = 0;
  $('session-mins').value = 0;
  $('session-period').value = defaultPeriod();
  $('session-start').value = '';
  $('session-note').value = '';
  populateSubjectSelect(keep);
  $('session-form-title').textContent = 'إضافة جلسة يدوياً';
  $('session-submit').textContent = 'إضافة الجلسة ➕';
  $('session-cancel').style.display = 'none';
}

function startEdit(id) {
  const s = store.getState().sessions.find((x) => x.id === id);
  if (!s) return;
  editingId = id;
  const { hours, mins } = splitMins(s.minutes);
  $('session-hours').value = hours;
  $('session-mins').value = mins;
  $('session-period').value = s.period;
  $('session-start').value = Number.isFinite(s.startedAt) ? hhmm(new Date(s.startedAt)) : '';
  $('session-note').value = s.note || '';
  populateSubjectSelect(s.subject);
  $('session-form-title').textContent = 'تعديل الجلسة';
  $('session-submit').textContent = 'حفظ التعديل 💾';
  $('session-cancel').style.display = 'block';
  renderDay(context());
  $('session-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// يحوّل «HH:MM» + تاريخ الجلسة إلى طابع زمني محلي (أو null إن كان الحقل فارغاً)
function startedAtFrom(timeValue, dateStr) {
  const m = /^(\d{2}):(\d{2})$/.exec(timeValue || '');
  if (!m) return null;
  const d = parseDate(dateStr);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
}

function readBoundedInt(id, min, max) {
  const el = $(id);
  let v = parseInt(el.value, 10);
  if (Number.isNaN(v)) v = 0;
  v = Math.min(max, Math.max(min, v));
  el.value = v;
  return v;
}

function onSubmit(e) {
  e.preventDefault();
  const minutes = readBoundedInt('session-hours', 0, 24) * 60 + readBoundedInt('session-mins', 0, 59);
  let period = $('session-period').value;
  const editingSession = editingId ? store.getState().sessions.find((x) => x.id === editingId) : null;
  const startedAt = startedAtFrom($('session-start').value, editingSession ? editingSession.date : selected);
  if (startedAt !== null) period = periodFromTimestamp(startedAt);
  const note = $('session-note').value;
  const subject = $('session-subject').value || null;
  const state = store.getState();

  const res = editingId
    ? updateSession(state.sessions, editingId, { minutes, period, note, subject, ...(startedAt !== null ? { startedAt } : {}) })
    : addSession(state.sessions, { date: selected, minutes, period, note, subject, startedAt, source: 'manual' });

  if (!res.ok) {
    showToast(/** @type {{error: string}} */ (res).error, 'error');
    return;
  }
  const wasEditing = !!editingId;
  lastSubject = subject;
  commitPatch({ sessions: res.sessions });
  resetForm();
  render();
  showToast(wasEditing ? 'تم حفظ التعديل 💾' : 'تمت إضافة الجلسة 📈', 'success');
}

function deleteSession(id) {
  const target = store.getState().sessions.find((x) => x.id === id);
  const res = removeSession(store.getState().sessions, id);
  if (!res.ok || !target) { showToast(/** @type {{error?: string}} */ (res).error || 'الجلسة غير موجودة.', 'error'); return; }
  commitPatch({ sessions: res.sessions });
  if (editingId === id) resetForm();
  render();
  // بدل confirm(): الحذف فوري ويمكن التراجع عنه
  showUndoToast('تم حذف الجلسة', () => {
    store.reload(); // قد تكون البيانات تغيّرت من تبويب آخر
    const back = restoreSession(store.getState().sessions, target);
    if (!back.ok) return back;
    commitPatch({ sessions: back.sessions });
    render();
    return { ok: true };
  });
}

function onQualityChange() {
  const state = store.getState();
  const q = $('day-quality-select').value;
  const dayMeta = { ...state.dayMeta };
  if (q === 'none') delete dayMeta[selected];
  else dayMeta[selected] = { quality: q };
  commitPatch({ dayMeta });
  showToast('تم حفظ التقييم', 'success');
}

// ---------- المؤقت (بومودورو) ----------
// الآلة نقية في core/pomodoro.js؛ هنا فقط: الحفظ، تسجيل الجلسة، الصوت/الإشعار، والعرض.
let pomo = createIdleState();
let timerSubject = null;       // المادة المختارة قبل البدء
let ring = null;
let dotsKey = '';
let subjectSig = '';
let lastTitle = null;
const baseTitle = document.title;
const wake = createWakeLock();

const timerCfg = () => store.getState().settings.timer;
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const PHASE_LABEL = { idle: '🎯 جاهز للتركيز', focus: '🎯 تركيز', shortBreak: '☕ استراحة قصيرة', longBreak: '🌿 استراحة طويلة' };

// تسجيل جلسة تركيز: المعرّف ثابت (pomo-<startedAt>) فلا تتكرر الجلسة
// مهما أُعيد تحميل الصفحة أو فُتحت في تبويبين. نعيد قراءة التخزين أولاً لنرى ما سجّله التبويب الآخر.
function recordFocus(e) {
  store.reload();
  const state = store.getState();
  if (state.sessions.some((s) => s.id === e.id)) return 'dup';

  const subject = e.subject && state.subjects.some((s) => s.id === e.subject) ? e.subject : null;
  const res = addSession(state.sessions, {
    id: e.id,
    date: formatDate(new Date(e.startedAt)),
    minutes: e.minutes,
    period: periodFromTimestamp(e.startedAt),
    startedAt: e.startedAt,
    subject,
    source: 'timer',
  });
  if (!res.ok) {
    showToast(`تعذّر حفظ الجلسة: ${/** @type {{error: string}} */ (res).error}`, 'error');
    return 'failed';
  }
  commitPatch({ sessions: res.sessions });
  render();
  showToast(`تمت إضافة ${e.minutes} دقيقة 📈`, 'success');
  return 'added';
}

function transitionText(e) {
  if (e.from === 'focus') {
    const mins = Math.round(pomo.durationSec / 60);
    return e.to === 'longBreak'
      ? { title: 'انتهت جلسة التركيز 🎉', body: `أحسنت! أتممت ${timerCfg().longEvery} جلسات — استراحة طويلة ${mins} د.` }
      : { title: 'انتهت جلسة التركيز 🎉', body: `استراحة قصيرة ${mins} د.` };
  }
  return { title: 'انتهت الاستراحة ⏰', body: 'جاهز لجلسة تركيز جديدة؟' };
}

// events: ناتج الآلة. silent: إنهاء يدوي (لا نغمة ولا إشعار لانتقال طلبه المستخدم بنفسه)
function applyEvents(events, { silent = false } = {}) {
  let change = null;
  let duplicate = false;
  for (const e of events) {
    if (e.type === 'focusCompleted') {
      if (recordFocus(e) === 'dup') duplicate = true;
    } else if (e.type === 'phaseChanged') {
      change = e;
    }
  }
  if (!change || silent) return;

  const { title, body } = transitionText(change);
  showToast(`${title} ${body}`, 'success');
  if (duplicate) return; // تبويب آخر سجّل الجلسة وهو من ينبّه
  const cfg = timerCfg();
  if (cfg.sound) playTone(change.from === 'focus' ? 'focusEnd' : 'breakEnd');
  if (cfg.notify && notifyPermission() === 'granted' && (document.hidden || !document.hasFocus())) {
    showNotification(title, body, 'study-timer');
  }
}

function persistPomo() {
  savePomodoro(storage, pomo);
}

function populateTimerSubjects(viewSubject, locked) {
  const { subjects } = store.getState();
  const wanted = locked ? viewSubject : timerSubject;
  const sig = `${locked}|${wanted}|${JSON.stringify(subjects.map((s) => [s.id, s.name, s.archived]))}`;
  const sel = $('timer-subject');
  if (sig !== subjectSig) {
    subjectSig = sig;
    sel.replaceChildren(new Option('بدون مادة', ''));
    for (const s of subjects) {
      if (!s.archived || s.id === wanted) sel.appendChild(new Option(s.archived ? `${s.name} (مؤرشفة)` : s.name, s.id));
    }
    sel.value = wanted && subjects.some((s) => s.id === wanted) ? wanted : '';
    if (!locked && sel.value === '') timerSubject = null;
  }
  sel.disabled = locked;
}

function renderDots(cycle, length) {
  const key = `${cycle}/${length}`;
  if (key === dotsKey) return;
  dotsKey = key;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < length; i++) {
    const d = document.createElement('span');
    d.className = `cycle-dot${i < cycle ? ' done' : ''}`;
    frag.appendChild(d);
  }
  $('timer-dots').replaceChildren(frag);
  $('timer-cycle-text').textContent = `جلسات هذه الدورة: ${Math.min(cycle, length)} من ${length}`;
}

function renderTimer(now = Date.now()) {
  const v = getView(pomo, now, timerCfg());
  const label = PHASE_LABEL[v.phase] + (v.mode === 'paused' ? ' — متوقف مؤقتاً' : '');

  $('timer-display').textContent = mmss(v.remainingSec);
  $('timer-phase').textContent = label;
  ring.update(v.progress, v.phase);
  renderDots(v.cycle, v.cycleLength);
  populateTimerSubjects(v.subject, v.phase === 'focus');

  const idle = v.phase === 'idle';
  $('start-timer-btn').style.display = idle || !v.running ? '' : 'none';
  $('start-timer-btn').textContent = idle ? 'بدء التركيز 🚀' : 'استئناف ▶️';
  $('pause-timer-btn').style.display = v.running ? '' : 'none';
  $('stop-timer-btn').style.display = idle ? 'none' : '';
  $('stop-timer-btn').textContent = v.phase === 'focus' ? 'إنهاء وحفظ ⏹️' : 'تخطي ⏭️';
  $('stop-timer-btn').setAttribute('aria-label', v.phase === 'focus' ? 'إنهاء الجلسة وحفظ الدقائق المنقضية' : 'تخطي الاستراحة');

  wake.set(v.phase === 'focus' && v.running);

  const title = v.running ? `${mmss(v.remainingSec)} — ${PHASE_LABEL[v.phase].slice(2)}` : baseTitle;
  if (title !== lastTitle) { document.title = title; lastTitle = title; }
}

function tick() {
  const now = Date.now();
  const r = advance(pomo, now, timerCfg());
  if (r.state !== pomo) {
    pomo = r.state;
    applyEvents(r.events);   // أولاً نسجّل الجلسة ثم نحفظ الحالة: لو توقّف شيء بينهما فالمعرّف الثابت يمنع التكرار
    persistPomo();
  }
  renderTimer(now);
}

function onStart() {
  unlockAudio();
  const now = Date.now();
  if (pomo.phase === 'idle') pomo = startFocus(pomo, now, timerCfg(), timerSubject);
  else pomo = resume(pomo, now);
  persistPomo();
  renderTimer(now);
}

function onPause() {
  pomo = pause(pomo, Date.now());
  persistPomo();
  renderTimer();
}

function onStop() {
  const r = stop(pomo, Date.now());
  pomo = r.state;
  applyEvents(r.events, { silent: true });
  persistPomo();
  renderTimer();
}

// ---------- تغيّر اليوم بعد منتصف الليل ----------
function checkRollover() {
  const t = todayStr();
  if (t === today) return;
  const wasViewingToday = selected === today;
  today = t;
  if (wasViewingToday) {
    selected = t;
    view = { year: new Date().getFullYear(), month: new Date().getMonth() };
  }
  render();
}

// ---------- الربط ----------
// ---------- اختصارات ----------
function focusNewSession() {
  const section = $('session-section');
  if (section) section.scrollIntoView({ block: 'center' });
  resetForm();
  $('session-hours').focus();
  $('session-hours').select();
}

function toggleTimer() {
  const v = getView(pomo, Date.now(), timerCfg());
  if (v.running) onPause(); else onStart(); // الإنهاء والحفظ بالزر فقط (حفظ بيانات بضغطة خاطئة غير مرغوب)
}

function handleHash() {
  if (location.hash === '#new') focusNewSession();
  else if (location.hash === '#timer') { const t = $('timer-section'); if (t) t.scrollIntoView({ block: 'center' }); $('start-timer-btn').focus(); }
}

function init() {
  initShell({ active: 'home', store });
  initShortcuts({ onNewSession: focusNewSession, onToggleTimer: toggleTimer });
  const select = $('day-quality-select');
  for (const [value, label] of QUALITY_OPTIONS) select.appendChild(new Option(label, value));

  const typeSel = $('dayoff-type');
  for (const [value, label] of Object.entries(DAY_OFF_TYPES)) typeSel.appendChild(new Option(label, value));
  typeSel.value = 'sick';

  renderStatusLegend($('calendar-legend'));
  $('calendar-grid').addEventListener('keydown', onCalendarKeydown);
  $('prev-month').addEventListener('click', () => { view = shiftMonth(view, -1); render(); });
  $('next-month').addEventListener('click', () => { view = shiftMonth(view, 1); render(); });
  $('session-form').addEventListener('submit', onSubmit);
  $('session-cancel').addEventListener('click', () => { resetForm(); renderDay(context()); });
  $('dayoff-apply').addEventListener('click', onApplyDayOff);
  $('dayoff-remove').addEventListener('click', onRemoveDayOff);
  select.addEventListener('change', onQualityChange);

  $('timer-subject').addEventListener('change', (e) => { timerSubject = e.target.value || null; });
  $('start-timer-btn').addEventListener('click', onStart);
  $('pause-timer-btn').addEventListener('click', onPause);
  $('stop-timer-btn').addEventListener('click', onStop);

  // تغيّر البيانات من تبويب آخر
  window.addEventListener('storage', (e) => {
    if (e.key === STATE_KEY) { store.reload(); render(); resetForm(); }
    if (e.key === POMODORO_KEY || e.key === null) { pomo = loadPomodoro(storage).state; renderTimer(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { checkRollover(); tick(); }
  });
  setInterval(checkRollover, 30000);
  setInterval(() => { if (hero) hero.update(); }, 60000); // التحية تتبع الساعة
  setInterval(tick, 250);
  startBackgroundTicker(tick, 1000); // لا يُخنق في التبويب الخلفي كما تُخنق setInterval

  hero = createHero($('hero'), store, () => today);
  resetForm();
  render();
  flushStoreNotices(store, showToast);

  ring = createRing($('timer-ring'));
  const loaded = loadPomodoro(storage);
  pomo = loaded.state;
  timerSubject = pomo.subject;
  if (loaded.migratedLegacy) showToast('نُقل مؤقتك الجاري إلى المؤقت الجديد ✅', 'info');
  initWizard(store, { onDone: () => { render(); } });
  tick(); // إن انتهى طور أثناء الغياب فيعالجه هنا (تسجيل الجلسة مرة واحدة)
  initUnlockAnnouncer(store);
  handleHash();
  window.addEventListener('hashchange', handleHash);
}

init();
