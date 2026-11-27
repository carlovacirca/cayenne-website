// Clients and leads: the list (GET) and a new one (POST). Developer only.
import type { APIRoute } from 'astro';
import { json } from '../../../../lib/server';
import { guard, isRes, db, body, cleanClient, newId, nowIso } from '../../../../lib/portal';
export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const r = await (await db()).prepare(`SELECT c.*, (SELECT COUNT(*) FROM portal_audits a WHERE a.client_id = c.id) AS audits,
    (SELECT MAX(a.updated_at) FROM portal_audits a WHERE a.client_id = c.id) AS last_audit FROM portal_clients c ORDER BY COALESCE(last_audit, c.updated_at) DESC`).all<any>();
  return json({ clients: r.results || [] });
};

export const POST: APIRoute = async ({ request }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const c = cleanClient(await body(request, 8000));
  if (!c.name) return json({ error: 'Add a business name.' }, 400);
  const id = newId('cli'), t = nowIso();
  await (await db()).prepare('INSERT INTO portal_clients (id, name, kind, contact, email, phone, website, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, c.name, c.kind, c.contact, c.email, c.phone, c.website, c.location, t, t).run();
  return json({ ok: true, id });
};
