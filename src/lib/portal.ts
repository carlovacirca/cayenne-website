// The client portal: developer and client logins, clients and leads, audits. Data lives in D1 (PORTAL_DB).
// Secrets (SESSION_SECRET, PORTAL_DEV_EMAIL, PORTAL_DEV_PASSWORD, ANTHROPIC_API_KEY) come from Cloudflare settings only.
import { env } from 'cloudflare:workers';
import { json, sign, unsign, cookie, limited } from './server';
import type { AuditDoc, Research, Task, Template } from '../portal/logic';
import { cleanResearch, validTemplate, numberQuestions, qKey, rKey, str } from '../portal/logic';

export type PEnv = {
  PORTAL_DB?: D1Database; SESSION_SECRET?: string; PORTAL_DEV_EMAIL?: string; PORTAL_DEV_PASSWORD?: string;
  ANTHROPIC_API_KEY?: string; DATA?: KVNamespace;
};
export const P = env as unknown as PEnv;
export type Who = { role: 'dev' | 'client'; email: string; name: string; uid: string; client_id?: string; sv: string; exp: number };

const COOKIE = 'cy_portal';
// portal cookies use their own signing key, so a course sign-in cookie can never pass as a portal one
const key = () => P.SESSION_SECRET + '|cayenne-portal';
const DAYS = 14;
export const nowIso = () => new Date().toISOString();
export const newId = (p: string) => p + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

/* ---------- not switched on yet ---------- */
export function portalReady() { return !!(P.PORTAL_DB && P.SESSION_SECRET && P.PORTAL_DEV_EMAIL && P.PORTAL_DEV_PASSWORD); }
export const notReadyPortal = () => json({ ok: false, notReady: 'portal' }, 501);

/* ---------- tables, created on first use ---------- */
let schemaOk = false;
export async function db(): Promise<D1Database> {
  const d = P.PORTAL_DB!;
  if (!schemaOk) {
    await d.batch([
      d.prepare(`CREATE TABLE IF NOT EXISTS portal_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'lead', contact TEXT, email TEXT, phone TEXT, website TEXT, location TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
      d.prepare(`CREATE TABLE IF NOT EXISTS portal_users (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, email TEXT NOT NULL UNIQUE, name TEXT, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1, sv INTEGER NOT NULL DEFAULT 1, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT)`),
      d.prepare(`CREATE TABLE IF NOT EXISTS portal_audits (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, number INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft', shared INTEGER NOT NULL DEFAULT 0, parent_id TEXT, rev INTEGER NOT NULL DEFAULT 1, doc TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, updated_by TEXT)`),
      d.prepare(`CREATE INDEX IF NOT EXISTS portal_audits_client ON portal_audits (client_id, number)`),
      d.prepare(`CREATE INDEX IF NOT EXISTS portal_users_client ON portal_users (client_id)`),
    ]);
    schemaOk = true;
  }
  return d;
}

/* ---------- passwords ---------- */
const enc = (s: string) => new TextEncoder().encode(s);
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pbkdf2(pass: string, salt: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', enc(pass), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256));
}
export async function hashPassword(pass: string) { const salt = crypto.getRandomValues(new Uint8Array(16)); return { hash: await pbkdf2(pass, salt), salt: b64(salt) }; }
async function sha(s: string) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc(s))); }
function same(a: Uint8Array, b: Uint8Array) {
  const subtle: any = crypto.subtle;
  if (subtle.timingSafeEqual && a.byteLength === b.byteLength) return subtle.timingSafeEqual(a, b) as boolean;
  if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i]; return x === 0;
}
export async function checkPassword(pass: string, hash: string, salt: string) { return same(await sha(await pbkdf2(pass, unb64(salt))), await sha(hash)); }
export function tempPassword() {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(r, x => A[x % A.length]).join('');
}
export function strongEnough(p: string) { return typeof p === 'string' && p.length >= 10 && p.length <= 200; }
async function devStamp() { return b64(await sha('dev:' + (P.PORTAL_DEV_PASSWORD || ''))).slice(0, 12); }

/* ---------- sessions: a signed cookie, checked against the database on every request ---------- */
export async function startSession(w: Omit<Who, 'exp'>) {
  const exp = Math.floor(Date.now() / 1000) + DAYS * 86400;
  const token = await sign({ ...w, exp }, key());
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}
export const endSession = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export async function who(req: Request): Promise<Who | null> {
  if (!portalReady()) return null;
  const w = await unsign<Who>(cookie(req, COOKIE), key());
  if (!w || (w.role !== 'dev' && w.role !== 'client') || !w.uid) return null;
  if (w.role === 'dev') return w.email === str(P.PORTAL_DEV_EMAIL).toLowerCase() && w.sv === await devStamp() ? w : null;
  const u = await (await db()).prepare('SELECT id, client_id, email, name, sv, disabled FROM portal_users WHERE id = ?').bind(w.uid).first<any>();
  if (!u || u.disabled || String(u.sv) !== w.sv) return null;
  return { ...w, client_id: u.client_id, name: u.name || w.name };
}

/* ---------- login ---------- */
export async function login(req: Request, email: string, pass: string): Promise<{ cookie?: string; who?: Omit<Who, 'exp'>; mustChange?: boolean; error?: string; status?: number }> {
  if (await limited(req, 'portal-login', 10, 900)) return { error: 'Too many tries. Wait 15 minutes, then try again.', status: 429 };
  email = str(email).toLowerCase().slice(0, 200);
  if (!email || !pass) return { error: 'Enter your email and password.', status: 400 };
  if (email === str(P.PORTAL_DEV_EMAIL).toLowerCase()) {
    if (!same(await sha(pass), await sha(P.PORTAL_DEV_PASSWORD!))) return { error: 'That email and password do not match.', status: 401 };
    const w = { role: 'dev' as const, email, name: 'Developer', uid: 'dev', sv: await devStamp() };
    return { cookie: await startSession(w), who: w };
  }
  const d = await db();
  const u = await d.prepare('SELECT * FROM portal_users WHERE email = ?').bind(email).first<any>();
  if (!u) await hashPassword(pass); // same work either way, so the reply time does not reveal which emails have a login
  if (!u || u.disabled || !(await checkPassword(pass, u.pass_hash, u.pass_salt))) return { error: 'That email and password do not match.', status: 401 };
  await d.prepare('UPDATE portal_users SET last_login = ? WHERE id = ?').bind(nowIso(), u.id).run();
  const w = { role: 'client' as const, email, name: u.name || '', uid: u.id, client_id: u.client_id, sv: String(u.sv) };
  return { cookie: await startSession(w), who: w, mustChange: !!u.must_change };
}

/* ---------- guards: a custom header on every change stops other sites posting with the cookie ---------- */
export function sameSite(req: Request) { return req.method === 'GET' || req.headers.get('x-cayenne-portal') === '1'; }
export async function guard(req: Request, role?: 'dev'): Promise<Who | Response> {
  if (!portalReady()) return notReadyPortal();
  if (!sameSite(req)) return json({ error: 'bad request' }, 400);
  const w = await who(req);
  if (!w) return json({ error: 'Signed out. Sign in again.' }, 401);
  if (role === 'dev' && w.role !== 'dev') return json({ error: 'Not allowed.' }, 403);
  return w;
}
export const isRes = (x: unknown): x is Response => x instanceof Response;

/* ---------- audits ---------- */
export type AuditRow = { id: string; client_id: string; number: number; status: string; shared: number; parent_id: string | null; rev: number; doc: string; created_at: string; updated_at: string; completed_at: string | null; updated_by: string | null };
export async function getAudit(id: string): Promise<AuditRow | null> {
  return (await db()).prepare('SELECT * FROM portal_audits WHERE id = ?').bind(id).first<AuditRow>();
}
export function canSee(w: Who, a: AuditRow) { return w.role === 'dev' || (w.client_id === a.client_id && !!a.shared); }
export function parseDoc(a: AuditRow): AuditDoc { const d = JSON.parse(a.doc) as AuditDoc; numberQuestions(d.template); return d; }
export function meta(a: AuditRow) {
  return { id: a.id, client_id: a.client_id, number: a.number, status: a.status, shared: !!a.shared, parent_id: a.parent_id, rev: a.rev, created_at: a.created_at, updated_at: a.updated_at, completed_at: a.completed_at };
}
/* what a client is shown: no research labels, no competitors, no analysis or options */
export function clientView(d: AuditDoc): AuditDoc {
  const template = { ...d.template, stages: d.template.stages.map(s => ({ ...s, qs: s.qs.map(({ tip, ...q }) => q) })) };
  return { ...d, template, research: { groups: d.research.groups, items: d.research.items.map(f => ({ ...f, k: 'info' as const })), competitors: [] }, analysis: null, choices: {}, business: { name: d.business.name || '' } };
}

export async function createAudit(clientId: string, doc: AuditDoc, opts: { shared?: boolean; parent?: string | null; by: string }) {
  const d = await db();
  const row = await d.prepare('SELECT COALESCE(MAX(number), 0) AS n FROM portal_audits WHERE client_id = ?').bind(clientId).first<any>();
  const id = newId('aud'), t = nowIso();
  await d.prepare('INSERT INTO portal_audits (id, client_id, number, status, shared, parent_id, rev, doc, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)')
    .bind(id, clientId, Number(row?.n || 0) + 1, 'draft', opts.shared ? 1 : 0, opts.parent || null, JSON.stringify(doc), t, t, opts.by).run();
  return id;
}

/* ---------- saving: small patches merged into the stored document, retried if two people save at once ---------- */
export type Patch = {
  answers?: Record<string, unknown>; verdict?: Record<string, string | null>; ctx?: Record<string, string | null>; unsure?: Record<string, boolean | null>;
  tasks?: Task[]; choices?: Record<string, number>; business?: Record<string, string>; research?: Research; template?: Template;
};
function cleanValue(v: unknown): unknown {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (Array.isArray(v)) return v.slice(0, 40).map(x => str(x).slice(0, 200)).filter(Boolean);
  return str(v).slice(0, 4000);
}
export function applyPatch(doc: AuditDoc, p: Patch, role: 'dev' | 'client') {
  const fieldKeys = new Set<string>(), qKeys = new Set<string>(), rKeys = new Set<string>(), rIds = new Set<string>();
  doc.template.stages.forEach(s => s.qs.forEach(q => { qKeys.add(qKey(q.id)); q.f.forEach(f => fieldKeys.add(f.k)); }));
  doc.research.items.forEach(f => { rKeys.add(rKey(f.id)); rIds.add(f.id); });
  if (role === 'dev') {
    if (p.template && validTemplate(p.template)) { doc.template = numberQuestions(p.template); doc.template.stages.forEach(s => s.qs.forEach(q => { qKeys.add(qKey(q.id)); q.f.forEach(f => fieldKeys.add(f.k)); })); }
    if (p.research) {
      doc.research = cleanResearch(p.research); rKeys.clear(); rIds.clear(); doc.research.items.forEach(f => { rKeys.add(rKey(f.id)); rIds.add(f.id); });
      // a deleted item takes its check, extra context and not-sure mark with it
      Object.keys(doc.verdict).forEach(k => { if (!rIds.has(k)) delete doc.verdict[k]; });
      Object.keys(doc.ctx).forEach(k => { if (k.startsWith('r:') && !rKeys.has(k)) delete doc.ctx[k]; });
      Object.keys(doc.unsure).forEach(k => { if (k.startsWith('r:') && !rKeys.has(k)) delete doc.unsure[k]; });
    }
    if (p.business) Object.entries(p.business).slice(0, 20).forEach(([k, v]) => { if (/^[a-z_]{1,30}$/.test(k)) doc.business[k] = str(v).slice(0, 4000); });
    if (p.choices) Object.entries(p.choices).slice(0, 40).forEach(([k, v]) => { if (/^[a-z_]{1,30}$/.test(k)) doc.choices[k] = Math.max(0, Math.min(5, Number(v) || 0)); });
  }
  if (p.answers) Object.entries(p.answers).forEach(([k, v]) => { if (!fieldKeys.has(k)) return; const c = cleanValue(v); if (c == null || (Array.isArray(c) && !c.length)) delete doc.answers[k]; else doc.answers[k] = c; });
  if (p.verdict) Object.entries(p.verdict).forEach(([k, v]) => { if (!rIds.has(k)) return; if (v === 'True' || v === 'Not true') doc.verdict[k] = v; else delete doc.verdict[k]; });
  if (p.ctx) Object.entries(p.ctx).forEach(([k, v]) => { if (!qKeys.has(k) && !rKeys.has(k)) return; const c = str(v).slice(0, 4000); if (c) doc.ctx[k] = c; else delete doc.ctx[k]; });
  if (p.unsure) Object.entries(p.unsure).forEach(([k, v]) => { if (!qKeys.has(k) && !rKeys.has(k)) return; if (v) doc.unsure[k] = true; else delete doc.unsure[k]; });
  if (p.tasks && Array.isArray(p.tasks)) doc.tasks = p.tasks.slice(0, 30).map(t => ({ task: str(t?.task).slice(0, 200), min: str(t?.min).slice(0, 12), per: str(t?.per).slice(0, 12) }));
  return doc;
}
export async function patchAudit(id: string, p: Patch, w: Who): Promise<{ row?: AuditRow; error?: string; status?: number }> {
  const d = await db();
  for (let i = 0; i < 5; i++) {
    const a = await getAudit(id);
    if (!a || !canSee(w, a)) return { error: 'Not found.', status: 404 };
    if (a.status !== 'draft') return { error: 'This audit is finished and locked.', status: 409 };
    const doc = applyPatch(parseDoc(a), p, w.role);
    const t = nowIso();
    const r = await d.prepare('UPDATE portal_audits SET doc = ?, rev = rev + 1, updated_at = ?, updated_by = ? WHERE id = ? AND rev = ?').bind(JSON.stringify(doc), t, w.email, id, a.rev).run();
    if (r.meta.changes) return { row: { ...a, doc: JSON.stringify(doc), rev: a.rev + 1, updated_at: t } };
  }
  return { error: 'Busy saving. Try again.', status: 409 };
}
export async function setAnalysis(id: string, analysis: AuditDoc['analysis']) {
  const d = await db();
  for (let i = 0; i < 5; i++) {
    const a = await getAudit(id); if (!a) return false;
    const doc = parseDoc(a); doc.analysis = analysis;
    const r = await d.prepare('UPDATE portal_audits SET doc = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?').bind(JSON.stringify(doc), nowIso(), id, a.rev).run();
    if (r.meta.changes) return true;
  }
  return false;
}

/* ---------- reading a request body safely ---------- */
export async function body<T = any>(req: Request, max = 900_000): Promise<T | null> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) return null;
  try { const t = await req.text(); if (t.length > max) return null; return JSON.parse(t) as T; } catch { return null; }
}
export function cleanClient(b: any) {
  return {
    name: str(b?.name).slice(0, 120), kind: b?.kind === 'client' ? 'client' : 'lead', contact: str(b?.contact).slice(0, 160), email: str(b?.email).slice(0, 160),
    phone: str(b?.phone).slice(0, 60), website: str(b?.website).slice(0, 300), location: str(b?.location).slice(0, 200),
  };
}
