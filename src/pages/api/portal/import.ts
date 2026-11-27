// Import a prepared lead: client details plus research (with source links) and, if given, its own question bank. Developer only.
import type { APIRoute } from 'astro';
import { json } from '../../../lib/server';
import { guard, isRes, db, body, cleanClient, newId, nowIso, createAudit } from '../../../lib/portal';
import { blankDoc, cleanResearch, validTemplate, str } from '../../../portal/logic';
import { DEFAULT_TEMPLATE, DEFAULT_GROUPS } from '../../../portal/template';
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const b = await body<any>(request, 2_000_000);
  if (!b || b.cayenne_import !== 1) return json({ error: 'This is not a Cayenne import file.' }, 400);
  const d = await db();
  let clientId = str(b.client_id);
  if (clientId) {
    if (!(await d.prepare('SELECT id FROM portal_clients WHERE id = ?').bind(clientId).first())) return json({ error: 'Client not found.' }, 404);
  } else {
    const c = cleanClient(b.client);
    if (!c.name) return json({ error: 'The file has no business name.' }, 400);
    clientId = newId('cli'); const t = nowIso();
    await d.prepare('INSERT INTO portal_clients (id, name, kind, contact, email, phone, website, location, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(clientId, c.name, c.kind, c.contact, c.email, c.phone, c.website, c.location, t, t).run();
  }
  const a = b.audit || {};
  const template = validTemplate(a.template) ? a.template : DEFAULT_TEMPLATE;
  const research = cleanResearch(a.research || {});
  if (!research.groups.length) research.groups = DEFAULT_GROUPS;
  const business: Record<string, string> = {};
  Object.entries(a.business || {}).slice(0, 20).forEach(([k, v]) => { if (/^[a-z_]{1,30}$/.test(k)) business[k] = str(v).slice(0, 4000); });
  const id = await createAudit(clientId, blankDoc(template, research, business), { by: w.email });
  return json({ ok: true, client_id: clientId, audit_id: id, items: research.items.length, questions: template.stages.reduce((n: number, s: any) => n + s.qs.length, 0) });
};
