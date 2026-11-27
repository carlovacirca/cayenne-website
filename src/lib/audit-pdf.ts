// The audit as a PDF of real text (so it can be read, searched and analysed again), with clickable source links.
import { PDFDocument, StandardFonts, rgb, PDFString, type PDFFont, type PDFPage } from 'pdf-lib';
import type { AuditDoc } from '../portal/logic';
import {
  KIND, qKey, rKey, fieldText, stillNeeded, services, autos, baseline, checkedCount, answeredCount, questionCount,
  OPTIONS, optResult, choice, LV, fmt, optionTotals, totalTaskHours, taskHours, str,
} from '../portal/logic';

/* the standard PDF fonts only cover Windows-1252, so anything else becomes a plain stand-in */
const WIN = new Set<number>([0x20ac, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x17d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x17e, 0x178]);
function clean(s: unknown) {
  const t = String(s ?? '').replace(/[–—]/g, '-').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≈/g, '~').replace(/\r/g, '').replace(/\t/g, '  ').replace(/ /g, ' ');
  return Array.from(t).map(c => { const n = c.codePointAt(0)!; return c === '\n' || (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN.has(n) ? c : '?'; }).join('');
}

const RED = rgb(196 / 255, 15 / 255, 11 / 255), INK = rgb(23 / 255, 17 / 255, 15 / 255), MUT = rgb(107 / 255, 96 / 255, 91 / 255), LINE = rgb(216 / 255, 207 / 255, 201 / 255), SOFT = rgb(248 / 255, 245 / 255, 242 / 255), AMBER = rgb(161 / 255, 92 / 255, 0);
const W = 595.28, H = 841.89, M = 50, TOP = H - 56, BOTTOM = 60;

class Writer {
  pdf!: PDFDocument; page!: PDFPage; y = TOP; f!: PDFFont; b!: PDFFont; i!: PDFFont; c!: PDFFont;
  async init() {
    this.pdf = await PDFDocument.create();
    this.f = await this.pdf.embedFont(StandardFonts.Helvetica); this.b = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    this.i = await this.pdf.embedFont(StandardFonts.HelveticaOblique); this.c = await this.pdf.embedFont(StandardFonts.Courier);
    this.newPage();
  }
  newPage() { this.page = this.pdf.addPage([W, H]); this.y = TOP; }
  need(h: number) { if (this.y - h < BOTTOM) this.newPage(); }
  lines(text: string, font: PDFFont, size: number, width: number) {
    const out: string[] = [];
    clean(text).split('\n').forEach(para => {
      const words = para.split(/ +/); let line = '';
      const push = (w: string) => {
        if (font.widthOfTextAtSize(w, size) <= width) { line = w; return; }
        let chunk = ''; // break very long words such as links
        for (const ch of w) { if (font.widthOfTextAtSize(chunk + ch, size) > width) { out.push(chunk); chunk = ch; } else chunk += ch; }
        line = chunk;
      };
      words.forEach(w => { const t = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(t, size) <= width) line = t; else { if (line) out.push(line); push(w); } });
      out.push(line);
    });
    return out;
  }
  text(s: unknown, o: { size?: number; font?: PDFFont; color?: any; indent?: number; gap?: number; lh?: number; link?: string } = {}) {
    const size = o.size || 10, font = o.font || this.f, indent = o.indent || 0, lh = o.lh || size * 1.38, width = W - M * 2 - indent;
    const ls = this.lines(String(s ?? ''), font, size, width);
    ls.forEach(l => {
      this.need(lh);
      this.page.drawText(l, { x: M + indent, y: this.y - size, size, font, color: o.color || INK });
      if (o.link && l) this.addLink(M + indent, this.y - size - 2, font.widthOfTextAtSize(l, size), size + 4, o.link);
      this.y -= lh;
    });
    this.y -= o.gap ?? 2;
  }
  addLink(x: number, y: number, w: number, h: number, url: string) {
    const ctx = this.pdf.context;
    const ref = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + w, y + h], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } }));
    this.page.node.addAnnot(ref);
  }
  h1(s: string) { this.need(120); this.y -= 10; this.text(s, { size: 17, font: this.b, gap: 4 }); this.rule(RED, 1.4); this.y -= 6; }
  h2(s: string) { this.need(70); this.y -= 6; this.text(s, { size: 12.5, font: this.b, gap: 4 }); }
  h3(s: string) { this.need(44); this.text(s, { size: 10.5, font: this.b, gap: 2 }); }
  rule(color = LINE, th = 0.7) { this.need(8); this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: th, color }); this.y -= 6; }
  kv(k: string, v: string | null, indent = 0) {
    const size = 9.5, kw = 190; this.need(size * 1.5);
    const ls = this.lines(v == null ? 'missing' : v, this.f, size, W - M * 2 - indent - kw);
    this.page.drawText(clean(k), { x: M + indent, y: this.y - size, size, font: this.f, color: MUT });
    ls.forEach((l, j) => { if (j) this.need(size * 1.4); this.page.drawText(l, { x: M + indent + kw, y: this.y - size, size, font: v == null ? this.i : this.b, color: v == null ? AMBER : INK }); this.y -= size * 1.4; });
  }
  box(lines: [string, string][]) { // a soft panel of label: value pairs
    const size = 9.5, lh = 15, h = lines.length * lh + 14; this.need(h + 6);
    this.page.drawRectangle({ x: M, y: this.y - h, width: W - M * 2, height: h, color: SOFT, borderColor: LINE, borderWidth: 0.7 });
    let y = this.y - 12;
    lines.forEach(([k, v]) => { this.page.drawText(clean(k), { x: M + 12, y: y - size + 2, size, font: this.f, color: MUT }); this.page.drawText(clean(v), { x: M + 230, y: y - size + 2, size, font: this.b, color: INK }); y -= lh; });
    this.y -= h + 10;
  }
}

export async function auditPdf(d: AuditDoc, m: { number: number; status: string; completed_at: string | null; updated_at: string; client: string }) {
  const w = new Writer(); await w.init();
  const name = d.business.name || m.client || 'Business', when = new Date(m.completed_at || m.updated_at);
  const date = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const needs = stillNeeded(d), pri = (p: number) => needs.filter(n => n.pri === p).length;
  const an = d.analysis && d.analysis.result ? d.analysis.result : null;
  const label = (id: string) => { // evidence ids back to readable items
    if (id.startsWith('q:')) { for (const s of d.template.stages) for (const q of s.qs) if (qKey(q.id) === id) return 'Q' + q.n + ' ' + q.t; }
    if (id.startsWith('r:')) { const f = d.research.items.find(x => rKey(x.id) === id); if (f) return 'Research: ' + f.t.slice(0, 90) + (f.t.length > 90 ? '...' : ''); }
    return id;
  };

  /* ---------- cover ---------- */
  w.page.drawText('Cayenne', { x: M, y: TOP - 18, size: 22, font: w.b, color: RED });
  w.page.drawText(clean('Audit ' + m.number), { x: W - M - w.b.widthOfTextAtSize('Audit ' + m.number, 13), y: TOP - 14, size: 13, font: w.b, color: INK });
  w.y = TOP - 44;
  w.text(name, { size: 21, font: w.b, gap: 2 });
  w.text((m.status === 'complete' ? 'Finished on ' : 'Draft, last updated ') + date + '. Prepared by Cayenne.', { size: 10.5, color: MUT, gap: 8 });
  w.text('How to read it: "?" means not sure yet and still to confirm. "Missing" or "not answered" means no information yet. Priority 1 items are the most important to find out.', { size: 9, font: w.i, color: MUT, gap: 8 });
  const tot = optionTotals(d);
  w.box([
    ['Research checked with the business', checkedCount(d) + ' of ' + d.research.items.length],
    ['Questions answered', answeredCount(d) + ' of ' + questionCount(d)],
    ['Still needed: priority 1 (not sure, nothing yet)', String(pri(1))],
    ['Still needed: priority 2 (not sure, to confirm)', String(pri(2))],
    ['Still needed: priority 3 (not answered or checked)', String(pri(3))],
    ['Hours a year that could be saved (estimate)', tot.today ? fmt(tot.saved) + ' of ' + fmt(tot.today) : 'needs answers'],
  ]);

  w.h1('Summary');
  if (an && an.summary) w.text(an.summary, { size: 10.5, gap: 6 }); else w.text('The AI analysis has not been run on this audit yet. The services and automations below come from the live rules.', { size: 10, font: w.i, color: MUT, gap: 6 });
  if (an && Array.isArray(an.ask_next) && an.ask_next.length) { w.h3('Ask next'); an.ask_next.forEach((q: string, i: number) => w.text((i + 1) + '. ' + q, { size: 10, indent: 8 })); }

  /* ---------- money ---------- */
  w.h1('Where the money comes in');
  if (an && Array.isArray(an.money) && an.money.length) an.money.forEach((x: any) => w.kv(str(x.channel), str(x.share) + (x.comment ? '. ' + str(x.comment) : '')));
  w.h3('Baseline numbers from the answers');
  baseline(d).forEach(([k, v]) => w.kv(k, v));

  /* ---------- services ---------- */
  w.h1('Likely services');
  const aiSvc = an && Array.isArray(an.services) && an.services.length ? an.services : null;
  if (aiSvc) aiSvc.forEach((s: any) => {
    w.h3('Section ' + (s.section || '?') + ': ' + str(s.service) + ' (' + str(s.fit || 'possible') + ')');
    if (s.why) w.text(s.why, { size: 10, indent: 8 });
    if (s.first_step) w.text('First step: ' + s.first_step, { size: 9.5, indent: 8, color: MUT });
    if (Array.isArray(s.evidence) && s.evidence.length) w.text('Based on: ' + s.evidence.map((e: string) => label(String(e))).join('; '), { size: 8.5, indent: 8, color: MUT, gap: 6 });
  });
  else services(d).forEach(s => { w.h3('Section ' + s.sec + ': ' + s.n + ' (' + s.fit + ')'); w.text(s.why, { size: 10, indent: 8, gap: 6 }); });

  /* ---------- automations ---------- */
  w.h1('Likely automations');
  const aiAut = an && Array.isArray(an.automations) && an.automations.length ? an.automations : null;
  if (aiAut) aiAut.forEach((x: any) => {
    w.h3((x.priority ? x.priority + '. ' : '') + str(x.name) + (x.confidence ? ' (' + x.confidence + ' confidence)' : '') + (x.section ? ', section ' + x.section : ''));
    const row = (k: string, v: any) => { if (v == null || v === '' || (Array.isArray(v) && !v.length)) return; w.text(k + ': ' + (Array.isArray(v) ? v.join(k === 'Steps' ? ' > ' : ', ') : v), { size: 9.5, indent: 8 }); };
    row('Problem', x.problem); row('Trigger', x.trigger); row('Steps', x.steps); row('Result', x.result); row('Tools', x.tools); row('AI does', x.ai_role);
    row('Staff approve', x.staff_approve || x.owner_approves); row('Fallback', x.fallback); row('Measure', x.metric); row('Estimate', x.estimate);
    if (Array.isArray(x.evidence) && x.evidence.length) w.text('Based on: ' + x.evidence.map((e: string) => label(String(e))).join('; '), { size: 8.5, indent: 8, color: MUT });
    w.y -= 4;
  });
  else if (autos(d).length) autos(d).forEach(a => { w.h3('Section ' + a.sec + ': ' + a.n + ' (' + a.c + ' confidence)'); w.text(a.why + (a.est ? ' ' + a.est + '.' : ''), { size: 10, indent: 8, gap: 6 }); });
  else w.text('None yet. They show as the answers come in.', { size: 10, font: w.i, color: MUT, gap: 6 });

  /* ---------- still needed ---------- */
  w.h1('Information still needed');
  if (!needs.length) w.text('Nothing outstanding.', { size: 10 });
  ([[1, 'Priority 1: marked not sure, nothing written yet'], [2, 'Priority 2: marked not sure, rough information to confirm'], [3, 'Priority 3: not answered or not checked yet']] as [number, string][]).forEach(([p, t]) => {
    const list = needs.filter(n => n.pri === p); if (!list.length) return;
    w.h2(t + ' (' + list.length + ')');
    list.forEach(n => { w.text('- ' + (n.pri < 3 ? '? ' : '') + n.label, { size: 9.5, indent: 6, gap: 0 }); w.text(n.where + (n.sofar ? '. So far: ' + n.sofar : ''), { size: 8.5, indent: 16, color: MUT, gap: 4 }); });
  });

  /* ---------- research ---------- */
  w.h1('Research found online');
  d.research.groups.forEach(g => {
    const items = d.research.items.filter(f => f.g === g.id); if (!items.length) return;
    w.h2(g.name);
    items.forEach(f => {
      const key = rKey(f.id), uns = !!d.unsure[key], v = d.verdict[f.id];
      w.text((uns ? '? ' : '') + '[' + KIND[f.k] + '] ' + f.t, { size: 10, gap: 1 });
      w.text('Checked with the business: ' + (v || 'not yet') + (uns ? ', not sure' : ''), { size: 8.5, indent: 10, color: uns || !v ? AMBER : MUT, gap: 1 });
      if (d.ctx[key]) w.text('Extra context: ' + d.ctx[key], { size: 9, indent: 10, gap: 1 });
      f.src.forEach(s => w.text('Source: ' + (s.label ? s.label + ' ' : '') + s.url, { size: 8, indent: 10, color: RED, link: s.url, gap: 0 }));
      w.y -= 6;
    });
  });
  if (d.research.competitors.length) {
    w.h2('Competitors');
    d.research.competitors.forEach(c => {
      w.text(c.n, { size: 10, font: w.b, gap: 0 });
      w.text('What they do: ' + c.w, { size: 9, indent: 10, gap: 0 }); w.text('Their edge: ' + c.e, { size: 9, indent: 10, gap: 0 }); w.text('Where ' + name + ' can win: ' + c.z, { size: 9, indent: 10, gap: 0 });
      if (c.url) w.text('Source: ' + c.url, { size: 8, indent: 10, color: RED, link: c.url, gap: 0 });
      w.y -= 6;
    });
  }

  /* ---------- every answer ---------- */
  let last = 0;
  d.template.stages.forEach(s => {
    if (s.sec !== last) { w.h1(d.template.sections[String(s.sec)] || 'Section ' + s.sec); last = s.sec; }
    w.h2(s.name);
    s.qs.forEach(q => {
      const key = qKey(q.id), uns = !!d.unsure[key];
      w.text('Q' + q.n + '. ' + q.t + (uns ? '  ?' : ''), { size: 10, font: w.b, gap: 1 });
      q.f.forEach(f => {
        if (f.type === 'tasks') return;
        const t = fieldText(d, f);
        w.kv((f.label || 'Answer'), t ? t + (uns ? ' ?' : '') : null, 10);
      });
      if (q.f.some(f => f.type === 'tasks')) {
        const rows = (d.tasks || []).filter(t => taskHours(t));
        if (!rows.length) w.kv('Task table', null, 10);
        rows.forEach(t => w.kv(t.task || 'Task', t.min + ' min × ' + t.per + ' a week = ' + fmt(taskHours(t)) + ' h a year' + (uns ? ' ?' : ''), 10));
        if (rows.length) w.kv('Total', fmt(totalTaskHours(d)) + ' h a year', 10);
      }
      if (uns) w.text('Marked not sure: to confirm.', { size: 8.5, indent: 10, color: AMBER, gap: 1 });
      if (d.ctx[key]) w.text('Extra context: ' + d.ctx[key], { size: 9, indent: 10, gap: 1 });
      w.y -= 5;
    });
  });

  /* ---------- options ---------- */
  w.h1('Options and estimated hours');
  OPTIONS.filter(o => o.kind === 'hours').forEach(o => {
    const r = optResult(d, o), c = choice(d, o);
    w.kv(o.name, (c ? 'Level ' + c + ' ' + LV[c] : 'Skipped') + (r.b ? '. Today ' + fmt(r.today) + ' h a year, after ' + fmt(r.after) + ' h (estimate)' : '. Needs answers'));
  });
  const on = OPTIONS.filter(o => o.kind === 'growth' && choice(d, o)).map(o => o.name);
  w.kv('Growth engines switched on', on.length ? on.join(', ') : 'none');

  /* ---------- data for analysis ---------- */
  w.newPage();
  w.h1('Data for analysis');
  w.text('The same audit as structured data, for analysis tools. q: ids are questions, r: ids are research items.', { size: 8.5, color: MUT, gap: 6 });
  const data = { audit: m.number, status: m.status, business: d.business, answers: d.answers, checked: d.verdict, not_sure: Object.keys(d.unsure), extra_context: d.ctx, tasks: d.tasks, options: d.choices, still_needed: needs.map(n => ({ id: n.key, priority: n.pri })) };
  w.text(JSON.stringify(data), { size: 7, font: w.c, lh: 9 });

  /* ---------- footer on every page ---------- */
  const pages = w.pdf.getPages();
  pages.forEach((p, i) => {
    const t = clean('Cayenne  ·  ' + name + '  ·  Audit ' + m.number + '  ·  page ' + (i + 1) + ' of ' + pages.length);
    p.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: LINE });
    p.drawText(t, { x: M, y: 28, size: 8, font: w.f, color: MUT });
  });
  w.pdf.setTitle(clean('Cayenne audit ' + m.number + ': ' + name)); w.pdf.setAuthor('Cayenne'); w.pdf.setCreator('Cayenne'); w.pdf.setProducer('Cayenne');
  w.pdf.setSubject('Audit ' + m.number); w.pdf.setCreationDate(new Date());
  return await w.pdf.save();
}
