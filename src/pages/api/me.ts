// Who is signed in, for the course pages.
import type { APIRoute } from 'astro';
import { E, json, currentUser } from '../../lib/server';
export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  if (!E.GOOGLE_CLIENT_ID || !E.SESSION_SECRET) return json({ signedIn: false, notReady: 'signin' });
  const u = await currentUser(request);
  return json(u ? { signedIn: true, name: u.name, email: u.email } : { signedIn: false });
};
