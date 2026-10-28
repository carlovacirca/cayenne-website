// Approve or skip a draft from the review page. The signed link (or the approver's Google sign-in) is the permission.
import type { APIRoute } from 'astro';
import { currentUser } from '../../../lib/server';
import { isDate, tokenOk, isApprover, publish, skip } from '../../../lib/insights';
export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const f = await request.formData().catch(() => null);
  const d = String(f?.get('d') || ''), t = String(f?.get('t') || ''), act = String(f?.get('act') || 'publish');
  if (!isDate(d)) return new Response('Bad request', { status: 400 });
  const user = await currentUser(request);
  if (!(await tokenOk(d, t)) && !isApprover(user?.email)) return new Response('This link has expired. Open the latest email.', { status: 403 });
  if (act === 'skip') { await skip(d); return redirect('/insights/review?d=' + d + '&t=' + encodeURIComponent(t), 303); }
  const keep = (f?.getAll('keep') || []).map(v => Number(v)).filter(n => Number.isInteger(n) && n >= 0);
  const ed = await publish(d, keep);
  if (!ed) return new Response('Nothing to publish: tick at least one story.', { status: 400 });
  return redirect('/insights/' + d, 303);
};
