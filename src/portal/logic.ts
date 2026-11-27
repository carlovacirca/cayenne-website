// Audit logic shared by the portal screens and the server (PDF, AI brief).
// Plain functions over one audit document: no DOM, no storage.

export type Field = { k: string; type: 'num' | 'text' | 'long' | 'select' | 'chips' | 'tasks'; label?: string; opts?: string[] };
// hint: shown to everyone. tip: a prompt from the research for the developer only (never shown to the client).
export type Question = { id: string; t: string; hint?: string; tip?: string; f: Field[]; n?: number };
export type Stage = { id: string; sec: number; name: string; short: string; qs: Question[] };
export type Template = { id: string; name: string; sections: Record<string, string>; stages: Stage[] };
export type Source = { label: string; url: string };
export type Finding = { id: string; g: string; k: 'gap' | 'good' | 'check' | 'info'; t: string; src: Source[] };
export type Competitor = { n: string; w: string; e: string; z: string; url?: string };
export type Research = { groups: { id: string; name: string }[]; items: Finding[]; competitors: Competitor[] };
export type Task = { task: string; min: string | number; per: string | number };
export type AuditDoc = {
  v: number;
  business: Record<string, string>;
  template: Template;
  research: Research;
  answers: Record<string, unknown>;
  verdict: Record<string, string>;
  ctx: Record<string, string>;
  unsure: Record<string, boolean>;
  tasks: Task[];
  choices: Record<string, number>;
  analysis: { at: string; result: any; secs?: number } | null;
};

export const KIND: Record<string, string> = { gap: 'Gap', good: 'Strength', check: 'Check', info: 'Fact' };
export const VERDICTS = ['True', 'Not true'];
export const qKey = (id: string) => 'q:' + id;
export const rKey = (id: string) => 'r:' + id;

export function numberQuestions(t: Template) { let n = 0; t.stages.forEach(s => s.qs.forEach(q => { q.n = ++n; })); return t; }
export function fmt(n: number) { return Math.round(n).toLocaleString('en-GB'); }
export function clamp(x: number) { return Math.max(0, Math.min(100, Math.round(x))); }
export function str(v: unknown) { return v == null ? '' : String(v).trim(); }

export function num(d: AuditDoc, k: string): number | null { const v = d.answers[k]; return v === '' || v == null || isNaN(Number(v)) ? null : Number(v); }
export function has(d: AuditDoc, k: string): boolean { const v = d.answers[k]; return Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== ''; }
export function list(d: AuditDoc, k: string): string[] { const v = d.answers[k]; return Array.isArray(v) ? v.map(String) : []; }
export function sel(d: AuditDoc, k: string): string { return str(d.answers[k]); }

export function taskHours(t: Task) { const m = Number(t.min), p = Number(t.per); return m > 0 && p > 0 ? m * p * 46 / 60 : 0; }
export function totalTaskHours(d: AuditDoc) { return (d.tasks || []).reduce((s, t) => s + taskHours(t), 0); }
export function fieldAnswered(d: AuditDoc, f: Field) { return f.type === 'tasks' ? totalTaskHours(d) > 0 : has(d, f.k); }
export function qAnswered(d: AuditDoc, q: Question) { return q.f.some(f => fieldAnswered(d, f)); }
export function qCoverage(d: AuditDoc, s: Stage) {
  const fs = s.qs.flatMap(q => q.f); if (!fs.length) return 0;
  return fs.filter(f => fieldAnswered(d, f)).length / fs.length;
}
export function checkedCount(d: AuditDoc) { return d.research.items.filter(f => !!d.verdict[f.id]).length; }
export function researchCoverage(d: AuditDoc) { return d.research.items.length ? checkedCount(d) / d.research.items.length : 0; }
export function answeredCount(d: AuditDoc) { return d.template.stages.reduce((n, s) => n + s.qs.filter(q => qAnswered(d, q)).length, 0); }
export function questionCount(d: AuditDoc) { return d.template.stages.reduce((n, s) => n + s.qs.length, 0); }

/* What a question's answers look like as text, for summaries, the PDF and "so far" notes */
export function fieldText(d: AuditDoc, f: Field): string {
  if (f.type === 'tasks') return totalTaskHours(d) ? fmt(totalTaskHours(d)) + ' h a year in the task table' : '';
  const v = d.answers[f.k];
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
  return Array.isArray(v) ? v.join(', ') : String(v);
}
export function answerText(d: AuditDoc, q: Question): string {
  return q.f.map(f => { const t = fieldText(d, f); return t ? (f.label ? f.label + ': ' : '') + t : ''; }).filter(Boolean).join('; ');
}

/* ---------- information still needed, in the order to chase it ----------
   1: marked Not sure with nothing written (the biggest gap)
   2: marked Not sure but with a rough answer or extra context (needs confirming)
   3: not answered or not checked at all */
export type Need = { key: string; kind: 'q' | 'r'; id: string; pri: 1 | 2 | 3; label: string; where: string; reason: string; sofar: string };
export const PRI_NAME: Record<number, string> = { 1: 'Not sure, nothing yet', 2: 'Not sure, needs confirming', 3: 'Not answered yet' };
export function stillNeeded(d: AuditDoc): Need[] {
  const out: Need[] = [];
  d.template.stages.forEach(s => s.qs.forEach(q => {
    const key = qKey(q.id), uns = !!d.unsure[key], c = str(d.ctx[key]), ans = qAnswered(d, q);
    let pri: 1 | 2 | 3 | 0 = 0;
    if (uns && !ans && !c) pri = 1; else if (uns) pri = 2; else if (!ans && !c) pri = 3;
    if (!pri) return;
    const sofar = [answerText(d, q), c ? 'Extra context: ' + c : ''].filter(Boolean).join(' | ');
    out.push({ key, kind: 'q', id: q.id, pri, label: 'Q' + q.n + ' ' + q.t, where: (d.template.sections[String(s.sec)] || 'Section ' + s.sec) + ', ' + s.name, reason: PRI_NAME[pri], sofar });
  }));
  d.research.items.forEach(f => {
    const key = rKey(f.id), uns = !!d.unsure[key], c = str(d.ctx[key]), v = d.verdict[f.id];
    let pri: 1 | 2 | 3 | 0 = 0;
    if (uns && !v && !c) pri = 1; else if (uns) pri = 2; else if (!v) pri = 3;
    if (!pri) return;
    const g = d.research.groups.find(x => x.id === f.g);
    const sofar = [v ? 'Checked: ' + v : '', c ? 'Extra context: ' + c : ''].filter(Boolean).join(' | ');
    out.push({ key, kind: 'r', id: f.id, pri, label: f.t, where: 'Research, ' + (g ? g.name : f.g), reason: pri === 3 ? 'Not checked yet' : PRI_NAME[pri], sofar });
  });
  return out.sort((a, b) => a.pri - b.pri);
}

/* ---------- live rule scores (0 to 100, opportunity per stage) ---------- */
const MANUAL = ['Paper or notebook', 'Email inbox only', 'Excel', 'Nowhere'];
export function manualLog(d: AuditDoc) { return list(d, 'log').filter(x => MANUAL.indexOf(x) > -1); }
export function contactsDay(d: AuditDoc) { return (num(d, 'calls_d') || 0) + (num(d, 'emails_d') || 0) + (num(d, 'chats_d') || 0); }
export function qHours(d: AuditDoc) { const q = num(d, 'quotes_d'), m = num(d, 'quote_min'); return q && m ? q * m * 5 * 46 / 60 : 0; }
export function labHours(d: AuditDoc) { const p = num(d, 'parcels_d'), m = num(d, 'label_min'); return p && m ? p * m * 5 * 46 / 60 : 0; }
export function expHours(d: AuditDoc) { const w = num(d, 'exp_w'), m = num(d, 'exp_min'); return w && m ? w * m * 46 / 60 : 0; }
export function poHours(d: AuditDoc) { const s = num(d, 'special_d'), m = num(d, 'po_min'); return s && m ? s * m * 5 * 46 / 60 : 0; }
const CH = ['ch_counter', 'ch_phone', 'ch_webuk', 'ch_export', 'ch_ebay', 'ch_other'];
export function chTotal(d: AuditDoc) { return CH.some(k => has(d, k)) ? CH.reduce((s, k) => s + (num(d, k) || 0), 0) : null; }

export function scores(d: AuditDoc): Record<string, number> {
  const o: Record<string, number> = {};
  const mk = list(d, 'mkt_now'), quiet = mk.indexOf('Word of mouth only') > -1 || mk.indexOf('Nothing') > -1;
  const onl = (num(d, 'ch_webuk') || 0) + (num(d, 'ch_ebay') || 0) + (num(d, 'ch_other') || 0), rp = num(d, 'repeat_pct'), t10 = num(d, 'top10');
  o.money = clamp((({ Never: 20, 'Newsletter now and then': 10 } as any)[sel(d, 'keep_touch')] || 0) + (rp != null && rp < 50 ? 15 : 0) + (has(d, 'ch_ebay') && (num(d, 'ch_ebay') || 0) < 5 ? 20 : 0) + (chTotal(d) != null && onl < 30 ? 20 : 0) + (mk.length ? (quiet ? 20 : 8) : 0) + (t10 != null && t10 >= 40 ? 10 : 0));
  const sk = num(d, 'web_skus');
  o.online = clamp((sk != null && sk < 10000 ? 25 : 0) + (sel(d, 'add_how') === 'Added by hand' ? 15 : 0) + (sel(d, 'merge') === 'Happy to merge into one' ? 10 : 0) + (({ Never: 15, Sometimes: 8 } as any)[sel(d, 'gbp_posts')] || 0) + (({ Never: 20, Sometimes: 10 } as any)[sel(d, 'reviews_ask')] || 0) + list(d, 'cust_ask').length * 2 + (({ 'Not ours': 10, 'Not sure': 8 } as any)[sel(d, 'fbuk')] || 0) + (sel(d, 'web_who') === 'Not sure' ? 5 : 0));
  o.growth = clamp((({ Stopped: 25, 'Never tried': 25, 'Not sure': 10 } as any)[sel(d, 'ebay_status')] || 0) + (({ Yes: 10, Maybe: 5 } as any)[sel(d, 'mkt_yes')] || 0) + (({ 'Yes, but not looked after': 15, No: 20, 'Not sure': 12 } as any)[sel(d, 'mc')] || 0) + list(d, 'want_more').length * 4 + (({ 'Nobody looks for new customers': 20, Sometimes: 10 } as any)[sel(d, 'outreach')] || 0) + (list(d, 'exp_leads').length ? 5 : 0));
  const md = num(d, 'missed_d');
  o.enq = clamp((md != null ? Math.min(md * 5, 30) : 0) + (({ 'Next day': 20, '2 days or more': 30, 'Same day': 8 } as any)[sel(d, 'reply')] || 0) + (({ 'Often lost': 15, 'Voicemail, sometimes lost': 10, 'Called back later': 5 } as any)[sel(d, 'missed_what')] || 0) + manualLog(d).length * 8 + Math.min(contactsDay(d) / 6, 15));
  const w10 = num(d, 'win10');
  o.quote = clamp(Math.min(qHours(d) / 25, 40) + (({ Never: 25, Sometimes: 15 } as any)[sel(d, 'followup')] || 0) + (w10 != null && w10 < 5 ? 10 : 0) + (list(d, 'need').some(x => ['Reg number', 'VIN or chassis', 'Photo', 'Photos'].indexOf(x) > -1) ? 10 : 0) + (sel(d, 'pricing') === 'Case by case' ? 10 : 0));
  const sd = num(d, 'special_d'), dd = num(d, 'dead');
  o.stock = clamp((({ 'Updated by hand': 30, 'Not linked': 35, 'Not sure': 15 } as any)[sel(d, 'stock_sync')] || 0) + (sel(d, 'po_method') === 'Email or phone, by hand' ? 20 : 0) + (sd != null ? Math.min(sd * 3, 20) : 0) + (dd != null && dd >= 10000 ? 15 : 0) + (list(d, 'clear').indexOf('Sit on it') > -1 ? 10 : 0));
  const rm = num(d, 'returns_m');
  o.ship = clamp(Math.min(labHours(d) / 20, 30) + (sel(d, 'label_how') === "Typed into the courier's website" ? 15 : 0) + (({ 'Sent by hand': 10, 'Not sent': 20 } as any)[sel(d, 'tracking')] || 0) + Math.min(expHours(d) / 20, 20) + (rm != null ? Math.min(rm * 1.5, 15) : 0) + (list(d, 'ret_why').indexOf('Customer ordered the wrong part') > -1 ? 10 : 0));
  const ch = num(d, 'chase_h'), od = num(d, 'overdue');
  o.team = clamp((ch != null ? Math.min(ch * 3, 25) : 0) + (od != null ? Math.min(od * 1.5, 15) : 0) + Math.min(totalTaskHours(d) / 4, 40) + Math.min(list(d, 'dash').length * 3, 15) + (has(d, 'ai_ok') ? 5 : 0));
  return o;
}

export function baseline(d: AuditDoc): [string, string | null][] {
  const rows: [string, string | null][] = [];
  const add = (k: string, v: unknown) => rows.push([k, v == null ? null : String(v)]);
  add('Research checked', checkedCount(d) + ' of ' + d.research.items.length);
  add('Questions answered', answeredCount(d) + ' of ' + questionCount(d));
  add('Sales a month', num(d, 'rev_m') != null ? '£' + fmt(num(d, 'rev_m')!) : null);
  add('Orders a week', num(d, 'orders_w') != null ? fmt(num(d, 'orders_w')!) : null);
  add('Average order', num(d, 'aov') != null ? '£' + fmt(num(d, 'aov')!) : null);
  const ct = chTotal(d); add('Channel split adds up to', ct == null ? null : fmt(ct) + '%' + (Math.abs(ct - 100) > 5 ? ' (check)' : ''));
  add('Online share (web, eBay, other)', ct == null ? null : fmt((num(d, 'ch_webuk') || 0) + (num(d, 'ch_ebay') || 0) + (num(d, 'ch_other') || 0)) + '%');
  add('Repeat customers', num(d, 'repeat_pct') != null ? num(d, 'repeat_pct') + '%' : null);
  add('Gross margin', num(d, 'margin') != null ? num(d, 'margin') + '%' : null);
  add('Products on the website', num(d, 'web_skus') != null ? fmt(num(d, 'web_skus')!) : null);
  add('Calls, emails and chats a day', ['calls_d', 'emails_d', 'chats_d'].some(k => has(d, k)) ? fmt(contactsDay(d)) : null);
  add('Missed calls a day', num(d, 'missed_d'));
  add('Quotes a day', num(d, 'quotes_d')); add('Hours a year on quotes', qHours(d) ? fmt(qHours(d)) : null);
  add('Parcels a day', num(d, 'parcels_d')); add('Export orders a week', num(d, 'exp_w')); add('Returns a month', num(d, 'returns_m'));
  add('Overdue invoices', num(d, 'overdue')); add('Hours a month chasing', num(d, 'chase_h'));
  add('Admin hours a year (task table)', totalTaskHours(d) ? fmt(totalTaskHours(d)) : null);
  return rows;
}

function conf(d: AuditDoc, keys: string[]) { const n = keys.filter(k => has(d, k)).length; return n >= keys.length ? 'high' : n >= Math.ceil(keys.length / 2) ? 'medium' : 'low'; }
export type Auto = { sec: number; st: string; n: string; why: string; est: string; c: string };
export function autos(d: AuditDoc): Auto[] {
  const L: Auto[] = [], s = scores(d), add = (o: Auto) => L.push(o);
  const ow = num(d, 'orders_w'), sk = num(d, 'web_skus');
  if (['Stopped', 'Never tried'].indexOf(sel(d, 'ebay_status')) > -1 || (has(d, 'ch_ebay') && (num(d, 'ch_ebay') || 0) < 5))
    add({ sec: 1, st: 'growth', n: 'Marketplace shop fed from the stock list', why: 'Marketplaces such as eBay bring buyers who search there first, and little or nothing is listed today.', est: ow ? 'Today ' + fmt(ow) + ' orders a week across all channels' : '', c: conf(d, ['ebay_status', 'mkt_yes', 'stock_sync']) });
  if (['No', 'Not sure', 'Yes, but not looked after'].indexOf(sel(d, 'mc')) > -1)
    add({ sec: 1, st: 'growth', n: 'Google Shopping feed for every product with a price', why: 'Free Shopping listings show the product, price and stock in Google results.', est: sk != null ? fmt(sk) + ' products on the site to feed' : '', c: conf(d, ['mc', 'web_skus']) });
  if ((sk != null && sk < 10000) || sel(d, 'add_how') === 'Added by hand')
    add({ sec: 1, st: 'online', n: 'Product pages at scale: AI writes descriptions and fitment, staff check', why: 'Few products are online compared with the range on offer, and buyers search by part or model number.', est: sk != null ? fmt(sk) + ' products online now' : '', c: conf(d, ['web_skus', 'add_how', 'stock_sys']) });
  if (['Never', 'Sometimes'].indexOf(sel(d, 'reviews_ask')) > -1)
    add({ sec: 1, st: 'online', n: 'Review request after every delivery', why: 'Reviews are not asked for every time.', est: ow ? fmt(ow * 46) + ' orders a year to ask (' + ow + ' × 46 weeks)' : '', c: conf(d, ['reviews_ask', 'orders_w']) });
  if (['Never', 'Sometimes'].indexOf(sel(d, 'gbp_posts')) > -1)
    add({ sec: 1, st: 'online', n: 'Weekly Google posts from stock, staff and customer stories', why: 'The Google profile is not posted to every week.', est: '52 posts a year', c: conf(d, ['gbp_posts', 'gbp_access', 'photos']) });
  if (list(d, 'want_more').length || sel(d, 'outreach') === 'Nobody looks for new customers')
    add({ sec: 1, st: 'growth', n: 'Trade outreach to the customer types wanted', why: list(d, 'want_more').length ? 'Wants more: ' + list(d, 'want_more').join(', ') + '.' : 'Nobody looks for new customers today.', est: num(d, 'cap_orders') ? num(d, 'cap_orders') + ' more orders a week wanted' : '', c: conf(d, ['want_more', 'cap_orders', 'outreach']) });
  if (sel(d, 'keep_touch') === 'Never' || (num(d, 'repeat_pct') != null && num(d, 'repeat_pct')! < 60))
    add({ sec: 1, st: 'money', n: 'Reorder reminders to past buyers', why: 'Past buyers are not contacted between orders.', est: num(d, 'list_n') ? fmt(num(d, 'list_n')!) + ' emails on the list' : '', c: conf(d, ['keep_touch', 'repeat_pct', 'list_n']) });
  if (list(d, 'exp_leads').length || num(d, 'ch_export'))
    add({ sec: 1, st: 'growth', n: 'Export enquiry capture with a fast quote reply (form and WhatsApp)', why: 'Export sales run on quotes.', est: num(d, 'ch_export') != null ? num(d, 'ch_export') + '% of sales from export' : '', c: conf(d, ['exp_leads', 'ch_export', 'exp_countries']) });
  const md = num(d, 'missed_d');
  if ((md != null && md >= 1) || ['Next day', '2 days or more'].indexOf(sel(d, 'reply')) > -1)
    add({ sec: 2, st: 'enq', n: "Missed-call text-back, and a chat that never just says 'busy'", why: 'Missed calls and slow replies send orders to the next supplier.', est: md ? fmt(md * 5 * 46) + ' missed calls a year (' + md + ' × 5 days × 46 weeks)' : '', c: conf(d, ['missed_d', 'missed_what', 'reply']) });
  const ml = manualLog(d), cpd = contactsDay(d);
  if (ml.length)
    add({ sec: 2, st: 'enq', n: 'One inbox (CRM): calls, emails, chats and WhatsApp logged against each customer', why: 'Enquiries live in: ' + ml.join(', ') + '.', est: cpd ? fmt(cpd * 5 * 46) + ' contacts a year (' + fmt(cpd) + ' a day × 5 × 46)' : '', c: conf(d, ['log', 'calls_d', 'emails_d']) });
  const q = num(d, 'quotes_d'), qm = num(d, 'quote_min'), w10 = num(d, 'win10');
  if ((q != null && q >= 5) || (qm != null && qm >= 5))
    add({ sec: 2, st: 'quote', n: 'AI product finder: details or photo in, product and a draft quote out, staff approve', why: 'Every quote needs a look-up before a price.', est: qHours(d) ? fmt(qHours(d)) + ' h a year on quotes (' + q + ' × ' + qm + ' min × 5 × 46 ÷ 60)' : '', c: conf(d, ['quotes_d', 'quote_min', 'need', 'id_tool']) });
  if (['Never', 'Sometimes'].indexOf(sel(d, 'followup')) > -1)
    add({ sec: 2, st: 'quote', n: 'Quote follow-up at 1 and 3 days', why: "Quotes that don't buy are not always chased.", est: q && w10 != null ? fmt(q * (10 - w10) / 10 * 5 * 46) + ' unconverted quotes a year (' + q + ' × ' + (10 - w10) + '/10 × 5 × 46)' : '', c: conf(d, ['followup', 'quotes_d', 'win10']) });
  if (['Updated by hand', 'Not linked', 'Not sure'].indexOf(sel(d, 'stock_sync')) > -1)
    add({ sec: 2, st: 'stock', n: 'Stock sync: one stock list feeding the website, marketplaces and Google', why: 'Website stock is ' + (sel(d, 'stock_sync') === 'Not linked' ? 'not linked to the stock list.' : sel(d, 'stock_sync') === 'Not sure' ? 'maybe not linked to the stock list.' : 'updated by hand.'), est: '', c: conf(d, ['stock_sync', 'stock_sys', 'web_skus']) });
  if (sel(d, 'po_method') === 'Email or phone, by hand' && (num(d, 'special_d') || 0) >= 1)
    add({ sec: 2, st: 'stock', n: 'Supplier orders drafted from low stock and special orders, with chasing', why: 'Supplier orders are typed by hand.', est: poHours(d) ? fmt(poHours(d)) + ' h a year (' + num(d, 'special_d') + ' × ' + num(d, 'po_min') + ' min × 5 × 46 ÷ 60)' : '', c: conf(d, ['po_method', 'special_d', 'po_min']) });
  if (sel(d, 'label_how') === "Typed into the courier's website" || ['Sent by hand', 'Not sent'].indexOf(sel(d, 'tracking')) > -1)
    add({ sec: 2, st: 'ship', n: 'Labels and tracking emails made from the order', why: 'Labels are typed in or tracking goes out by hand.', est: labHours(d) ? fmt(labHours(d)) + ' h a year on pick, pack and labels (' + num(d, 'parcels_d') + ' × ' + num(d, 'label_min') + ' min × 5 × 46 ÷ 60)' : '', c: conf(d, ['parcels_d', 'label_min', 'label_how', 'tracking']) });
  if ((num(d, 'exp_w') || 0) >= 1)
    add({ sec: 2, st: 'ship', n: 'Export pack: freight quote request, proforma and paperwork drafted from the order', why: 'Each export order needs a freight quote and paperwork.', est: expHours(d) ? fmt(expHours(d)) + ' h a year (' + num(d, 'exp_w') + ' × ' + num(d, 'exp_min') + ' min × 46 ÷ 60)' : '', c: conf(d, ['exp_w', 'exp_min', 'exp_pay']) });
  const od = num(d, 'overdue'), ch = num(d, 'chase_h');
  if ((od != null && od >= 1) || (ch != null && ch >= 1))
    add({ sec: 2, st: 'team', n: 'Invoice chaser for credit accounts', why: 'Overdue invoices and time spent chasing.', est: ch ? fmt(ch * 12) + ' h a year chasing (' + ch + ' × 12)' : '', c: conf(d, ['overdue', 'chase_h', 'acc_tool']) });
  if (list(d, 'dash').length)
    add({ sec: 2, st: 'team', n: 'Morning screen: ' + list(d, 'dash').slice(0, 4).join(', '), why: 'One screen each morning instead of checking each system.', est: '', c: conf(d, ['dash', 'tools']) });
  if (totalTaskHours(d) >= 50) {
    const top = (d.tasks || []).slice().sort((x, y) => taskHours(y) - taskHours(x))[0];
    add({ sec: 2, st: 'team', n: 'Automate the biggest admin task: ' + (top.task || 'top task'), why: 'Largest row in the task table.', est: fmt(taskHours(top)) + ' h a year (' + top.min + ' min × ' + top.per + ' a week × 46 ÷ 60)', c: 'medium' });
  }
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return L.sort((x, y) => ((s[y.st] || 0) - (s[x.st] || 0)) || (order[x.c] - order[y.c]));
}

export type Service = { sec: number; n: string; fit: 'strong' | 'likely' | 'possible'; why: string };
export function services(d: AuditDoc): Service[] {
  const L: Service[] = [], sk = num(d, 'web_skus'), ml = manualLog(d), md = num(d, 'missed_d');
  const add = (sec: number, n: string, fit: Service['fit'], why: string) => L.push({ sec, n, fit, why });
  const merge = sel(d, 'merge');
  add(1, 'Website: one site, redesigned, with 301 redirects', merge === 'Happy to merge into one' ? 'strong' : merge === 'Keep both' ? 'possible' : 'likely', merge === 'Keep both' ? 'They want to keep separate sites: still fix duplicates and tracking.' : 'One site keeps rankings in one place and is simpler to run.');
  add(1, 'Monthly SEO: weekly blogs and product pages', (sk != null && sk < 10000) || sel(d, 'add_how') === 'Added by hand' ? 'strong' : 'likely', sk != null ? fmt(sk) + ' products on the site.' : 'Product range online still to confirm.');
  if (sel(d, 'gbp_posts') !== 'Weekly') add(1, 'Weekly Google Business Profile management', has(d, 'gbp_posts') ? 'strong' : 'likely', has(d, 'gbp_posts') ? 'Google posts: ' + sel(d, 'gbp_posts') + '.' : 'Google posting still to confirm.');
  if (sel(d, 'reviews_ask') !== 'Always') add(1, 'Review engine after every delivery', has(d, 'reviews_ask') ? 'strong' : 'likely', has(d, 'reviews_ask') ? 'Asks for reviews: ' + sel(d, 'reviews_ask') + '.' : 'Review asking still to confirm.');
  if (sel(d, 'ebay_status') !== 'Selling now' || sel(d, 'mc') !== 'Yes, feed running') add(1, 'Marketplaces and Google Shopping, fed from the stock list', ['Stopped', 'Never tried'].indexOf(sel(d, 'ebay_status')) > -1 ? 'strong' : 'likely', has(d, 'ebay_status') ? 'eBay today: ' + sel(d, 'ebay_status') + '.' : 'Marketplace selling still to confirm.');
  if (sel(d, 'fbuk') !== 'Ours' || sel(d, 'social_who') === 'Nobody') add(1, 'Social profiles clean-up (one-off)', sel(d, 'fbuk') === 'Not ours' ? 'strong' : 'likely', 'Social profiles look out of date or not under their control.');
  if (list(d, 'want_more').length || sel(d, 'outreach') !== 'A sales rep does') add(1, 'Trade outreach engine', list(d, 'want_more').length ? 'strong' : 'likely', list(d, 'want_more').length ? 'Wants more: ' + list(d, 'want_more').slice(0, 3).join(', ') + '.' : 'Nobody looks for new trade customers yet (to confirm).');
  add(2, 'AI-powered CRM: one inbox, customer history, quotes and follow-ups', ml.length || (md != null && md >= 1) || ['Never', 'Sometimes'].indexOf(sel(d, 'followup')) > -1 ? 'strong' : 'likely', ml.length ? 'Enquiries live in ' + ml.join(', ') + '.' : 'Calls, chat and email run separately today (to confirm).');
  add(2, 'AI product finder and quote drafts', (num(d, 'quotes_d') || 0) >= 5 || (num(d, 'quote_min') || 0) >= 5 ? 'strong' : 'likely', qHours(d) ? fmt(qHours(d)) + ' h a year on quotes.' : 'Quote volume still to confirm.');
  if (['Updated by hand', 'Not linked'].indexOf(sel(d, 'stock_sync')) > -1 || sel(d, 'po_method') === 'Email or phone, by hand') add(2, 'Stock sync and supplier order automations', 'strong', 'Stock or supplier orders are handled by hand.');
  if (sel(d, 'label_how') === "Typed into the courier's website" || ['Sent by hand', 'Not sent'].indexOf(sel(d, 'tracking')) > -1) add(2, 'Dispatch automation: labels and tracking from the order', 'strong', labHours(d) ? fmt(labHours(d)) + ' h a year on pick, pack and labels.' : 'Labels or tracking are done by hand.');
  if ((num(d, 'exp_w') || 0) >= 1) add(2, 'Export quote and paperwork pack', 'strong', num(d, 'exp_w') + ' export orders a week.');
  if ((num(d, 'overdue') || 0) >= 1 || (num(d, 'chase_h') || 0) >= 1) add(2, 'Invoice chasing automation', 'strong', (num(d, 'overdue') || 0) + ' overdue, ' + (num(d, 'chase_h') || 0) + ' h a month chasing.');
  if (list(d, 'dash').length) add(2, 'Custom morning dashboard', 'strong', 'Wants to see: ' + list(d, 'dash').join(', ') + '.');
  const o: Record<string, number> = { strong: 0, likely: 1, possible: 2 };
  return L.sort((x, y) => (x.sec - y.sec) || (o[x.fit] - o[y.fit]));
}

/* ---------- options: how AI could work here, with today, after and saved hours ---------- */
export const LV: Record<number, string> = { 1: 'Assistant', 2: 'Autopilot, staff approve', 3: 'Fully automatic', 4: 'Growth engine', 5: 'Custom build' };
export const LVD: Record<number, string> = { 1: 'Staff ask, AI drafts. Uses tools they already have.', 2: 'Runs on a trigger; a person approves before anything goes out.', 3: 'Runs on its own. Low-risk jobs only.', 4: 'AI goes out and finds or wins work.', 5: 'Their own system, built around how they work.' };
export const REPLY = 0.35; // share of asked customers who leave a review (assumption)
type Level = { l: number; d?: string; cut?: number; ask?: number; no?: string };
export type Option = { id: string; name: string; kind: 'hours' | 'outcome' | 'growth'; rec: number; needs?: string; d?: string; m?: string; base?: (d: AuditDoc) => any; levels?: Level[] };
export const OPTIONS: Option[] = [
  { id: 'contacts', name: 'Calls, emails and chats', kind: 'hours', rec: 2, needs: 'Needs calls, emails and chats a day.',
    base: d => { const c = contactsDay(d); return c ? { h: c * 5 * 46 * 4 / 60, sum: fmt(c) + ' a day × 5 × 46 × 4 min (assumed) ÷ 60' } : null; },
    levels: [{ l: 1, d: 'Saved replies and AI drafts for common questions (stock, price, delivery).', cut: .2 }, { l: 2, d: 'One inbox for calls, email, chat and WhatsApp. AI drafts replies, missed calls get a text back. Staff approve.', cut: .45 }, { l: 3, d: 'Instant acknowledgements and order-status answers go on their own. Advice stays at Level 2.', cut: .6 }, { l: 5, d: 'Level 2 inside their own CRM: every contact logged against the customer, with history and open quotes.', cut: .65 }] },
  { id: 'quotes', name: 'Product ID and quotes', kind: 'hours', rec: 2, needs: 'Needs quotes a day and minutes per quote.',
    base: d => qHours(d) ? { h: qHours(d), sum: num(d, 'quotes_d') + ' quotes a day × ' + num(d, 'quote_min') + ' min × 5 × 46 ÷ 60' } : null,
    levels: [{ l: 1, d: 'AI helps decode part numbers and replacements on request.', cut: .2 }, { l: 2, d: 'AI reads the details or photo, suggests the product and drafts the quote. Staff check and send. Follow-ups at 1 and 3 days.', cut: .5 }, { l: 3, no: 'Not offered: a person checks every product ID and price.' }, { l: 5, d: 'Level 2 inside the CRM with each customer\'s price list and history.', cut: .55 }] },
  { id: 'dispatch', name: 'Pick, pack, labels and tracking', kind: 'hours', rec: 3, needs: 'Needs parcels a day and minutes per parcel.',
    base: d => labHours(d) ? { h: labHours(d), sum: num(d, 'parcels_d') + ' parcels a day × ' + num(d, 'label_min') + ' min × 5 × 46 ÷ 60' } : null,
    levels: [{ l: 1, d: 'Templates for delivery notes and courier details.', cut: .1 }, { l: 2, d: 'Label created from the order; staff confirm the parcel.', cut: .3 }, { l: 3, d: 'Labels, tracking emails and delivery updates run on their own.', cut: .4 }] },
  { id: 'export', name: 'Export quotes and paperwork', kind: 'hours', rec: 2, needs: 'Needs export orders a week and minutes per order.',
    base: d => expHours(d) ? { h: expHours(d), sum: num(d, 'exp_w') + ' a week × ' + num(d, 'exp_min') + ' min × 46 ÷ 60' } : null,
    levels: [{ l: 1, d: 'AI drafts the export quote email and proforma wording.', cut: .2 }, { l: 2, d: 'Freight quote request, proforma and paperwork drafted from the order. Staff approve.', cut: .5 }, { l: 3, no: 'Not offered: export prices and paperwork are checked by a person.' }] },
  { id: 'supplier', name: 'Supplier and special orders', kind: 'hours', rec: 2, needs: 'Needs special orders a day and minutes per order.',
    base: d => poHours(d) ? { h: poHours(d), sum: num(d, 'special_d') + ' a day × ' + num(d, 'po_min') + ' min × 5 × 46 ÷ 60' } : null,
    levels: [{ l: 1, d: 'AI drafts supplier emails from a list.', cut: .2 }, { l: 2, d: 'Reorder list and supplier orders drafted from stock levels and special orders. Staff approve.', cut: .5 }, { l: 3, d: 'Routine reorders go out on their own within set limits.', cut: .7 }] },
  { id: 'inv', name: 'Invoices and chasing', kind: 'hours', rec: 3, needs: 'Needs hours a month chasing.',
    base: d => { const c = num(d, 'chase_h'); return c ? { h: c * 12, sum: c + ' h a month × 12' } : null; },
    levels: [{ l: 1, d: 'AI drafts chase emails on request.', cut: .2 }, { l: 2, d: 'Chasers drafted for every overdue invoice. Staff approve.', cut: .5 }, { l: 3, d: 'Polite chasers at 7, 14 and 30 days that stop when paid, plus a Monday money summary.', cut: .75 }] },
  { id: 'admin', name: 'Repeat admin tasks', kind: 'hours', rec: 2, needs: 'Needs the task table.',
    base: d => { const t = totalTaskHours(d); return t ? { h: t, sum: 'task table total' } : null; },
    levels: [{ l: 1, d: 'AI helps on request: email drafts, summaries, sorting.', cut: .25 }, { l: 2, d: 'Repeat tasks run on triggers; staff approve.', cut: .5 }, { l: 3, d: 'Filing, sorting and tracker updates run on their own.', cut: .7 }] },
  { id: 'rev', name: 'Google and Trustpilot reviews', kind: 'outcome', rec: 3, needs: 'Needs orders a week and whether reviews are asked for.',
    base: d => { const o = num(d, 'orders_w'); if (!o) return null; const r = ({ Never: 0, Sometimes: .4, Always: .9 } as any)[sel(d, 'reviews_ask')]; return { j: { n: o * 46, sum: o + ' orders a week × 46' }, today: o * 46 * (r || 0) * REPLY }; },
    levels: [{ l: 1, d: 'Staff send the review link from a saved message when they remember.', ask: .5 }, { l: 2, d: "Staff tick 'happy customer', AI sends a thank-you with the review link and one reminder.", ask: .9 }, { l: 3, d: 'Sent automatically after delivery, reminder after 5 days. AI drafts replies to new reviews.', ask: 1 }] },
  { id: 'market', name: 'Marketplace shop from the stock list', kind: 'growth', rec: 4, d: 'Every in-stock product with a price listed on the marketplace, stock and price kept in sync, orders dropped into the same order flow.', m: 'Marketplace orders and feedback a month.' },
  { id: 'shopping', name: 'Google Shopping feed', kind: 'growth', rec: 4, d: 'Every product with a price in Google Shopping (free listings first), with part or model numbers in titles.', m: 'Shopping clicks and orders.' },
  { id: 'pages', name: 'Product pages at scale', kind: 'growth', rec: 4, d: 'AI writes descriptions and fitment notes for each product, staff check, pages published in batches.', m: 'Products online and searches won.' },
  { id: 'outreach', name: 'Trade outreach engine', kind: 'growth', rec: 4, d: 'Finds the customer types wanted, writes a short personal email, three touches from a separate mailbox, hands over warm replies. Limited companies only, clear opt-out.', m: 'Replies and new trade accounts a month.' },
  { id: 'exportout', name: 'Export distributor outreach', kind: 'growth', rec: 4, d: 'Finds distributors and fleet buyers in the export countries and opens conversations.', m: 'Export accounts opened.' },
  { id: 'reorder', name: 'Reorder reminders', kind: 'growth', rec: 4, d: 'Past buyers of service items get a reminder when they are likely due.', m: 'Repeat orders a month.' },
  { id: 'content', name: 'Content engine: weekly Google posts and blogs', kind: 'growth', rec: 4, d: 'Each week: one Google post and one blog from stock, staff and customer stories (with permission).', m: 'Posts a month and calls from Google.' },
  { id: 'dashboard', name: 'Morning dashboard', kind: 'growth', rec: 4, d: "One screen: today's orders, open quotes, missed calls, stock to reorder, overdue invoices, export pipeline.", m: 'Used every morning.' },
];
export function choice(d: AuditDoc, o: Option) { const raw = d.choices[o.id]; const c = raw == null ? o.rec : Number(raw); const lv = o.levels && o.levels.find(x => x.l === c); return lv && lv.no ? 0 : c; }
export function optResult(d: AuditDoc, o: Option) {
  const b = o.base ? o.base(d) : null, c = choice(d, o), lv = o.levels ? o.levels.find(x => x.l === c) : undefined;
  if (!b) return { b: null, lv, today: 0, after: 0, cut: 0 };
  if (o.kind === 'hours') { const cut = lv && lv.cut ? lv.cut : 0; return { b, today: b.h, after: b.h * (1 - cut), cut, lv }; }
  return { b, today: b.today, after: lv && lv.ask != null ? b.j.n * lv.ask * REPLY : b.today, cut: 0, lv };
}
export function optionTotals(d: AuditDoc) {
  let t = 0, a = 0; OPTIONS.filter(o => o.kind === 'hours').forEach(o => { const r = optResult(d, o); if (r.b) { t += r.today; a += r.after; } });
  return { today: t, after: a, saved: t - a };
}

/* ---------- a plain text summary of the whole audit ---------- */
export function summaryText(d: AuditDoc, title: string): string {
  const b = d.business, L = [title];
  [['name', 'Business'], ['contact', 'Contact'], ['location', 'Location'], ['website', 'Websites'], ['type', 'What they do'], ['tools', 'Tools they use'], ['prep', 'Prep notes']].forEach(([k, l]) => { if (b[k]) L.push(l + ': ' + b[k]); });
  L.push('', '## Research found online');
  d.research.groups.forEach(g => {
    const items = d.research.items.filter(f => f.g === g.id); if (!items.length) return;
    L.push('### ' + g.name);
    items.forEach(f => {
      const key = rKey(f.id);
      L.push('- [' + (d.verdict[f.id] || 'unchecked') + (d.unsure[key] ? ', not sure' : '') + '] ' + f.t + (f.src.length ? ' (sources: ' + f.src.map(s => s.url).join(' , ') + ')' : ''));
      if (d.ctx[key]) L.push('  Extra context: ' + d.ctx[key]);
    });
  });
  let last = 0;
  d.template.stages.forEach(s => {
    if (s.sec !== last) { L.push('', '# ' + (d.template.sections[String(s.sec)] || 'Section ' + s.sec)); last = s.sec; }
    L.push('', '## ' + s.name);
    s.qs.forEach(q => {
      const key = qKey(q.id), parts = [answerText(d, q)].filter(Boolean);
      if (d.ctx[key]) parts.push('Extra context: ' + d.ctx[key]);
      if (d.unsure[key]) parts.push('NOT SURE');
      L.push('Q' + q.n + ' ' + q.t + ' | ' + (parts.join(' | ') || 'not answered'));
    });
  });
  if (totalTaskHours(d)) { L.push('', '## Task table'); d.tasks.forEach(t => { if (taskHours(t)) L.push(t.task + ': ' + t.min + ' min x ' + t.per + '/wk = ' + fmt(taskHours(t)) + ' h/yr'); }); L.push('Total: ' + fmt(totalTaskHours(d)) + ' h/yr'); }
  L.push('', '## Still needed');
  stillNeeded(d).forEach(n => L.push('P' + n.pri + ' ' + n.label + (n.sofar ? ' | so far: ' + n.sofar : '')));
  L.push('', '## Best-fit services (live rules)');
  services(d).forEach(x => L.push('S' + x.sec + ' ' + x.n + ' [' + x.fit + ']: ' + x.why));
  L.push('', '## Options chosen');
  OPTIONS.forEach(o => { const r = optResult(d, o), c = choice(d, o); L.push(o.name + ': ' + (c ? 'Level ' + c + ' ' + LV[c] : 'skipped') + (r.b && o.kind === 'hours' ? ' | today ' + fmt(r.today) + ' h/yr, after ' + fmt(r.after) + ' h/yr (estimate)' : '')); });
  return L.join('\n');
}

/* ---------- a fresh document, and the next audit made from a finished one ---------- */
export function blankDoc(template: Template, research?: Partial<Research>, business?: Record<string, string>): AuditDoc {
  return {
    v: 1, business: business || {}, template: numberQuestions(JSON.parse(JSON.stringify(template))),
    research: { groups: research?.groups || [], items: research?.items || [], competitors: research?.competitors || [] },
    answers: {}, verdict: {}, ctx: {}, unsure: {}, tasks: [], choices: {}, analysis: null,
  };
}
/* Audit N+1: answers carried over and editable; anything not answered stays empty; "not sure" stays marked so it shows a "?" */
export function nextDoc(d: AuditDoc): AuditDoc {
  const n: AuditDoc = JSON.parse(JSON.stringify(d));
  n.analysis = null;
  // drop empty values so blanks are truly blank
  Object.keys(n.answers).forEach(k => { const v = n.answers[k]; if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete n.answers[k]; });
  Object.keys(n.ctx).forEach(k => { if (!str(n.ctx[k])) delete n.ctx[k]; });
  Object.keys(n.unsure).forEach(k => { if (!n.unsure[k]) delete n.unsure[k]; });
  n.tasks = (n.tasks || []).filter(t => str(t.task) || taskHours(t));
  return n;
}

/* ---------- checks on anything saved or imported ---------- */
const ID = /^[a-z0-9_:-]{1,60}$/i;
export function validTemplate(t: any): t is Template {
  if (!t || typeof t !== 'object' || !Array.isArray(t.stages) || !t.stages.length) return false;
  const seen = new Set<string>();
  for (const s of t.stages) {
    if (!s || !ID.test(s.id) || typeof s.name !== 'string' || !Array.isArray(s.qs)) return false;
    for (const q of s.qs) {
      if (!q || !ID.test(q.id) || seen.has(q.id) || typeof q.t !== 'string' || !Array.isArray(q.f)) return false;
      seen.add(q.id);
      for (const f of q.f) if (!f || !ID.test(f.k) || ['num', 'text', 'long', 'select', 'chips', 'tasks'].indexOf(f.type) < 0) return false;
    }
  }
  return true;
}
export function cleanResearch(r: any): Research {
  const groups = (Array.isArray(r?.groups) ? r.groups : []).filter((g: any) => g && ID.test(g.id)).map((g: any) => ({ id: String(g.id), name: str(g.name).slice(0, 80) || String(g.id) }));
  const ids = new Set<string>();
  const items = (Array.isArray(r?.items) ? r.items : []).filter((f: any) => f && ID.test(f.id) && !ids.has(f.id) && ids.add(f.id)).map((f: any) => ({
    id: String(f.id), g: String(f.g || (groups[0] && groups[0].id) || 'other'), k: ['gap', 'good', 'check', 'info'].indexOf(f.k) > -1 ? f.k : 'info', t: str(f.t).slice(0, 1200),
    src: (Array.isArray(f.src) ? f.src : []).map((s: any) => ({ label: str(s?.label).slice(0, 120), url: safeUrl(s?.url) })).filter((s: Source) => s.url).slice(0, 8),
  }));
  const competitors = (Array.isArray(r?.competitors) ? r.competitors : []).map((c: any) => ({ n: str(c?.n).slice(0, 160), w: str(c?.w).slice(0, 400), e: str(c?.e).slice(0, 300), z: str(c?.z).slice(0, 300), url: safeUrl(c?.url) })).filter((c: Competitor) => c.n).slice(0, 40);
  return { groups, items, competitors };
}
export function safeUrl(u: unknown) { const s = str(u); return /^https:\/\/[^\s<>"']+$/i.test(s) ? s.slice(0, 600) : ''; }
