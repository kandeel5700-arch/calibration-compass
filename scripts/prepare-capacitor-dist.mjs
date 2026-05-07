#!/usr/bin/env node
/**
 * يجهز مجلد dist لـ Capacitor:
 * 1. ينقل محتوى dist/client إلى dist/ مباشرة
 * 2. لو مفيش index.html (TanStack Start SSR ما بيولدش واحد ثابت)، نولّده يدوي
 *    من خلال البحث عن JS اللي فيه hydrateRoot وملف الـ CSS الرئيسي
 * 3. يحوّل المسارات المطلقة /assets/ إلى نسبية assets/
 * 4. يحذف dist/server و dist/client بعد النقل
 */
import {
  existsSync, readFileSync, writeFileSync, rmSync,
  readdirSync, cpSync,
} from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const CLIENT = join(DIST, 'client');
const SERVER = join(DIST, 'server');

if (!existsSync(CLIENT)) {
  console.error('[prepare-capacitor-dist] dist/client مش موجود. اعمل vite build الأول.');
  process.exit(1);
}

// 1) انقل كل محتوى dist/client إلى dist/
console.log('[prepare-capacitor-dist] نقل dist/client → dist/');
for (const entry of readdirSync(CLIENT)) {
  const from = join(CLIENT, entry);
  const to = join(DIST, entry);
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

// 2) احذف dist/client و dist/server (مش محتاجينهم لتطبيق Capacitor)
rmSync(CLIENT, { recursive: true, force: true });
if (existsSync(SERVER)) rmSync(SERVER, { recursive: true, force: true });

// احذف ملفات Worker/Cloudflare اللي مش محتاجينها
for (const f of ['_worker.js', 'wrangler.json', '.dev.vars', '.vite', '.assetsignore']) {
  const p = join(DIST, f);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

// 3) جهّز index.html
const indexPath = join(DIST, 'index.html');
const ASSETS_DIR = join(DIST, 'assets');

if (!existsSync(indexPath)) {
  console.log('[prepare-capacitor-dist] index.html مش موجود — هنولّده من ملفات assets');

  if (!existsSync(ASSETS_DIR)) {
    console.error('[prepare-capacitor-dist] مفيش مجلد assets!');
    process.exit(1);
  }

  const files = readdirSync(ASSETS_DIR);

  // ابحث عن JS فيه hydrateRoot (entry الكلاينت)
  let entryJs = null;
  for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const content = readFileSync(join(ASSETS_DIR, f), 'utf8');
    if (content.includes('hydrateRoot') || content.includes('createRoot')) {
      // اختار الأصغر (الـ entry عادة أصغر من الـ chunks الكبيرة)
      if (!entryJs || content.length < readFileSync(join(ASSETS_DIR, entryJs), 'utf8').length) {
        entryJs = f;
      }
    }
  }

  if (!entryJs) {
    console.error('[prepare-capacitor-dist] مش لاقي entry JS فيه hydrateRoot');
    process.exit(1);
  }

  // ابحث عن أكبر CSS (styles الرئيسية)
  const cssFiles = files.filter((f) => f.endsWith('.css'));
  const mainCss = cssFiles.sort(
    (a, b) => readFileSync(join(ASSETS_DIR, b)).length - readFileSync(join(ASSETS_DIR, a)).length
  )[0];

  console.log(`[prepare-capacitor-dist] entry JS: ${entryJs}`);
  console.log(`[prepare-capacitor-dist] main CSS: ${mainCss || '(none)'}`);

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0d1f2a" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>UECC Survey</title>
    <meta name="description" content="UECC Survey — نظام احترافي لإدارة وجرد أجهزة المساحة وتتبع المعايرات" />
    ${mainCss ? `<link rel="stylesheet" href="assets/${mainCss}" />` : ''}
    <script type="module" src="assets/${entryJs}"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;
  writeFileSync(indexPath, html, 'utf8');
  console.log('[prepare-capacitor-dist] ✅ تم توليد index.html');
} else {
  // عدّل المسارات المطلقة → نسبية
  let html = readFileSync(indexPath, 'utf8');
  html = html.replace(/(src|href)="\/assets\//g, '$1="assets/');
  writeFileSync(indexPath, html, 'utf8');
  console.log('[prepare-capacitor-dist] تم تعديل المسارات في index.html');
}

console.log('[prepare-capacitor-dist] ✅ dist جاهز لـ Capacitor');
