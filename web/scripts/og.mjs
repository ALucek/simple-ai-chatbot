// Generates src/app/opengraph-image.png
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ART = [
  '  ____ _           _     __                  _    ',
  ' / ___| |__   __ _| |_  | //  _   _  ___ ___| | __',
  "| |   | '_ \\ / _` | __| |//| | | | |/ __/ _ \\ |/ /",
  '| |___| | | | (_| | |_  // |_| |_| | (_|  __/   < ',
  ' \\____|_| |_|\\__,_|\\__| |_____\\__,_|\\___\\___|_|\\_\\',
].join('\n');

const html = `<!doctype html><html><body style="margin:0;width:1200px;height:630px;display:flex;align-items:center;justify-content:center;background:#ffffff"><pre style="margin:0;font-family:'Courier New',monospace;font-size:38px;line-height:1.2;color:#1a1a1a;white-space:pre">${ART}</pre></body></html>`;

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'app',
  'opengraph-image.png',
);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.setContent(html);
await page.screenshot({
  path: out,
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});
await browser.close();
console.log('wrote', out);
