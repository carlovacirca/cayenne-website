// The Clients section: Lucid's Rank SEO page (approved 17 November 2026) in the Cayenne look.
//   #/clients                       a window per client: a row per part (Hub, Website, Google profile), Admin, Automations
//   #/clients/<id>[/automations]    that client's pop-up: Overview (a panel per part, then Admin) or Automations
//   #/clients/spend[/<YYYY-MM>]     what the agents cost, per month
//   (#/clients/audits, the clients' audits and logins, is in app.ts)
// Only the automations: the developer's own to-dos stay out, as in Lucid (the server drops them before they get here).
// Client names come from the automations; logos, colours and parts from a private setting (rank/style). None of it is in this code.
// Agent chat and the live browser stay in the Control centre: they need the developer's own Cloudflare Access sign-in.
import { api, esc, ApiError } from './ui';

export const CONTROL_CENTRE = 'https://rank-dashboard-6cl.pages.dev';

type Part = 'hub' | 'web' | 'gbp';
type Place = Part | 'admin';
type Item = { key: string; client_id: string; kind: string; agent: string | null; title: string; due: string | null; at: string | null; status: string; link: { label: string; url: string } | null };
type Board = { generated_at: string | null; clients: { id: string; name: string; internal: boolean }[]; you: Item[]; agents: Item[]; done: Item[] };
type Style = { id: string; name?: string | null; domain?: string | null; head?: string | null; accent?: string | null; sections?: Part[] | null; wide?: boolean; logo?: string | null };
type Win = { id: string; name: string; domain: string | null; head: string | null; accent: string | null; logo: string | null; wide: boolean; sections: Part[] };
type Who = 'you' | 'agent' | 'done' | 'problem';
type Line = { key: string; who: Who; title: string; when: string | null; link: Item['link'] };
type View = { win: Win; needsYou: number; problems: number; sections: { key: Part; lines: Line[] }[]; admin: Line[] };
type Spend = {
  month: string; clients: { id: string; name: string }[];
  spend: { runs: number; cost_usd: number; errors: number; by_client: { client_id: string; runs: number; cost_usd: number; errors: number }[] };
  agents: { id: string; client_id: string; name: string; month_runs: number; month_cost_usd: number }[];
};

export const LABEL: Record<Place, string> = { hub: 'Hub', web: 'Website', gbp: 'Google profile', admin: 'Admin' };
const WHO: Record<Who, string> = { you: 'You', agent: 'Agent', done: 'Done', problem: 'Problem' };

/* ================= the board, read safely ================= */
type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function readItem(v: unknown): Item | null {
  if (!isObj(v) || !s(v.title)) return null;
  const link = isObj(v.link) && s(v.link.url) && /^https?:\/\//.test(v.link.url) ? { label: s(v.link.label) ?? 'Open', url: String(v.link.url) } : null;
  return { key: s(v.key) ?? String(v.title), client_id: s(v.client_id) ?? '', kind: s(v.kind) ?? '', agent: s(v.agent), title: String(v.title), due: s(v.due), at: s(v.at), status: s(v.status) ?? '', link };
}
function readBoard(raw: unknown): Board | null {
  if (!isObj(raw) || !Array.isArray(raw.clients)) return null;
  const items = (k: string) => arr(raw[k]).map(readItem).filter((x): x is Item => x !== null);
  return {
    generated_at: s(raw.generated_at),
    clients: arr(raw.clients).filter(isObj).filter(c => s(c.id)).map(c => ({ id: String(c.id), name: s(c.name) ?? String(c.id), internal: c.internal === true })),
    you: items('you'), agents: items('agents'), done: items('done'),
  };
}

/* ================= dates and money, in UK time ================= */
const TZ = 'Europe/London';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ukParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });
const usd = (v: unknown) => money.format(Number(v) || 0);
/* "Mon 5 Oct" from "YYYY-MM-DD" */
function dayLabel(iso: string) { const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`); return Number.isNaN(d.getTime()) ? iso : `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
/* As Lucid: "Fri 20 Nov, 06:00" (UK time) from a UTC "YYYY-MM-DD HH:MM:SS"; "Fri 20 Nov" from a due date */
export function whenText(i: Pick<Item, 'at' | 'due'>): string | null {
  if (i.at && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(i.at)) {
    const d = new Date(`${i.at.replace(' ', 'T').slice(0, 19)}Z`);
    if (!Number.isNaN(d.getTime())) {
      const p = Object.fromEntries(ukParts.formatToParts(d).map(x => [x.type, x.value]));
      return `${dayLabel(`${p.year}-${p.month}-${p.day}`)}, ${p.hour}:${p.minute}`;
    }
  }
  if (i.due && /^\d{4}-\d{2}-\d{2}$/.test(i.due)) return dayLabel(i.due);
  return null;
}
const thisMonth = () => new Date().toISOString().slice(0, 7);
function shiftMonth(month: string, by: number) { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7); }
function monthLabel(month: string) { const d = new Date(`${month}-01T12:00:00Z`); return Number.isNaN(d.getTime()) ? month : new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d); }

/* ================= the windows, shaped as in Lucid (src/domain/work/rank.ts) ================= */
/* The private style decides the order, names, colours, logos and parts. A client the automations have but the style
   does not still gets a window, with the portal's colours and Website only when it has website work. */
export function windowsOf(b: Board, styles: Style[]): Win[] {
  const known = new Map(b.clients.filter(c => !c.internal).map(c => [c.id, c]));
  const all = [...b.you, ...b.agents, ...b.done];
  const parts = (id: string): Part[] => (all.some(i => i.client_id === id && (i.kind === 'blog' || i.kind === 'indexing')) ? ['web', 'gbp'] : ['gbp']);
  const out: Win[] = [];
  for (const st of styles) {
    const c = known.get(st.id); if (!c) continue;
    out.push({ id: c.id, name: st.name || c.name, domain: st.domain || null, head: st.head || null, accent: st.accent || null, logo: st.logo || null, wide: !!st.wide, sections: st.sections && st.sections.length ? st.sections : parts(c.id) });
    known.delete(c.id);
  }
  for (const c of known.values()) out.push({ id: c.id, name: c.name, domain: null, head: null, accent: null, logo: null, wide: false, sections: parts(c.id) });
  return out;
}

/* Which part of a client an item belongs to. null: left out (the developer's own to-dos). */
export function placeOf(i: Item, w: Win): Place | null {
  const k = i.kind, has = (p: Part) => w.sections.includes(p);
  if (k === 'task' || k === 'request') return null;
  if (k === 'report' || k === 'report_input') return 'admin';
  if (k === 'gbp') return has('gbp') ? 'gbp' : null;
  if (k === 'blog' || k === 'indexing') return has('web') ? 'web' : 'gbp';
  if (k === 'failure') return /\bGBP\b|Google profile/i.test(`${i.title} ${i.agent ?? ''}`) ? 'gbp' : has('web') ? 'web' : 'gbp';
  return null;
}
const failed = (i: Item) => i.kind === 'failure' || i.status === 'failed' || i.status === 'stuck';
const sortKey = (i: Item) => i.at ?? (i.due ? `${i.due} 99` : '9999');

/* You first, then the agents by time, then the latest finished (2 per part). */
export function shape(b: Board, wins: Win[], doneShown = 2): { views: View[]; next: string | null; needsYou: number } {
  const line = (i: Item, who: Who): Line => ({ key: i.key, who, title: i.title, when: whenText(i), link: i.link });
  const views = wins.map(win => {
    const mine = (l: Item[]) => l.filter(i => i.client_id === win.id && placeOf(i, win) !== null);
    const you = mine(b.you), agents = mine(b.agents), done = mine(b.done);
    const into = (place: Place) => {
      const here = (l: Item[]) => l.filter(i => placeOf(i, win) === place);
      return [
        ...here(you).map(i => line(i, failed(i) ? 'problem' : 'you')),
        ...here(agents).sort((a, c) => sortKey(a).localeCompare(sortKey(c))).map(i => line(i, failed(i) ? 'problem' : 'agent')),
        ...here(done).slice(0, doneShown).map(i => line(i, failed(i) ? 'problem' : 'done')),
      ];
    };
    return {
      win, needsYou: you.length,
      problems: [...you, ...agents, ...done.slice(0, doneShown)].filter(failed).length,
      sections: win.sections.map(key => ({ key, lines: key === 'hub' ? [] : into(key) })),
      admin: into('admin'),
    };
  });
  const ids = new Set(wins.map(w => w.id));
  const upcoming = b.agents.filter(i => ids.has(i.client_id) && i.kind !== 'task' && i.kind !== 'request' && i.at).sort((a, c) => sortKey(a).localeCompare(sortKey(c)));
  return { views, next: upcoming.length ? whenText(upcoming[0]) : null, needsYou: views.reduce((n, v) => n + v.needsYou, 0) };
}

/* ================= drawing ================= */
const ICON: Record<Place, string> = {
  hub: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5M16 5.5a3 3 0 0 1 0 5.6M18 14.5c1.4.7 2.2 2.3 2.5 4.5"/>',
  web: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18"/>',
  gbp: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  admin: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5"/>',
};
const icon = (p: Place) => `<span class="pt-ico${p === 'admin' ? ' admin' : ''}" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[p]}</svg></span>`;
const arrow = '<svg class="pt-win-go" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>';
const COLOUR = /^#[0-9a-fA-F]{6}$/;
const bg = (w: Win) => (w.head && COLOUR.test(w.head) ? ` style="background:${w.head}"` : '');

function logo(w: Win, big = false) {
  if (w.logo && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(w.logo)) return `<span class="pt-logo${w.wide ? ' wide' : ''}${big ? ' big' : ''}"><img src="${esc(w.logo)}" alt=""></span>`;
  return `<span class="pt-logo mono${big ? ' big' : ''}" aria-hidden="true">${esc(w.name.replace(/^the\s+/i, '').charAt(0).toUpperCase())}</span>`;
}
function brand(w: Win, big = false, idAttr = '') {
  const dot = w.accent && COLOUR.test(w.accent) ? ` style="background:${w.accent}"` : '';
  return `${logo(w, big)}<span class="pt-brand"><b${idAttr}>${esc(w.name)}</b>${w.domain ? `<span class="pt-dom"><i${dot}></i>${esc(w.domain)}</span>` : ''}</span>`;
}

/* The first open line of a part, or the latest finished one, for the window's row. */
const headline = (lines: Line[]) => lines.find(l => l.who !== 'done') ?? lines[0] ?? null;
function row(part: Place, line: Line | null, href: string) {
  const text = line ? `${line.title}${line.when ? ` · ${line.when}` : ''}` : part === 'hub' ? 'Not connected yet' : 'Nothing coming up';
  const tag = line && (line.who === 'you' || line.who === 'problem') ? `<span class="pt-tag2 ${line.who}">${line.who === 'you' ? 'Needs you' : 'Problem'}</span>` : '';
  return `<a class="pt-row${part === 'admin' ? ' admin' : ''}" href="${href}">${icon(part)}<span class="pt-row-t"><b>${LABEL[part]}</b><span class="pt-row-s">${esc(text)}</span></span>${tag}</a>`;
}
function windowHtml(v: View, span: number) {
  const href = '#/clients/' + encodeURIComponent(v.win.id);
  return `<article class="pt-card pt-win s${span}">
    <a class="pt-win-head"${bg(v.win)} href="${href}" aria-label="Open ${esc(v.win.name)}">${brand(v.win)}${arrow}</a>
    ${v.sections.map(sec => row(sec.key, headline(sec.lines), href)).join('')}
    ${row('admin', headline(v.admin), href)}
    <a class="pt-win-auto" href="${href}/automations"><span>Automations</span><span aria-hidden="true">›</span></a></article>`;
}

function lineHtml(l: Line) {
  const body = `<span class="pt-dot ${l.who}" aria-hidden="true"></span><span class="pt-line-t"><b>${esc(l.title)}</b>${l.when ? `<span>${esc(l.when)}</span>` : ''}</span><span class="pt-tag2 ${l.who}">${WHO[l.who]}</span>`;
  return l.link ? `<li><a class="pt-line" href="${esc(l.link.url)}" target="_blank" rel="noreferrer" title="${esc(l.link.label)}">${body}</a></li>` : `<li class="pt-line">${body}</li>`;
}
function panel(part: Place, title: string, lines: Line[], empty: string, tone = '') {
  return `<section class="pt-card pt-panel${tone ? ' ' + tone : ''}"><div class="pt-panel-h">${icon(part)}<h3>${esc(title)}</h3></div>
    ${lines.length ? `<ul class="pt-lines">${lines.map(lineHtml).join('')}</ul>` : `<p class="pt-note">${esc(empty)}</p>`}</section>`;
}
function popupHtml(v: View, tab: 'overview' | 'automations') {
  const href = '#/clients/' + encodeURIComponent(v.win.id);
  const all = [...v.sections.flatMap(x => x.lines), ...v.admin];
  const body = tab === 'overview'
    ? `<div class="pt-panels n${v.sections.length}">${v.sections.map(x => panel(x.key, LABEL[x.key], x.lines, x.key === 'hub' ? 'Not connected yet. Fills in once the hub is linked.' : 'Nothing coming up.')).join('')}</div>
       ${panel('admin', 'Admin', v.admin, 'Nothing due.', 'admin')}`
    : `${panel('web', 'Running and coming up', all.filter(l => l.who === 'agent' || l.who === 'problem'), 'Nothing scheduled.')}
       ${panel('admin', 'Recently finished', all.filter(l => l.who === 'done'), 'Nothing finished lately.', 'done')}`;
  return `<div class="pt-pop" role="dialog" aria-modal="true" aria-labelledby="ptPopTitle">
    <a class="pt-pop-shade" href="#/clients" tabindex="-1" aria-hidden="true"></a>
    <section class="pt-pop-box">
      <header class="pt-pop-head"${bg(v.win)}>
        <div class="pt-pop-bar"><a class="pt-pop-btn" href="#/clients">‹ Back</a><a class="pt-pop-btn x" href="#/clients" aria-label="Close" data-close>✕</a></div>
        <div class="pt-pop-brand">${brand(v.win, true, ' id="ptPopTitle"')}</div>
        <nav class="pt-pop-tabs" aria-label="${esc(v.win.name)} views">
          <a href="${href}"${tab === 'overview' ? ' aria-current="page"' : ''}>Overview</a><a href="${href}/automations"${tab === 'automations' ? ' aria-current="page"' : ''}>Automations</a></nav>
      </header>
      <div class="pt-pop-body">${body}</div>
    </section></div>`;
}

/* ================= screen state ================= */
let gen = 0;          // which screen is showing; an answer for an older one is dropped
let timer = 0;        // refresh every minute while the tab is open
let cache: { at: number; board: Board; styles: Style[] } | null = null;  // opening and closing a pop-up draws at once
let opener: string | null = null;  // the window a pop-up opened from, to put the focus back

export function leaveClients() {
  gen++; clearInterval(timer); timer = 0;
  document.documentElement.classList.remove('pt-lock');
  document.removeEventListener('keydown', onKey);
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && document.querySelector('.pt-pop')) { e.preventDefault(); location.hash = '#/clients'; } }

const loading = () => '<p class="pt-note">Loading…</p>';
function failHtml(e: unknown) {
  const x = e instanceof ApiError ? e : null, why = x && x.data ? x.data.rank : '';
  if (why === 'not_connected') return `<section class="pt-card pt-pad"><h2>Not connected yet</h2>
    <p class="pt-sub">The Clients section reads your client automations with its own key. The same new key goes in two places in Cloudflare: <b>PORTAL_TOKEN</b> on the rank-automation Worker and <b>RANK_PORTAL_TOKEN</b> on the cayenne-website Worker.</p></section>`;
  if (why === 'missing') return `<section class="pt-card pt-pad"><h2>No board data yet</h2><p class="pt-sub">The windows show here once the automations are live.</p></section>`;
  return `<section class="pt-card pt-pad"><h2>${why === 'refused' ? 'The automations refused the key' : 'That did not load'}</h2><p class="pt-sub">${esc(x ? x.message : 'Try again.')}</p>
    <p><button class="pt-btn" type="button" data-act="reload">Try again</button></p></section>`;
}

function tabs(active: 'home' | 'spend' | 'audits') {
  const t = (id: typeof active, href: string, label: string) => `<a class="pt-tab" href="${href}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="pt-tabs pt-subnav" aria-label="Clients">${t('home', '#/clients', 'Overview')}${t('spend', '#/clients/spend', 'Spend')}${t('audits', '#/clients/audits', 'Audits and logins')}
    <a class="pt-tab pt-out" href="${CONTROL_CENTRE}" target="_blank" rel="noreferrer">Agents and live browser ↗</a></nav>`;
}
export function clientsHead(active: 'home' | 'spend' | 'audits', acts = '') {
  const sub = active === 'audits' ? 'Clients in the portal, with their audits and logins.' : active === 'spend' ? 'What the agents cost, per month.' : 'Your client automations: what is coming up, what needs you, what got done.';
  return `<div class="pt-head"><div><h1>Clients</h1><p class="pt-sub">${sub}</p></div>${acts ? `<div class="pt-acts">${acts}</div>` : ''}</div>${tabs(active)}`;
}

async function load(fresh: boolean) {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache;
  const [raw, st] = await Promise.all([api('rank/board'), api<{ clients?: Style[] }>('rank/style').catch(() => ({ clients: [] as Style[] }))]);
  const board = readBoard(raw);
  if (!board) throw new ApiError('No board data yet.', 404, { rank: 'missing' });
  cache = { at: Date.now(), board, styles: Array.isArray(st.clients) ? st.clients.filter(x => x && typeof x.id === 'string') : [] };
  return cache;
}

/* The width of each window: rows of 3, and a last row of 2 shares the width, as in Lucid. */
function spans(n: number) { const tail = n % 3; return Array.from({ length: n }, (_, i) => (i >= n - tail ? (tail === 2 ? 3 : 6) : 2)); }

/* One screen of the section. Returns what a click on [data-act] does there. */
export function clientsScreen(view: string, arg: string, extra: string, main: HTMLElement): (el: HTMLElement) => void {
  leaveClients();
  const my = gen, live = () => my === gen;
  const every = (f: () => Promise<void>) => { timer = window.setInterval(() => { if (live() && document.visibilityState === 'visible') f().catch(() => { /* the next minute tries again */ }); }, 60000); };

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
    const go = async () => {
      try { const d = await api<Spend>('rank/spend?month=' + month); if (live()) box().innerHTML = spendHtml(d, month); }
      catch (e) { if (live()) box().innerHTML = failHtml(e); }
    };
    go(); every(go);
    return () => {};
  }

  /* ---------- the windows, and a client's pop-up over them ---------- */
  const openId = view === 'client' ? arg : '';
  const tab = extra === 'automations' ? 'automations' : 'overview';
  document.title = 'Clients · Cayenne';
  main.innerHTML = `${clientsHead('home', '<span class="pt-next" id="ptNext" hidden></span>')}<div id="ptWins">${loading()}</div><div id="ptPop"></div>`;
  const wins = () => document.getElementById('ptWins') as HTMLElement;
  const draw = (c: NonNullable<typeof cache>) => {
    const list = windowsOf(c.board, c.styles), shaped = shape(c.board, list), w = spans(shaped.views.length);
    const next = document.getElementById('ptNext') as HTMLElement;
    next.hidden = !shaped.next; next.innerHTML = shaped.next ? `<i aria-hidden="true"></i>Next: ${esc(shaped.next)}` : '';
    wins().innerHTML = shaped.views.length ? `<div class="pt-wins">${shaped.views.map((v, i) => windowHtml(v, w[i])).join('')}</div>` : '<section class="pt-card pt-pad"><p>No clients in the automations yet.</p></section>';
    const pop = document.getElementById('ptPop') as HTMLElement, v = openId ? shaped.views.find(x => x.win.id === openId) : null;
    const wasOpen = !!pop.firstElementChild;
    pop.innerHTML = v ? popupHtml(v, tab) : '';
    document.documentElement.classList.toggle('pt-lock', !!v);
    if (v) {
      document.title = v.win.name + ' · Clients · Cayenne';
      if (!wasOpen) {
        const same = opener === v.win.id;  // only the tab changed: keep the focus on the tabs
        opener = v.win.id;
        (pop.querySelector(same ? '.pt-pop-tabs [aria-current="page"]' : '[data-close]') as HTMLElement).focus();
      }
    } else if (openId) {
      wins().insertAdjacentHTML('afterbegin', `<p class="pt-note">No client called "${esc(openId)}".</p>`);
    } else if (opener) {
      (wins().querySelector(`.pt-win-head[href="#/clients/${CSS.escape(encodeURIComponent(opener))}"]`) as HTMLElement | null)?.focus();
      opener = null;
    }
  };
  document.addEventListener('keydown', onKey);
  let drawn = '';  // what is on screen; a refresh with nothing new leaves it alone (focus and scroll stay put)
  const show = (c: NonNullable<typeof cache>) => { const sig = JSON.stringify([c.board, c.styles.length]); if (sig !== drawn) { drawn = sig; draw(c); } };
  const go = async (fresh = false) => {
    try { const c = await load(fresh); if (live()) show(c); }
    catch (e) { if (live()) { drawn = ''; wins().innerHTML = failHtml(e); } }
  };
  if (cache) show(cache);
  go(); every(() => go(true));
  return () => {};
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
