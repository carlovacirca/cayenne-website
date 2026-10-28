// Starts Google sign-in. Only the name and email are asked for.
import type { APIRoute } from 'astro';
import { E, notReady } from '../../../lib/server';
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  if (!E.GOOGLE_CLIENT_ID || !E.SESSION_SECRET) return notReady('signin');
  const state = crypto.randomUUID();
  const back = (url.searchParams.get('next') || '/my-course').replace(/[^\w\-/.#?=&]/g, '');
  const q = new URLSearchParams({
    client_id: E.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/api/auth/callback', response_type: 'code',
    scope: 'openid email profile', state, prompt: 'select_account',
  });
  return new Response(null, { status: 302, headers: {
    location: 'https://accounts.google.com/o/oauth2/v2/auth?' + q,
    'set-cookie': `cy_state=${state}|${encodeURIComponent(back.startsWith('/') ? back : '/my-course')}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  } });
};
