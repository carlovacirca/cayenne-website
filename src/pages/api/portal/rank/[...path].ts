// The Clients section's data, from the client automations. Developer only, read only.
//   GET board                 the client windows: the automations, without the developer's own to-dos
//   GET spend?month=YYYY-MM   what the agents cost that month
//   GET style                 the windows' logos and colours (a private setting)
//   PUT style                 save that setting
import type { APIRoute } from 'astro';
import { json } from '../../../../lib/server';
import { guard, isRes, body } from '../../../../lib/portal';
import { board, spend, style, saveStyle } from '../../../../lib/rank';
export const prerender = false;

const nope = () => json({ error: 'Not found.' }, 404);

export const GET: APIRoute = async ({ request, params, url }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const p = params.path || '';
  if (p === 'board') return board();
  if (p === 'spend') return spend(url.searchParams.get('month') || new Date().toISOString().slice(0, 7));
  if (p === 'style') return style();
  return nope();
};

export const PUT: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  if ((params.path || '') !== 'style') return nope();
  return saveStyle(await body(request, 400_000));
};
