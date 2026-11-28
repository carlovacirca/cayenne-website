// The Clients section's data, from the client automations. Developer only.
//   GET   board?client=all|<id>&done_limit=60   what you need to do, what the agents are working on, done
//   GET   spend?month=YYYY-MM                    what the agents cost that month
//   POST  todos                                  add a to-do or a request for the agents
//   PATCH todos/<id>                             tick a to-do, or change it
import type { APIRoute } from 'astro';
import { json } from '../../../../lib/server';
import { guard, isRes, body } from '../../../../lib/portal';
import { board, spend, addTodo, updateTodo } from '../../../../lib/rank';
export const prerender = false;

const nope = () => json({ error: 'Not found.' }, 404);

export const GET: APIRoute = async ({ request, params, url }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const p = params.path || '';
  if (p === 'board') return board(url.searchParams.get('client') || 'all', Number(url.searchParams.get('done_limit') || 60));
  if (p === 'spend') return spend(url.searchParams.get('month') || new Date().toISOString().slice(0, 7));
  return nope();
};

export const POST: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  if ((params.path || '') !== 'todos') return nope();
  return addTodo(await body(request, 30000));
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const w = await guard(request, 'dev'); if (isRes(w)) return w;
  const m = (params.path || '').match(/^todos\/([^/]+)$/);
  if (!m) return nope();
  return updateTodo(m[1], await body(request, 30000));
};
