// Small helpers for the portal screens: escaping, the API call, dates, the toast and copying.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

export class ApiError extends Error {
  status: number; data: any;
  constructor(message: string, status: number, data: any) { super(message); this.status = status; this.data = data; }
}

let signedOut: () => void = () => {};
export function onSignedOut(f: () => void) { signedOut = f; }

/* Every call sends the portal header: the server refuses changes without it, so other sites cannot post with the cookie. */
export async function api<T = any>(path: string, method = 'GET', body?: unknown, opt: { keepalive?: boolean } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch('/api/portal/' + path, {
      method, credentials: 'same-origin', keepalive: !!opt.keepalive,
      headers: { 'x-cayenne-portal': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch { throw new ApiError('No connection. Check the internet and try again.', 0, null); }
  let data: any = null;
  try { data = await r.json(); } catch { /* not JSON */ }
  if (r.status === 401 && path !== 'session' && path !== 'password') signedOut();
  if (!r.ok || (data && data.notReady)) throw new ApiError((data && data.error) || (data && data.notReady ? 'notReady' : 'Something went wrong. Try again.'), r.status, data);
  return data as T;
}

export function day(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function when(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const today = new Date().toDateString() === d.toDateString();
  return (today ? 'today' : day(iso)) + ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

let toastTimer = 0;
export function toast(msg: string, ms = 3600) {
  const t = document.getElementById('ptToast'); if (!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* older browsers */ }
  const a = document.createElement('textarea'); a.value = text; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
  document.body.appendChild(a); a.select(); let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  a.remove(); return ok;
}

/* A button that needs a second click within a few seconds, instead of a pop-up dialog */
export function twoStep(btn: HTMLElement, label = 'Click again to confirm') {
  if (btn.dataset.armed === '1') { btn.dataset.armed = ''; return true; }
  const was = btn.textContent || ''; btn.dataset.armed = '1'; btn.textContent = label;
  window.setTimeout(() => { if (btn.dataset.armed === '1') { btn.dataset.armed = ''; btn.textContent = was; } }, 4000);
  return false;
}

export function host(url: string) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
