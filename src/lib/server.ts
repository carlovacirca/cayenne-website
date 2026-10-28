// Small helpers shared by the API endpoints. Secrets come from the Cloudflare environment, never from the browser.
import { env } from 'cloudflare:workers';

export type Env = {
  ANTHROPIC_API_KEY?: string; GOOGLE_PLACES_KEY?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string; RESEND_API_KEY?: string; MAIL_FROM?: string; MAIL_TO?: string; DATA?: KVNamespace;
  INSIGHTS_APPROVER?: string; SITE_URL?: string;
};
export const E = env as unknown as Env;

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
/* 501 tells the page the feature is not switched on yet, so it quietly uses its built-in example instead */
export const notReady = (what: string) => json({ ok: false, notReady: what }, 501);

export function clip(v: unknown, n: number) { return String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }

/* signed values for the sign-in cookie (HMAC SHA-256) */
async function key(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export async function sign(payload: object, secret: string) {
  const body = b64u(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(body));
  return body + '.' + b64u(sig);
}
export async function unsign<T>(token: string | undefined, secret: string): Promise<T | null> {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const ok = await crypto.subtle.verify('HMAC', await key(secret), unb64u(sig), new TextEncoder().encode(body));
  if (!ok) return null;
  try { const v = JSON.parse(new TextDecoder().decode(unb64u(body))); return v.exp && v.exp < Date.now() / 1000 ? null : v; } catch { return null; }
}
export function cookie(req: Request, name: string) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}
export type User = { sub: string; name: string; email: string; exp: number };
export async function currentUser(req: Request): Promise<User | null> {
  if (!E.SESSION_SECRET) return null;
  return unsign<User>(cookie(req, 'cy_session'), E.SESSION_SECRET);
}

/* email through Resend. Without a key the message is kept in KV (if there is one) so nothing is lost */
export async function sendMail(subject: string, text: string, replyTo?: string) {
  if (!E.RESEND_API_KEY || !E.MAIL_TO) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: 'Bearer ' + E.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: E.MAIL_FROM || 'Cayenne <hello@example.com>', to: E.MAIL_TO.split(','), subject, text, reply_to: replyTo || undefined }),
  });
  return r.ok;
}
export async function keep(prefix: string, value: unknown) {
  if (!E.DATA) return false;
  await E.DATA.put(prefix + ':' + new Date().toISOString() + ':' + crypto.randomUUID().slice(0, 8), JSON.stringify(value), { expirationTtl: 60 * 60 * 24 * 365 });
  return true;
}

/* a very small rate limit per visitor, kept in KV when there is one */
export async function limited(req: Request, bucket: string, max: number, seconds: number) {
  if (!E.DATA) return false;
  const ip = req.headers.get('cf-connecting-ip') || 'anon';
  const k = 'rl:' + bucket + ':' + ip;
  const n = Number((await E.DATA.get(k)) || 0);
  if (n >= max) return true;
  await E.DATA.put(k, String(n + 1), { expirationTtl: seconds });
  return false;
}
