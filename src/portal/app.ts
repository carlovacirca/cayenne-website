// The Cayenne client portal. One page, moved around with the address hash:
//   #/ or #/leads    developer: leads (businesses being audited); client: their audits
//   #/clients/...    developer: current clients, the client automations as Lucid's Rank SEO page (clients.ts)
//   #/clients/audits developer: clients in the portal, with their audits and logins
//   #/client/<id>    developer: one lead or client, its audits and its logins
//   #/audit/<id>     the audit itself
import { api, esc, toast, day, when, copyText, twoStep, onSignedOut, ApiError } from './ui';
import { openAudit, leaveAudit, flushNow } from './editor';
import { clientsScreen, clientsHead, leaveClients } from './clients';

type Me = { signedIn: boolean; role?: 'dev' | 'client'; name?: string; email?: string; mustChange?: boolean; clientName?: string };
type Progress = { questions: number; answered: number; items: number; checked: number; p1: number; p2: number; p3: number; pct: number; analysed: boolean };
type AuditRow = Progress & { id: string; number: number; status: string; shared: boolean; parent_id: string | null; updated_at: string; completed_at: string | null };
type Kind = 'lead' | 'client';
type Client = { id: string; name: string; kind: string; contact?: string; email?: string; phone?: string; website?: string; location?: string; audits?: number; last_audit?: string; updated_at?: string; latest?: AuditRow | null };
type UserRow = { id: string; email: string; name: string; must_change: number; disabled: number; last_login: string | null };

let me: Me = { signedIn: false };
let notReady = false;
let routing = 0;
let screenClick: ((el: HTMLElement) => void) | null = null;
let secret: { email: string; password: string } | null = null; // a temporary password, shown once

const root = () => document.getElementById('pt') as HTMLElement;
const portalLink = () => location.origin + '/portal';

function shell(inner: string, section?: Kind) {
  const who = me.role === 'dev' ? me.email : me.clientName || me.email;
  const nav = me.role === 'dev'
    ? `<nav class="pt-topnav" aria-label="Portal"><a href="#/leads" data-nav="lead"${section === 'lead' ? ' aria-current="page"' : ''}>Leads</a><a href="#/clients" data-nav="client"${section === 'client' ? ' aria-current="page"' : ''}>Clients</a></nav>`
    : '<span class="pt-tag">Client portal</span>';
  root().innerHTML = `<header class="pt-bar"><div class="pt-bar-in"><a href="#/" class="pt-home" aria-label="Portal home"><img src="/img/cayenne.png" alt="Cayenne" width="104" height="29"></a>${nav}<div class="pt-who"><span class="pt-me">${esc(who)}</span><button class="pt-btn small" type="button" data-act="logout">Sign out</button></div></div></header><main class="pt-wrap" id="ptMain">${inner}</main>`;
  return document.getElementById('ptMain') as HTMLElement;
}
function setNav(section: Kind) {
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach(a => { if (a.dataset.nav === section) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const loading = () => '<p class="pt-note">Loading…</p>';
const problem = (e: any) => `<div class="pt-card pt-pad"><h2>That did not load</h2><p class="pt-sub">${esc(e && e.message ? e.message : 'Try again.')}</p><p><button class="pt-btn" type="button" data-act="reload">Try again</button></p></div>`;

/* ================= start ================= */
async function boot() {
  onSignedOut(() => { if (!me.signedIn) return; me = { signedIn: false }; toast('Signed out. Sign in again.'); route(); });
  window.addEventListener('hashchange', () => { route(); });
  window.addEventListener('pagehide', () => flushNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
  root().addEventListener('click', onRootClick);
  await loadMe();
  route();
}
async function loadMe() {
  try { const r = await api<Me>('session'); me = r && r.signedIn ? r : { signedIn: false }; notReady = false; }
  catch (e: any) { me = { signedIn: false }; notReady = e instanceof ApiError && !!(e.data && e.data.notReady); }
}

async function route() {
  const my = ++routing;
  const [a, b, c, d] = location.hash.replace(/^#\/?/, '').split('/');
  leaveClients();
  if (a !== 'audit') await leaveAudit();
  if (my !== routing) return;
  screenClick = null;
  if (!me.signedIn) return showLogin();
  if (me.role === 'client' && me.mustChange) return showPassword();
  if (a === 'audit' && b) { const m = shell(''); return openAudit(decodeURIComponent(b), me.role === 'dev' ? 'dev' : 'client', m); }
  if (me.role === 'dev') {
    if (a === 'client' && b) return showClient(decodeURIComponent(b));
    if (a === 'clients' && b === 'audits') return showList('client');
    if (a === 'clients') {
      // #/clients/spend[/<month>]; #/clients/<id>[/automations] (the old #/clients/board/<id> still opens it); else the windows
      const id = b === 'board' ? c : b, sub = b === 'board' ? d : c;
      const view = b === 'spend' ? 'spend' : id && id !== 'tasks' ? 'client' : 'home';
      screenClick = clientsScreen(view, decodeURIComponent((view === 'spend' ? c : id) || ''), sub || '', shell('', 'client'));
      return;
    }
    return showList('lead');
  }
  return showMine();
}

async function onRootClick(e: Event) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-href]');
  if (!el) return;
  if (el.dataset.href && !(e.target as HTMLElement).closest('a,button,input,select,textarea,label')) { location.hash = el.dataset.href; return; }
  const act = el.dataset.act;
  if (act === 'logout') {
    await leaveAudit();
    try { await api('session', 'DELETE'); } catch { /* signed out anyway */ }
    me = { signedIn: false }; secret = null;
    if (location.hash && location.hash !== '#/') location.hash = '#/'; else route();
    return;
  }
  if (act === 'reload') { route(); return; }
  if (screenClick && act) screenClick(el);
}

/* ================= signing in ================= */
function showLogin() {
  document.title = 'Client portal · Cayenne';
  root().innerHTML = `<div class="pt-login"><form class="pt-card" id="ptLogin" novalidate>
    <img src="/img/cayenne.png" alt="Cayenne" width="128" height="36">
    <div><h1>Client <em>portal</em></h1><p class="pt-sub">Sign in to see your audits.</p></div>
    ${notReady ? '<p class="pt-banner">The portal is not switched on yet. Its settings need adding in Cloudflare first.</p>' : ''}
    <label class="pt-f">Email<input class="pt-in" type="email" name="email" autocomplete="username" required></label>
    <label class="pt-f">Password<input class="pt-in" type="password" name="password" autocomplete="current-password" required></label>
    <p class="pt-err" id="ptErr" role="alert" hidden></p>
    <button class="pt-btn red" type="submit">Sign in</button>
    <p class="pt-note">Forgotten the password? Ask Cayenne for a new one.</p>
  </form></div>`;
  const f = document.getElementById('ptLogin') as HTMLFormElement;
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = f.querySelector('button') as HTMLButtonElement, err = document.getElementById('ptErr') as HTMLElement;
    const email = (f.elements.namedItem('email') as HTMLInputElement).value.trim(), password = (f.elements.namedItem('password') as HTMLInputElement).value;
    if (!email || !password) { err.textContent = 'Enter your email and password.'; err.hidden = false; return; }
    btn.disabled = true; err.hidden = true;
    try { await api('session', 'POST', { email, password }); await loadMe(); route(); }
    catch (x: any) { err.textContent = x.message === 'notReady' ? 'The portal is not switched on yet.' : x.message; err.hidden = false; }
    finally { btn.disabled = false; }
  });
}
function showPassword() {
  document.title = 'Choose a password · Cayenne';
  root().innerHTML = `<div class="pt-login"><form class="pt-card" id="ptPass" novalidate>
    <img src="/img/cayenne.png" alt="Cayenne" width="128" height="36">
    <div><h1>Choose a <em>password</em></h1><p class="pt-sub">You signed in with a temporary password. Pick your own to carry on.</p></div>
    <label class="pt-f">Temporary password<input class="pt-in" type="password" name="current" autocomplete="current-password" required></label>
    <label class="pt-f">New password<input class="pt-in" type="password" name="next" autocomplete="new-password" minlength="10" required></label>
    <label class="pt-f">New password again<input class="pt-in" type="password" name="again" autocomplete="new-password" required></label>
    <p class="pt-note">At least 10 characters.</p>
    <p class="pt-err" id="ptErr" role="alert" hidden></p>
    <button class="pt-btn red" type="submit">Save the password</button>
    <button class="pt-link" type="button" data-act="logout">Sign out</button>
  </form></div>`;
  const f = document.getElementById('ptPass') as HTMLFormElement;
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value, err = document.getElementById('ptErr') as HTMLElement, btn = f.querySelector('button[type=submit]') as HTMLButtonElement;
    const fail = (m: string) => { err.textContent = m; err.hidden = false; };
    if (v('next').length < 10) return fail('Use at least 10 characters.');
    if (v('next') !== v('again')) return fail('The two new passwords do not match.');
    btn.disabled = true; err.hidden = true;
    try { await api('password', 'POST', { current: v('current'), next: v('next') }); me.mustChange = false; toast('Password saved.'); route(); }
    catch (x: any) { fail(x.message); }
    finally { btn.disabled = false; }
  });
}

/* ================= developer: leads and clients ================= */
function clientForm(c: Client | null, kind: Kind = 'lead') {
  const v = (k: keyof Client) => esc(c ? c[k] ?? '' : '');
  return `<form class="pt-form" id="ptClientForm" novalidate>
    <label class="pt-f">Business name<input class="pt-in" type="text" name="name" value="${v('name')}" required></label>
    <label class="pt-f">Type<select class="pt-in" name="kind"><option value="lead"${(c ? c.kind : kind) === 'client' ? '' : ' selected'}>Lead</option><option value="client"${(c ? c.kind : kind) === 'client' ? ' selected' : ''}>Client</option></select></label>
    <label class="pt-f">Contact<input class="pt-in" type="text" name="contact" value="${v('contact')}"></label>
    <label class="pt-f">Email<input class="pt-in" type="email" name="email" value="${v('email')}"></label>
    <label class="pt-f">Phone<input class="pt-in" type="tel" name="phone" value="${v('phone')}"></label>
    <label class="pt-f">Website<input class="pt-in" type="url" name="website" value="${v('website')}"></label>
    <label class="pt-f full">Location<input class="pt-in" type="text" name="location" value="${v('location')}"></label>
    <p class="pt-err full" id="ptFormErr" role="alert" hidden></p>
    <div class="pt-row full"><button class="pt-btn small red" type="submit">${c ? 'Save details' : 'Add'}</button>${c ? '' : '<button class="pt-btn small" type="button" data-act="cancel-new">Cancel</button>'}</div>
  </form>`;
}
function readClientForm(f: HTMLFormElement) {
  const o: Record<string, string> = {};
  ['name', 'kind', 'contact', 'email', 'phone', 'website', 'location'].forEach(k => { o[k] = ((f.elements.namedItem(k) as HTMLInputElement)?.value || '').trim(); });
  return o;
}

/* how far an audit has got, as a bar and short counts */
function bar(a: AuditRow) { return `<div class="pt-mini"><div class="pt-pbar" aria-hidden="true"><i style="width:${Math.max(2, a.pct)}%"></i></div><span><b>${a.pct}%</b> done</span></div>`; }
function stats(a: AuditRow) {
  return `<span><b>${a.answered}/${a.questions}</b> questions answered</span><span><b>${a.checked}/${a.items}</b> research checked</span>`
    + `<span class="p1"><b>${a.p1}</b> not sure, nothing yet</span><span><b>${a.p2}</b> not sure, to confirm</span><span><b>${a.p3}</b> not answered</span>${a.analysed ? '<span>AI analysis done</span>' : ''}`;
}
const status = (a: AuditRow) => `<span class="pt-pill${a.status === 'complete' ? ' go' : ''}">${a.status === 'complete' ? 'Finished ' + esc(day(a.completed_at)) : 'Open'}</span>`;

async function showList(kind: Kind) {
  const L = kind === 'lead', title = L ? 'Leads' : 'Clients';
  document.title = title + ' · Cayenne';
  const m = shell(loading(), kind);
  let r: { clients: Client[] };
  try { r = await api('clients?kind=' + kind); } catch (e) { m.innerHTML = problem(e); return; }
  const rows = r.clients.map(c => { const a = c.latest; return `<tr class="click" data-href="#/client/${encodeURIComponent(c.id)}">
      <td data-l="Business"><a href="#/client/${encodeURIComponent(c.id)}"><b>${esc(c.name)}</b></a>${c.contact ? `<div class="pt-note">${esc(c.contact)}</div>` : ''}</td>
      <td data-l="Audit">${a ? `<b>Audit ${a.number}</b> ${status(a)}` : '<span class="pt-note">No audit yet</span>'}</td>
      <td data-l="Progress">${a ? bar(a) + `<div class="pt-note">${a.p1 + a.p2 + a.p3} still needed${a.p1 ? `, <b class="pt-p1">${a.p1} P1</b>` : ''}</div>` : ''}</td>
      <td data-l="Last change">${esc(cap(when(c.last_audit || c.updated_at)))}</td>
      <td>${a ? `<a class="pt-btn small red" href="#/audit/${encodeURIComponent(a.id)}">Open audit</a>` : ''}</td></tr>`; }).join('');
  const acts = `${L ? '<button class="pt-btn" type="button" data-act="import">Import file</button><input type="file" id="ptImport" accept=".json,application/json" hidden>' : ''}<button class="pt-btn red" type="button" data-act="new-client">${L ? 'New lead' : 'New client'}</button>`;
  m.innerHTML = `${L ? `<div class="pt-head"><div><h1>${title}</h1><p class="pt-sub">Businesses being audited before they sign.</p></div><div class="pt-acts">${acts}</div></div>` : clientsHead('audits', acts)}
    <section class="pt-card pt-pad pt-gap" id="ptNew" hidden><h2>${L ? 'New lead' : 'New client'}</h2>${clientForm(null, kind)}</section>
    <section class="pt-card">${r.clients.length
      ? `<div class="pt-scroll"><table class="pt-table stack"><thead><tr><th>Business</th><th>Audit</th><th>Progress</th><th>Last change</th><th><span class="pt-sr">Open</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="pt-pad"><p>${L ? 'No leads yet. Add one, or import a prepared file.' : 'No clients in the portal yet. A lead you switch to Client shows here, with its audits and logins.'}</p></div>`}</section>`;

  const box = document.getElementById('ptNew') as HTMLElement, form = document.getElementById('ptClientForm') as HTMLFormElement, file = document.getElementById('ptImport') as HTMLInputElement;
  screenClick = el => {
    if (el.dataset.act === 'new-client') { box.hidden = false; (form.elements.namedItem('name') as HTMLInputElement).focus(); }
    if (el.dataset.act === 'cancel-new') box.hidden = true;
    if (el.dataset.act === 'import' && file) file.click();
  };
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = readClientForm(form), err = document.getElementById('ptFormErr') as HTMLElement;
    if (!o.name) { err.textContent = 'Add a business name.'; err.hidden = false; return; }
    try { const x = await api<{ id: string }>('clients', 'POST', o); location.hash = '#/client/' + encodeURIComponent(x.id); }
    catch (x: any) { err.textContent = x.message; err.hidden = false; }
  });
  if (file) file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; file.value = '';
    if (!f) return;
    let data: any;
    try { data = JSON.parse(await f.text()); } catch { toast('That file is not a Cayenne import file.'); return; }
    try {
      const x = await api<{ client_id: string; audit_id: string; items: number; questions: number }>('import', 'POST', data);
      toast('Imported: ' + x.items + ' research items and ' + x.questions + ' questions.', 5000);
      location.hash = '#/audit/' + encodeURIComponent(x.audit_id);
    } catch (x: any) { toast(x.message, 5000); }
  });
}

async function showClient(id: string) {
  const m = shell(loading());
  let r: { client: Client; audits: AuditRow[]; users: UserRow[] };
  try { r = await api('clients/' + encodeURIComponent(id)); } catch (e) { m.innerHTML = problem(e); return; }
  const c = r.client, num = (pid: string | null) => { const p = r.audits.find(a => a.id === pid); return p ? p.number : null; };
  const kind: Kind = c.kind === 'client' ? 'client' : 'lead';
  document.title = c.name + ' · Cayenne';
  setNav(kind);
  const audits = r.audits.length ? `<div class="pt-audits">${r.audits.slice().reverse().map(a => `<div class="pt-acard">
      <div class="pt-acard-h"><div class="pt-acard-t"><a href="#/audit/${encodeURIComponent(a.id)}"><b>Audit ${a.number}</b></a>${status(a)}${a.shared ? '<span class="pt-pill red">Shared with the client</span>' : ''}</div>
        <div class="pt-acts"><a class="pt-btn small" href="/api/portal/audits/${encodeURIComponent(a.id)}/pdf" download>PDF</a><a class="pt-btn small red" href="#/audit/${encodeURIComponent(a.id)}">Open audit</a></div></div>
      ${bar(a)}
      <div class="pt-astats">${stats(a)}</div>
      <div class="pt-note">${num(a.parent_id) ? `Carries on from Audit ${num(a.parent_id)}. ` : ''}Last change ${esc(when(a.updated_at))}.</div></div>`).join('')}</div>`
    : '<div class="pt-pad"><p>No audits yet.</p></div>';
  const users = r.users.map(u => `<div class="pt-item"><div class="h"><b>${esc(u.email)}</b><span class="pt-conf ${u.disabled ? 'low' : u.must_change ? 'medium' : 'high'}">${u.disabled ? 'Switched off' : u.must_change ? 'Not signed in yet' : 'Active'}</span></div>
      <div class="e">${u.name ? esc(u.name) + '. ' : ''}${u.last_login ? 'Last signed in ' + esc(when(u.last_login)) : 'Never signed in'}</div>
      <div class="pt-row pt-tools"><button class="pt-link" type="button" data-act="u-reset" data-u="${esc(u.id)}">New temporary password</button><button class="pt-link" type="button" data-act="${u.disabled ? 'u-on' : 'u-off'}" data-u="${esc(u.id)}">${u.disabled ? 'Switch on' : 'Switch off'}</button></div></div>`).join('');
  m.innerHTML = `<a class="pt-back" href="${kind === 'client' ? '#/clients/audits' : '#/leads'}">← ${kind === 'client' ? 'Clients' : 'Leads'}</a>
    <div class="pt-head"><div><h1>${esc(c.name)}</h1><p class="pt-sub">${c.kind === 'client' ? 'Client' : 'Lead'}${c.contact ? ' · ' + esc(c.contact) : ''}</p></div>
      <div class="pt-acts"><button class="pt-btn red" type="button" data-act="new-audit">New blank audit</button></div></div>
    <div class="pt-grid">
      <div class="pt-stack"><section class="pt-card"><div class="pt-pad pt-padb"><h2>Audits</h2><p class="pt-note">Finish an audit to lock it and save it as it stands. Then create the next one to fill in what is still needed.</p></div>${audits}</section></div>
      <div class="pt-stack">
        <section class="pt-card pt-pad"><h2>Client logins</h2>
          ${secret ? `<div class="pt-edit"><b>Temporary password for ${esc(secret.email)}</b><div class="pt-secret">${esc(secret.password)}</div><p class="pt-note">Shown once. Send it with the sign-in link: ${esc(portalLink())}</p><div class="pt-row"><button class="pt-btn small dark" type="button" data-act="copy-login">Copy sign-in details</button><button class="pt-link" type="button" data-act="hide-secret">Done</button></div></div>` : ''}
          ${users || '<p class="pt-note">No logins yet.</p>'}
          <form class="pt-form" id="ptAddUser" novalidate><label class="pt-f">Email<input class="pt-in" type="email" name="email" required></label><label class="pt-f">Name<input class="pt-in" type="text" name="name"></label>
            <p class="pt-err full" id="ptUserErr" role="alert" hidden></p><div class="full"><button class="pt-btn small dark" type="submit">Add a login</button></div></form>
          <p class="pt-note">The client signs in at ${esc(portalLink())} and only sees audits that are shared.</p></section>
        <section class="pt-card pt-pad"><h2>Details</h2>${clientForm(c)}</section>
      </div>
    </div>`;

  screenClick = async el => {
    const act = el.dataset.act;
    try {
      if (act === 'new-audit') { const x = await api<{ id: string }>('clients/' + encodeURIComponent(c.id) + '/audits', 'POST', {}); location.hash = '#/audit/' + encodeURIComponent(x.id); }
      if (act === 'u-reset') { if (!twoStep(el, 'Click again to make a new one')) return; const x = await api<{ email: string; password: string }>('clients/' + encodeURIComponent(c.id) + '/users', 'PATCH', { user_id: el.dataset.u, action: 'reset' }); secret = { email: x.email, password: x.password }; showClient(c.id); }
      if (act === 'u-off') { if (!twoStep(el, 'Click again to switch off')) return; await api('clients/' + encodeURIComponent(c.id) + '/users', 'PATCH', { user_id: el.dataset.u, action: 'disable' }); toast('Login switched off.'); showClient(c.id); }
      if (act === 'u-on') { await api('clients/' + encodeURIComponent(c.id) + '/users', 'PATCH', { user_id: el.dataset.u, action: 'enable' }); toast('Login switched on.'); showClient(c.id); }
      if (act === 'hide-secret') { secret = null; showClient(c.id); }
      if (act === 'copy-login' && secret) {
        const ok = await copyText('Cayenne client portal: ' + portalLink() + '\nEmail: ' + secret.email + '\nTemporary password: ' + secret.password + '\nYou will be asked to choose your own password when you first sign in.');
        toast(ok ? 'Sign-in details copied.' : 'Copying did not work. Select the password and copy it.');
      }
    } catch (x: any) { toast(x.message); }
  };
  const form = document.getElementById('ptClientForm') as HTMLFormElement;
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = readClientForm(form), err = document.getElementById('ptFormErr') as HTMLElement;
    if (!o.name) { err.textContent = 'Add a business name.'; err.hidden = false; return; }
    try { await api('clients/' + encodeURIComponent(c.id), 'PATCH', o); toast('Details saved.'); showClient(c.id); }
    catch (x: any) { err.textContent = x.message; err.hidden = false; }
  });
  const add = document.getElementById('ptAddUser') as HTMLFormElement;
  add.addEventListener('submit', async ev => {
    ev.preventDefault();
    const email = (add.elements.namedItem('email') as HTMLInputElement).value.trim(), name = (add.elements.namedItem('name') as HTMLInputElement).value.trim(), err = document.getElementById('ptUserErr') as HTMLElement;
    try { const x = await api<{ email: string; password: string }>('clients/' + encodeURIComponent(c.id) + '/users', 'POST', { email, name }); secret = { email: x.email, password: x.password }; showClient(c.id); }
    catch (x: any) { err.textContent = x.message; err.hidden = false; }
  });
}

/* ================= client: their audits ================= */
async function showMine() {
  document.title = 'Your audits · Cayenne';
  const m = shell(loading());
  let r: { client: { name: string } | null; audits: AuditRow[] };
  try { r = await api('my'); } catch (e) { m.innerHTML = problem(e); return; }
  m.innerHTML = `<div class="pt-head"><div><h1>Your <em>audits</em></h1><p class="pt-sub">${esc(r.client ? r.client.name : '')}</p></div></div>
    <section class="pt-card">${r.audits.length
      ? `<div class="pt-scroll"><table class="pt-table stack"><thead><tr><th>Audit</th><th>Status</th><th>Last change</th></tr></thead><tbody>${r.audits.map(a => `<tr class="click" data-href="#/audit/${encodeURIComponent(a.id)}">
          <td data-l="Audit"><a href="#/audit/${encodeURIComponent(a.id)}"><b>Audit ${a.number}</b></a></td>
          <td data-l="Status"><span class="pt-pill${a.status === 'complete' ? ' go' : ' red'}">${a.status === 'complete' ? 'Finished' : 'Ready to fill in'}</span></td>
          <td data-l="Last change">${esc(cap(when(a.updated_at)))}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="pt-pad"><p>Nothing to fill in yet. Cayenne will let you know when an audit is ready for you.</p></div>'}</section>`;
}

boot();
