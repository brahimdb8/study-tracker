// المرحلة 7: حراس شبكة الأمان (ESLint/الأنواع/e2e/CI). لا يختبر منطق التطبيق، بل أن الأدوات تعمل وتحرس فعلاً.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));

/** يفحص نصاً كأنه ملف في المسار المعطى بإعداد المشروع الفعلي */
async function lint(code, filePath) {
  const eslint = new ESLint({ cwd: new URL('..', import.meta.url).pathname });
  const [res] = await eslint.lintText(code, { filePath });
  return res.messages.map((m) => `${m.ruleId}: ${m.message}`);
}

describe('ESLint يحرس القواعد الهندسية', () => {
  it('يمنع innerHTML وouterHTML وinsertAdjacentHTML في src/ui', async () => {
    const a = await lint('export function f(el, s) { el.innerHTML = s; }\n', 'src/ui/x.js');
    const b = await lint('export function f(el, s) { el.outerHTML = s; }\n', 'src/ui/x.js');
    const c = await lint("export function f(el, s) { el.insertAdjacentHTML('beforeend', s); }\n", 'src/ui/x.js');
    for (const msgs of [a, b, c]) expect(msgs.join('\n')).toMatch(/no-restricted/);
  });

  it('يمنع innerHTML داخل خاصية كائن أيضاً (مثل el({ innerHTML }))', async () => {
    const msgs = await lint('export const x = { innerHTML: "<b>1</b>" };\n', 'src/ui/x.js');
    expect(msgs.join('\n')).toMatch(/no-restricted-syntax/);
  });

  it('يمنع document/window/localStorage في src/core', async () => {
    for (const code of ['export const a = document.title;\n', 'export const a = window.innerWidth;\n', 'export const a = localStorage.getItem("k");\n']) {
      const msgs = await lint(code, 'src/core/x.js');
      expect(msgs.join('\n'), code).toMatch(/no-restricted-globals/);
    }
  });

  it('يسمح بـ document في src/ui (الطبقة المسموحة)', async () => {
    const msgs = await lint('export const a = document.title;\n', 'src/ui/x.js');
    expect(msgs).toEqual([]);
  });

  it('يرصد المتغيرات غير المستعملة وeqeqeq', async () => {
    const msgs = await lint('const unused = 1;\nexport const a = (1 == 1);\n', 'src/ui/x.js');
    const joined = msgs.join('\n');
    expect(joined).toMatch(/no-unused-vars/);
    expect(joined).toMatch(/eqeqeq/);
  });
});

describe('إعداد الأنواع', () => {
  const base = JSON.parse(read('tsconfig.json'));
  const core = JSON.parse(read('tsconfig.core.json'));
  it('checkJs مفعّل على src، وcore صارم', () => {
    expect(base.compilerOptions.checkJs).toBe(true);
    expect(base.compilerOptions.noEmit).toBe(true);
    expect(core.compilerOptions.strict).toBe(true);
    expect(core.include).toEqual(['src/core/**/*.js']);
  });
  it('src/core كله بعلامة @ts-check', () => {
    const files = readdirSync(new URL('../src/core/', import.meta.url)).filter((f) => f.endsWith('.js'));
    const missing = files.filter((f) => !read(`src/core/${f}`).includes('@ts-check'));
    expect(missing).toEqual([]);
  });
});

describe('سكربتات المشروع وCI', () => {
  it('السكربتات المطلوبة موجودة', () => {
    for (const s of ['lint', 'typecheck', 'test', 'build', 'e2e', 'verify']) expect(pkg.scripts[s], s).toBeTruthy();
    expect(pkg.scripts.typecheck).toContain('tsconfig.core.json');
    expect(pkg.scripts.verify).toMatch(/lint.*typecheck.*test.*build.*e2e/);
  });

  it('ci.yml يستدعي كل الفحوص بالترتيب ويرفع التقارير', () => {
    const ci = read('.github/workflows/ci.yml');
    for (const cmd of ['npm run lint', 'npm run typecheck', 'npm test', 'npm run build', 'npm run e2e', 'upload-artifact']) {
      expect(ci, cmd).toContain(cmd);
    }
    expect(ci).toContain('needs: checks');
  });

  it('e2e: أربع تركيبات (1280/390 × فاتح/داكن) وملفات السيناريوهات موجودة', () => {
    const cfg = read('playwright.config.js');
    expect(cfg).toContain('width: 1280');
    expect(cfg).toContain('width: 390');
    expect(cfg).toMatch(/'light', 'dark'/);
    for (const f of ['e2e/flows.spec.js', 'e2e/pages.spec.js', 'e2e/fixtures.js', 'e2e/seed.js']) expect(existsSync(new URL(`../${f}`, import.meta.url)), f).toBe(true);
    expect(read('e2e/fixtures.js')).toContain("'wcag21aa'");
  });

  it('مخرجات الاختبارات خارج git وخارج الحزمة', () => {
    const gi = read('.gitignore');
    for (const p of ['node_modules', 'dist', 'playwright-report', 'test-results', 'e2e-artifacts']) expect(gi, p).toContain(p);
  });

  it('الإصدار 0.9.0 والمخطط 5 بلا تغيير', async () => {
    expect(pkg.version).toBe('0.9.0');
    const { SCHEMA_VERSION } = await import('../src/core/constants.js');
    expect(SCHEMA_VERSION).toBe(5);
  });
});
