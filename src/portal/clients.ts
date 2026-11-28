// The Clients section: the client automations, the same data as the Control centre (rank-dashboard).
//   #/clients                   one card per client
//   #/clients/board/<id>        one client: what you need to do, what the agents are working on, what got done
//   #/clients/tasks[/<id>]      every client's board in one place, with a filter per client
//   #/clients/spend[/<YYYY-MM>] what the agents cost, per month
//   (#/clients/audits, the clients' audits and logins, is in app.ts)
// Data comes from /api/portal/rank/..., developer only. Client names come from the automations, never from this code.
// Agent chat and the live browser stay in the Control centre: they need Carlo's own Cloudflare Access sign-in.
import { api, esc, toast, ApiError } from './ui';

export const CONTROL_CENTRE = 'https://rank-dashboard-6cl.pages.dev';

/* ================= the board, read safely (a missing or odd field shows as empty) ================= */
type Run = { agent: string; did: string; model: string; cost_usd: number; duration_ms: number; status: string };
type Item = {
  key: string; client_id: string; client_name: string; kind: string; agent: string | null; title: string; detail: string | null; steps: string[];
  due: string | null; at: string | null; status: string; link: { label: string; url: string } | null; action: 'tick' | 'telegram' | null;
  todo_id: number | null; cost_usd: number | null; duration_ms: number | null; runs: Run[];
};
type BoardClient = { id: string; name: string; internal: boolean; you_count: number; agents_count: number; overdue_count: number; next: { title: string; due: string | null } | null };
type Board = { generated_at: string | null; clients: BoardClient[]; you: Item[]; agents: Item[]; later: Item[]; done: Item[] };
type Spend = {
  month: string; clients: { id: string; name: string }[];
  spend: { runs: number; cost_usd: number; errors: number; by_client: { client_id: string; runs: number; cost_usd: number; errors: number }[] };
  agents: { id: string; client_id: string; name: string; month_runs: number; month_cost_usd: number }[];
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const dayOf = (v: unknown): string | null => { const s = str(v); return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function item(v: unknown, i: number, names: Map<string, string>): Item | null {
  if (!isObj(v)) return null;
  const title = str(v.title); if (!title) return null;
  const client = str(v.client_id) ?? '';
  const link = isObj(v.link) && str(v.link.url) && /^https?:\/\//.test(String(v.link.url)) ? { label: str(v.link.label) ?? 'Open', url: String(v.link.url) } : null;
  return {
    key: str(v.key) ?? `item-${i}-${title}`, client_id: client, client_name: str(v.client_name) ?? names.get(client) ?? client,
    kind: str(v.kind) ?? 'task', agent: str(v.agent), title, detail: str(v.detail),
    steps: list(v.steps).filter((s): s is string => typeof s === 'string' && !!s.trim()),
    due: dayOf(v.due), at: str(v.at), status: str(v.status) ?? '', link,
    action: v.action === 'tick' || v.action === 'telegram' ? v.action : null,
    todo_id: num(v.todo_id), cost_usd: num(v.cost_usd), duration_ms: num(v.duration_ms),
    runs: list(v.runs).filter(isObj).map(r => ({ agent: str(r.agent) ?? 'Agent', did: str(r.did) ?? '', model: str(r.model) ?? '', cost_usd: num(r.cost_usd) ?? 0, duration_ms: num(r.duration_ms) ?? 0, status: str(r.status) ?? '' })),
  };
}
function readBoard(raw: unknown): Board | null {
  if (!isObj(raw) || !['you', 'agents', 'later', 'done', 'clients'].some(k => Array.isArray(raw[k]))) return null;
  const clients: BoardClient[] = list(raw.clients).filter(isObj).filter(c => str(c.id)).map(c => ({
    id: String(c.id), name: str(c.name) ?? String(c.id), internal: c.internal === true,
    you_count: num(c.you_count) ?? 0, agents_count: num(c.agents_count) ?? 0, overdue_count: num(c.overdue_count) ?? 0,
    next: isObj(c.next) && str(c.next.title) ? { title: String(c.next.title), due: dayOf(c.next.due) } : null,
  }));
  const names = new Map(clients.map(c => [c.id, c.name]));
  const items = (k: string) => list(raw[k]).map((v, i) => item(v, i, names)).filter((x): x is Item => x !== null);
  return { generated_at: str(raw.generated_at), clients, you: items('you'), agents: items('agents'), later: items('later'), done: items('done') };
}

/* ================= dates, times and money, in UK time like the Control centre ================= */
const TZ = 'Europe/London';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ukParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });
const usd = (v: unknown) => money.format(Number(v) || 0);

/* The automations send UTC "YYYY-MM-DD HH:MM:SS", or just "YYYY-MM-DD" */
function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v.includes('T') ? (v.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`) : `${v.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
/* "Mon 5 Oct" */
function dayLabel(iso: string) { const d = parseUtc(iso.slice(0, 10)); return d ? `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : iso; }
/* "Fri 23 Oct, 07:00" in UK time */
function timeLabel(utc: string) {
  const d = parseUtc(utc); if (!d) return utc;
  const p = Object.fromEntries(ukParts.formatToParts(d).map(x => [x.type, x.value]));
  return `${dayLabel(`${p.year}-${p.month}-${p.day}`)}, ${p.hour}:${p.minute}`;
}
function ukToday(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
function addDays(iso: string, n: number) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* "Overdue, was due Mon 28 Sep", "Due today", "Due tomorrow", "Due Mon 5 Oct" */
function dueWords(due: string | null, today = ukToday()) {
  if (!due) return null;
  if (due < today) return { text: `Overdue, was due ${dayLabel(due)}`, overdue: true };
  if (due === today) return { text: 'Due today', overdue: false };
  if (due === addDays(today, 1)) return { text: 'Due tomorrow', overdue: false };
  return { text: `Due ${dayLabel(due)}`, overdue: false };
}
function duration(ms: number | null | undefined) {
  const s = Math.round((Number(ms) || 0) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
const thisMonth = () => new Date().toISOString().slice(0, 7);
function shiftMonth(month: string, by: number) { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7); }
function monthLabel(month: string) { const d = parseUtc(`${month}-01`); return d ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : month; }

/* ================= order ================= */
const whenKey = (i: Item) => (i.at ? i.at : i.due ? `${i.due} 00:00:00` : null);
const youKey = (i: Item) => (i.due ? `${i.due} ${i.at?.slice(11) ?? '00:00:00'}` : null); // your list goes by deadline first
function byDate(items: Item[], key: (i: Item) => string | null = whenKey) {
  return items.map((item, index) => ({ item, index, k: key(item) })).sort((a, b) => {
    if (a.k && b.k) return a.k.localeCompare(b.k) || a.index - b.index;
    if (a.k || b.k) return a.k ? -1 : 1;
    return a.index - b.index;
  }).map(x => x.item);
}
function newestFirst(items: Item[]) {
  return items.map((item, index) => ({ item, index })).sort((a, b) => {
    if (a.item.at && b.item.at) return b.item.at.localeCompare(a.item.at) || a.index - b.index;
    if (a.item.at || b.item.at) return a.item.at ? -1 : 1;
    return a.index - b.index;
  }).map(x => x.item);
}

/* ================= screen state ================= */
let gen = 0;            // which screen is showing; an answer for an older screen is dropped
let timer = 0;          // refresh every minute while the tab is open, like the Control centre
let busy = false;       // a save is running: the refresh waits
const open = new Set<string>(); // expanded items stay expanded across refreshes
let last: Board | null = null;

export function leaveClients() { gen++; clearInterval(timer); timer = 0; }

const loading = () => '<p class="pt-note">Loading…</p>';
function failHtml(e: unknown) {
  const x = e instanceof ApiError ? e : null, why = x && x.data ? x.data.rank : '';
  if (why === 'not_connected') return `<section class="pt-card pt-pad"><h2>Not connected yet</h2>
    <p class="pt-sub">The Clients section reads your client automations with its own key. The same new key goes in two places in Cloudflare: <b>PORTAL_TOKEN</b> on the rank-automation Worker and <b>RANK_PORTAL_TOKEN</b> on the cayenne-website Worker.</p></section>`;
  if (why === 'missing') return `<section class="pt-card pt-pad"><h2>No board data yet</h2><p class="pt-sub">The board shows here once the automations are live.</p></section>`;
  return `<section class="pt-card pt-pad"><h2>${why === 'refused' ? 'The automations refused the key' : 'That did not load'}</h2><p class="pt-sub">${esc(x ? x.message : 'Try again.')}</p>
    <p><button class="pt-btn" type="button" data-act="reload">Try again</button></p></section>`;
}

function tabs(active: 'home' | 'tasks' | 'spend' | 'audits') {
  const t = (id: typeof active, href: string, label: string) => `<a class="pt-tab" href="${href}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="pt-tabs pt-subnav" aria-label="Clients">${t('home', '#/clients', 'Overview')}${t('tasks', '#/clients/tasks', 'Tasks')}${t('spend', '#/clients/spend', 'Spend')}${t('audits', '#/clients/audits', 'Audits and logins')}
    <a class="pt-tab pt-out" href="${CONTROL_CENTRE}" target="_blank" rel="noreferrer">Agents and live browser ↗</a></nav>`;
}
export function clientsHead(active: 'home' | 'tasks' | 'spend' | 'audits', acts = '') {
  return `<div class="pt-head"><div><h1>Clients</h1><p class="pt-sub">${active === 'audits' ? 'Clients in the portal, with their audits and logins.' : 'Your client automations: what you need to do, what the agents are doing, and what it costs.'}</p></div>${acts ? `<div class="pt-acts">${acts}</div>` : ''}</div>${tabs(active)}`;
}

/* ================= #/clients: one card per client ================= */
function cardHtml(c: BoardClient) {
  const due = c.next ? dueWords(c.next.due) : null;
  return `<a class="pt-card pt-ccard" href="#/clients/board/${encodeURIComponent(c.id)}">
    <h2>${esc(c.name)}</h2>
    <div class="pt-cnums"><div><b${c.overdue_count ? ' class="bad"' : ''}>${c.you_count}</b><span>for you</span></div><div><b>${c.agents_count}</b><span>${c.agents_count === 1 ? 'agent working' : 'agents working'}</span></div></div>
    <div class="pt-cnext">${c.next
      ? `<span class="${due && due.overdue ? 'bad' : 'pt-note'}">Next deadline: ${due ? (due.overdue ? `overdue since ${esc(dayLabel(c.next.due!))}` : esc(due.text.replace(/^Due /, ''))) : 'no date'}</span><span class="t">${esc(c.next.title)}</span>`
      : '<span class="pt-note">Nothing due for you.</span>'}${c.overdue_count > 1 ? `<span class="bad">${c.overdue_count} overdue</span>` : ''}</div></a>`;
}

/* ================= the lists ================= */
const chev = '<span class="pt-chev" aria-hidden="true">›</span>';
function meta(i: Item, mine: boolean, showClient: boolean) {
  const due = dueWords(i.due), bits: string[] = [];
  if (mine || !i.at) bits.push(due ? `<span${due.overdue ? ' class="bad"' : ''}>${esc(due.text)}</span>` : '<span>No date</span>');
  else bits.push(`<span>${esc(i.status === 'working' ? `Started ${timeLabel(i.at)}` : timeLabel(i.at))}</span>`);
  if (!mine && i.agent) bits.push(`<span>${esc(i.agent)}</span>`);
  if (showClient && i.client_name) bits.push(`<span>${esc(i.client_name)}</span>`);
  if (i.status === 'waiting') bits.push('<span class="pt-pill">Waiting</span>');
  if (i.action === 'telegram') bits.push('<span class="pt-pill red">In Telegram</span>');
  return `<div class="pt-meta">${bits.join('')}</div>`;
}
const steps = (s: string[]) => (s.length ? `<ol class="pt-steps">${s.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '');
const para = (t: string | null) => (t ? `<p class="pt-pre">${esc(t)}</p>` : '');
const outLink = (l: Item['link']) => (l ? `<a class="pt-li-a" href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)} ↗</a>` : '');

function rowHtml(i: Item, mine: boolean, showClient: boolean) {
  const who = i.agent ?? 'An agent';
  const doing = i.status === 'working' ? `${who} is working on this now.` : i.at ? `${who} does this on ${timeLabel(i.at)} (UK time).` : i.due ? `${who} has this to do by ${dayLabel(i.due)}.` : `${who} has this on the list, with no date yet.`;
  const more = !mine || !!(i.detail || i.steps.length); // an agent's item always opens, to say what is being done
  const head = `<span class="pt-li-t">${esc(i.title)}</span>`;
  const body = `<div class="pt-li-b">${mine ? '' : `<p class="pt-note">${esc(doing)}</p>`}${para(i.detail)}${steps(i.steps)}</div>`;
  const live = i.todo_id !== null && /^Request indexing\b/i.test(i.title) && i.status !== 'done' && i.client_id !== 'rank'
    ? `<a class="pt-li-a" href="${CONTROL_CENTRE}/agents/${encodeURIComponent(i.client_id)}-seo?todo=${i.todo_id}" target="_blank" rel="noreferrer">Do it with the SEO agent in the live browser ↗</a>` : '';
  const tick = i.action === 'tick' && i.todo_id !== null
    ? `<button class="pt-btn small" type="button" data-act="tick" data-todo="${i.todo_id}" aria-label="Mark done: ${esc(i.title)}">✓ Done</button>` : '';
  return `<li class="pt-li"><div class="pt-li-m">${more
    ? `<details data-k="${esc(i.key)}"${open.has(i.key) ? ' open' : ''}><summary>${head}${chev}${meta(i, mine, showClient)}</summary>${body}</details>`
    : `${head}${meta(i, mine, showClient)}`}${live || i.link ? `<div class="pt-li-links">${live}${outLink(i.link)}</div>` : ''}</div>${tick}</li>`;
}

function doneHtml(i: Item, showClient: boolean) {
  const runsCost = i.runs.reduce((s, r) => s + r.cost_usd, 0), cost = i.cost_usd ?? (i.runs.length ? runsCost : null);
  const time = i.duration_ms ?? (i.runs.length ? i.runs.reduce((s, r) => s + r.duration_ms, 0) : null);
  const failed = i.kind === 'failure' || i.status === 'failed';
  const more = !!(i.detail || i.runs.length || i.steps.length || cost !== null);
  const bits = [`<span>${esc(i.at ? timeLabel(i.at) : 'No date')}</span>`];
  if (i.agent) bits.push(`<span>${esc(i.agent)}</span>`);
  if (showClient && i.client_name) bits.push(`<span>${esc(i.client_name)}</span>`);
  if (cost !== null) bits.push(`<span>${esc(usd(cost))}</span>`);
  const head = `<span class="pt-li-t${failed ? ' bad' : ''}"><span class="pt-mk${failed ? ' bad' : ''}" aria-hidden="true">${failed ? '✕' : '✓'}</span>${failed ? '<span class="pt-sr">Failed: </span>' : ''}${esc(i.title)}</span>`;
  const runs = i.runs.length ? `<div class="pt-scroll"><table class="pt-tasks pt-runs"><thead><tr><th>Who</th><th>What</th><th>Model</th><th class="n">Time</th><th class="n">Cost</th></tr></thead><tbody>${i.runs.map(r => `<tr${r.status === 'error' ? ' class="bad"' : ''}><td>${esc(r.agent)}</td><td>${esc(r.did)}</td><td class="pt-note">${esc(r.model)}</td><td class="n">${esc(duration(r.duration_ms))}</td><td class="n">${esc(usd(r.cost_usd))}</td></tr>`).join('')}</tbody></table></div>` : '';
  const total = cost !== null || time !== null ? `<p class="pt-note">${cost !== null ? `Total cost ${esc(usd(cost))}` : ''}${cost !== null && time !== null ? ', ' : ''}${time !== null ? `time ${esc(duration(time))}` : ''}</p>` : '';
  return `<li class="pt-li"><div class="pt-li-m">${more
    ? `<details data-k="${esc(i.key)}"${open.has(i.key) ? ' open' : ''}><summary>${head}${chev}<div class="pt-meta">${bits.join('')}</div></summary><div class="pt-li-b">${para(i.detail)}${steps(i.steps)}${runs}${total}${outLink(i.link)}</div></details>`
    : `${head}<div class="pt-meta">${bits.join('')}</div>`}</div></li>`;
}

function listsHtml(you: Item[], agents: Item[], done: Item[], showClient: boolean) {
  const mine = byDate(you, youKey), theirs = byDate(agents), dn = newestFirst(done);
  const col = (title: string, items: Item[], isMine: boolean, empty: string) => `<section class="pt-card"><div class="pt-lhead"><h2>${title}</h2><span class="pt-count">${items.length}</span></div>
    ${items.length ? `<ul class="pt-list">${items.map(i => rowHtml(i, isMine, showClient)).join('')}</ul>` : `<p class="pt-empty">${empty}</p>`}</section>`;
  return `<div class="pt-two">${col('You need to do', mine, true, 'Nothing for you right now.')}${col('Agents are working on', theirs, false, 'Nothing scheduled.')}</div>
    <section class="pt-card pt-donebox"><details data-k="__done"${open.has('__done') ? ' open' : ''}><summary class="pt-lhead"><h2>Done</h2><span class="pt-note">${dn.length ? `${dn.length}, click to show` : 'Nothing yet'}</span>${dn.length ? chev : ''}</summary>
      ${dn.length ? `<ul class="pt-list">${dn.map(i => doneHtml(i, showClient)).join('')}</ul>` : ''}</details></section>`;
}

/* ================= adding a to-do or a request ================= */
function addFormHtml(clients: BoardClient[], fixed: string | null) {
  return `<section class="pt-card pt-pad pt-gap" id="ptAdd" hidden><div class="pt-lhead0"><h2>Add</h2><button class="pt-link" type="button" data-act="add-close">Close</button></div>
    <form class="pt-form" id="ptAddForm" novalidate>
      <div class="pt-chips full" role="radiogroup" aria-label="What is it"><button class="pt-chip" type="button" role="radio" aria-checked="true" aria-pressed="true" data-act="add-kind" data-kind="task">A to-do</button><button class="pt-chip" type="button" role="radio" aria-checked="false" aria-pressed="false" data-act="add-kind" data-kind="request">A request for the agents</button></div>
      ${fixed ? '' : `<label class="pt-f full">Client<select class="pt-in" name="client_id">${clients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>`}
      <label class="pt-f full"><span data-l="title">What needs doing</span><input class="pt-in" type="text" name="title" maxlength="200"></label>
      <label class="pt-f full"><span data-l="detail">Details (optional)</span><textarea class="pt-in" name="detail" rows="3" maxlength="20000"></textarea></label>
      <label class="pt-f">Due (optional)<input class="pt-in" type="date" name="due_date"></label>
      <label class="pt-f" data-who>Who<select class="pt-in" name="who"><option value="carlo">Me</option><option value="claude">Claude</option><option value="claude_code">Claude Code</option></select></label>
      <div class="pt-row full"><button class="pt-btn red" type="submit">Add</button><p class="pt-addmsg" id="ptAddMsg" role="status"></p></div>
    </form></section>`;
}
function wireAddForm(fixed: string | null, reload: () => Promise<void>) {
  const f = document.getElementById('ptAddForm') as HTMLFormElement | null; if (!f) return;
  const msg = document.getElementById('ptAddMsg') as HTMLElement;
  const say = (t: string, bad: boolean) => { msg.textContent = t; msg.classList.toggle('bad', bad); msg.classList.toggle('good', !bad); };
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = (n: string) => ((f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '');
    const kind = (f.querySelector('[data-kind][aria-pressed="true"]') as HTMLElement | null)?.dataset.kind === 'request' ? 'request' : 'task';
    const title = v('title').trim(), detail = v('detail');
    if (!title) return say('Give it a title.', true);
    if (kind === 'request' && !detail.trim()) return say('A request needs the details.', true);
    const btn = f.querySelector('button[type=submit]') as HTMLButtonElement;
    btn.disabled = true; btn.textContent = 'Saving'; busy = true; say('', false);
    try {
      await api('rank/todos', 'POST', { client_id: fixed ?? v('client_id'), kind, title, detail, due_date: v('due_date') || undefined, who: kind === 'request' ? 'carlo' : v('who') });
      (f.elements.namedItem('title') as HTMLInputElement).value = ''; (f.elements.namedItem('detail') as HTMLTextAreaElement).value = ''; (f.elements.namedItem('due_date') as HTMLInputElement).value = '';
      say('Added.', false);
      busy = false; await reload();
    } catch (e: any) { say(e && e.message ? e.message : 'Could not save.', true); }
    finally { busy = false; btn.disabled = false; btn.textContent = 'Add'; }
  });
}
function setKind(el: HTMLElement) {
  const f = document.getElementById('ptAddForm') as HTMLFormElement | null; if (!f) return;
  const req = el.dataset.kind === 'request';
  f.querySelectorAll<HTMLElement>('[data-kind]').forEach(b => { const on = b === el; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-checked', String(on)); });
  (f.querySelector('[data-l="title"]') as HTMLElement).textContent = req ? 'What do you need, in a few words' : 'What needs doing';
  (f.querySelector('[data-l="detail"]') as HTMLElement).textContent = req ? 'Everything the agent should know' : 'Details (optional)';
  (f.elements.namedItem('detail') as HTMLTextAreaElement).rows = req ? 6 : 3;
  (f.querySelector('[data-who]') as HTMLElement).hidden = req;
}

/* ================= the screens ================= */
async function getBoard(client: string) {
  const raw = await api('rank/board?client=' + encodeURIComponent(client) + '&done_limit=60');
  const b = readBoard(raw);
  if (!b) throw new ApiError('No board data yet.', 404, { rank: 'missing' });
  return b;
}

/* One screen of the section. Returns what a click on [data-act] does there. */
export function clientsScreen(view: string, arg: string, main: HTMLElement): (el: HTMLElement) => void {
  leaveClients();
  const my = gen;
  const live = () => my === gen;
  main.addEventListener('toggle', e => {
    const d = e.target as HTMLElement;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset.k) return;
    if (d.open) open.add(d.dataset.k); else open.delete(d.dataset.k);
  }, true);
  const every = (f: () => Promise<void>) => { timer = window.setInterval(() => { if (live() && !busy && document.visibilityState === 'visible') f().catch(() => { /* the next minute tries again */ }); }, 60000); };

  /* ---------- overview ---------- */
  if (view === 'home') {
    document.title = 'Clients · Cayenne';
    main.innerHTML = `${clientsHead('home')}<div id="ptCards">${loading()}</div>`;
    const box = () => document.getElementById('ptCards') as HTMLElement;
    const load = async () => {
      try {
        const b = await getBoard('all'); if (!live()) return;
        last = b;
        const cards = b.clients.filter(c => !c.internal);
        box().innerHTML = cards.length ? `<div class="pt-cgrid">${cards.map(cardHtml).join('')}</div>` : '<section class="pt-card pt-pad"><p>No clients in the automations yet.</p></section>';
      } catch (e) { if (live()) box().innerHTML = failHtml(e); }
    };
    load(); every(load);
    return () => {};
  }

  /* ---------- spend ---------- */
  if (view === 'spend') {
    document.title = 'Spend · Clients · Cayenne';
    const now = thisMonth(), month = /^\d{4}-(0[1-9]|1[0-2])$/.test(arg) && arg <= now ? arg : now;
    main.innerHTML = `${clientsHead('spend')}
      <div class="pt-month"><a class="pt-btn" href="#/clients/spend/${shiftMonth(month, -1)}" aria-label="Previous month">‹</a>
        <label class="pt-grow"><span class="pt-sr">Month</span><input class="pt-in" type="month" id="ptMonth" value="${month}" max="${now}" aria-label="${esc(monthLabel(month))}"></label>
        ${month < now ? `<a class="pt-btn" href="#/clients/spend/${shiftMonth(month, 1)}" aria-label="Next month">›</a>` : '<span class="pt-btn" aria-disabled="true" aria-label="Next month">›</span>'}</div>
      <div id="ptSpend">${loading()}</div>`;
    (document.getElementById('ptMonth') as HTMLInputElement).addEventListener('change', e => {
      const m = (e.target as HTMLInputElement).value; if (m) location.hash = '#/clients/spend/' + (m > now ? now : m);
    });
    const box = () => document.getElementById('ptSpend') as HTMLElement;
    const load = async () => {
      try { const d = await api<Spend>('rank/spend?month=' + month); if (live()) box().innerHTML = spendHtml(d, month); }
      catch (e) { if (live()) box().innerHTML = failHtml(e); }
    };
    load(); every(load);
    return () => {};
  }

  /* ---------- one client, or every client (tasks) ---------- */
  const one = view === 'board';
  const filter = one ? arg : arg || 'all';
  document.title = (one ? 'Client' : 'Tasks') + ' · Clients · Cayenne';
  main.innerHTML = one
    ? `<a class="pt-back" href="#/clients">← Clients</a><div class="pt-head"><div><h1 id="ptBoardName">${last ? esc(last.clients.find(c => c.id === arg)?.name ?? '') : ''}</h1><p class="pt-sub">What you need to do, what the agents are working on, and what got done.</p></div>
        <div class="pt-acts"><button class="pt-btn red" type="button" data-act="add-open" disabled>Add</button></div></div><div id="ptAddBox"></div><div id="ptLists">${loading()}</div>`
    : `${clientsHead('tasks', '<button class="pt-btn red" type="button" data-act="add-open" disabled>Add</button>')}<div id="ptFilter"></div><div id="ptAddBox"></div><div id="ptLists">${loading()}</div>`;
  const lists = () => document.getElementById('ptLists') as HTMLElement;
  let formMade = false;
  const load = async () => {
    try {
      const b = await getBoard('all'); if (!live()) return;
      last = b;
      const known = b.clients.find(c => c.id === filter);
      if (one && !known) { lists().innerHTML = `<section class="pt-card pt-pad"><p>No client called "${esc(arg)}". <a href="#/clients">Back to Clients</a></p></section>`; return; }
      const fixed = one ? filter : known ? filter : null;
      if (one) { (document.getElementById('ptBoardName') as HTMLElement).textContent = known!.name; document.title = known!.name + ' · Clients · Cayenne'; }
      else {
        const chip = (id: string, name: string) => `<a class="pt-chip" href="#/clients/tasks${id === 'all' ? '' : '/' + encodeURIComponent(id)}"${(known ? filter : 'all') === id ? ' aria-current="page"' : ''}>${esc(name)}</a>`;
        (document.getElementById('ptFilter') as HTMLElement).innerHTML = `<div class="pt-chips pt-filter" role="group" aria-label="Show tasks for">${chip('all', 'All')}${b.clients.map(c => chip(c.id, c.name)).join('')}</div>`;
      }
      if (!formMade) { formMade = true; (document.getElementById('ptAddBox') as HTMLElement).innerHTML = addFormHtml(b.clients, fixed); wireAddForm(fixed, load); main.querySelector<HTMLButtonElement>('[data-act="add-open"]')!.disabled = false; }
      const pick = (i: Item) => !fixed || i.client_id === fixed;
      lists().innerHTML = listsHtml(b.you.filter(pick), [...b.agents, ...b.later].filter(pick), b.done.filter(pick), !fixed);
    } catch (e) { if (live()) lists().innerHTML = failHtml(e); }
  };
  load(); every(load);

  return async el => {
    const act = el.dataset.act;
    if (act === 'add-open') { const box = document.getElementById('ptAdd'); if (box) { box.hidden = false; (box.querySelector('input[name="title"]') as HTMLInputElement).focus(); } }
    if (act === 'add-close') { const box = document.getElementById('ptAdd'); if (box) box.hidden = true; }
    if (act === 'add-kind') setKind(el);
    if (act === 'tick' && el instanceof HTMLButtonElement) {
      const id = el.dataset.todo; if (!id || el.disabled) return;
      el.disabled = true; el.textContent = 'Saving'; busy = true;
      try { await api('rank/todos/' + encodeURIComponent(id), 'PATCH', { status: 'done' }); toast('Ticked off.'); busy = false; await load(); }
      catch (e: any) { el.disabled = false; el.textContent = '✓ Done'; toast(e && e.message ? e.message : 'Could not save.'); }
      finally { busy = false; }
    }
  };
}

function spendHtml(d: Spend, month: string) {
  const name = (id: string) => d.clients.find(c => c.id === id)?.name || id;
  const rows = [...d.spend.by_client].sort((a, b) => b.cost_usd - a.cost_usd), max = Math.max(0, ...rows.map(r => r.cost_usd));
  const groups = d.clients.map(c => ({ c, agents: d.agents.filter(a => a.client_id === c.id).sort((a, b) => b.month_cost_usd - a.month_cost_usd) })).filter(g => g.agents.length);
  return `<div class="pt-grid">
    <div class="pt-stack">
      <section class="pt-card pt-pad"><h2>${esc(monthLabel(month))}</h2><div class="pt-big">${esc(usd(d.spend.cost_usd))}</div>
        <div class="pt-counts two"><div><b>${d.spend.runs}</b><span>runs</span></div><div${d.spend.errors ? ' class="bad"' : ''}><b>${d.spend.errors}</b><span>errors</span></div></div></section>
      <section class="pt-card pt-pad"><h2>By project</h2>${rows.length ? `<ul class="pt-spend">${rows.map(r => `<li>
          <div class="h"><b>${esc(name(r.client_id))}</b><span>${esc(usd(r.cost_usd))}</span></div>
          <div class="pt-bar2" role="img" aria-label="${esc(name(r.client_id) + ': ' + usd(r.cost_usd))}"><i style="width:${max > 0 ? Math.max(2, Math.round(r.cost_usd / max * 100)) : 0}%"></i></div>
          <div class="pt-note">${r.runs} runs${r.errors ? ` · <span class="bad">${r.errors} errors</span>` : ''}</div></li>`).join('')}</ul>` : '<p class="pt-note">No spend this month.</p>'}</section>
    </div>
    <section class="pt-card pt-pad"><h2>By agent</h2>${groups.length ? groups.map(g => `<div class="pt-scroll"><table class="pt-tasks pt-agents"><caption>${esc(g.c.name)}</caption>
        <thead><tr><th>Agent</th><th class="n">Runs</th><th class="n">Cost</th></tr></thead><tbody>${g.agents.map(a => `<tr><td>${esc(a.name)}</td><td class="n">${a.month_runs}</td><td class="n">${esc(usd(a.month_cost_usd))}</td></tr>`).join('')}</tbody></table></div>`).join('') : '<p class="pt-note">No agents yet.</p>'}</section>
  </div>`;
}
