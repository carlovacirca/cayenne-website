// Insights: a daily briefing on AI and business news. Each morning Claude searches the web and writes a draft,
// the approver gets an email with a private review link, and nothing goes live until they approve it
// (unless INSIGHTS_AUTO_PUBLISH is set to "on"). Editions live in KV under insights:ed:<date>.
import { E, sign, unsign, sendMail } from './server';

export type Story = { kind: 'breaking' | 'radar'; region: string; headline: string; summary: string; why: string; sources: { title: string; url: string }[] };
export type Edition = {
  date: string; title: string; titleEm: string; intro: string; stories: Story[];
  status: 'draft' | 'published' | 'skipped'; createdAt: string; publishedAt?: string;
};
type IndexRow = { date: string; title: string; n: number };

const MODEL = 'claude-opus-5-5';

/* today's date in the UK, as 2026-10-28 */
export function ukDate(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export function longDate(date: string) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(',', '');
}
const shortDate = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

/* ---------- storage ---------- */
export async function getEdition(date: string): Promise<Edition | null> {
  if (!E.DATA || !isDate(date)) return null;
  return (await E.DATA.get('insights:ed:' + date, 'json')) as Edition | null;
}
async function putEdition(ed: Edition) { await E.DATA!.put('insights:ed:' + ed.date, JSON.stringify(ed)); }
export async function getIndex(): Promise<IndexRow[]> {
  if (!E.DATA) return [];
  return ((await E.DATA.get('insights:index', 'json')) as IndexRow[] | null) || [];
}

export async function publish(date: string, keep?: number[]) {
  const ed = await getEdition(date);
  if (!ed) return null;
  if (keep) ed.stories = ed.stories.filter((_, i) => keep.includes(i));
  if (!ed.stories.length) return null;
  ed.status = 'published'; ed.publishedAt = new Date().toISOString();
  await putEdition(ed);
  const idx = (await getIndex()).filter(r => r.date !== date);
  idx.unshift({ date, title: ed.title, n: ed.stories.length });
  idx.sort((a, b) => (a.date < b.date ? 1 : -1));
  await E.DATA!.put('insights:index', JSON.stringify(idx.slice(0, 400)));
  return ed;
}
export async function skip(date: string) {
  const ed = await getEdition(date);
  if (!ed || ed.status === 'published') return ed;
  ed.status = 'skipped'; await putEdition(ed); return ed;
}

/* ---------- the private review link ---------- */
export async function reviewToken(date: string) {
  return sign({ d: date, act: 'insights', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 4 }, E.SESSION_SECRET!);
}
export async function tokenOk(date: string, t: string | null | undefined) {
  if (!E.SESSION_SECRET || !t) return false;
  const v = await unsign<{ d: string; act: string }>(t, E.SESSION_SECRET);
  return !!v && v.act === 'insights' && v.d === date;
}
export function isApprover(email: string | undefined) {
  const list = (E.INSIGHTS_APPROVER || E.MAIL_TO || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

/* ---------- writing the draft ---------- */
const tidy = (s: unknown, n: number) => String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);

function brief(date: string, recent: string[]) {
  return `Today is ${longDate(date)}. You are the editor of a short daily briefing called Insights, on the Cayenne website. Its readers run small and medium businesses in the UK, many of them aged 40 to 60. They are busy, sensible and not technical.

Use web search to find the most important and most interesting news about AI and business from the last 24 to 36 hours, from anywhere in the world. Pick 7 stories:
- 3 "breaking": the big stories most people in business will hear about (major launches, regulation, big company moves, funding, outages).
- 4 "radar": under-the-radar stories most people will miss but are worth knowing (a small company doing something clever, a regional or non-English-language story, a court case, a research result, a policy change in another country, a sector-specific use of AI). Cast a wide net: Asia, Europe, Africa, Latin America and the UK, not only the US.

Rules:
- Only report what your sources say. Never invent facts, figures, quotes or dates. If you are not sure something happened in the last two days, leave it out.
- Prefer original reporting and primary sources. Every story needs at least one source URL that came from your search results, and two where you can.
- Do not repeat these recent stories: ${recent.length ? recent.join(' | ') : 'none yet'}.
- Write in plain British English: short sentences, everyday words, no hype, no jargon, no exclamation marks. Never use em dashes or en dashes.
- "why" says, in one or two sentences, what the story means for a UK business owner in practice. Be honest when the answer is "not much yet".
- Do not describe Cayenne or recommend any product or service.

When you have finished searching, reply with JSON only, no other text, in exactly this shape:
{"title": "a calm headline for the day under 70 characters", "titleEm": "the last two to four words of the title, copied exactly", "intro": "two sentences under 50 words that sum up the day",
 "stories": [{"kind": "breaking" or "radar", "region": "where it happened, e.g. United Kingdom, United States, Japan, Global", "headline": "under 90 characters", "summary": "what happened, 50 to 80 words", "why": "what it means for a UK business, under 45 words", "sources": [{"title": "publication name", "url": "https://..."}]}]}`;
}

async function callClaude(messages: any[]) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': E.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 16000, output_config: { effort: 'high' }, fallbacks: 'default',
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 18 }],
      messages,
    }),
  });
  if (!r.ok) throw new Error('Claude ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return r.json() as Promise<any>;
}

export async function writeDraft(date = ukDate()): Promise<Edition> {
  if (!E.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  if (!E.DATA) throw new Error('the DATA KV namespace is not bound');
  const recent = (await Promise.all((await getIndex()).slice(0, 3).map(r => getEdition(r.date))))
    .flatMap(ed => (ed ? ed.stories.map(s => s.headline) : []));
  const messages: any[] = [{ role: 'user', content: brief(date, recent) }];
  const seen = new Set<string>();
  let res: any;
  /* a long search can pause the turn; send it back to carry on, a few times at most */
  for (let i = 0; i < 5; i++) {
    res = await callClaude(messages);
    for (const b of res.content || []) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach((x: any) => x.url && seen.add(x.url));
    }
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content });
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude declined the request');
  const text = (res.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  const o = JSON.parse(m ? m[0] : text);
  const stories: Story[] = (Array.isArray(o.stories) ? o.stories : []).map((s: any): Story => ({
    kind: s.kind === 'breaking' ? 'breaking' : 'radar',
    region: tidy(s.region, 40) || 'Global',
    headline: tidy(s.headline, 120), summary: tidy(s.summary, 700), why: tidy(s.why, 400),
    /* keep only links the search actually returned, so no source is made up */
    sources: (Array.isArray(s.sources) ? s.sources : [])
      .filter((x: any) => typeof x?.url === 'string' && /^https:\/\//.test(x.url) && (seen.has(x.url) || [...seen].some(u => u.split('#')[0] === x.url.split('#')[0])))
      .slice(0, 3).map((x: any) => ({ title: tidy(x.title, 60) || new URL(x.url).hostname.replace(/^www\./, ''), url: x.url })),
  })).filter((s: Story) => s.headline && s.summary && s.sources.length).slice(0, 8);
  if (stories.length < 3) throw new Error('the draft had too few stories with checkable sources');
  stories.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'breaking' ? -1 : 1));
  const title = tidy(o.title, 90) || 'Today in AI and business';
  let titleEm = tidy(o.titleEm, 60);
  if (!titleEm || !title.endsWith(titleEm)) titleEm = title.split(' ').slice(-3).join(' ');
  const ed: Edition = { date, title, titleEm, intro: tidy(o.intro, 400), stories, status: 'draft', createdAt: new Date().toISOString() };
  await putEdition(ed);
  return ed;
}

/* the morning run: write the draft, then ask for approval (or publish straight away when auto is on) */
export async function morning() {
  const date = ukDate();
  const have = await getEdition(date);
  if (have && have.status !== 'skipped') return have;
  let ed: Edition;
  try { ed = await writeDraft(date); }
  catch (e) {
    await sendMail('Insights: today’s draft could not be written', `The ${longDate(date)} briefing failed: ${(e as Error).message}\n\nNothing was published. Tomorrow's run will try again.`);
    throw e;
  }
  if ((E.INSIGHTS_AUTO_PUBLISH || '').toLowerCase() === 'on') { await publish(date); return ed; }
  const site = (E.SITE_URL || '').replace(/\/$/, '');
  const link = `${site}/insights/review?d=${date}&t=${encodeURIComponent(await reviewToken(date))}`;
  const lines = ed.stories.map((s, i) => `${i + 1}. [${s.kind === 'breaking' ? 'Breaking' : 'Under the radar'}] ${s.headline}`).join('\n');
  await sendMail(`Insights draft for ${longDate(date)}: ${ed.title}`,
    `Today's briefing is ready for you to check.\n\n${ed.title}\n${ed.intro}\n\n${lines}\n\nReview, untick anything you do not want, and approve:\n${link}\n\nNothing goes live until you approve it. The link works for four days.`);
  return ed;
}

/* ---------- the page ---------- */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ICON = {
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  out: '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h9v9M18 6L7 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bolt: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" fill="currentColor"/></svg>',
  eye: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  arrow: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tick: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const NAV = `<header class="nav"><div class="nav-in wrap"><a class="brand" href="/" aria-label="Cayenne home"><img src="/img/cayenne.png" alt="Cayenne" width="128" height="36"></a>
<nav class="links" aria-label="Main"><a href="/course">Course</a><a href="/audit">Free AI audit</a><a href="/services">Services</a><a href="/about">About</a></nav>
<a class="signin" href="/signin">Sign in</a><button type="button" class="menu" aria-label="Menu">${ICON.menu}</button></div></header>`;
const FOOT = `<footer class="foot"><div class="wrap"><div class="foot-in"><div class="foot-brand"><img src="/img/cayenne.png" alt="Cayenne"><p>Plain-English AI for UK businesses. Learn it, plan it or have it built.</p></div>
<div><h4>Cayenne</h4><ul><li><a href="/course">The free course</a></li><li><a href="/audit">Free AI audit</a></li><li><a href="/services">Services</a></li><li><a href="/guides">Guides</a></li><li><a href="/insights">Insights</a></li></ul></div>
<div><h4>Company</h4><ul><li><a href="/about">About</a></li><li><a href="/partners">Partners</a></li><li><a href="/contact">Contact</a></li><li><a href="/signin">Sign in</a></li></ul></div></div>
<div class="foot-base"><span>© 2026 Cayenne. Made in the UK.</span><nav aria-label="Legal"><a href="/legal#privacy">Privacy</a><a href="/legal#cookies">Cookies</a><a href="/legal#terms">Terms</a></nav></div></div></footer>`;
const SCRIPT = `<script>(function(){var bar=document.getElementById('rdbar'),art=document.querySelector('.gd-art');if(!bar||!art)return;
function p(){var r=art.getBoundingClientRect(),t=r.height-innerHeight*.5;bar.style.setProperty('--p',Math.min(1,Math.max(0,(innerHeight*.5-r.top)/Math.max(1,t))).toFixed(4));}
var l=[].slice.call(document.querySelectorAll('.rail-l a')),s=l.map(function(a){return document.querySelector(a.getAttribute('href'));});
function c(){var y=innerHeight*.35,k=-1;s.forEach(function(x,i){if(x&&x.getBoundingClientRect().top<=y)k=i;});l.forEach(function(a,i){if(i===k)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');});}
var f=0;addEventListener('scroll',function(){if(!f){f=1;requestAnimationFrame(function(){f=0;p();c();});}},{passive:true});addEventListener('resize',p);p();c();})();</script>`;

function titleHtml(ed: Edition) {
  const t = esc(ed.title), em = esc(ed.titleEm);
  return t.endsWith(em) ? t.slice(0, t.length - em.length) + '<em>' + em + '</em>' : t;
}
const kindTag = (s: Story) => s.kind === 'breaking'
  ? `<span class="tag red">${ICON.bolt}Breaking</span>` : `<span class="tag ins-radar">${ICON.eye}Under the radar</span>`;
const mins = (ed: Edition) => Math.max(3, Math.round(ed.stories.reduce((n, s) => n + (s.summary + s.why).split(' ').length, 0) / 200) + 1);

/* one edition as page HTML. In review mode each story gets a tick box and the approve bar shows */
export function editionBody(ed: Edition, opts: { review?: { token: string } ; archive?: IndexRow[]; latest?: boolean } = {}) {
  const rv = opts.review;
  const rail = ed.stories.map((s, i) => `<li><a href="#s${i + 1}"><span>${i + 1}</span>${esc(s.headline)}</a></li>`).join('');
  const front = ed.stories.map((s, i) => `<li><a href="#s${i + 1}"><span class="fr-n">${i + 1}</span><span class="fr-b"><span class="fr-k ${s.kind}">${s.kind === 'breaking' ? 'Breaking' : 'Under the radar'} · ${esc(s.region)}</span><b>${esc(s.headline)}</b></span></a></li>`).join('');
  const stories = ed.stories.map((s, i) => `
      <section class="st ins-st" id="s${i + 1}" aria-labelledby="h-s${i + 1}">
        ${rv ? `<label class="ins-keep"><input type="checkbox" name="keep" value="${i}" checked><span>Include this story</span></label>` : ''}
        <div class="ins-meta">${kindTag(s)}<span class="ins-reg">${esc(s.region)}</span></div>
        <h2 id="h-s${i + 1}"><span class="st-n" aria-hidden="true">${i + 1}</span>${esc(s.headline)}</h2>
        <p>${esc(s.summary)}</p>
        <p class="say"><b>What it means for you</b>${esc(s.why)}</p>
        <p class="ins-src"><span>Sources</span>${s.sources.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener nofollow">${esc(x.title)}${ICON.out}</a>`).join('')}</p>
      </section>`).join('');
  const nB = ed.stories.filter(s => s.kind === 'breaking').length, nR = ed.stories.length - nB;
  const arch = (opts.archive || []).filter(r => r.date !== ed.date).slice(0, 9);
  return `
<div id="stage"><div id="app" class="app">
  <div class="rd-prog" aria-hidden="true"><i id="rdbar"></i></div>
  <div class="gd-top" id="top">
    <div class="heat" aria-hidden="true"><i class="h1"></i><i class="h2"></i><i class="h3"></i></div>
    ${NAV}
    ${rv ? `<div class="wrap"><p class="ins-draft" role="status"><b>Draft for your approval.</b> Only you can see this page. Untick any story you do not want, then approve at the bottom.</p></div>` : ''}
    <div class="wrap gd-hero intro">
      <nav class="gd-k in" aria-label="Breadcrumb"><i aria-hidden="true"></i><ol><li><a href="/insights">Insights</a></li><li><span class="ld">${esc(longDate(ed.date))}</span><span class="sd">${esc(shortDate(ed.date))}</span></li></ol><span class="gd-t">${mins(ed)} min read</span></nav>
      <h1 class="gd-h in d1">${titleHtml(ed)}</h1>
      <p class="lede in d2">${esc(ed.intro)}</p>
      <div class="ins-front in d3">
        <div class="fr-top"><span class="fr-k0"><i aria-hidden="true"></i>${opts.latest ? 'Today’s briefing' : 'In this briefing'}</span><span class="fr-c"><span class="fr-dot b"></span>${nB} breaking<span class="fr-dot r"></span>${nR} under the radar</span></div>
        <ol class="fr-l">${front}</ol>
      </div>
    </div>
  </div>

  <div class="wrap gd-body">
    <aside class="gd-rail" aria-label="In this briefing">
      <span class="rail-k">In this briefing</span>
      <ol class="rail-l">${rail}</ol>
      <div class="rail-n">${ed.stories.length} stories · ${mins(ed)} min read</div>
    </aside>
    <article class="read gd-art">
      ${rv ? `<form id="ins-ok" method="post" action="/api/insights/approve"><input type="hidden" name="d" value="${ed.date}"><input type="hidden" name="t" value="${esc(rv.token)}">` : ''}
      ${stories}
      <aside class="tipbox ins-how" aria-label="How this briefing is made">
        <i aria-hidden="true">${ICON.tick}</i>
        <div><b>How this briefing is made</b><p>Each morning AI reads the day’s public reporting from around the world and drafts this page. A person checks it before it goes up. Every story links to its sources, so you can read the full report.</p></div>
      </aside>
      ${rv ? `<div class="ins-bar"><button class="btn-create" type="submit" name="act" value="publish">Approve and publish</button><button class="ins-skip" type="submit" name="act" value="skip">Skip today</button></div></form>` : ''}
    </article>
  </div>

  ${arch.length ? `<section class="gd-more ins-more" aria-labelledby="h-more"><div class="wrap">
    <div class="more-top"><div><span class="sec-k"><i aria-hidden="true"></i>Earlier briefings</span><h2 class="more-h" id="h-more">The last few <em>mornings.</em></h2></div></div>
    <ul class="ins-arch">${arch.map(r => `<li><a href="/insights/${r.date}"><span class="ar-d">${esc(longDate(r.date))}</span><b>${esc(r.title)}</b><span class="ar-n">${r.n} stories${ICON.arrow}</span></a></li>`).join('')}</ul>
  </div></section>` : ''}

  ${FOOT}
</div></div>
<div class="toast" id="toast" role="status" hidden></div>
<script src="/site.js"></script>
${SCRIPT}`;
}

/* before the first edition: a calm holding screen, nothing invented */
export function emptyBody() {
  return `
<div id="stage"><div id="app" class="app">
  <section class="snap hero ins-wait" id="top">
    <div class="heat" aria-hidden="true"><i class="h1"></i><i class="h2"></i><i class="h3"></i></div>
    ${NAV}
    <div class="hero-main wrap intro ins-wait-in">
      <span class="sec-k in"><i aria-hidden="true"></i>Insights · Daily</span>
      <h1 class="gd-h in d1">AI and business news, <em>every morning.</em></h1>
      <p class="lede in d2">The big stories and the quiet ones from around the world, in plain English, with what each one means for a UK business. The first briefing is on its way.</p>
      <div class="ins-front ins-ghost in d3" aria-hidden="true">
        <div class="fr-top"><span class="fr-k0"><i></i>Each briefing</span><span class="fr-c"><span class="fr-dot b"></span>3 breaking<span class="fr-dot r"></span>4 under the radar</span></div>
        <ol class="fr-l"><li><span class="fr-n">1</span><span class="fr-b"><span class="fr-k breaking">Breaking</span><b>The stories everyone in business will hear about</b></span></li><li><span class="fr-n">2</span><span class="fr-b"><span class="fr-k radar">Under the radar</span><b>The ones most people miss, from every corner of the world</b></span></li><li><span class="fr-n">3</span><span class="fr-b"><span class="fr-k mean">What it means for you</span><b>One or two plain lines on each, with links to the sources</b></span></li></ol>
      </div>
      <div class="ins-row in d4"><a class="btn-create" href="/guides">Read the free guides</a></div>
    </div>
  </section>
  ${FOOT}
</div></div>
<div class="toast" id="toast" role="status" hidden></div>
<script src="/site.js"></script>`;
}
