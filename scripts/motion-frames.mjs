// usage: node scripts/motion-frames.mjs page.html stopIndex out-prefix  -> frames of one scroll stop arriving
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const DIR = path.resolve('dist/client'); const [pg, idx, pre] = process.argv.slice(2);
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.route('http://site.test/**', r => { let f = new URL(r.request().url()).pathname.slice(1) || 'index.html'; const fp = path.join(DIR, f); return fs.existsSync(fp) ? r.fulfill({ path: fp, contentType: T[path.extname(f)] }) : r.fulfill({ status: 404, body: '' }); });
await p.goto('http://site.test/' + pg); await p.waitForTimeout(1200);
console.log(await p.evaluate(i => { const s = document.querySelectorAll('.snap')[i]; return s.dataset.enter + ' items=' + s.querySelectorAll('.m-i').length; }, +idx));
await p.evaluate(i => { const el = document.querySelectorAll('.snap')[i]; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY); }, +idx);
for (const t of [120, 420, 900, 2600]) { await p.waitForTimeout(t === 120 ? 120 : t - 120); await p.screenshot({ path: `${pre}-${t}.png` }); }
console.log(await p.evaluate(i => [...document.querySelectorAll('.snap')[i].querySelectorAll('.floaty')].map(e => e.className).join(' ; '), +idx));
await b.close();
