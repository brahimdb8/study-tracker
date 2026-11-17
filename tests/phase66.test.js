import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BADGES } from '../src/core/badge-defs.js';
import { DEV_CONTACT_TEXT, DEV_TAGLINE, INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../src/core/credits.js';
import { MAX_LEVEL } from '../src/core/levels.js';
import { SUGGESTED_SUBJECTS, shouldShowOnboarding } from '../src/core/onboarding.js';
import { buildTourSteps, tourKeyAction, tourNext, tourPrev } from '../src/core/tour.js';
import { ART_KEYS } from '../src/ui/tour-art.js';

const steps = buildTourSteps();
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('الجولة التعريفية', () => {
  it('7 خطوات بمعرّفات فريدة وعناوين ونصوص غير فارغة', () => {
    expect(steps).toHaveLength(7);
    expect(new Set(steps.map((s) => s.id)).size).toBe(7);
    for (const s of steps) { expect(s.title.length).toBeGreaterThan(3); expect(s.body.length).toBeGreaterThan(20); }
  });
  it('تغطي المحاور المطلوبة', () => {
    const all = steps.map((s) => s.title + s.body).join(' ');
    for (const w of ['المواد', 'الخطة الأسبوعية', 'المؤقت', 'التقويم', 'النقاط', 'المستويات', 'الأوسمة', 'العد التنازلي', 'بطاقة', 'الإعدادات']) expect(all).toContain(w);
  });
  it('الأرقام من الثوابت: عدد الأوسمة والمستويات', () => {
    const lv = steps.find((s) => s.id === 'levels').body;
    expect(lv).toContain(`${BADGES.length} وساماً`);
    expect(lv).toContain(`${MAX_LEVEL} مستوى`);
    expect(BADGES).toHaveLength(32);
  });
  it('خطوة المواد وحدها فيها اختيار المواد', () => {
    expect(steps.filter((s) => s.subjects).map((s) => s.id)).toEqual(['plan']);
    expect(SUGGESTED_SUBJECTS.length).toBeGreaterThan(3);
  });
  it('لكل خطوة رسم معرّف', () => {
    for (const s of steps) expect(ART_KEYS).toContain(s.art);
  });
  it('التنقل بحدود ثابتة', () => {
    expect(tourNext(6, 7)).toBe(6); expect(tourNext(0, 7)).toBe(1);
    expect(tourPrev(0)).toBe(0); expect(tourPrev(3)).toBe(2);
  });
  it('المفاتيح في الواجهة العربية: يسار = التالي، يمين = السابق، Esc = إغلاق', () => {
    expect(tourKeyAction('ArrowLeft')).toBe('next');
    expect(tourKeyAction('ArrowRight')).toBe('prev');
    expect(tourKeyAction('Escape')).toBe('close');
    expect(tourKeyAction('a')).toBeNull();
  });
  it('الظهور التلقائي للجديد فقط (قاعدة الأهلية لم تتغير)', () => {
    expect(shouldShowOnboarding({ sessions: [], subjects: [] }, false)).toBe(true);
    expect(shouldShowOnboarding({ sessions: [], subjects: [] }, true)).toBe(false);
    expect(shouldShowOnboarding({ sessions: [{}], subjects: [] }, false)).toBe(false);
  });
});

describe('بصمة المطوّر', () => {
  it('النص والرابط كما طُلبا', () => {
    expect(DEV_TAGLINE).toBe('صُنع بشغف لدعم الطلبة — تطوير إبراهيم');
    expect(INSTAGRAM_HANDLE).toBe('brahim_db7');
    expect(INSTAGRAM_URL).toBe('https://www.instagram.com/brahim_db7/');
    expect(DEV_CONTACT_TEXT).toContain('اقتراح');
  });
  it('الرابط الخارجي بـ noopener noreferrer و_blank وبلا innerHTML', () => {
    const src = readFileSync('src/ui/credits.js', 'utf8');
    expect(src).toContain("'noopener noreferrer'");
    expect(src).toContain("'_blank'");
    expect(strip(src)).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });
  it('core/tour و core/credits نقيان وملفات الجولة بلا innerHTML', () => {
    for (const f of ['core/tour', 'core/credits']) expect(strip(readFileSync(`src/${f}.js`, 'utf8'))).not.toMatch(/\b(document|window|localStorage)\b/);
    for (const f of ['ui/onboarding', 'ui/tour-art', 'ui/credits', 'ui/shell']) expect(strip(readFileSync(`src/${f}.js`, 'utf8'))).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
  });
});
