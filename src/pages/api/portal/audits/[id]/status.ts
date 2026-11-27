// Finish (lock), reopen, share with the client or stop sharing. Developer only.
import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/server';
import { guard, isRes, db, getAudit, body, nowIso } from '../../../../../lib/portal';
export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const a = await getAudit(String(params.id)); if (!a) return json({ error: 'Not found.' }, 404);
  const b = await body<any>(request, 2000), d = await db(), t = nowIso();
  const q = {
    complete: ['UPDATE portal_audits SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?', 'complete', t, t, a.id],
    reopen: ['UPDATE portal_audits SET status = ?, completed_at = NULL, updated_at = ? WHERE id = ?', 'draft', t, a.id],
    share: ['UPDATE portal_audits SET shared = 1, updated_at = ? WHERE id = ?', t, a.id],
    unshare: ['UPDATE portal_audits SET shared = 0, updated_at = ? WHERE id = ?', t, a.id],
  }[String(b?.action)] as any[] | undefined;
  if (!q) return json({ error: 'bad request' }, 400);
  await d.prepare(q[0]).bind(...q.slice(1)).run();
  return json({ ok: true });
};
