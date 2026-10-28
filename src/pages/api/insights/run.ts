// Writes today's draft on demand, for the approver only (signed in with Google). The morning run does the same on a timer.
import type { APIRoute } from 'astro';
import { currentUser, json } from '../../../lib/server';
import { isApprover, morning } from '../../../lib/insights';
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const user = await currentUser(request);
  if (!isApprover(user?.email)) return json({ error: 'approver only' }, 403);
  try { const ed = await morning(); return json({ ok: true, date: ed.date, status: ed.status, stories: ed.stories.length }); }
  catch (e) { return json({ error: (e as Error).message }, 500); }
};
