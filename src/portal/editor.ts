// The audit screen: research and questions on the left, the live tally on the right. Every change saves on its own.
// Every question and every research item has a "Not sure, need info" tick and an Extra context box.
import type { AuditDoc, Field, Question, Stage, Finding, Competitor, Task, Research } from './logic';
import {
  KIND, VERDICTS, qKey, rKey, fmt, str, qCoverage, researchCoverage, stillNeeded, scores, baseline, autos, services,
  OPTIONS, LV, LVD, REPLY, choice, optResult, optionTotals, taskHours, totalTaskHours, summaryText, safeUrl,
} from './logic';
import { api, esc, toast, copyText, twoStep, host, day, when } from './ui';

type Meta = { id: string; client_id: string; number: number; status: string; shared: boolean; parent_id: string | null; rev: number; created_at: string; updated_at: string; completed_at: string | null };
type Patch = {
  answers?: Record<string, unknown>; verdict?: Record<string, string | null>; ctx?: Record<string, string | null>; unsure?: Record<string, boolean | null>;
  tasks?: Task[]; choices?: Record<string, number>; business?: Record<string, string>; research?: Research;
};
type SaveState = 'saved' | 'saving' | 'unsaved' | 'error' | 'locked';

let A: { meta: Meta; client: { id: string; name: string } | null; doc: AuditDoc } | null = null;
let role: 'dev' | 'client' = 'client';
let main: HTMLElement;
let tab = '';
let pending: Patch = {};
let timer = 0, liveTimer = 0, inflight: Promise<void> | null = null;
let saveState: SaveState = 'saved';
let lastEdit = 0, showAll = false, bizOpen = false;
let editing = ''; // a research item being edited ('new:<group>' for a new one), or 'comp:<index>' / 'comp:new'
let ai = { running: false, text: '', t0: 0, error: '' };
let aiTick = 0;
let basis = 0; // when the answers behind the current analysis were saved
let seq = 0;
const bound = new WeakSet<HTMLElement>();

const BIZ: [string, string, boolean][] = [['name', 'Business name', false], ['contact', 'Contact', false], ['location', 'Location', false], ['website', 'Websites', false], ['type', 'What they do', true], ['tools', 'Tools they use', true]];
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const pct = (x: number) => Math.round(x * 100) + '%';
const dev = () => role === 'dev';
const locked = () => !A || A.meta.status !== 'draft';
const smooth = (): ScrollBehavior => (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/* ================= opening and leaving ================= */
export async function openAudit(id: string, r: 'dev' | 'client', el: HTMLElement) {
  await leaveAudit();
  role = r; main = el; const my = ++seq;
  if (!bound.has(el)) { bound.add(el); el.addEventListener('input', onInput); el.addEventListener('change', onChange); el.addEventListener('click', onClick); el.addEventListener('toggle', onToggle, true); }
  main.innerHTML = '<p class="pt-note">Loading the audit…</p>';
  try {
    const res = await api<{ meta: Meta; client: { id: string; name: string } | null; doc: AuditDoc }>('audits/' + encodeURIComponent(id));
    if (my !== seq) return;
    const d = res.doc;
    d.answers = d.answers || {}; d.verdict = d.verdict || {}; d.ctx = d.ctx || {}; d.unsure = d.unsure || {}; d.tasks = d.tasks || []; d.choices = d.choices || {};
    d.business = d.business || {}; d.research = d.research || { groups: [], items: [], competitors: [] };
    A = { meta: res.meta, client: res.client, doc: d };
    basis = d.analysis ? Date.parse(d.analysis.at) : 0;
    pending = {}; saveState = 'saved'; lastEdit = 0; editing = ''; showAll = false; ai = { running: false, text: '', t0: 0, error: '' };
    tab = startTab();
    render();
  } catch (e: any) {
    if (my !== seq) return;
    main.innerHTML = `<div class="pt-card pt-pad"><h2>This audit did not open</h2><p class="pt-sub">${esc(e.message)}</p><p><a class="pt-btn" href="#/">Back</a></p></div>`;
  }
}

/* Save anything waiting, then let the audit go. */
export async function leaveAudit() {
  if (!A) return;
  await flush();
  if (Object.keys(pending).length) toast('Some changes were not saved. Open the audit again to check.');
  clearTimeout(timer); clearTimeout(liveTimer); clearInterval(aiTick);
  pending = {}; A = null; seq++;
}
/* Page closing or hidden: send what is waiting straight away */
export function flushNow() { if (A && Object.keys(pending).length) flush(true); }

async function reload() {
  if (!A) return;
  const id = A.meta.id, my = seq;
  try {
    const res = await api<{ meta: Meta; client: any; doc: AuditDoc }>('audits/' + encodeURIComponent(id));
    if (!A || my !== seq || A.meta.id !== id) return;
    A.meta = res.meta; A.client = res.client; A.doc = res.doc;
    basis = A.doc.analysis ? Date.parse(A.doc.analysis.at) : 0;
    if (!validTab(tab)) tab = startTab();
    render();
  } catch (e: any) { toast(e.message); }
}

function startTab() {
  try { const t = sessionStorage.getItem('pt-tab-' + A!.meta.id); if (t && validTab(t)) return t; } catch { /* storage off */ }
  if (!dev()) { const n = stillNeeded(A!.doc)[0]; if (n) return tabOf(n.key); }
  return showResearch() ? 'research' : A!.doc.template.stages[0]?.id || 'research';
}
function showResearch() { return dev() || A!.doc.research.items.length > 0; }
function validTab(t: string) {
  if (!A) return false;
  if (t === 'research') return showResearch();
  if (t === 'options' || t === 'analysis') return dev();
  return A.doc.template.stages.some(s => s.id === t);
}
function tabOf(key: string) {
  if (key.startsWith('r:')) return 'research';
  const id = key.slice(2), s = A!.doc.template.stages.find(x => x.qs.some(q => q.id === id));
  return s ? s.id : tab;
}
function order(): [string, string][] {
  const L: [string, string][] = [];
  if (showResearch()) L.push(['research', 'Research']);
  A!.doc.template.stages.forEach(s => L.push([s.id, s.name]));
  if (dev()) { L.push(['options', 'Options']); L.push(['analysis', 'Analysis']); }
  return L;
}

/* ================= the screen ================= */
function render() {
  if (!A) return;
  const m = A.meta, d = A.doc, name = A.client?.name || d.business.name || '';
  document.title = 'Audit ' + m.number + ' · ' + (name || 'Cayenne') + ' · Cayenne';
  main.innerHTML = `
    <a class="pt-back" href="${dev() ? '#/client/' + encodeURIComponent(m.client_id) : '#/'}">← ${dev() ? esc(name || 'Client') : 'All audits'}</a>
    <div class="pt-head">
      <div><h1>Audit ${m.number} <em>${esc(name)}</em></h1><div class="pt-pills" id="ptPills">${pills()}</div></div>
      <div class="pt-acts" id="ptActs">${actions()}</div>
    </div>
    ${banner()}
    ${dev() ? bizCard() : ''}
    <div class="pt-grid">
      <div class="pt-mainc"><div class="pt-tabwrap"><nav class="pt-tabs" role="tablist" aria-label="Parts of the audit" id="ptTabs">${tabs()}</nav></div><div class="pt-card" id="ptBody" role="tabpanel">${body()}</div></div>
      <aside class="pt-side" id="ptSide" aria-label="Live results">${side()}</aside>
    </div>`;
}

function pills() {
  const m = A!.meta;
  return `<span class="pt-pill${m.status === 'complete' ? ' go' : ''}">${m.status === 'complete' ? 'Finished ' + esc(day(m.completed_at)) : 'Open'}</span>`
    + (dev() ? `<span class="pt-pill${m.shared ? ' red' : ''}">${m.shared ? 'Shared with the client' : 'Not shared'}</span>` : '')
    + `<span class="pt-save" id="ptSave" aria-live="polite">${saveText()}</span>`;
}
function actions() {
  if (!dev()) return '';
  const m = A!.meta, done = m.status === 'complete';
  return `<button class="pt-btn small" type="button" data-act="copy">Copy summary</button>`
    + `<button class="pt-btn small" type="button" data-act="pdf">Download PDF</button>`
    + `<button class="pt-btn small" type="button" data-act="${m.shared ? 'unshare' : 'share'}">${m.shared ? 'Stop sharing' : 'Share with client'}</button>`
    + (done
      ? `<button class="pt-btn small" type="button" data-act="reopen">Reopen</button><button class="pt-btn red" type="button" data-act="next">Create Audit ${m.number + 1}</button>`
      : `<button class="pt-btn red" type="button" data-act="finish">Finish Audit ${m.number}</button>`);
}
function banner() {
  const m = A!.meta;
  if (m.status === 'complete') return `<div class="pt-banner">${dev()
    ? `Finished and locked on ${esc(day(m.completed_at))}: this is the saved Audit ${m.number}. Download the PDF for the full results. Create Audit ${m.number + 1} to carry on with what is still needed: answers carry over, gaps stay empty and anything not sure keeps its <span class="pt-mark sm" aria-hidden="true">?</span>.`
    : 'This audit is finished. Thank you for your answers.'}</div>`;
  if (!dev()) return '<div class="pt-banner">Fill in what you can. Tick <b>Not sure, need info</b> for anything you need to check, and put what you know in <b>Extra context</b>. Everything saves as you type.</div>';
  return '';
}
function bizCard() {
  const b = A!.doc.business, dis = locked() ? ' disabled' : '';
  return `<details class="pt-card pt-bizbox"${bizOpen ? ' open' : ''}><summary>Business details</summary><div class="pt-biz">${BIZ.map(([k, l, full]) => full
    ? `<label class="pt-f full">${l}<textarea class="pt-in" rows="2" data-biz="${k}"${dis}>${esc(b[k] || '')}</textarea></label>`
    : `<label class="pt-f">${l}<input class="pt-in" type="text" data-biz="${k}" value="${esc(b[k] || '')}"${dis}></label>`).join('')}</div></details>`;
}
function tabs() {
  const d = A!.doc;
  const btn = (id: string, label: string, extra = '', sec = '') => `<button type="button" class="pt-tab" role="tab" data-tab="${esc(id)}" aria-selected="${tab === id}">${sec ? `<span class="s">${sec}</span>` : ''}${esc(label)}${extra ? `<span class="p">${extra}</span>` : ''}</button>`;
  let h = '';
  if (showResearch()) h += btn('research', 'Research', pct(researchCoverage(d)));
  d.template.stages.forEach(s => { h += btn(s.id, s.short || s.name, pct(qCoverage(d, s)), 'S' + s.sec); });
  if (dev()) h += btn('options', 'Options') + btn('analysis', 'Analysis', d.analysis ? 'ready' : '');
  return h;
}
function body() {
  if (tab === 'research') return researchHtml();
  if (tab === 'options') return optionsHtml();
  if (tab === 'analysis') return analysisHtml();
  const s = A!.doc.template.stages.find(x => x.id === tab) || A!.doc.template.stages[0];
  return s ? stageHtml(s) : '';
}
function navHtml() {
  const L = order(), i = L.findIndex(x => x[0] === tab), p = L[i - 1], n = L[i + 1];
  return `<div class="pt-nav">${p ? `<button class="pt-btn small" type="button" data-tab="${esc(p[0])}" data-top="1">← ${esc(p[1])}</button>` : '<span></span>'}${n ? `<button class="pt-btn small dark" type="button" data-tab="${esc(n[0])}" data-top="1">${esc(n[1])} →</button>` : ''}</div>`;
}
const mark = (key: string) => `<span class="pt-mark" data-mark="${esc(key)}" title="Not sure yet" aria-label="Not sure yet"${A!.doc.unsure[key] ? '' : ' hidden'}>?</span>`;

/* ---------- questions ---------- */
function stageHtml(s: Stage) {
  const sec = A!.doc.template.sections[String(s.sec)] || 'Section ' + s.sec;
  return `<div class="pt-stagehead"><span class="k">${esc(sec)}</span><h2>${esc(s.name)}</h2></div>${s.qs.map(qHtml).join('')}${navHtml()}`;
}
function qHtml(q: Question) {
  const key = qKey(q.id);
  const inline = q.f.filter(f => f.type === 'num' || f.type === 'text' || f.type === 'select');
  const block = q.f.filter(f => f.type === 'chips' || f.type === 'long' || f.type === 'tasks');
  return `<div class="pt-q" id="q-${esc(q.id)}"${locked() ? ' data-locked' : ''}>
    <div class="pt-qt"><span class="pt-qn">Q${q.n ?? ''}</span>${mark(key)}<span>${esc(q.t)}</span></div>
    ${q.hint ? `<div class="pt-hint">${esc(q.hint)}</div>` : ''}
    ${dev() && q.tip ? `<div class="pt-tip"><b>From the research:</b> ${esc(q.tip)}</div>` : ''}
    ${inline.length ? `<div class="pt-row">${inline.map(fieldHtml).join('')}</div>` : ''}
    ${block.map(fieldHtml).join('')}
    ${ctxHtml(key)}
  </div>`;
}
function fieldHtml(f: Field) {
  const v = A!.doc.answers[f.k], dis = locked() ? ' disabled' : '', k = esc(f.k), lab = esc(f.label || '');
  switch (f.type) {
    case 'num': return `<label class="pt-f n">${lab}<input class="pt-in num" type="text" inputmode="decimal" autocomplete="off" data-k="${k}" data-t="num" value="${esc(v ?? '')}"${dis}></label>`;
    case 'text': return `<label class="pt-f pt-grow">${lab}<input class="pt-in" type="text" autocomplete="off" data-k="${k}" data-t="text" value="${esc(v ?? '')}"${dis}></label>`;
    case 'select': {
      const opts = (f.opts || ['']).slice(), cur = str(v);
      if (cur && opts.indexOf(cur) < 0) opts.push(cur);
      return `<label class="pt-f">${lab}<select class="pt-in" data-k="${k}" data-t="select"${dis}>${opts.map(o => `<option value="${esc(o)}"${cur === o ? ' selected' : ''}>${o ? esc(o) : 'Choose…'}</option>`).join('')}</select></label>`;
    }
    case 'long': return `<label class="pt-f">${lab}<textarea class="pt-in" rows="2" data-k="${k}" data-t="long"${dis}>${esc(v ?? '')}</textarea></label>`;
    case 'chips': {
      const on = Array.isArray(v) ? v.map(String) : [];
      return `<div class="pt-f">${lab ? `<span>${lab}</span>` : ''}<div class="pt-chips" role="group"${lab ? ` aria-label="${lab}"` : ''}>${(f.opts || []).map(o => `<button type="button" class="pt-chip" data-chip="${esc(o)}" data-k="${k}" aria-pressed="${on.indexOf(o) > -1}"${dis}>${esc(o)}</button>`).join('')}</div></div>`;
    }
    case 'tasks': return tasksHtml();
  }
  return '';
}
function blankTask(): Task { return { task: '', min: '', per: '' }; }
function tasksHtml() {
  const d = A!.doc, lk = locked(), dis = lk ? ' disabled' : '';
  if (!d.tasks.length && !lk) d.tasks = [blankTask(), blankTask(), blankTask()];
  const rows = d.tasks.map((t, i) => `<tr>
    <td><input class="pt-in" type="text" data-task="${i}" data-tf="task" value="${esc(t.task)}" aria-label="Task ${i + 1}"${dis}></td>
    <td><input class="pt-in num" type="text" inputmode="decimal" data-task="${i}" data-tf="min" value="${esc(t.min)}" aria-label="Minutes each, task ${i + 1}"${dis}></td>
    <td><input class="pt-in num" type="text" inputmode="decimal" data-task="${i}" data-tf="per" value="${esc(t.per)}" aria-label="Times a week, task ${i + 1}"${dis}></td>
    <td class="n" data-th="${i}">${taskHours(t) ? fmt(taskHours(t)) : ''}</td>
    ${lk ? '' : `<td><button class="pt-link" type="button" data-act="task-del" data-i="${i}">Remove</button></td>`}</tr>`).join('');
  return `<div class="pt-scroll"><table class="pt-tasks"><thead><tr><th>Task</th><th>Minutes each</th><th>Times a week</th><th class="n">Hours a year</th>${lk ? '' : '<th><span class="pt-sr">Remove</span></th>'}</tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="pt-note">No tasks.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3">${lk ? '' : '<button class="pt-btn small" type="button" data-act="task-add">Add a task</button>'}</td><td class="n"><b id="ptTaskTotal">${fmt(totalTaskHours(d))}</b></td>${lk ? '' : '<td></td>'}</tr></tfoot></table></div>`;
}
function ctxHtml(key: string) {
  const d = A!.doc, dis = locked() ? ' disabled' : '';
  const ph = dev() ? 'Anything the business said that adds to or changes this. The AI analysis reads every box.' : 'Anything that adds to or changes your answer.';
  return `<div class="pt-ctx"><div class="pt-ctx-top"><span>Extra context</span><label class="pt-unsure"><input type="checkbox" data-unsure="${esc(key)}"${d.unsure[key] ? ' checked' : ''}${dis}>Not sure, need info</label></div>
    <textarea class="pt-in" rows="2" data-ctx="${esc(key)}" placeholder="${esc(ph)}" aria-label="Extra context"${dis}>${esc(d.ctx[key] || '')}</textarea></div>`;
}

/* ---------- research ---------- */
function researchHtml() {
  const d = A!.doc, lk = locked();
  let h = `<div class="pt-stagehead"><span class="k">Research</span><h2>${dev() ? 'Found online' : 'What we found online'}</h2><p class="pt-sub">${dev()
    ? 'Check each item with the business. Every source link opens the page it was found on.'
    : 'Is each one right? Pick True or Not true. Tick Not sure if you need to check.'}</p></div>`;
  const groups = d.research.groups.length ? d.research.groups.slice() : [{ id: 'other', name: 'Research' }];
  const orphans = d.research.items.filter(f => !groups.some(g => g.id === f.g));
  if (orphans.length) groups.push({ id: '__other', name: 'Other' });
  groups.forEach(g => {
    const items = g.id === '__other' ? orphans : d.research.items.filter(f => f.g === g.id);
    if (!items.length && !dev()) return;
    h += `<div class="pt-group"><h2>${esc(g.name)}</h2><span class="pt-note">${items.filter(f => d.verdict[f.id]).length} of ${items.length} checked</span>${dev() && !lk && g.id !== '__other' ? `<button class="pt-btn small" type="button" data-act="r-add" data-g="${esc(g.id)}">Add item</button>` : ''}</div>`;
    if (editing === 'new:' + g.id) h += `<div class="pt-q">${itemForm(null, g.id)}</div>`;
    if (!items.length && editing !== 'new:' + g.id) h += '<div class="pt-q"><p class="pt-note">Nothing here yet.</p></div>';
    items.forEach(f => { h += editing === f.id ? `<div class="pt-q" id="r-${esc(f.id)}">${itemForm(f, f.g)}</div>` : itemHtml(f); });
  });
  if (dev()) h += competitorsHtml();
  return h + navHtml();
}
function linksHtml(src: { label: string; url: string }[], none: boolean) {
  const ok = src.filter(s => safeUrl(s.url));
  if (!ok.length) return none ? '<div class="pt-src"><span class="pt-note">No source link yet</span></div>' : '';
  return `<div class="pt-src"><span class="pt-note">${ok.length > 1 ? 'Sources:' : 'Source:'}</span>${ok.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label || host(s.url))} ↗</a>`).join('')}</div>`;
}
function itemHtml(f: Finding) {
  const d = A!.doc, key = rKey(f.id), v = d.verdict[f.id] || '', lk = locked(), dis = lk ? ' disabled' : '';
  return `<div class="pt-q" id="r-${esc(f.id)}"${lk ? ' data-locked' : ''}>
    <div class="pt-find">
      <div><div class="pt-qt">${mark(key)}<span>${dev() ? `<span class="pt-kind ${esc(f.k)}">${esc(KIND[f.k] || 'Fact')}</span>` : ''}${esc(f.t)}</span></div>${linksHtml(f.src, dev())}</div>
      <div class="pt-chips" role="group" aria-label="Checked with the business">${VERDICTS.map(x => `<button type="button" class="pt-chip ${x === 'True' ? 'go' : 'no'}" data-verdict="${esc(f.id)}" data-v="${x}" aria-pressed="${v === x}"${dis}>${x}</button>`).join('')}</div>
    </div>
    ${dev() && !lk ? `<div class="pt-row pt-tools"><button class="pt-link" type="button" data-act="r-edit" data-id="${esc(f.id)}">Edit</button><button class="pt-link" type="button" data-act="r-del" data-id="${esc(f.id)}">Delete</button></div>` : ''}
    ${ctxHtml(key)}
  </div>`;
}
function itemForm(f: Finding | null, g: string) {
  const d = A!.doc, id = f ? f.id : 'new:' + g;
  return `<div class="pt-edit" data-form="${esc(id)}"><div class="pt-form">
    <label class="pt-f">Group<select class="pt-in" data-e="g">${d.research.groups.map(x => `<option value="${esc(x.id)}"${(f ? f.g : g) === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label class="pt-f">Type<select class="pt-in" data-e="k">${Object.entries(KIND).map(([k, l]) => `<option value="${k}"${(f ? f.k : 'info') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="pt-f full">What was found<textarea class="pt-in" rows="3" data-e="t">${esc(f ? f.t : '')}</textarea></label>
    <label class="pt-f full">Sources, one a line, as name | https://link<textarea class="pt-in" rows="3" data-e="src" placeholder="Google profile | https://maps.app.goo.gl/...">${esc(f ? f.src.map(s => (s.label ? s.label + ' | ' : '') + s.url).join('\n') : '')}</textarea></label>
  </div><p class="pt-err" data-e="err" hidden></p>
  <div class="pt-row"><button class="pt-btn small red" type="button" data-act="r-save" data-id="${esc(id)}">Save</button><button class="pt-btn small" type="button" data-act="cancel">Cancel</button></div></div>`;
}
function competitorsHtml() {
  const c = A!.doc.research.competitors, lk = locked(), name = A!.doc.business.name || A!.client?.name || 'this business';
  let h = `<div class="pt-group"><h2>Competitors</h2><span class="pt-note">${c.length}</span>${lk ? '' : '<button class="pt-btn small" type="button" data-act="c-add">Add competitor</button>'}</div>`;
  if (editing === 'comp:new') h += `<div class="pt-q">${compForm(null, -1)}</div>`;
  if (!c.length && editing !== 'comp:new') h += '<div class="pt-q"><p class="pt-note">None added yet.</p></div>';
  c.forEach((x, i) => {
    if (editing === 'comp:' + i) { h += `<div class="pt-q">${compForm(x, i)}</div>`; return; }
    h += `<div class="pt-q"><div class="pt-qt"><span>${esc(x.n)}</span></div>
      <div class="pt-kv2">${x.w ? `<div><span>What they offer</span>${esc(x.w)}</div>` : ''}${x.e ? `<div><span>Their edge</span>${esc(x.e)}</div>` : ''}${x.z ? `<div><span>Where ${esc(name)} can win</span>${esc(x.z)}</div>` : ''}</div>
      ${linksHtml(x.url ? [{ label: host(x.url), url: x.url }] : [], true)}
      ${lk ? '' : `<div class="pt-row pt-tools"><button class="pt-link" type="button" data-act="c-edit" data-i="${i}">Edit</button><button class="pt-link" type="button" data-act="c-del" data-i="${i}">Delete</button></div>`}</div>`;
  });
  return h;
}
function compForm(x: Competitor | null, i: number) {
  const v = (k: keyof Competitor) => esc(x ? x[k] || '' : '');
  return `<div class="pt-edit" data-form="comp:${i < 0 ? 'new' : i}"><div class="pt-form">
    <label class="pt-f">Name<input class="pt-in" type="text" data-e="n" value="${v('n')}"></label>
    <label class="pt-f">Website, https://<input class="pt-in" type="url" data-e="url" value="${v('url')}"></label>
    <label class="pt-f full">What they offer<textarea class="pt-in" rows="2" data-e="w">${v('w')}</textarea></label>
    <label class="pt-f full">Their edge<textarea class="pt-in" rows="2" data-e="e">${v('e')}</textarea></label>
    <label class="pt-f full">Where this business can win<textarea class="pt-in" rows="2" data-e="z">${v('z')}</textarea></label>
  </div><p class="pt-err" data-e="err" hidden></p>
  <div class="pt-row"><button class="pt-btn small red" type="button" data-act="c-save" data-i="${i}">Save</button><button class="pt-btn small" type="button" data-act="cancel">Cancel</button></div></div>`;
}

/* ---------- options ---------- */
function optionsHtml() {
  const d = A!.doc, t = optionTotals(d), lk = locked();
  let h = `<div class="pt-stagehead"><span class="k">Options</span><h2>How AI could work here</h2><p class="pt-sub">Pick a level for each area. Hours come from the answers and are estimates.</p></div>
    <div class="pt-q"><div class="pt-counts"><div><b>${fmt(t.today)}</b><span>Hours a year today</span></div><div><b>${fmt(t.after)}</b><span>Hours a year after</span></div><div><b>${fmt(t.saved)}</b><span>Saved (estimate)</span></div></div>
    <div class="pt-legend">${[1, 2, 3, 4, 5].map(l => `<b>Level ${l}</b><span>${esc(LV[l])}. ${esc(LVD[l])}</span>`).join('')}</div></div>`;
  OPTIONS.forEach(o => {
    const c = choice(d, o), r: any = optResult(d, o);
    const levels = o.kind === 'growth' ? [{ l: 4, label: 'Switch on', no: '' }] : (o.levels || []).map(x => ({ l: x.l, label: 'Level ' + x.l, no: x.no || '' }));
    const chips = levels.map(x => `<button type="button" class="pt-chip" data-opt="${o.id}" data-lv="${x.l}" aria-pressed="${c === x.l}"${x.no || lk ? ' disabled' : ''}${x.no ? ` title="${esc(x.no)}"` : ''}>${esc(x.label)}</button>`).join('')
      + `<button type="button" class="pt-chip" data-opt="${o.id}" data-lv="0" aria-pressed="${c === 0}"${lk ? ' disabled' : ''}>Skip</button>`;
    let detail = '';
    if (o.kind === 'growth') detail = `<p>${esc(o.d || '')}</p><p class="pt-note">Measured by: ${esc(o.m || '')}</p>`;
    else {
      detail = c ? `<p>${esc(r.lv?.d || '')}</p>` : '<p class="pt-note">Skipped.</p>';
      if (!r.b) detail += `<p class="pt-note">${esc(o.needs || 'Needs answers.')}</p>`;
      else if (o.kind === 'hours') detail += `<div class="pt-kv"><span class="k">Today</span><span class="v">${fmt(r.today)} h a year</span><span class="k">After</span><span class="v">${fmt(r.after)} h a year</span><span class="k">Saved (estimate)</span><span class="v">${fmt(r.today - r.after)} h</span></div><p class="pt-note">${esc(r.b.sum)}</p>`;
      else detail += `<div class="pt-kv"><span class="k">Reviews a year today</span><span class="v">${fmt(r.today)}</span><span class="k">After</span><span class="v">${fmt(r.after)}</span></div><p class="pt-note">${esc(r.b.j.sum)}. Assumes ${Math.round(REPLY * 100)}% of those asked leave a review.</p>`;
      const no = (o.levels || []).filter(x => x.no).map(x => x.no as string);
      if (no.length) detail += `<p class="pt-note">${esc(no.join(' '))}</p>`;
    }
    h += `<div class="pt-q"><div class="pt-qt"><span>${esc(o.name)}</span></div><div class="pt-chips" role="group" aria-label="${esc(o.name)}">${chips}</div>${detail}</div>`;
  });
  return h + navHtml();
}

/* ---------- AI analysis ---------- */
function stale() { return !!A!.doc.analysis && lastEdit > basis; }
function aiStep() {
  const t = ai.text;
  if (!t) return 'Reading the audit';
  const steps: [string, string][] = [['"summary"', 'Writing the summary'], ['"money"', 'Where the money comes in'], ['"stages"', 'Scoring each stage'], ['"services"', 'Choosing the likely services'], ['"automations"', 'Writing the automation specs'], ['"ask_next"', 'Listing what to ask next']];
  let best = 'Starting', at = -1;
  steps.forEach(([k, l]) => { const i = t.lastIndexOf(k); if (i > at) { at = i; best = l; } });
  return best;
}
function aiControls() {
  if (ai.running) {
    const secs = Math.round((Date.now() - ai.t0) / 1000), n = ai.text.length, p = n ? Math.max(4, Math.min(95, Math.round(n / 90))) : 2;
    const sv = (ai.text.match(/"service"\s*:/g) || []).length, au = (ai.text.match(/"trigger"\s*:/g) || []).length;
    return `<div class="pt-prog"><div class="pt-pbar" role="progressbar" aria-label="AI analysis" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i style="width:${p}%"></i></div>
      <div class="pt-prow"><span>${esc(aiStep())}</span><span><b>${secs}</b> s</span><span><b>${fmt(n)}</b> characters</span>${sv ? `<span><b>${sv}</b> services</span>` : ''}${au ? `<span><b>${au}</b> automations</span>` : ''}</div>
      <p class="pt-note">Keep this page open until it finishes. It usually takes 1 to 3 minutes.</p></div>`;
  }
  return `${ai.error ? `<p class="pt-err" role="alert">${esc(ai.error)}</p>` : ''}<button class="pt-btn red" type="button" data-act="ai-run">${A!.doc.analysis ? 'Run the analysis again' : 'Run the AI analysis'}</button>`;
}
function evLabel(id: string) {
  if (id.startsWith('q:')) { for (const s of A!.doc.template.stages) for (const q of s.qs) if (qKey(q.id) === id) return 'Q' + q.n; }
  if (id.startsWith('r:')) { const f = A!.doc.research.items.find(x => rKey(x.id) === id); if (f) return short(f.t, 46); }
  return id;
}
function evid(list: any) {
  const L = arr(list).map(String).filter(x => /^[qr]:/.test(x));
  return L.length ? `<div class="pt-ev"><span>Based on</span>${L.map(id => `<button type="button" class="pt-evb" data-go="${esc(id)}">${esc(evLabel(id))}</button>`).join('')}</div>` : '';
}
function specHtml(x: any) {
  const row = (k: string, v: any) => {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
    return `<dt>${k}</dt><dd>${Array.isArray(v) ? (k === 'Steps' ? `<ol>${v.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : v.map(esc).join(', ')) : esc(v)}</dd>`;
  };
  const c = ['high', 'medium', 'low'].indexOf(x.confidence) > -1 ? x.confidence : 'low';
  return `<div class="pt-item pt-spec"><div class="h"><b>${x.priority ? esc(x.priority) + '. ' : ''}${esc(x.name)}</b>${x.confidence ? `<span class="pt-conf ${c}">${esc(x.confidence)}</span>` : ''}</div>
    <dl>${row('Problem', x.problem)}${row('Trigger', x.trigger)}${row('Steps', x.steps)}${row('Result', x.result)}${row('Tools', x.tools)}${row('AI does', x.ai_role)}${row('Staff approve', x.staff_approve)}${row('Fallback', x.fallback)}${row('Measure', x.metric)}${row('Estimate', x.estimate)}</dl>${evid(x.evidence)}</div>`;
}
function analysisHtml() {
  const a = A!.doc.analysis, r = a && a.result ? a.result : null;
  let h = `<div class="pt-stagehead"><span class="k">AI analysis</span><h2>Likely services and automations</h2><p class="pt-sub">${a
    ? `Run ${esc(when(a.at))}${a.secs ? ', took ' + a.secs + ' seconds' : ''}.${stale() ? ' <b>Answers changed since. Run it again to include them.</b>' : ''}`
    : 'Not run yet. It reads every answer, every Extra context box and every not sure mark, then picks the likely services and automations.'}</p></div>
    <div class="pt-q"><div data-ai-controls>${aiControls()}</div></div>`;
  if (!r) return h + navHtml();
  if (r.summary) h += `<div class="pt-q"><h3>Summary</h3><p>${esc(r.summary)}</p></div>`;
  if (arr(r.ask_next).length) h += `<div class="pt-q"><h3>Ask next</h3><ol>${arr(r.ask_next).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>`;
  if (arr(r.money).length) h += `<div class="pt-q"><h3>Where the money comes in</h3><div class="pt-scroll"><table class="pt-table"><thead><tr><th>Channel</th><th>Share</th><th>Comment</th></tr></thead><tbody>${arr(r.money).map(m => `<tr><td>${esc(m.channel)}</td><td>${esc(m.share)}</td><td>${esc(m.comment)}</td></tr>`).join('')}</tbody></table></div></div>`;
  if (arr(r.services).length) h += `<div class="pt-q"><h3>Likely services</h3>${arr(r.services).map(s => `<div class="pt-item"><div class="h"><b>${esc(s.service)}</b>${s.fit ? `<span class="pt-conf ${s.fit === 'strong' ? 'high' : 'medium'}">${esc(s.fit)}</span>` : ''}</div><div class="w">${s.section ? 'Section ' + esc(s.section) + '. ' : ''}${esc(s.why)}</div>${s.first_step ? `<div class="e">First step: ${esc(s.first_step)}</div>` : ''}${evid(s.evidence)}</div>`).join('')}</div>`;
  if (arr(r.automations).length) h += `<div class="pt-q"><h3>Likely automations</h3>${arr(r.automations).map(specHtml).join('')}</div>`;
  if (arr(r.stages).length) h += `<div class="pt-q"><h3>Stage by stage</h3>${arr(r.stages).map(s => `<div class="pt-item"><div class="h"><b>${esc(s.stage)}</b><span class="pt-conf low">${esc(s.score)}</span></div><div class="w">${esc(s.why)}</div>${arr(s.missing).length ? `<div class="e">Missing: ${arr(s.missing).map(esc).join('; ')}</div>` : ''}</div>`).join('')}</div>`;
  return h + navHtml();
}

/* ---------- the live panel ---------- */
function side() {
  let h = needPane();
  if (!dev()) return h;
  return h + aiPane() + scoresPane() + servicesPane() + autosPane() + baselinePane();
}
function needPane() {
  const need = stillNeeded(A!.doc), c = [1, 2, 3].map(p => need.filter(n => n.pri === p).length), list = showAll ? need : need.slice(0, 8);
  return `<section class="pt-card pt-pane"><h2>${dev() ? 'Still needed' : 'Still to do'}</h2>
    <div class="pt-counts"><div><b>${c[0]}</b><span>Not sure, nothing yet</span></div><div><b>${c[1]}</b><span>Not sure, to confirm</span></div><div><b>${c[2]}</b><span>Not answered yet</span></div></div>
    ${need.length ? `<div class="pt-need">${list.map(n => `<button type="button" data-go="${esc(n.key)}"><span class="pt-pri p${n.pri}">P${n.pri}</span><span>${esc(short(n.label, 110))}</span></button>`).join('')}</div>${need.length > 8 ? `<button class="pt-link" type="button" data-act="need-all">${showAll ? 'Show fewer' : 'Show all ' + need.length}</button>` : ''}` : '<p class="pt-note">Nothing outstanding.</p>'}
    <p class="pt-note">${dev() ? 'P1 first: not sure with nothing written. Then P2: not sure with a rough answer. Then P3: not answered.' : 'Start with P1: things marked not sure with nothing written yet.'}</p></section>`;
}
function aiPane() {
  const a = A!.doc.analysis;
  return `<section class="pt-card pt-pane pt-ai"><h2>AI analysis</h2>${a
    ? `<p class="pt-note">Run ${esc(when(a.at))}.${stale() ? ' Answers changed since.' : ''}</p>${a.result && a.result.summary ? `<p>${esc(short(String(a.result.summary), 320))}</p>` : ''}<button class="pt-link" type="button" data-tab="analysis" data-top="1">Open the full analysis</button>`
    : '<p class="pt-note">Reads every answer, every Extra context box and every not sure mark, then picks the likely services and automations.</p>'}
    <div data-ai-controls>${aiControls()}</div></section>`;
}
function scoresPane() {
  const d = A!.doc, s = scores(d);
  const rows = d.template.stages.filter(st => s[st.id] != null).map(st => `<div class="pt-score"><span>${esc(st.short || st.name)}</span><div class="pt-bar2"><i style="width:${s[st.id]}%"></i></div><span class="v">${s[st.id]}</span><span class="c">${pct(qCoverage(d, st))} answered</span></div>`).join('');
  return `<section class="pt-card pt-pane"><h2>Where the gains are</h2><p class="pt-note">Opportunity per stage, 0 to 100, from the answers so far.</p>${rows || '<p class="pt-note">Scores show as questions are answered.</p>'}</section>`;
}
function servicesPane() {
  const L = services(A!.doc), secs = A!.doc.template.sections;
  const list = (n: number) => L.filter(x => x.sec === n).map(x => `<div class="pt-item"><div class="h"><b>${esc(x.n)}</b><span class="pt-conf ${x.fit === 'strong' ? 'high' : x.fit === 'likely' ? 'medium' : 'low'}">${x.fit}</span></div><div class="w">${esc(x.why)}</div></div>`).join('');
  return `<section class="pt-card pt-pane"><h2>Best-fit services</h2><p class="pt-note">From the answers so far. The AI analysis goes deeper.</p><div class="pt-secl">${esc(secs['1'] || 'Section 1')}</div>${list(1)}<div class="pt-secl">${esc(secs['2'] || 'Section 2')}</div>${list(2)}</section>`;
}
function autosPane() {
  const L = autos(A!.doc);
  return `<section class="pt-card pt-pane"><h2>Likely automations</h2>${L.length ? L.map(a => `<div class="pt-item"><div class="h"><b>${esc(a.n)}</b><span class="pt-conf ${a.c}">${a.c}</span></div><div class="w">${esc(a.why)}</div>${a.est ? `<div class="e">${esc(a.est)}</div>` : ''}</div>`).join('') : '<p class="pt-note">These show as the answers come in.</p>'}<p class="pt-note">Confidence shows how many of the answers behind each one are in.</p></section>`;
}
function baselinePane() {
  return `<section class="pt-card pt-pane"><h2>Baseline numbers</h2><div class="pt-kv">${baseline(A!.doc).map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v${v == null ? ' miss' : ''}">${v == null ? 'missing' : esc(v)}</span>`).join('')}</div></section>`;
}

/* ---------- small repaints ---------- */
function paintSide() { const el = document.getElementById('ptSide'); if (!el || !A) return; const top = el.scrollTop; el.innerHTML = side(); el.scrollTop = top; }
function paintTabs() { const el = document.getElementById('ptTabs'); if (!el || !A) return; const left = el.scrollLeft; el.innerHTML = tabs(); el.scrollLeft = left; }
function paintBody(focusSel?: string) {
  const el = document.getElementById('ptBody'); if (!el || !A) return;
  el.innerHTML = body();
  if (focusSel) { const f = el.querySelector<HTMLElement>(focusSel); if (f) f.focus({ preventScroll: true }); }
}
function paintHead() {
  const p = document.getElementById('ptPills'), a = document.getElementById('ptActs');
  if (p) p.innerHTML = pills(); if (a) a.innerHTML = actions();
}
function paintSave() { const el = document.getElementById('ptSave'); if (el) el.innerHTML = saveText(); }
function paintAi() { document.querySelectorAll('[data-ai-controls]').forEach(el => { el.innerHTML = aiControls(); }); }
function live() { clearTimeout(liveTimer); liveTimer = window.setTimeout(() => { paintSide(); paintTabs(); }, 250); }

/* ================= saving ================= */
function saveText() {
  switch (saveState) {
    case 'saving': return 'Saving…';
    case 'unsaved': return 'Not saved yet';
    case 'error': return 'Not saved. <button class="pt-link" type="button" data-act="retry">Try again</button>';
    case 'locked': return 'Locked';
    default: return lastEdit ? 'All changes saved' : '';
  }
}
function setSave(s: SaveState) { saveState = s; paintSave(); }
function merge(a: Patch, b: Patch): Patch {
  const o: any = { ...a };
  Object.entries(b).forEach(([k, v]) => { o[k] = k === 'tasks' || k === 'research' ? v : { ...(o[k] || {}), ...(v as object) }; });
  return o;
}
function queue(p: Patch) {
  if (!A || locked()) return;
  pending = merge(pending, p); lastEdit = Date.now(); setSave('unsaved');
  clearTimeout(timer); timer = window.setTimeout(() => { flush(); }, 800);
  live();
}
async function flush(keepalive = false): Promise<void> {
  clearTimeout(timer);
  if (!A) return;
  if (inflight) { await inflight; if (A && Object.keys(pending).length && saveState !== 'locked') return flush(keepalive); return; }
  if (!Object.keys(pending).length) return;
  const id = A.meta.id, p = pending; pending = {};
  setSave('saving');
  inflight = (async () => {
    try {
      const r = await api<{ rev: number; updated_at: string }>('audits/' + encodeURIComponent(id), 'PATCH', p, { keepalive });
      if (A && A.meta.id === id) { A.meta.rev = r.rev; A.meta.updated_at = r.updated_at; }
      setSave(Object.keys(pending).length ? 'unsaved' : 'saved');
    } catch (e: any) {
      if (e.status === 409 && /locked/i.test(e.message)) { pending = {}; setSave('locked'); toast('This audit is finished, so it is locked. Changes were not saved.'); reload(); }
      else if (e.status === 401) { pending = merge(p, pending); setSave('error'); }
      else { pending = merge(p, pending); setSave('error'); timer = window.setTimeout(() => { flush(); }, 6000); }
    } finally { inflight = null; }
  })();
  await inflight;
  if (A && A.meta.id === id && Object.keys(pending).length && saveState === 'unsaved') { clearTimeout(timer); timer = window.setTimeout(() => { flush(); }, 800); }
}

/* ================= events ================= */
function numVal(s: string): string | number {
  const r = s.trim(); if (!r) return '';
  const c = r.replace(/[£$€,%\s]/g, '');
  return c !== '' && isFinite(Number(c)) ? Number(c) : r;
}
function setAnswer(k: string, v: unknown) {
  const d = A!.doc;
  if (v === '' || v == null || (Array.isArray(v) && !v.length)) { delete d.answers[k]; queue({ answers: { [k]: null } }); }
  else { d.answers[k] = v; queue({ answers: { [k]: v } }); }
}
function onInput(e: Event) {
  const t = e.target as HTMLInputElement;
  if (!A || locked() || !t.dataset) return;
  const ds = t.dataset;
  if (ds.k && (ds.t === 'num' || ds.t === 'text' || ds.t === 'long')) { setAnswer(ds.k, ds.t === 'num' ? numVal(t.value) : t.value); return; }
  if (ds.ctx) { const k = ds.ctx; if (t.value.trim()) A.doc.ctx[k] = t.value; else delete A.doc.ctx[k]; queue({ ctx: { [k]: t.value.trim() ? t.value : null } }); return; }
  if (ds.task != null && ds.tf) {
    const i = Number(ds.task), d = A.doc; if (!d.tasks[i]) return;
    d.tasks[i] = { ...d.tasks[i], [ds.tf]: t.value } as Task;
    const cell = main.querySelector(`[data-th="${i}"]`); if (cell) cell.textContent = taskHours(d.tasks[i]) ? fmt(taskHours(d.tasks[i])) : '';
    const tot = document.getElementById('ptTaskTotal'); if (tot) tot.textContent = fmt(totalTaskHours(d));
    queue({ tasks: d.tasks }); return;
  }
  if (ds.biz) { A.doc.business[ds.biz] = t.value; queue({ business: { [ds.biz]: t.value } }); }
}
function onChange(e: Event) {
  const t = e.target as HTMLInputElement;
  if (!A || locked() || !t.dataset) return;
  if (t.tagName === 'SELECT' && t.dataset.k) { setAnswer(t.dataset.k, t.value); return; }
  if (t.dataset.unsure) {
    const k = t.dataset.unsure;
    if (t.checked) A.doc.unsure[k] = true; else delete A.doc.unsure[k];
    main.querySelectorAll<HTMLElement>('[data-mark]').forEach(m => { if (m.dataset.mark === k) m.hidden = !t.checked; });
    queue({ unsure: { [k]: t.checked ? true : null } });
  }
}
function onToggle(e: Event) { const t = e.target as HTMLElement; if (t && t.classList && t.classList.contains('pt-bizbox')) bizOpen = (t as HTMLDetailsElement).open; }

function setTab(t: string, scroll: boolean) {
  if (!validTab(t)) return;
  editing = ''; tab = t;
  try { sessionStorage.setItem('pt-tab-' + A!.meta.id, t); } catch { /* storage off */ }
  paintTabs(); paintBody();
  const bar = document.getElementById('ptTabs');
  if (bar) {
    const sel = bar.querySelector<HTMLElement>('[aria-selected="true"]'); if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const top = (document.getElementById('ptBody')?.getBoundingClientRect().top || 0);
    if (scroll || top < 0) window.scrollTo({ top: Math.max(0, window.scrollY + bar.getBoundingClientRect().top - 76), behavior: smooth() });
  }
}
function jump(key: string) {
  if (!A) return;
  const t = tabOf(key); if (t !== tab) setTab(t, false);
  const el = document.getElementById((key.startsWith('r:') ? 'r-' : 'q-') + key.slice(2));
  if (!el) return;
  el.scrollIntoView({ behavior: smooth(), block: 'start' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  const f = el.querySelector<HTMLElement>('input:not([type=checkbox]),select,textarea,button'); if (f) f.focus({ preventScroll: true });
}

function newId() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function parseSources(text: string): { ok: boolean; list: { label: string; url: string }[] } {
  const list: { label: string; url: string }[] = []; let ok = true;
  text.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
    const i = l.lastIndexOf('|'), url = (i > -1 ? l.slice(i + 1) : l).trim(), label = i > -1 ? l.slice(0, i).trim() : '';
    if (!safeUrl(url)) ok = false; else list.push({ label: label.slice(0, 120), url });
  });
  return { ok, list };
}
function formVal(form: Element, k: string) { const el = form.querySelector<HTMLInputElement>(`[data-e="${k}"]`); return el ? el.value : ''; }
function formErr(form: Element, msg: string) { const p = form.querySelector<HTMLElement>('[data-e="err"]'); if (p) { p.textContent = msg; p.hidden = false; } }
function saveResearch() { queue({ research: A!.doc.research }); }

function saveItem(id: string) {
  const form = main.querySelector(`[data-form="${CSS.escape(id)}"]`); if (!form || !A) return;
  const t = formVal(form, 't').trim(), src = parseSources(formVal(form, 'src')), g = formVal(form, 'g'), k = formVal(form, 'k') as Finding['k'];
  if (!t) return formErr(form, 'Write what was found.');
  if (!src.ok) return formErr(form, 'Each source needs a full https:// link.');
  const items = A.doc.research.items;
  if (id.startsWith('new:')) {
    const item: Finding = { id: newId(), g, k, t, src: src.list };
    let at = -1; items.forEach((f, i) => { if (f.g === g) at = i; });
    if (at < 0) items.push(item); else items.splice(at + 1, 0, item);
  } else {
    const f = items.find(x => x.id === id); if (!f) return;
    f.t = t; f.g = g; f.k = k; f.src = src.list;
  }
  editing = ''; saveResearch(); paintBody(); live();
}
function saveComp(i: number) {
  const form = main.querySelector(`[data-form="comp:${i < 0 ? 'new' : i}"]`); if (!form || !A) return;
  const n = formVal(form, 'n').trim(), url = formVal(form, 'url').trim();
  if (!n) return formErr(form, 'Add a name.');
  if (url && !safeUrl(url)) return formErr(form, 'The website needs a full https:// link.');
  const c: Competitor = { n, url, w: formVal(form, 'w').trim(), e: formVal(form, 'e').trim(), z: formVal(form, 'z').trim() };
  if (i < 0) A.doc.research.competitors.push(c); else A.doc.research.competitors[i] = c;
  editing = ''; saveResearch(); paintBody();
}

async function onClick(e: Event) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab],[data-chip],[data-verdict],[data-go],[data-opt]');
  if (!el || !A || !main.contains(el)) return;
  const ds = el.dataset;

  if (ds.chip != null && ds.k) {
    if (locked()) return;
    const cur = Array.isArray(A.doc.answers[ds.k]) ? (A.doc.answers[ds.k] as unknown[]).map(String) : [];
    const i = cur.indexOf(ds.chip); if (i > -1) cur.splice(i, 1); else cur.push(ds.chip);
    setAnswer(ds.k, cur); el.setAttribute('aria-pressed', String(i < 0)); return;
  }
  if (ds.verdict) {
    if (locked()) return;
    const id = ds.verdict, next = A.doc.verdict[id] === ds.v ? null : ds.v || null;
    if (next) A.doc.verdict[id] = next; else delete A.doc.verdict[id];
    el.parentElement?.querySelectorAll<HTMLElement>('[data-verdict]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === next)));
    queue({ verdict: { [id]: next } }); return;
  }
  if (ds.opt) {
    if (locked()) return;
    const id = ds.opt, lv = Number(ds.lv) || 0;
    A.doc.choices[id] = lv; queue({ choices: { [id]: lv } });
    paintBody(`[data-opt="${id}"][data-lv="${lv}"]`); return;
  }
  if (ds.tab) { setTab(ds.tab, !!ds.top); return; }
  if (ds.go) { jump(ds.go); return; }

  const act = ds.act, id = A.meta.id;
  try {
    switch (act) {
      case 'retry': flush(); return;
      case 'need-all': showAll = !showAll; paintSide(); return;
      case 'copy': {
        const name = A.client?.name || A.doc.business.name || '';
        toast((await copyText(summaryText(A.doc, 'Cayenne audit ' + A.meta.number + ': ' + name))) ? 'Summary copied.' : 'Copying did not work. Try again.');
        return;
      }
      case 'pdf': {
        await flush();
        const a = document.createElement('a'); a.href = '/api/portal/audits/' + encodeURIComponent(id) + '/pdf'; a.download = '';
        document.body.appendChild(a); a.click(); a.remove(); toast('Downloading the PDF of Audit ' + A.meta.number + '.'); return;
      }
      case 'finish': {
        await flush();
        if (Object.keys(pending).length || saveState === 'error') { toast('Some changes are not saved yet. Try again in a moment.'); return; }
        await api('audits/' + encodeURIComponent(id) + '/status', 'POST', { action: 'complete' });
        await reload(); toast('Audit ' + A.meta.number + ' is finished and saved.'); return;
      }
      case 'reopen': await api('audits/' + encodeURIComponent(id) + '/status', 'POST', { action: 'reopen' }); await reload(); toast('Reopened. Changes save on their own again.'); return;
      case 'share': case 'unshare':
        await api('audits/' + encodeURIComponent(id) + '/status', 'POST', { action: act });
        A.meta.shared = act === 'share'; paintHead();
        toast(act === 'share' ? 'Shared. The client sees it once signed in.' : 'No longer shared with the client.'); return;
      case 'next': {
        const r = await api<{ id: string; existed?: boolean }>('audits/' + encodeURIComponent(id) + '/next', 'POST', {});
        if (r.existed) toast('Audit ' + (A.meta.number + 1) + ' already exists. Opening it.'); else toast('Audit ' + (A.meta.number + 1) + ' created and shared with the client.');
        location.hash = '#/audit/' + encodeURIComponent(r.id); return;
      }
      case 'ai-run': runAi(); return;
      case 'task-add': if (locked()) return; A.doc.tasks.push(blankTask()); queue({ tasks: A.doc.tasks }); paintBody(`[data-task="${A.doc.tasks.length - 1}"][data-tf="task"]`); return;
      case 'task-del': if (locked()) return; A.doc.tasks.splice(Number(ds.i), 1); queue({ tasks: A.doc.tasks }); paintBody(); return;
      case 'r-add': editing = 'new:' + ds.g; paintBody('[data-e="t"]'); return;
      case 'r-edit': editing = ds.id || ''; paintBody('[data-e="t"]'); return;
      case 'cancel': editing = ''; paintBody(); return;
      case 'r-save': saveItem(ds.id || ''); return;
      case 'r-del': {
        if (!twoStep(el, 'Click again to delete')) return;
        const rid = ds.id || '';
        A.doc.research.items = A.doc.research.items.filter(f => f.id !== rid);
        delete A.doc.verdict[rid]; delete A.doc.ctx[rKey(rid)]; delete A.doc.unsure[rKey(rid)];
        saveResearch(); paintBody(); return;
      }
      case 'c-add': editing = 'comp:new'; paintBody('[data-e="n"]'); return;
      case 'c-edit': editing = 'comp:' + ds.i; paintBody('[data-e="n"]'); return;
      case 'c-save': saveComp(Number(ds.i)); return;
      case 'c-del': if (!twoStep(el, 'Click again to delete')) return; A.doc.research.competitors.splice(Number(ds.i), 1); saveResearch(); paintBody(); return;
    }
  } catch (x: any) { toast(x && x.message ? x.message : 'Something went wrong. Try again.'); }
}

/* ================= the AI run: streamed, with live progress ================= */
async function runAi() {
  if (!A || ai.running) return;
  await flush();
  if (!A) return;
  const id = A.meta.id, t0 = Date.now();
  ai = { running: true, text: '', t0, error: '' };
  paintAi(); clearInterval(aiTick); aiTick = window.setInterval(paintAi, 500);
  try {
    const r = await fetch('/api/portal/audits/' + encodeURIComponent(id) + '/analyse', { method: 'POST', credentials: 'same-origin', headers: { 'x-cayenne-portal': '1' } });
    if (!r.ok || !r.body) {
      let j: any = null; try { j = await r.json(); } catch { /* not JSON */ }
      throw new Error(j && j.notReady === 'ai' ? 'AI analysis is not switched on yet. It needs the AI key added in Cloudflare settings.' : (j && j.error) || 'The analysis did not run. Try again.');
    }
    const rd = r.body.getReader(), td = new TextDecoder(); let all = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      all += td.decode(value, { stream: true });
      const z = all.indexOf('\u0000'); ai.text = z > -1 ? all.slice(0, z) : all;
    }
    all += td.decode();
    const z = all.indexOf('\u0000');
    if (z < 0) throw new Error('The analysis stopped before the end. Try again.');
    const end = JSON.parse(all.slice(z + 1));
    if (!end.analysis) throw new Error(end.error === 'unreadable answer' ? 'The answer came back in the wrong shape. Run it again.' : 'The analysis did not finish (' + (end.error || 'no answer') + '). Try again.');
    if (A && A.meta.id === id) {
      A.doc.analysis = end.analysis; basis = t0;
      toast(end.saved ? 'Analysis ready and saved. It is in the Analysis tab and the PDF.' : 'Analysis shown but not saved. Run it again to save it.', 5000);
    }
  } catch (x: any) {
    ai.error = x && x.message ? x.message : 'The analysis did not run. Try again.';
  } finally {
    clearInterval(aiTick); ai.running = false;
    if (A && A.meta.id === id) { paintAi(); paintSide(); paintTabs(); if (tab === 'analysis') paintBody(); }
  }
}
