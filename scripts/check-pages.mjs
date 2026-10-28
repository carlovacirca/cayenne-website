// Checks the built site (dist/client): every scroll stop is exactly one screen, no sideways scroll, no errors.
// usage: node scripts/check-pages.mjs [page1,page2] [sizes] [shotsDir]
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIR = path.resolve('dist/client');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain' };
const pages = (process.argv[2] || fs.readdirSync(DIR).filter(f => f.endsWith('.html')).join(',')).split(',');
const sizes = (process.argv[3] || '1440x900,1366x768,390x844,375x667').split(',');
const shots = process.argv[4];
const opts = {}; if (process.env.HTTPS_PROXY) opts.proxy = { server: process.env.HTTPS_PROXY };
const b = await chromium.launch(opts);
let bad = 0;
for (const pg of pages) {
  const res = [];
  for (const s of sizes) {
    const [w, h] = s.split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.route('http://site.test/**', async r => {
      const u = new URL(r.request().url());
      /* no Worker here: answer the API the way a deploy without keys does */
      if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"notReady":"keys"}' });
      let f = decodeURIComponent(u.pathname.replace(/^\//, '')) || 'index.html';
      if (!path.extname(f)) f += '.html';
      const fp = path.join(DIR, f);
      if (!fs.existsSync(fp)) { errs.push('missing ' + f); return r.fulfill({ status: 404, body: '' }); }
      return r.fulfill({ path: fp, contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
    });
    await p.goto('http://site.test/' + pg); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(900);
    const info = await p.evaluate(() => ({ snaps: [...document.querySelectorAll('.snap')].map(x => Math.round(x.getBoundingClientRect().height)), sw: document.documentElement.scrollWidth }));
    const off = info.snaps.filter(x => x !== h);
    if (shots) {
      const n = info.snaps.length;
      for (let i = 0; i < Math.max(n, 1); i++) {
        if (n) { await p.evaluate(i => { const el = document.querySelectorAll('.snap')[i]; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY); }, i); await p.waitForTimeout(1700); }
        await p.screenshot({ path: path.join(shots, `${pg.replace('.html', '')}-${w}x${h}-${i + 1}.png`), fullPage: !n });
      }
    }
    const ok = !off.length && info.sw <= w && !errs.length; if (!ok) bad++;
    res.push(`${s}:${ok ? 'ok' : 'FAIL'}${off.length ? ' off=' + off.join('/') : ''}${info.sw > w ? ' sideways' : ''}${errs.length ? ' err=' + errs.slice(0, 2).join(' | ') : ''}`);
    await ctx.close();
  }
  console.log(pg.padEnd(30), res.join('  '));
}
console.log('failing checks:', bad);
await b.close();
