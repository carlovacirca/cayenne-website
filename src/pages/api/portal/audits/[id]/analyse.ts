// AI analysis of one audit, run on the server. The text streams back as it is written; the result is saved on the audit.
import type { APIRoute } from 'astro';
import { json } from '../../../../../lib/server';
import { guard, isRes, getAudit, parseDoc, setAnalysis, P } from '../../../../../lib/portal';
import { brief, streamAnalysis, tidyResult } from '../../../../../lib/audit-ai';
import { limited } from '../../../../../lib/server';
export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  if (!P.ANTHROPIC_API_KEY) return json({ ok: false, notReady: 'ai' }, 501);
  if (await limited(request, 'portal-ai', 20, 3600)) return json({ error: 'Too many analyses this hour. Try again later.' }, 429);
  const a = await getAudit(String(params.id)); if (!a) return json({ error: 'Not found.' }, 404);
  const doc = parseDoc(a), t0 = Date.now();
  const stream = streamAnalysis(P.ANTHROPIC_API_KEY, brief(doc, a.number), async text => {
    const result = tidyResult(text);
    if (!result) return JSON.stringify({ saved: false, error: 'unreadable answer' });
    const analysis = { at: new Date().toISOString(), result, secs: Math.round((Date.now() - t0) / 1000) };
    const ok = await setAnalysis(a.id, analysis);
    return JSON.stringify({ saved: ok, analysis });
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
};
