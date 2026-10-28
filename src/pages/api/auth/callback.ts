// Google sends people back here. We swap the code for their name and email, then set a signed cookie for 30 days.
import type { APIRoute } from 'astro';
import { E, notReady, cookie, sign } from '../../../lib/server';
export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  if (!E.GOOGLE_CLIENT_ID || !E.GOOGLE_CLIENT_SECRET || !E.SESSION_SECRET) return notReady('signin');
  const [state, back] = (cookie(request, 'cy_state') || '').split('|');
  if (!state || state !== url.searchParams.get('state')) return Response.redirect(url.origin + '/signin?error=state', 302);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: E.GOOGLE_CLIENT_ID, client_secret: E.GOOGLE_CLIENT_SECRET, redirect_uri: url.origin + '/api/auth/callback', grant_type: 'authorization_code' }),
  });
  if (!r.ok) return Response.redirect(url.origin + '/signin?error=google', 302);
  const tok: any = await r.json();
  const info: any = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: 'Bearer ' + tok.access_token } })).json();
  if (!info.sub) return Response.redirect(url.origin + '/signin?error=google', 302);
  const days = 30, exp = Math.floor(Date.now() / 1000) + days * 86400;
  const session = await sign({ sub: info.sub, name: info.name || '', email: info.email || '', exp }, E.SESSION_SECRET);
  const headers = new Headers({ location: url.origin + decodeURIComponent(back || '/my-course') });
  headers.append('set-cookie', `cy_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`);
  headers.append('set-cookie', 'cy_state=; Path=/; Max-Age=0');
  return new Response(null, { status: 302, headers });
};
