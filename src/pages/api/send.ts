// One endpoint for every form: contact, audit, waitlist, partner application and the weekly tip sign-up.
import type { APIRoute } from 'astro';
import { json, clip, sendMail, keep, limited } from '../../lib/server';
export const prerender = false;

const KINDS: Record<string, string> = { contact: 'New message', audit: 'Free AI audit call booked', waitlist: 'Build on Cayenne waitlist', partner: 'Partner application', tips: 'Weekly tip sign-up' };

export const POST: APIRoute = async ({ request }) => {
  if (await limited(request, 'send', 12, 3600)) return json({ ok: false, error: 'Too many messages, try again later' }, 429);
  let b: any; try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const kind = clip(b.kind, 20);
  if (!KINDS[kind]) return json({ ok: false }, 400);
  if (clip(b.website, 50)) return json({ ok: true }); // spam trap
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.fields || {}).slice(0, 20)) fields[clip(k, 40)] = Array.isArray(v) ? v.map(x => clip(x, 80)).join(', ') : clip(v, 2000);
  const ek = Object.keys(fields).find(k => /email/i.test(k)), bk = Object.keys(fields).find(k => /business|practice|biz/i.test(k));
  const email = ek ? fields[ek] : '';
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'Check your email address' }, 400);
  const text = Object.entries(fields).map(([k, v]) => k + ': ' + v).join('\n');
  const sent = await sendMail(KINDS[kind] + (bk && fields[bk] ? ' · ' + fields[bk] : ''), text, email || undefined).catch(() => false);
  const kept = await keep('form:' + kind, { fields, at: new Date().toISOString() }).catch(() => false);
  return json({ ok: true, delivered: sent || kept });
};
