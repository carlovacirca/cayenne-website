// Client logins: add one (POST) or reset, switch off, switch on (PATCH). The temporary password is shown once.
import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/server';
import { guard, isRes, db, body, hashPassword, tempPassword, newId, nowIso } from '../../../../../lib/portal';
import { str } from '../../../../../portal/logic';
export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const b = await body<any>(request, 4000);
  const email = str(b?.email).toLowerCase().slice(0, 160), name = str(b?.name).slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Add a valid email.' }, 400);
  const d = await db();
  if (!(await d.prepare('SELECT id FROM portal_clients WHERE id = ?').bind(params.id).first())) return json({ error: 'Not found.' }, 404);
  if (await d.prepare('SELECT id FROM portal_users WHERE email = ?').bind(email).first()) return json({ error: 'That email already has a login.' }, 409);
  const pass = tempPassword(), h = await hashPassword(pass);
  await d.prepare('INSERT INTO portal_users (id, client_id, email, name, pass_hash, pass_salt, must_change, sv, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 0, ?)')
    .bind(newId('usr'), params.id, email, name, h.hash, h.salt, nowIso()).run();
  return json({ ok: true, email, password: pass });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const b = await body<any>(request, 4000);
  const d = await db();
  const u = await d.prepare('SELECT * FROM portal_users WHERE id = ? AND client_id = ?').bind(str(b?.user_id), params.id).first<any>();
  if (!u) return json({ error: 'Not found.' }, 404);
  if (b?.action === 'reset') {
    const pass = tempPassword(), h = await hashPassword(pass);
    await d.prepare('UPDATE portal_users SET pass_hash = ?, pass_salt = ?, must_change = 1, sv = sv + 1, disabled = 0 WHERE id = ?').bind(h.hash, h.salt, u.id).run();
    return json({ ok: true, email: u.email, password: pass });
  }
  if (b?.action === 'disable' || b?.action === 'enable') {
    await d.prepare('UPDATE portal_users SET disabled = ?, sv = sv + 1 WHERE id = ?').bind(b.action === 'disable' ? 1 : 0, u.id).run();
    return json({ ok: true });
  }
  return json({ error: 'bad request' }, 400);
};
