import type { APIRoute } from 'astro';
export const prerender = false;
export const GET: APIRoute = async ({ url }) => new Response(null, { status: 302, headers: { location: url.origin + '/', 'set-cookie': 'cy_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' } });
