#!/usr/bin/env node
/**
 * يجهز مجلد dist لـ Capacitor:
 * 1. ينقل محتوى dist/client إلى dist/ مباشرة (عشان index.html يبقى في الجذر)
 * 2. يحوّل المسارات المطلقة /assets/ إلى نسبية assets/ في index.html
 * 3. يحذف dist/server و dist/client بعد النقل (مش محتاجينهم في التطبيق المحلي)
 */
import { existsSync, readFileSync, writeFileSync, rmSync, renameSync, readdirSync, statSync, mkdirSync, cpSync } from 'node:fs';
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
for (const f of ['_worker.js', 'wrangler.json', '.vite']) {
  const p = join(DIST, f);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

// 3) عدّل index.html: المسارات المطلقة → نسبية
const indexPath = join(DIST, 'index.html');
if (existsSync(indexPath)) {
  let html = readFileSync(indexPath, 'utf8');
  html = html.replace(/(src|href)="\/assets\//g, '$1="assets/');
  html = html.replace(/(src|href)="\/([^/"][^"]*)"/g, '$1="$2"');
  writeFileSync(indexPath, html, 'utf8');
  console.log('[prepare-capacitor-dist] تم تعديل المسارات في index.html');
} else {
  console.error('[prepare-capacitor-dist] index.html مش موجود في dist!');
  process.exit(1);
}

console.log('[prepare-capacitor-dist] ✅ dist جاهز لـ Capacitor');
