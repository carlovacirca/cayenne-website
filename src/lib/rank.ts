// The portal's Clients section reads the client automations (the rank-automation Worker) through a service binding.
// The Worker's key, RANK_PORTAL_TOKEN, is a Cloudflare secret: it is added here on the server and never reaches the browser.
// The portal only reads: the board (automations only, the developer's own to-dos left out, as in Lucid) and spend.
// Client logos, colours and which parts each client has are a private setting kept in KV (rank/style), never in this code.
import { env } from 'cloudflare:workers';
import { json } from './server';

type REnv = { RANK?: Fetcher; RANK_PORTAL_TOKEN?: string; DATA?: KVNamespace };
const R = env as unknown as REnv;

export const BOARD_ID = /^[a-z0-9-]{1,30}$/;
export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const rankReady = () => !!(R.RANK && R.RANK_PORTAL_TOKEN);

/* Never a 401: the portal page treats 401 as "you are signed out". Each answer says what went wrong in plain words. */
const notConnected = () => json({ error: 'The Clients section is not connected yet.', rank: 'not_connected' }, 503);

async function call(path: string): Promise<{ status: number; data: any } | Response> {
  if (!rankReady()) return notConnected();
  let r: Response;
  try {
    r = await R.RANK!.fetch(new Request('https://rank-automation' + path, {
      headers: { Authorization: 'Bearer ' + R.RANK_PORTAL_TOKEN, Accept: 'application/json' },
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

const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, n = 400) => (typeof v === 'string' ? v.slice(0, n) : null);
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);

/* ---------- the board: the automations only ---------- */
/* Lucid's Rank SEO page leaves the developer's own to-dos out (kinds task and request, and the Later list). So does this,
   before anything reaches the browser. Each item keeps only what the client windows show. */
const MINE = new Set(['task', 'request']);
function item(v: any) {
  const link = v && v.link && typeof v.link.url === 'string' && /^https?:\/\//.test(v.link.url) ? { label: str(v.link.label, 60) || 'Open', url: v.link.url.slice(0, 600) } : null;
  return { key: str(v.key, 120), client_id: str(v.client_id, 30), kind: str(v.kind, 30), agent: str(v.agent, 120), title: str(v.title, 300), due: str(v.due, 30), at: str(v.at, 30), status: str(v.status, 30), link };
}
const automations = (v: unknown) => list(v).filter(i => i && typeof i.title === 'string' && !MINE.has(i.kind)).map(item);

export async function board() {
  const r = await call('/api/board?client=all&done_limit=60');
  if (r instanceof Response) return r;
  const d = r.data || {};
  return json({
    generated_at: str(d.generated_at, 30),
    clients: list(d.clients).filter(c => c && BOARD_ID.test(String(c.id))).map(c => ({ id: String(c.id), name: str(c.name, 80) || String(c.id), internal: c.internal === true })),
    you: automations(d.you), agents: automations(d.agents), done: automations(d.done),
  });
}

/* Spend: only what the Spend screen shows. The Worker's summary also holds approvals, failures and links, which stay there. */
export async function spend(month: string) {
  if (!MONTH.test(month)) return json({ error: 'Pick a month.' }, 400);
  const r = await call(`/api/dashboard?month=${month}`);
  if (r instanceof Response) return r;
  const d = r.data || {}, s = d.spend || {};
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

/* ---------- the client windows' look: a private setting in KV ---------- */
/* { clients: [{ id, name, domain, head, accent, sections: ['hub'|'web'|'gbp'], wide, logo: data URL }] }, in page order.
   Not set: the windows use the names from the automations and the portal's own colours. */
const STYLE_KEY = 'portal:rank-style';
const HEX = /^#[0-9a-fA-F]{6}$/;
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const PARTS = ['hub', 'web', 'gbp'];

export async function style() {
  if (!R.DATA) return json({ clients: [] });
  return json(((await R.DATA.get(STYLE_KEY, 'json')) as unknown) || { clients: [] });
}

export async function saveStyle(b: any) {
  if (!R.DATA) return json({ error: 'The DATA store is not bound.' }, 503);
  const raw = b && Array.isArray(b.clients) ? b.clients : null;
  if (!raw || !raw.length || raw.length > 12) return json({ error: 'Send between 1 and 12 clients.' }, 400);
  const clients = [];
  for (const c of raw) {
    if (!c || !BOARD_ID.test(String(c.id))) return json({ error: 'Each client needs its id from the automations.' }, 400);
    const sections = list(c.sections).filter((s, i, a) => PARTS.includes(s) && a.indexOf(s) === i);
    const logo = typeof c.logo === 'string' && c.logo.length <= 120_000 && LOGO.test(c.logo) ? c.logo : null;
    if (c.logo && !logo) return json({ error: `The logo for ${c.id} is not a small image.` }, 400);
    clients.push({
      id: String(c.id), name: str(c.name, 80), domain: str(c.domain, 120),
      head: HEX.test(c.head) ? c.head : null, accent: HEX.test(c.accent) ? c.accent : null,
      sections: sections.length ? sections : null, wide: c.wide === true, logo,
    });
  }
  if (new Set(clients.map(c => c.id)).size !== clients.length) return json({ error: 'A client is listed twice.' }, 400);
  await R.DATA.put(STYLE_KEY, JSON.stringify({ clients }));
  return json({ ok: true, clients: clients.length });
}
