// The audit as a downloadable PDF. Developer only.
import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/server';
import { guard, isRes, db, getAudit, parseDoc } from '../../../../../lib/portal';
import { auditPdf } from '../../../../../lib/audit-pdf';
export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const a = await getAudit(String(params.id)); if (!a) return json({ error: 'Not found.' }, 404);
  const c = await (await db()).prepare('SELECT name FROM portal_clients WHERE id = ?').bind(a.client_id).first<any>();
  const bytes = await auditPdf(parseDoc(a), { number: a.number, status: a.status, completed_at: a.completed_at, updated_at: a.updated_at, client: c?.name || '' });
  const file = ('Cayenne audit ' + a.number + ' ' + (c?.name || '')).replace(/[^A-Za-z0-9 .-]+/g, '').trim().replace(/\s+/g, ' ') + '.pdf';
  return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store' } });
};
