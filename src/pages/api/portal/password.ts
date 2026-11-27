// A client changes their own password (the first sign-in uses a temporary one).
import type { APIRoute } from 'astro';
import { json } from '../../../lib/server';
import { guard, isRes, body, db, checkPassword, hashPassword, strongEnough, startSession } from '../../../lib/portal';
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const w = await guard(request); if (isRes(w)) return w;
  if (w.role !== 'client') return json({ error: 'The developer password is set in Cloudflare settings.' }, 400);
  const b = await body<any>(request, 4000);
  if (!strongEnough(b?.next)) return json({ error: 'Use at least 10 characters.' }, 400);
  const d = await db();
  const u = await d.prepare('SELECT * FROM portal_users WHERE id = ?').bind(w.uid).first<any>();
  if (!u || !(await checkPassword(String(b?.current || ''), u.pass_hash, u.pass_salt))) return json({ error: 'The current password is not right.' }, 401);
  const h = await hashPassword(String(b.next)), sv = Number(u.sv) + 1;
  await d.prepare('UPDATE portal_users SET pass_hash = ?, pass_salt = ?, must_change = 0, sv = ? WHERE id = ?').bind(h.hash, h.salt, sv, u.id).run();
  const cookie = await startSession({ role: 'client', email: u.email, name: u.name || '', uid: u.id, client_id: u.client_id, sv: String(sv) });
  return json({ ok: true }, 200, { 'set-cookie': cookie });
};
