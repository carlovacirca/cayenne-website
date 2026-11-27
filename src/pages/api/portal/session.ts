// Portal sign-in: who is signed in (GET), sign in (POST), sign out (DELETE).
import type { APIRoute } from 'astro';
import { json } from '../../../lib/server';
import { portalReady, notReadyPortal, who, login, endSession, body, sameSite, db } from '../../../lib/portal';
export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!portalReady()) return notReadyPortal();
  const w = await who(request);
  if (!w) return json({ signedIn: false });
  let mustChange = false, clientName = '';
  if (w.role === 'client') {
    const d = await db();
    const u = await d.prepare('SELECT must_change FROM portal_users WHERE id = ?').bind(w.uid).first<any>();
    const c = await d.prepare('SELECT name FROM portal_clients WHERE id = ?').bind(w.client_id).first<any>();
    mustChange = !!u?.must_change; clientName = c?.name || '';
  }
  return json({ signedIn: true, role: w.role, name: w.name, email: w.email, mustChange, clientName });
};

export const POST: APIRoute = async ({ request }) => {
  if (!portalReady()) return notReadyPortal();
  if (!sameSite(request)) return json({ error: 'bad request' }, 400);
  const b = await body<any>(request, 4000);
  const r = await login(request, b?.email, String(b?.password || ''));
  if (r.error) return json({ error: r.error }, r.status || 400);
  return json({ ok: true, role: r.who!.role, mustChange: !!r.mustChange }, 200, { 'set-cookie': r.cookie! });
};

export const DELETE: APIRoute = async () => json({ ok: true }, 200, { 'set-cookie': endSession() });
