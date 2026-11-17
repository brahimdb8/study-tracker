import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isOptedOut, shouldLoadVisitorStats } from '../src/core/visitor-stats.js';

const ok = { token: 'abcdef123456', doNotTrack: null, optedOut: false, online: true };

describe('بوابة تحليلات الزوار', () => {
  it('لا تعمل بلا مفتاح أو بمفتاح قصير', () => {
    expect(shouldLoadVisitorStats({ ...ok, token: undefined })).toBe(false);
    expect(shouldLoadVisitorStats({ ...ok, token: '' })).toBe(false);
    expect(shouldLoadVisitorStats({ ...ok, token: 'abc' })).toBe(false);
  });
  it('تعمل عند اجتماع الشروط', () => expect(shouldLoadVisitorStats(ok)).toBe(true));
  it('تحترم الرفض وعدم التتبع والأوفلاين', () => {
    expect(shouldLoadVisitorStats({ ...ok, optedOut: true })).toBe(false);
    expect(shouldLoadVisitorStats({ ...ok, doNotTrack: '1' })).toBe(false);
    expect(shouldLoadVisitorStats({ ...ok, doNotTrack: 'yes' })).toBe(false);
    expect(shouldLoadVisitorStats({ ...ok, online: false })).toBe(false);
  });
  it('isOptedOut', () => {
    expect(isOptedOut('off')).toBe(true);
    expect(isOptedOut(null)).toBe(false);
  });
});

function build(env) {
  const out = mkdtempSync(join(tmpdir(), 'st-build-'));
  execSync(`npx vite build --outDir ${out} --emptyOutDir`, { env: { ...process.env, ...env }, stdio: 'pipe' });
  const files = readdirSync(join(out, 'assets')).filter((f) => f.endsWith('.js'));
  const all = files.map((f) => readFileSync(join(out, 'assets', f), 'utf8')).join('\n');
  const sw = readFileSync(join(out, 'sw.js'), 'utf8');
  rmSync(out, { recursive: true, force: true });
  return { all, sw };
}

describe('مخرجات البناء', () => {
  it('البناء الافتراضي بلا أي كود تحليلات، وببناء بمفتاح يظهر المفتاح والـ SW لا يمسه', () => {
    expect(existsSync('.env.example')).toBe(true);
    const plain = build({ VITE_ANALYTICS_TOKEN: '' });
    expect(plain.all).not.toContain('cloudflareinsights');
    const withToken = build({ VITE_ANALYTICS_TOKEN: 'tok_test_123456' });
    expect(withToken.all).toContain('cloudflareinsights');
    expect(withToken.all).toContain('tok_test_123456');
    expect(withToken.sw).not.toContain('cloudflareinsights'); // الـ SW لا يعرف التحليلات إطلاقاً
  }, 120000);
});
