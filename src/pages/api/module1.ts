// Writes Module 1 for one business with Claude. The page sends facts only; the instructions live here.
import type { APIRoute } from 'astro';
import { E, json, notReady, clip, limited } from '../../lib/server';
export const prerender = false;

const LEVELS = ['Never used it', 'Tried it once or twice', 'Use it now and then', 'Use it most weeks', 'Use it most days', 'I build things with it'];

export const POST: APIRoute = async ({ request }) => {
  if (!E.ANTHROPIC_API_KEY) return notReady('ai');
  if (await limited(request, 'module1', 8, 3600)) return json({ error: 'slow down' }, 429);
  let b: any; try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const name = clip(b.name, 80), cat = clip(b.cat, 60), town = clip(b.town, 60);
  const goals = (Array.isArray(b.goals) ? b.goals : []).slice(0, 8).map((g: unknown) => clip(g, 80)).filter(Boolean);
  const level = Math.max(0, Math.min(5, Number(b.level) || 0));
  if (!name || !goals.length) return json({ error: 'missing details' }, 400);
  const prompt = `You are writing Module 1 of a free AI course for the owner of a small UK business.
Business: ${name}${cat ? ', ' + cat : ''}${town ? ' in ' + town : ''}.
What they want AI to help with: ${goals.join('; ')}.
Their AI knowledge: level ${level} of 5 (${LEVELS[level]}).
Write in plain British English, warm and practical, with no jargon and no em dashes or en dashes. Speak to the owner as "you". Never invent facts about the business.
Reply with JSON only, in this shape:
{"lead": "one or two sentences welcoming them, mentioning their business and their level",
 "whatIs": ["two short paragraphs, under 60 words each, explaining what AI chat tools are, with an example from their kind of business"],
 "steps": ["three short, concrete steps, under 25 words each, to use AI for: ${goals[0]}"],
 "prompt": "one ready-to-paste prompt for ChatGPT, Claude or Gemini that does that first job for their business, with [square brackets] where they add their own details"}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': E.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) return json({ error: 'ai failed' }, 502);
  const d: any = await r.json();
  const text = (d.content || []).map((c: any) => c.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const o = JSON.parse(m ? m[0] : text);
    const tidy = (s: unknown) => clip(s, 900).replace(/\s*[—–]\s*/g, ', ');
    if (!Array.isArray(o.whatIs) || !Array.isArray(o.steps) || typeof o.prompt !== 'string') throw new Error('shape');
    return json({ lead: tidy(o.lead), whatIs: o.whatIs.slice(0, 3).map(tidy), steps: o.steps.slice(0, 4).map(tidy), prompt: clip(o.prompt, 1500) });
  } catch { return json({ error: 'unexpected answer' }, 502); }
};
