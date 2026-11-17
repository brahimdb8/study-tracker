// خادم ساكن صغير لنسخة معزولة من dist (يُستعمل في اختبار التحديث: نعدّل sw.js في النسخة دون المساس بالبقية).
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

/** ينسخ dist إلى مجلد مؤقت ويخدمه على منفذ عشوائي. dir يمكن تعديل ملفاته أثناء الاختبار. */
export async function serveDistCopy(distDir = 'dist') {
  const dir = mkdtempSync(join(tmpdir(), 'st-e2e-'));
  cpSync(distDir, dir, { recursive: true });
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = join(dir, rel);
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    // الصفحات وsw بلا كاش HTTP كما في الإنتاج (Netlify _headers)
    const noCache = /\.html$|sw\.js$|manifest/.test(rel);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    dir, origin: `http://127.0.0.1:${port}`,
    close: async () => { await new Promise((r) => server.close(r)); rmSync(dir, { recursive: true, force: true }); },
  };
}
