// The next audit from a finished one: answers carried over and editable, unknowns left empty, "not sure" kept so it shows a "?".
import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/server';
import { guard, isRes, db, getAudit, parseDoc, createAudit } from '../../../../../lib/portal';
import { nextDoc } from '../../../../../portal/logic';
export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const a = await getAudit(String(params.id)); if (!a) return json({ error: 'Not found.' }, 404);
  if (a.status !== 'complete') return json({ error: 'Finish this audit first, so it is saved as it stands.' }, 409);
  const have = await (await db()).prepare('SELECT id FROM portal_audits WHERE parent_id = ?').bind(a.id).first<any>();
  if (have) return json({ ok: true, id: have.id, existed: true });
  const id = await createAudit(a.client_id, nextDoc(parseDoc(a)), { shared: true, parent: a.id, by: w.email });
  return json({ ok: true, id });
};
