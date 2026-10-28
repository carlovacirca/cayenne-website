# Generates the three mockup page bodies into src/html (run from the repo root)
import json, re
def svg(d, w=22, extra=''):
    return f'<svg width="{w}" height="{w}" viewBox="0 0 24 24" aria-hidden="true"{extra}>{d}</svg>'
S = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"'
IC = {
 'found': svg(f'<circle cx="10.5" cy="10.5" r="7" {S}/><path d="M3.5 10.5h14M10.5 3.5c2 2.1 3 4.4 3 7s-1 4.9-3 7c-2-2.1-3-4.4-3-7s1-4.9 3-7zM15.8 15.8L21 21" {S}/>'),
 'win': svg(f'<path d="M4 5.5h16v10.5H10l-6 4.5z" {S}/><path d="M8.5 10.8l2.2 2.2 4.8-4.8" {S}/>'),
 'keep': svg(f'<path d="M20 11a8 8 0 0 0-14.5-4.6M4 4v3.4h3.4M4 13a8 8 0 0 0 14.5 4.6M20 20v-3.4h-3.4" {S}/>'),
 'run': svg(f'<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" {S}/><path d="M9 8.5h6M9 12.5h6" {S}/>'),
 'shop': svg(f'<path d="M3.5 9.5l1.6-5h13.8l1.6 5M3.5 9.5a2.75 2.75 0 0 0 5.5 0 2.75 2.75 0 0 0 5.5 0 2.75 2.75 0 0 0 5.5 0M5 12v8h14v-8M10 20v-4.5h4V20" {S}/>', 24),
 'tick': svg('<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>', 18),
 'tickS': svg('<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>', 15),
 'arrow': svg('<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', 18),
 'plus': '<svg class="i-pl" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
 'tk': '<svg class="i-tk" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 'menu': svg('<path d="M4 8h16M4 16h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', 20),
 'left': svg('<path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', 18),
 'right': svg('<path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', 18),
 'cal': svg(f'<rect x="3.5" y="5" width="17" height="15" rx="3" {S}/><path d="M3.5 10h17M8 3v4M16 3v4" {S}/>', 18),
 'bulb': svg(f'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" {S}/>', 18),
 'link': svg(f'<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" {S}/>', 17),
 'own': svg(f'<rect x="4.5" y="10.5" width="15" height="10" rx="2.5" {S}/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {S}/>', 17),
 'grow': svg(f'<path d="M4 18l5.5-5.5 3.5 3.5L20 9M14.5 9H20v5.5" {S}/>', 17),
 'only': svg(f'<path d="M12 3.5l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z" {S}/>', 17),
 'reply': svg(f'<path d="M4 5.5h16v10.5H10l-6 4.5z" {S}/>', 17),
 'bell': svg(f'<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 21h4" {S}/>', 17),
 'pound': svg(f'<path d="M16.5 6.5A4 4 0 0 0 9 8.5V12m0 0v3.5c0 1.5-.8 2.6-2 3.5h11M6.5 12H14" {S}/>', 17),
 'star': svg(f'<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z" {S}/>', 17),
 'pin': svg(f'<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" {S}/><circle cx="12" cy="10" r="2.3" {S}/>', 17),
}
NAV = f'''<header class="nav"><div class="nav-in wrap"><a class="brand" href="/mockup-home" aria-label="Cayenne home"><img src="/img/cayenne.png" alt="Cayenne" width="128" height="36"></a>
    <nav class="links" aria-label="Main"><a href="/course">Course</a><a href="/mockup-consultation">Free consultation</a><a href="/mockup-services">Services</a><a href="/about">About</a></nav>
    <a class="signin" href="/signin">Sign in</a><button type="button" class="menu" aria-label="Menu">{IC['menu']}</button></div></header>'''
FOOT = '''<footer class="foot"><div class="wrap"><div class="foot-in"><div class="foot-brand"><img src="/img/cayenne.png" alt="Cayenne"><p>Plain-English AI for UK businesses. Learn it, plan it or have it built.</p></div>
    <div><h4>Cayenne</h4><ul><li><a href="/course">The free course</a></li><li><a href="/mockup-consultation">Free consultation</a></li><li><a href="/mockup-services">Services</a></li><li><a href="/guides">Guides</a></li><li><a href="/insights">Insights</a></li></ul></div>
    <div><h4>Company</h4><ul><li><a href="/about">About</a></li><li><a href="/partners">Partners</a></li><li><a href="/contact">Contact</a></li><li><a href="/signin">Sign in</a></li></ul></div></div>
    <div class="foot-base"><span>© 2026 Cayenne. Made in the UK.</span><nav aria-label="Legal"><a href="/legal#privacy">Privacy</a><a href="/legal#cookies">Cookies</a><a href="/legal#terms">Terms</a></nav></div></div></footer>'''
FLAG = '<div class="mk-flag" aria-hidden="true"><i></i>Mockup</div>'
CTA = 'Book a free consultation'

AREAS = [
 ('found', 'Get found', 'More of the right people find you', [('Website updates', 1), ('Google profile posts', 1), ('Asking for reviews', 1), ('Social media posts', 2)]),
 ('win', 'Win work', 'More enquiries turn into jobs', [('Replying to enquiries', 3), ('Writing quotes', 2), ('Chasing quotes', 1.5), ('Finding new customers', 3)]),
 ('keep', 'Keep customers', 'They come back and send friends', [('Bookings and changes', 2), ('Reminders and no-shows', 1.5), ('Aftercare and check-ins', 1), ('The same questions, again', 2)]),
 ('run', 'Run the business', 'Less admin, paid faster', [('Invoices and chasing payment', 2), ('Copying data between systems', 3), ('Reports and paperwork', 2), ('Staff rotas', 1.5)]),
]
def hrs(h): return (str(h).rstrip('0').rstrip('.') if isinstance(h, float) else str(h)) + 'h'
def chip(area, t, h):
    return f'<button type="button" class="ch" role="checkbox" aria-checked="false" data-a="{area}" data-h="{h}"><span class="ch-ic" aria-hidden="true">{IC["plus"]}{IC["tk"]}</span><span class="ch-t">{t}</span><span class="ch-h">{hrs(h)}</span></button>'

PLAN = f'''<div class="plan wcard" aria-label="Example plan from a free consultation">
          <div class="pl-top"><span class="rp-k"><i aria-hidden="true"></i>Your AI plan</span><span class="rp-ex">Example</span></div>
          <div class="pl-biz"><span class="bm" aria-hidden="true">HD</span><div><b>Harbourside Dental</b><span>Dental practice · Brighton</span></div></div>
          <div class="pl-big"><b>9<small>h</small></b><span>a week this practice could save (estimate)</span></div>
          <p class="pl-k">Start with these three</p>
          <ol class="pl-l">
            <li><span class="n">1</span><span><b>Reminders and rebooking</b><small>Keep customers</small></span><span class="h">3.5h a week</span></li>
            <li><span class="n">2</span><span><b>Instant replies to enquiries</b><small>Win work</small></span><span class="h">2.5h a week</span></li>
            <li><span class="n">3</span><span><b>Review requests after visits</b><small>Get found</small></span><span class="h">1h a week</span></li>
          </ol>
          <div class="pl-q">{IC['tick']}<span>A fixed quote, agreed before any work starts</span></div>
        </div>'''

FAQ_SERV = [
 ('What exactly do you build?', 'One system made for your business. It takes care of the jobs you tick above, joined up so they work together, using the email, calendar and accounts software you already have.'),
 ('How much does it cost?', 'Every build is different, so you get a fixed quote after your free consultation, in writing, before any work starts.'),
 ('Do I need to be good with tech?', 'No. If you can send an email, you can use what we build. We show you how and stay on hand.'),
 ('Can it grow later?', 'Yes. Most owners start with the three jobs that save the most time, then add more once those are running.'),
 ('What if I want to stop?', 'Everything we built is yours to keep, with all the logins.'),
]
def faq(items): return ''.join(f'<details><summary>{q}<span class="fq-ic" aria-hidden="true"></span></summary><div class="fq-a"><p>{a}</p></div></details>' for q, a in items)

ORB_SVG = '''<svg class="orb-svg" viewBox="0 0 560 500" aria-hidden="true">
            <circle class="rg" cx="280" cy="250" r="128"/><circle class="rg ds" cx="280" cy="250" r="206"/>
            <circle class="pt" cx="280" cy="44" r="4"/><circle class="pt" cx="280" cy="456" r="4"/>
            <circle class="pt s" cx="74" cy="250" r="3.5"/><circle class="pt s" cx="486" cy="250" r="3.5"/>
            <circle class="pt s" cx="189.5" cy="159.5" r="3"/><circle class="pt s" cx="370.5" cy="340.5" r="3"/>
            <path class="ln" pathLength="1" d="M280 250 V172 C280 118 266 96 232 96"/><path class="ln" pathLength="1" d="M280 250 V172 C280 118 294 96 328 96"/>
            <path class="ln" pathLength="1" d="M280 250 V328 C280 382 266 404 232 404"/><path class="ln" pathLength="1" d="M280 250 V328 C280 382 294 404 328 404"/>
          </svg>'''

JOURNEY = [('found', 'Finds you on Google', 'Your profile is up to date', 'Get found', '9:02'), ('reply', 'Gets a reply in 2 minutes', 'Even while you are on a job', 'Win work', '9:04'),
           ('cal', 'Books a time that suits', 'Straight into your calendar', 'Win work', '9:06'), ('bell', 'Reminded the day before', 'No more no-shows', 'Keep customers', 'Tue'),
           ('pound', 'Invoice sent and paid', 'Chased politely if late', 'Run the business', 'Wed'), ('star', 'Asked for a review', 'At the right moment', 'Get found', 'Thu')]

services = f'''
<div id="stage"><div id="app" class="app">

  <!-- 1 · one system, four areas -->
  <section class="snap hero sp intro" id="top">
    <div class="heat" aria-hidden="true"><i class="h1"></i><i class="h2"></i><i class="h3"></i></div>
    {NAV}
    <div class="hero-main wrap sp-main">
      <div class="sp-copy">
        <span class="sec-k in"><i aria-hidden="true"></i>Services</span>
        <h1 class="hero-h in d1">One system, built around <em>how your business runs.</em></h1>
        <p class="lede in d2">We build one AI system for your business. It takes care of the jobs that eat your week, from getting found to getting paid.</p>
        <div class="sp-cta in d3"><a class="btn-create" href="/mockup-consultation">{CTA} {IC['arrow']}</a><span class="note">Free · 30 minutes · No obligation</span></div>
      </div>
      <div class="sp-vis in d2">
        <figure class="orb mk-areas" aria-label="One bespoke system across four areas of your business: get found, win work, keep customers and run the business">
          {ORB_SVG}
          <div class="orb-core"><span class="oc-ic" aria-hidden="true">{IC['shop']}</span><span><b>Your business</b><small>One bespoke system</small></span></div>
          <div class="orb-n n1"><span class="ic" aria-hidden="true">{IC['found']}</span><span class="tx"><b>Get found</b><small>Google, reviews</small></span></div>
          <div class="orb-n n2"><span class="ic" aria-hidden="true">{IC['win']}</span><span class="tx"><b>Win work</b><small>Replies, quotes</small></span></div>
          <div class="orb-n n3"><span class="ic" aria-hidden="true">{IC['keep']}</span><span class="tx"><b>Keep customers</b><small>Bookings, reminders</small></span></div>
          <div class="orb-n n4"><span class="ic" aria-hidden="true">{IC['run']}</span><span class="tx"><b>Run the business</b><small>Invoices, admin</small></span></div>
        </figure>
      </div>
    </div>
  </section>

  <!-- 2 · where does your week go -->
  <section class="snap sec s-wk" id="week">
    <div class="heat" aria-hidden="true"><i class="h1"></i></div>
    <div class="wrap center">
      <span class="sec-k"><i aria-hidden="true"></i>Where does your week go?</span>
      <h2 class="sec-h">Tick the jobs that <em>eat your time.</em></h2>
      <p class="sec-sub">Your build can include any of these. We start with the ones that save you the most.</p>
      <div class="wk" id="wk">
        <div class="wk-tabs" role="tablist" aria-label="Areas of your business">{''.join(f'<button type="button" role="tab" aria-selected="{"true" if i == 0 else "false"}" data-tab="{a[0]}">{a[1].split(" ")[-1].capitalize() if False else a[1]}<span class="c" data-c="{a[0]}"></span></button>' for i, a in enumerate(AREAS))}</div>
        <div class="wk-cols">{''.join(f"""
          <div class="wk-col{' on' if i == 0 else ''}" data-col="{a[0]}" role="group" aria-label="{a[1]}"><div class="wk-h"><span class="wk-ic" aria-hidden="true">{IC[a[0]]}</span><span><b>{a[1]}</b><small>{a[2]}</small></span></div>{''.join(chip(a[0], t, h) for t, h in a[3])}</div>""" for i, a in enumerate(AREAS))}
        </div>
        <div class="wk-sum">
          <div class="wk-tot" aria-live="polite"><b id="wk-h">0 hours</b><span id="wk-w">a week. Tick a few jobs to see your total.</span><em>Rough estimate. We work out the real figure on your call.</em></div>
          <a class="btn-create" href="/mockup-consultation" id="wk-go">{CTA} {IC['arrow']}</a>
        </div>
      </div>
    </div>
  </section>

  <!-- 3 · the bespoke build -->
  <section class="snap sec s-bb" id="build">
    <div class="heat" aria-hidden="true"><i class="h1"></i><i class="h2"></i></div>
    <div class="wrap center">
      <span class="sec-k"><i aria-hidden="true"></i>The bespoke build</span>
      <h2 class="sec-h">Not another app. <em>Your own system.</em></h2>
      <p class="sec-sub">Separate apps each do one job. Yours is built as one system, so every part of the week hands over to the next.</p>
      <div class="card bb"><div class="card-in">
        <div>
          <span class="bb-k"><i aria-hidden="true"></i>Built for you</span>
          <p class="bb-h">Made for one business. <em>Yours.</em></p>
          <ul class="bb-pts">
            <li><i aria-hidden="true">{IC['only']}</i><span><b>Shaped around how you work</b><span>Your services, your prices, your tone of voice. Nothing off the shelf.</span></span></li>
            <li><i aria-hidden="true">{IC['link']}</i><span><b>Joins up what you already use</b><span>Your email, calendar, booking and accounts software. No switching.</span></span></li>
            <li><i aria-hidden="true">{IC['own']}</i><span><b>Yours to keep</b><span>Your accounts, your logins and your data, from day one.</span></span></li>
            <li><i aria-hidden="true">{IC['grow']}</i><span><b>Grows with you</b><span>Start with three jobs. Add more when you are ready.</span></span></li>
          </ul>
        </div>
        <div class="jr" aria-label="Example: one customer moving through the system">
          <div class="jr-top"><b>One customer, start to finish</b><span class="rp-ex">Example</span></div>
          <ol id="jr">{''.join(f'<li><i aria-hidden="true">{IC[k] if k in IC and k not in ("found",) else IC["pin"]}</i><span><b>{t}</b><small>{s}</small></span><span class="ar">{a}</span></li>' for k, t, s, a, _ in JOURNEY)}</ol>
        </div>
      </div></div>
    </div>
  </section>

  <!-- 4 · what you get from the free call -->
  <section class="snap sec s-call" id="call">
    <div class="heat" aria-hidden="true"><i class="h1"></i></div>
    <div class="wrap mk-split">
      <div>
        <span class="sec-k"><i aria-hidden="true"></i>Free consultation</span>
        <h2 class="sec-h">A free call, then <em>a plan to keep.</em></h2>
        <p class="sec-sub">Talk your week through with one of our team. Afterwards you get a written plan, whether or not you go ahead.</p>
        <ol class="call-steps">
          <li><span class="n">1</span><span><b>A 30-minute call</b><span>Pick a time that suits you. We ask how your business runs today.</span></span></li>
          <li><span class="n">2</span><span><b>Your written plan</b><span>The first three jobs to hand over, the time each saves, and a fixed quote.</span></span></li>
          <li><span class="n">3</span><span><b>You decide</b><span>Go ahead, wait, or use the plan yourself. No chasing, ever.</span></span></li>
        </ol>
        <div class="cta-row" style="margin-top:clamp(18px,3svh,28px)"><a class="btn-create" href="/mockup-consultation">{CTA} {IC['arrow']}</a></div>
      </div>
      {PLAN}
    </div>
  </section>

  <!-- 5 · promises -->
  <section class="snap sec sv-pr" id="promises">
    <div class="heat" aria-hidden="true"><i class="h1"></i><i class="h2"></i></div>
    <div class="wrap center">
      <span class="sec-k"><i aria-hidden="true"></i>What you can count on</span>
      <h2 class="sec-h">No small print. <em>Four promises.</em></h2>
      <p class="sec-sub">From the first call to the finished build.</p>
      <div class="prom-card">
        <ul class="prom">
          <li><span class="pr-top"><span class="pr-ic" aria-hidden="true">{IC['reply']}</span><span class="pr-n" aria-hidden="true">01</span></span><b>Plain English</b><p>No jargon. If we have to use a technical word, we explain it.</p></li>
          <li><span class="pr-top"><span class="pr-ic" aria-hidden="true">{IC['tickS']}</span><span class="pr-n" aria-hidden="true">02</span></span><b>No hard sell</b><p>The call is free and so is the plan. No pressure, no chasing.</p></li>
          <li><span class="pr-top"><span class="pr-ic" aria-hidden="true">{IC['own']}</span><span class="pr-n" aria-hidden="true">03</span></span><b>You own what we build</b><p>Your accounts, logins and files. Take them with you any time.</p></li>
          <li><span class="pr-top"><span class="pr-ic" aria-hidden="true">{IC['bulb']}</span><span class="pr-n" aria-hidden="true">04</span></span><b>Straight answers</b><p>If a job is not worth automating, we will tell you.</p></li>
        </ul>
        <div class="prom-foot"><img src="/img/cayenne.png" alt=""><span>Written into your agreement, before any work starts</span></div>
      </div>
    </div>
  </section>

  <!-- 6 · questions and footer -->
  <section class="snap sec s-why sp-q" id="questions">
    <div class="heat" aria-hidden="true"><i class="h1"></i></div>
    <div class="why"><div class="wrap why-grid">
      <div class="q-head">
        <span class="sec-k"><i aria-hidden="true"></i>Questions</span>
        <h2 class="sec-h">Good questions, <em>straight answers.</em></h2>
        <p class="sec-sub">Anything we have missed, ask on your free call.</p>
      </div>
      <div class="cta-row q-cta"><a class="btn-create" href="/mockup-consultation">{CTA} {IC['arrow']}</a><span class="note">Free · 30 minutes</span></div>
      <div class="faq">{faq(FAQ_SERV)}</div>
    </div></div>
    {FOOT}
  </section>
</div></div>
{FLAG}
<div class="toast" id="toast" role="status" hidden></div>
<script src="/site.js"></script>
<script>
(function () {{
  'use strict';
  var $ = function (s, el) {{ return (el || document).querySelector(s); }};
  var $$ = function (s, el) {{ return Array.prototype.slice.call((el || document).querySelectorAll(s)); }};
  /* the week: tick chips, add up the hours, hand the list to the booking page */
  var chips = $$('#wk .ch'), hEl = $('#wk-h'), wEl = $('#wk-w');
  function total() {{
    var on = chips.filter(function (c) {{ return c.getAttribute('aria-checked') === 'true'; }});
    var h = on.reduce(function (n, c) {{ return n + Number(c.dataset.h); }}, 0);
    hEl.textContent = (Math.round(h * 2) / 2) + (h === 1 ? ' hour' : ' hours');
    wEl.textContent = h ? 'a week, about ' + Math.max(1, Math.round(h * 46 / 37.5)) + ' working weeks a year.' : 'a week. Tick a few jobs to see your total.';
    $$('.wk-tabs .c').forEach(function (c) {{ var n = on.filter(function (x) {{ return x.dataset.a === c.dataset.c; }}).length; c.textContent = n ? n : ''; }});
    try {{ sessionStorage.setItem('cy_jobs', JSON.stringify(on.map(function (c) {{ return $('.ch-t', c).textContent; }}))); }} catch (e) {{}}
  }}
  chips.forEach(function (c) {{ c.addEventListener('click', function () {{ c.setAttribute('aria-checked', String(c.getAttribute('aria-checked') !== 'true')); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); total(); }}); }});
  try {{ var had = JSON.parse(sessionStorage.getItem('cy_jobs') || '[]'); chips.forEach(function (c) {{ if (had.indexOf($('.ch-t', c).textContent) > -1) c.setAttribute('aria-checked', 'true'); }}); }} catch (e) {{}}
  total();
  /* phone: one area at a time */
  $$('.wk-tabs button').forEach(function (b) {{ b.addEventListener('click', function () {{
    $$('.wk-tabs button').forEach(function (x) {{ x.setAttribute('aria-selected', String(x === b)); }});
    $$('.wk-col').forEach(function (col) {{ col.classList.toggle('on', col.dataset.col === b.dataset.tab); }});
  }}); }});
  /* the customer journey lights up one step at a time while it is on screen */
  var steps = $$('#jr li'), k = -1, timer = null, rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function step() {{ k = (k + 1) % (steps.length + 2); steps.forEach(function (s, i) {{ s.classList.toggle('lit', i <= k && k < steps.length + 1); }}); }}
  if (rm) steps.forEach(function (s) {{ s.classList.add('lit'); }});
  else if ('IntersectionObserver' in window) new IntersectionObserver(function (es) {{ var on = es[es.length - 1].isIntersecting; if (on && !timer) {{ timer = setInterval(step, 900); step(); }} else if (!on && timer) {{ clearInterval(timer); timer = null; }} }}, {{ threshold: .4 }}).observe($('#jr'));
}})();
</script>'''

# ---------------- the consultation page ----------------
FAQ_CALL = [
 ('Is it really free?', 'Yes. The call and the written plan are free, and you are under no obligation to go ahead.'),
 ('Who will I speak to?', 'One of our team, the person who would plan your build. Not a call centre.'),
 ('Do I need to prepare anything?', 'No. A rough idea of the jobs that take up your week helps, and you can tick them on our services page first.'),
 ('Can I move or cancel the call?', 'Yes. Use the link in your confirmation email, any time before the call.'),
]
consult = f'''
<div id="stage"><div id="app" class="app">

  <!-- 1 · book the call -->
  <section class="snap hero sec s-book intro" id="top">
    <div class="heat" aria-hidden="true"><i class="h1"></i><i class="h2"></i><i class="h3"></i></div>
    {NAV}
    <div class="hero-main wrap mk-split wide">
      <div class="mk-c-copy">
        <span class="sec-k in"><i aria-hidden="true"></i>Free consultation</span>
        <h1 class="hero-h in d1">Book your free <em>30-minute call.</em></h1>
        <p class="lede in d2">Talk your business through with one of our team. Within two working days you get a written plan, yours to keep.</p>
        <ul class="ticks in d3">
          <li>{IC['tick']}<span><b>No obligation.</b> No hard sell, and no chasing afterwards.</span></li>
          <li>{IC['tick']}<span><b>A written plan.</b> The first three jobs to hand over, and the time each saves.</span></li>
          <li>{IC['tick']}<span><b>A fixed quote.</b> Agreed in writing before any work starts.</span></li>
        </ul>
      </div>
      <div class="card cal in d2" id="cal" data-at="pick"><div class="card-in">
        <div data-step="pick">
          <div class="cal-top"><span><b>Choose a time</b><small>30 minutes · by phone or video · UK time</small></span>
            <span class="cal-nav"><button type="button" id="cal-prev" aria-label="Earlier week">{IC['left']}</button><span id="cal-wk">This week</span><button type="button" id="cal-next" aria-label="Later week">{IC['right']}</button></span></div>
          <div class="cal-grid" id="cal-grid" aria-label="Free times this week"></div>
          <div class="cal-days" id="cal-days" role="tablist" aria-label="Days"></div>
          <div class="cal-list" id="cal-list" aria-label="Free times"></div>
          <div class="cal-foot"><span class="lg"><i aria-hidden="true"></i>Free time</span><span>Example times for this mockup</span></div>
        </div>
        <form class="cal-form" data-step="form" id="cal-form" data-live novalidate>
          <div class="cal-when"><span><b id="cal-pick">Tuesday 4 November, 2:30pm</b><small>30-minute call · UK time</small></span><button type="button" id="cal-change">Change</button></div>
          <div class="cal-f2">
            <label for="cf-n">Your name<input id="cf-n" autocomplete="name" required></label>
            <label for="cf-b">Business name<input id="cf-b" autocomplete="organization" required></label>
            <label for="cf-e">Email<input id="cf-e" type="email" autocomplete="email" required></label>
            <label for="cf-p">Phone<input id="cf-p" type="tel" autocomplete="tel" required></label>
          </div>
          <div class="cal-help"><span id="cf-hl">What would you like help with?</span><div class="crow" id="cf-jobs"></div></div>
          <button class="btn-create" type="submit">Book my free call {IC['arrow']}</button>
          <p class="cal-fine">You get a calendar invite now and a reminder the day before.</p>
        </form>
        <div class="cal-done" data-step="done" role="status">
          <i aria-hidden="true">{IC['tick']}</i>
          <b>You are booked in.</b>
          <p id="cal-done-t">We will call you on Tuesday 4 November at 2:30pm. The invite is in your inbox.</p>
        </div>
      </div></div>
    </div>
  </section>

  <!-- 2 · what happens on the call, and what you get -->
  <section class="snap sec s-call" id="what">
    <div class="heat" aria-hidden="true"><i class="h1"></i></div>
    <div class="wrap mk-split">
      <div>
        <span class="sec-k"><i aria-hidden="true"></i>What you get</span>
        <h2 class="sec-h">Half an hour, then <em>a plan to keep.</em></h2>
        <p class="sec-sub">Here is the kind of plan you get after your call. It is yours whether or not you go ahead.</p>
        <ol class="call-steps">
          <li><span class="n">1</span><span><b>We listen</b><span>How your week runs, what takes the longest and what you would rather not do.</span></span></li>
          <li><span class="n">2</span><span><b>We plan</b><span>Within two working days: the first three jobs to hand over, the time each saves, and a fixed quote.</span></span></li>
          <li><span class="n">3</span><span><b>You decide</b><span>Go ahead, wait, or use the plan yourself. No chasing, ever.</span></span></li>
        </ol>
      </div>
      {PLAN}
    </div>
  </section>

  <!-- 3 · questions and footer -->
  <section class="snap sec s-why sp-q" id="questions">
    <div class="heat" aria-hidden="true"><i class="h1"></i></div>
    <div class="why"><div class="wrap why-grid">
      <div class="q-head">
        <span class="sec-k"><i aria-hidden="true"></i>Questions</span>
        <h2 class="sec-h">Before you <em>book.</em></h2>
        <p class="sec-sub">Anything else, ask on the call.</p>
      </div>
      <div class="cta-row q-cta"><a class="btn-create" href="#top">Choose a time {IC['arrow']}</a><span class="note">Free · 30 minutes</span></div>
      <div class="faq">{faq(FAQ_CALL)}</div>
    </div></div>
    {FOOT}
  </section>
</div></div>
{FLAG}
<div class="toast" id="toast" role="status" hidden></div>
<script src="/site.js"></script>
<script>
(function () {{
  'use strict';
  var $ = function (s, el) {{ return (el || document).querySelector(s); }};
  var $$ = function (s, el) {{ return Array.prototype.slice.call((el || document).querySelectorAll(s)); }};
  var cal = $('#cal'), grid = $('#cal-grid'), days = $('#cal-days'), list = $('#cal-list');
  var TICK = {json.dumps(IC['tick'])}, PLUS = {json.dumps(IC['plus'])}, TK = {json.dumps(IC['tk'])};
  /* MOCKUP ONLY: example free times, staggered through each day. The real build reads them from your own calendar. */
  var PATTERN = [
    [[9, 30], [13, 15], [16, 45]], [[10, 0], [14, 30]], [[8, 45], [11, 30], [15, 15]], [[12, 0], [16, 30]], [[9, 15], [11, 45]],
    [[10, 30], [15, 45]], [[9, 0], [12, 15], [16, 0]], [[11, 0], [14, 45]], [[9, 45], [13, 30], [16, 15]], [[10, 15]]
  ];
  var START = 8.5 * 60, SPAN = 9 * 60; /* 8:30am to 5:30pm */
  function fmt(h, m) {{ var ap = h >= 12 ? 'pm' : 'am', hh = h % 12 || 12; return hh + (m ? ':' + (m < 10 ? '0' : '') + m : '') + ap; }}
  var DN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /* the next ten working days from tomorrow */
  var all = [], d = new Date(); d.setHours(12, 0, 0, 0);
  while (all.length < 10) {{ d.setDate(d.getDate() + 1); if (d.getDay() > 0 && d.getDay() < 6) all.push(new Date(d)); }}
  var wk = 0, day = 0, picked = null;
  function slotsFor(i) {{ return PATTERN[i].map(function (t) {{ return {{ h: t[0], m: t[1], day: all[i] }}; }}); }}
  function label(s) {{ return DN[s.day.getDay()] + ' ' + s.day.getDate() + ' ' + MN[s.day.getMonth()] + ', ' + fmt(s.h, s.m); }}
  function slotBtn(s, abs) {{
    var b = document.createElement('button'); b.type = 'button'; b.className = 'slot'; b.textContent = fmt(s.h, s.m);
    b.setAttribute('aria-label', label(s)); b.setAttribute('aria-pressed', 'false');
    if (abs) b.style.top = 'calc(' + (((s.h * 60 + s.m) - START) / SPAN * 100) + '% - 17px)';
    b.addEventListener('click', function () {{ choose(s); }}); return b;
  }}
  function render() {{
    var idx = [0, 1, 2, 3, 4].map(function (n) {{ return wk * 5 + n; }});
    $('#cal-wk').textContent = wk ? 'Next week' : 'This week';
    $('#cal-prev').disabled = wk === 0; $('#cal-next').disabled = wk === 1;
    grid.innerHTML = '<div></div>' + idx.map(function (i) {{ var x = all[i]; return '<div class="cal-dh"><b>' + DN[x.getDay()].slice(0, 3) + '</b><span>' + x.getDate() + '</span><small>' + PATTERN[i].length + ' free</small></div>'; }}).join('');
    var times = document.createElement('div'); times.className = 'cal-times';
    [9, 11, 13, 15, 17].forEach(function (h) {{ var t = document.createElement('span'); t.textContent = fmt(h, 0); t.style.top = (((h * 60) - START) / SPAN * 100) + '%'; times.appendChild(t); }});
    grid.appendChild(times);
    idx.forEach(function (i) {{ var col = document.createElement('div'); col.className = 'cal-col'; slotsFor(i).forEach(function (s) {{ col.appendChild(slotBtn(s, true)); }}); grid.appendChild(col); }});
    days.innerHTML = '';
    idx.forEach(function (i, n) {{ var x = all[i], b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(n === day));
      b.innerHTML = DN[x.getDay()].slice(0, 3) + '<b>' + x.getDate() + '</b><small>' + PATTERN[i].length + ' free</small>';
      b.addEventListener('click', function () {{ day = n; render(); }}); days.appendChild(b); }});
    list.innerHTML = ''; slotsFor(idx[day]).forEach(function (s) {{ list.appendChild(slotBtn(s, false)); }});
  }}
  $('#cal-prev').addEventListener('click', function () {{ wk = 0; day = 0; render(); }});
  $('#cal-next').addEventListener('click', function () {{ wk = 1; day = 0; render(); }});
  /* step 2: the jobs ticked on the services page come along, or pick an area here */
  var jobs = []; try {{ jobs = JSON.parse(sessionStorage.getItem('cy_jobs') || '[]'); }} catch (e) {{}}
  var opts = jobs.length ? jobs : ['Get found', 'Win work', 'Keep customers', 'Run the business'];
  $('#cf-hl').textContent = jobs.length ? 'The jobs you ticked' : 'What would you like help with?';
  $('#cf-jobs').innerHTML = opts.map(function (t) {{ return '<button type="button" class="ch" role="checkbox" aria-checked="' + (jobs.length ? 'true' : 'false') + '"><span class="ch-ic" aria-hidden="true">' + PLUS + TK + '</span><span class="ch-t">' + t.replace(/</g, '&lt;') + '</span></button>'; }}).join('');
  $$('#cf-jobs .ch').forEach(function (c) {{ c.addEventListener('click', function () {{ c.setAttribute('aria-checked', String(c.getAttribute('aria-checked') !== 'true')); }}); }});
  function choose(s) {{ picked = s; $('#cal-pick').textContent = label(s); cal.setAttribute('data-at', 'form'); setTimeout(function () {{ $('#cf-n').focus(); }}, 50); }}
  $('#cal-change').addEventListener('click', function () {{ cal.setAttribute('data-at', 'pick'); }});
  $('#cal-form').addEventListener('submit', function (e) {{
    e.preventDefault(); var f = e.target, bad = $$('input', f).filter(function (i) {{ return !i.checkValidity(); }});
    if (bad.length) {{ bad[0].focus(); if (window.cayenneToast) cayenneToast('Please fill in ' + bad[0].parentNode.firstChild.textContent.trim().toLowerCase()); return; }}
    $('#cal-done-t').textContent = 'We will call you on ' + label(picked).replace(',', ' at') + '. The invite is in your inbox.';
    cal.setAttribute('data-at', 'done'); if (window.cayenneToast) cayenneToast('Mockup: nothing was booked');
  }});
  render();
}})();
</script>'''

# ---------------- the home page: new services and consultation sections ----------------
home = open('src/html/index.body.html', encoding='utf-8').read()
a = home.index('  function auditHTML() {'); b = home.index('  function faqHTML() {')
new_fns = r'''  function auditHTML() {
    /* the free consultation, with the next free call times (mockup: example times) */
    var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var T = [['9:30am', '1:15pm', '4:45pm'], ['10am', '2:30pm'], ['8:45am', '11:30am', '3:15pm']], rows = [], d = new Date();
    while (rows.length < 3) { d.setDate(d.getDate() + 1); if (d.getDay() > 0 && d.getDay() < 6) rows.push('<li><b>' + DN[d.getDay()] + ' ' + d.getDate() + '<small>' + MN[d.getMonth()] + '</small></b><span class="nx-s">' + T[rows.length].map(function (t) { return '<a href="/mockup-consultation">' + t + '</a>'; }).join('') + '</span></li>'); }
    return '<section class="snap sec s-audit" id="audit"><div class="heat" aria-hidden="true"><i class="h1"></i></div><div class="wrap split">' +
      '<div><span class="sec-k"><i aria-hidden="true"></i>Free consultation</span>' +
      '<h2 class="sec-h">Not sure where to start? <em>Talk it through.</em></h2>' +
      '<p class="sec-sub">A free 30-minute call with one of our team. Afterwards you get a written plan, yours to keep.</p>' +
      '<ul class="ticks"><li>' + IC.check + '<span><b>No obligation.</b> No hard sell, and no chasing afterwards.</span></li><li>' + IC.check + '<span><b>A written plan.</b> The first three jobs to hand over, and the time each saves.</span></li><li>' + IC.check + '<span><b>A fixed quote.</b> Agreed in writing before any work starts.</span></li></ul>' +
      '<div class="cta-row"><a class="btn-create" href="/mockup-consultation">Book a free consultation ' + IC.arrow + '</a><span class="note">Free · 30 minutes</span></div></div>' +
      '<div class="report nx reveal" aria-label="Next free call times"><div class="rp-top"><span class="rp-k"><i aria-hidden="true"></i>Next free calls</span><span class="rp-ex">UK time</span></div>' +
      '<ul class="nx-l">' + rows.join('') + '</ul><a class="nx-more" href="/mockup-consultation">See the whole week ' + IC.arrow + '</a></div></div></section>';
  }
  function servicesHTML() {
    var sv = [
      ['globe', 'Get found', 'More of the right people find you.', ['Google profile and posts', 'Review requests', 'Website and SEO']],
      ['bolt', 'Win work', 'More enquiries turn into jobs.', ['Instant replies', 'Quotes and follow-ups', 'Finding new customers']],
      ['train', 'Keep customers', 'They come back and send friends.', ['Bookings and reminders', 'Aftercare messages', 'Answers to common questions']],
      ['tool', 'Run the business', 'Less admin, paid faster.', ['Invoices and chasing', 'Data entry', 'Reports and rotas']]
    ];
    return '<section class="snap sec s-serv" id="services"><div class="heat" aria-hidden="true"><i class="h1"></i></div><div class="wrap center">' +
      '<span class="sec-k"><i aria-hidden="true"></i>What we build</span>' +
      '<h2 class="sec-h">One system for <em>the whole business.</em></h2>' +
      '<p class="sec-sub">Every Cayenne build is bespoke. It can take care of any of these, depending on what your business needs.</p>' +
      '<div class="serv">' + sv.map(function (s) { return '<div class="sv"><span class="sv-ic">' + IC[s[0]] + '</span><b>' + s[1] + '</b><p>' + s[2] + '</p><ul>' + s[3].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>'; }).join('') + '</div>' +
      '<div class="cta-row"><a class="btn-primary" href="/mockup-services">See how it works ' + IC.arrow + '</a></div></div></section>';
  }
'''
home = home[:a] + new_fns + home[b:]
home = home.replace('heroHTML() + courseHTML() + auditHTML() + servicesHTML() + faqHTML()', 'heroHTML() + courseHTML() + servicesHTML() + auditHTML() + faqHTML()')
home = home.replace('<a href="/audit">Free AI audit</a>', '<a href="/mockup-consultation">Free consultation</a>').replace('<a href="/audit">Free AI audit<span', '<a href="/mockup-consultation">Free consultation<span')
home = home.replace('<li><a href="/audit">Free AI audit</a></li>', '<li><a href="/mockup-consultation">Free consultation</a></li>').replace('href="/services"', 'href="/mockup-services"')
home = home.replace('<a href="/audit">Get a free AI audit</a>', '<a href="/mockup-consultation">Book a free consultation</a>').replace('<a class="btn-ghost" href="/audit">Get a free AI audit</a>', '<a class="btn-ghost" href="/mockup-consultation">Book a free consultation</a>')
home = home.replace('<div class="toast" id="toast"', FLAG + '\n<div class="toast" id="toast"', 1)
open('src/html/mockup-services.body.html', 'w', encoding='utf-8').write(services)
open('src/html/mockup-consultation.body.html', 'w', encoding='utf-8').write(consult)
open('src/html/mockup-home.body.html', 'w', encoding='utf-8').write(home)
print('audit left in home:', len(re.findall(r'/audit\b', home)), '| em dashes:', sum(x.count('—') + x.count('–') for x in (services, consult)))
