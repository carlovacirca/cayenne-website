// Saved course progress: the business, goals, level and which lessons are done. Kept in KV under the Google account id.
import type { APIRoute } from 'astro';
import { E, json, currentUser, clip } from '../../lib/server';
export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const u = await currentUser(request);
  if (!u) return json({ error: 'sign in' }, 401);
  const v = E.DATA ? await E.DATA.get('progress:' + u.sub) : null;
  return json(v ? JSON.parse(v) : {});
};
export const POST: APIRoute = async ({ request }) => {
  const u = await currentUser(request);
  if (!u) return json({ error: 'sign in' }, 401);
  if (!E.DATA) return json({ ok: false, notReady: 'storage' }, 501);
  let b: any; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const keepIt = {
    business: b.business && typeof b.business === 'object' ? { name: clip(b.business.name, 80), cat: clip(b.business.cat, 60), town: clip(b.business.town, 60) } : undefined,
    goals: Array.isArray(b.goals) ? b.goals.slice(0, 12).map((g: unknown) => clip(g, 80)) : undefined,
    level: Number.isFinite(b.level) ? Math.max(0, Math.min(5, b.level)) : undefined,
    done: Array.isArray(b.done) ? b.done.slice(0, 64).map((d: unknown) => clip(d, 20)) : undefined,
    updated: new Date().toISOString(),
  };
  const prev = JSON.parse((await E.DATA.get('progress:' + u.sub)) || '{}');
  await E.DATA.put('progress:' + u.sub, JSON.stringify({ ...prev, ...Object.fromEntries(Object.entries(keepIt).filter(([, v]) => v !== undefined)) }));
  return json({ ok: true });
};
