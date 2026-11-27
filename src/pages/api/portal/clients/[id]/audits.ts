// A new audit for a client or lead, from the standard question bank. Developer only.
import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/server';
import { guard, isRes, db, createAudit } from '../../../../../lib/portal';
import { blankDoc } from '../../../../../portal/logic';
import { DEFAULT_TEMPLATE, DEFAULT_GROUPS } from '../../../../../portal/template';
export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const c = await (await db()).prepare('SELECT * FROM portal_clients WHERE id = ?').bind(params.id).first<any>();
  if (!c) return json({ error: 'Not found.' }, 404);
  const doc = blankDoc(DEFAULT_TEMPLATE, { groups: DEFAULT_GROUPS }, { name: c.name || '', contact: c.contact || '', location: c.location || '', website: c.website || '' });
  const id = await createAudit(c.id, doc, { by: w.email });
  return json({ ok: true, id });
};
