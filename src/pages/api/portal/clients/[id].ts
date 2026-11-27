// One client or lead: details, audits and client logins (GET), update details (PATCH). Developer only.
import type { APIRoute } from 'astro';
import { json } from '../../../../lib/server';
import { guard, isRes, db, body, cleanClient, nowIso, meta, parseDoc, progress, type AuditRow } from '../../../../lib/portal';
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const d = await db();
  const c = await d.prepare('SELECT * FROM portal_clients WHERE id = ?').bind(params.id).first<any>();
  if (!c) return json({ error: 'Not found.' }, 404);
  const a = await d.prepare('SELECT * FROM portal_audits WHERE client_id = ? ORDER BY number').bind(c.id).all<AuditRow>();
  const audits = (a.results || []).map(x => ({ ...meta(x), ...progress(parseDoc(x)) }));
  const u = await d.prepare('SELECT id, email, name, must_change, disabled, created_at, last_login FROM portal_users WHERE client_id = ? ORDER BY created_at').bind(c.id).all<any>();
  return json({ client: c, audits, users: u.results || [] });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const c = cleanClient(await body(request, 8000));
  if (!c.name) return json({ error: 'Add a business name.' }, 400);
  const r = await (await db()).prepare('UPDATE portal_clients SET name = ?, kind = ?, contact = ?, email = ?, phone = ?, website = ?, location = ?, updated_at = ? WHERE id = ?')
    .bind(c.name, c.kind, c.contact, c.email, c.phone, c.website, c.location, nowIso(), params.id).run();
  return r.meta.changes ? json({ ok: true }) : json({ error: 'Not found.' }, 404);
};
