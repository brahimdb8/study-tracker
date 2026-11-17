import { describe, expect, it } from 'vitest';
import {
  THEME_KEY, nextThemePref, normalizeThemePref, readThemePref, resolveTheme, writeThemePref,
} from '../src/ui/theme.js';
import { memoryStorage } from './helpers.js';

describe('theme', () => {
  it('normalizeThemePref: أي قيمة غير معروفة → auto', () => {
    expect(normalizeThemePref('dark')).toBe('dark');
    for (const bad of [undefined, null, 'blue', 5, {}]) expect(normalizeThemePref(bad)).toBe('auto');
  });

  it('الدورة: auto → light → dark → auto', () => {
    expect(nextThemePref('auto')).toBe('light');
    expect(nextThemePref('light')).toBe('dark');
    expect(nextThemePref('dark')).toBe('auto');
    expect(nextThemePref('garbage')).toBe('light');
  });

  it('resolveTheme: التلقائي يتبع النظام، والصريح يتجاوزه', () => {
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('???', true)).toBe('light');
  });

  it('الحفظ والقراءة: auto يمسح المفتاح، والتالف يُهمل', () => {
    const st = memoryStorage();
    writeThemePref(st, 'light');
    expect(st.data[THEME_KEY]).toBe('light');
    expect(readThemePref(st)).toBe('light');
    writeThemePref(st, 'auto');
    expect(st.data[THEME_KEY]).toBeUndefined();
    st.setItem(THEME_KEY, 'neon');
    expect(readThemePref(st)).toBe('auto');
  });

  it('تخزين يرمي أخطاء لا يكسر شيئاً', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(readThemePref(broken)).toBe('auto');
    expect(() => writeThemePref(broken, 'dark')).not.toThrow();
  });
});
