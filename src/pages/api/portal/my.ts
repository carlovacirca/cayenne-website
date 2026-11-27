// What a signed-in client can open: their business and the audits shared with them.
import type { APIRoute } from 'astro';
import { json } from '../../../lib/server';
import { guard, isRes, db } from '../../../lib/portal';
export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const w = await guard(request); if (isRes(w)) return w;
  if (w.role !== 'client') return json({ error: 'Clients only.' }, 400);
  const d = await db();
  const c = await d.prepare('SELECT id, name FROM portal_clients WHERE id = ?').bind(w.client_id).first<any>();
  const a = await d.prepare('SELECT id, number, status, updated_at FROM portal_audits WHERE client_id = ? AND shared = 1 ORDER BY number DESC').bind(w.client_id).all<any>();
  return json({ client: c, audits: a.results || [] });
};
