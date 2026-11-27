// The portal's Clients section reads the client automations (the rank-automation Worker) through a service binding.
// The Worker's key, RANK_PORTAL_TOKEN, is a Cloudflare secret: it is added here on the server and never reaches the browser.
// It has the Control centre's read rights (any read, plus adding and ticking to-dos) and nothing else: no live browser, no chat.
import { env } from 'cloudflare:workers';
import { json } from './server';

type REnv = { RANK?: Fetcher; RANK_PORTAL_TOKEN?: string };
const R = env as unknown as REnv;

export const BOARD_ID = /^[a-z0-9-]{1,30}$/;
export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const rankReady = () => !!(R.RANK && R.RANK_PORTAL_TOKEN);

/* Never a 401: the portal page treats 401 as "you are signed out". Each answer says what went wrong in plain words. */
const notConnected = () => json({ error: 'The Clients section is not connected yet.', rank: 'not_connected' }, 503);

async function call(method: string, path: string, body?: Record<string, unknown>): Promise<{ status: number; data: any } | Response> {
  if (!rankReady()) return notConnected();
  let r: Response;
  try {
    r = await R.RANK!.fetch(new Request('https://rank-automation' + path, {
      method,
      headers: { Authorization: 'Bearer ' + R.RANK_PORTAL_TOKEN, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    }));
  } catch {
    return json({ error: 'The client automations did not answer. Try again in a minute.', rank: 'down' }, 502);
  }
  let data: any = null;
  try { data = await r.json(); } catch { /* not JSON */ }
  if (r.status === 401 || r.status === 403) return json({ error: 'The automations refused the portal key. Check PORTAL_TOKEN on rank-automation matches RANK_PORTAL_TOKEN here.', rank: 'refused' }, 502);
  if (r.status === 404) return json({ error: (data && data.error) || 'Not found.', rank: 'missing' }, 404);
  if (r.status === 400) return json({ error: (data && typeof data.error === 'string' ? data.error : 'That was not accepted.').slice(0, 300) }, 400);
  if (!r.ok || data === null) return json({ error: 'The client automations had a problem. Try again.', rank: 'error' }, 502);
  return { status: r.status, data };
}
const out = async (p: ReturnType<typeof call>) => { const r = await p; return r instanceof Response ? r : json(r.data, r.status); };

/* ---------- reads ---------- */
export function board(client: string, doneLimit: number) {
  if (client !== 'all' && !BOARD_ID.test(client)) return json({ error: 'Pick a client.' }, 400);
  const n = Math.max(1, Math.min(200, Math.round(doneLimit) || 60));
  return out(call('GET', `/api/board?client=${encodeURIComponent(client)}&done_limit=${n}`));
}

/* Spend: only what the Spend screen shows. The Worker's summary also holds approvals, failures and links, which stay there. */
export async function spend(month: string) {
  if (!MONTH.test(month)) return json({ error: 'Pick a month.' }, 400);
  const r = await call('GET', `/api/dashboard?month=${month}`);
  if (r instanceof Response) return r;
  const d = r.data || {}, list = (v: unknown) => (Array.isArray(v) ? v : []), num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const s = d.spend || {};
  return json({
    month: typeof d.month === 'string' ? d.month : month,
    generated_at: typeof d.generated_at === 'string' ? d.generated_at : null,
    clients: list(d.clients).map((c: any) => ({ id: String(c?.id ?? ''), name: String(c?.name ?? c?.id ?? '') })),
    spend: {
      runs: num(s.runs), cost_usd: num(s.cost_usd), errors: num(s.errors),
      by_client: list(s.by_client).map((c: any) => ({ client_id: String(c?.client_id ?? ''), runs: num(c?.runs), cost_usd: num(c?.cost_usd), errors: num(c?.errors) })),
    },
    agents: list(d.agents).map((a: any) => ({ id: String(a?.id ?? ''), client_id: String(a?.client_id ?? ''), name: String(a?.name ?? ''), month_runs: num(a?.month_runs), month_cost_usd: num(a?.month_cost_usd) })),
  });
}

/* ---------- writes: only the fields the Control centre sends; the Worker checks them again ---------- */
const text = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);

export function addTodo(b: any) {
  if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
  const o: Record<string, unknown> = {};
  if (typeof b.client_id === 'string' && BOARD_ID.test(b.client_id)) o.client_id = b.client_id; else return json({ error: 'Pick a client.' }, 400);
  o.kind = b.kind === 'request' ? 'request' : 'task';
  o.title = text(b.title, 200) ?? '';
  const detail = text(b.detail, 20000); if (detail && detail.trim()) o.detail = detail;
  if (typeof b.due_date === 'string' && DAY.test(b.due_date)) o.due_date = b.due_date;
  if (b.who === 'claude' || b.who === 'claude_code') o.who = b.who;
  return out(call('POST', '/api/todos', o));
}

export function updateTodo(id: string, b: any) {
  if (!/^\d{1,9}$/.test(id)) return json({ error: 'Not found.' }, 404);
  if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
  const o: Record<string, unknown> = {};
  if (typeof b.status === 'string' && /^[a-z_]{1,20}$/.test(b.status)) o.status = b.status;
  if (b.due_date === null || (typeof b.due_date === 'string' && DAY.test(b.due_date))) o.due_date = b.due_date;
  for (const k of ['title', 'detail', 'done_note'] as const) { const v = text(b[k], k === 'title' ? 200 : 20000); if (v !== undefined) o[k] = v; }
  if (!Object.keys(o).length) return json({ error: 'Nothing to change.' }, 400);
  return out(call('PATCH', '/api/todos/' + id, o));
}
