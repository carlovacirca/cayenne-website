// One audit: read it (GET) and save changes (PATCH). Clients only reach audits shared with them.
import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/server';
import { guard, isRes, db, getAudit, canSee, parseDoc, meta, clientView, patchAudit, body } from '../../../../../lib/portal';
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const w = await guard(request); if (isRes(w)) return w;
  const a = await getAudit(String(params.id));
  if (!a || !canSee(w, a)) return json({ error: 'Not found.' }, 404);
  const c = await (await db()).prepare('SELECT id, name FROM portal_clients WHERE id = ?').bind(a.client_id).first<any>();
  const doc = parseDoc(a);
  return json({ meta: meta(a), client: c, doc: w.role === 'dev' ? doc : clientView(doc) });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const w = await guard(request); if (isRes(w)) return w;
  const p = await body<any>(request);
  if (!p || typeof p !== 'object') return json({ error: 'bad request' }, 400);
  const r = await patchAudit(String(params.id), p, w);
  if (r.error) return json({ error: r.error }, r.status || 400);
  return json({ ok: true, rev: r.row!.rev, updated_at: r.row!.updated_at });
};
