/* Cayenne: shared behaviour for every page beyond the home page.
   The nav, the phone menu, the sticky course bar,
   one-time reveals, the AI pill, rounded question rows and prototype-only links. */
(function () {
  'use strict';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var here = document.body.getAttribute('data-page') || location.pathname.split('/').pop() || 'index.html';
  if (here.indexOf('.') < 0) here = (here || 'index') + '.html';

  /* ---------- nav: mark the current page, phone menu ---------- */
  $$('.links a, .foot a').forEach(function (a) { if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page'); });
  $$('.nav').forEach(function (nav) {
    var btn = $('.menu', nav); if (!btn) return;
    var panel = document.createElement('div'); panel.className = 'mnav'; panel.hidden = true;
    panel.innerHTML = $$('.links a', nav).map(function (a) { return '<a href="' + a.getAttribute('href') + '"' + (a.getAttribute('href') === here ? ' aria-current="page"' : '') + '>' + a.textContent + '<span aria-hidden="true">→</span></a>'; }).join('') +
      '<a href="signin.html">Sign in<span aria-hidden="true">→</span></a><a class="btn-create" href="index.html#top">Start the free course</a>';
    nav.style.position = 'relative'; nav.appendChild(panel);
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function (e) { e.stopPropagation(); panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); });
    document.addEventListener('click', function (e) { if (!panel.hidden && !e.target.closest('.mnav')) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  });

  /* ---------- toast for links that are not built yet ---------- */
  var toastEl = $('#toast');
  function toast(t) { if (!toastEl) return; toastEl.textContent = String(t).replace(/^Prototype:\s*/, ''); toastEl.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, 2600); }
  window.cayenneToast = toast;
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-soon]'); if (!a) return;
    e.preventDefault(); toast(a.getAttribute('data-soon') || 'Coming soon');
  });

  /* ---------- sticky course bar: shows only on sections marked data-sticky ---------- */
  var sticky = $('#sticky');
  function stickyCheck() {
    if (!sticky) return;
    var mid = window.innerHeight * 0.5, on = false;
    $$('.snap').forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid && el.hasAttribute('data-sticky')) on = true; });
    sticky.classList.toggle('show', on);
    if (on) sticky.removeAttribute('inert'); else sticky.setAttribute('inert', '');
  }
  window.addEventListener('scroll', function () { if (!stickyCheck.f) { stickyCheck.f = true; requestAnimationFrame(function () { stickyCheck.f = false; stickyCheck(); }); } }, { passive: true });
  stickyCheck();

  /* ---------- decorative fills play once when their screen comes into view; text is never hidden ---------- */
  if ('IntersectionObserver' in window && !RM) {
    var vh = window.innerHeight;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.remove('armed'); io.unobserve(e.target); } });
    }, { threshold: 0.35 });
    $$('.reveal').forEach(function (el) {
      var host = el.closest('.sec') || el;
      if (host.getBoundingClientRect().top > vh * 0.9) { host.classList.add('armed'); io.observe(host); }
    });
  }

  /* ---------- rounded question rows: one open at a time ---------- */
  $$('.faq').forEach(function (f) {
    f.addEventListener('toggle', function (e) {
      if (!e.target.open) return;
      $$('details', f).forEach(function (d) { if (d !== e.target) d.open = false; });
    }, true);
  });

  /* ---------- the AI pill (same as the home page): "Learn" stays, the tool swipes every 1.9 s ---------- */
  $$('.rot-track').forEach(function (track) {
    var items = track.children; if (RM || items.length < 2) return;
    var i = 0, hover = false, seen = true, held = false, pill = track.closest('.pill');
    if (pill) {
      pill.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hover = true; });
      pill.addEventListener('pointerleave', function () { hover = false; });
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { seen = es[es.length - 1].isIntersecting; }).observe(pill);
    }
    function tick() {
      if (document.hidden || !seen || hover) { held = true; setTimeout(tick, 400); return; }
      if (held) { held = false; setTimeout(tick, 900); return; }
      var cur = items[i]; i = (i + 1) % items.length; var nx = items[i];
      cur.classList.remove('on'); cur.classList.add('out'); nx.classList.remove('out'); nx.classList.add('on');
      setTimeout(function () { cur.classList.remove('out'); }, 800);
      setTimeout(tick, 1900);
    }
    setTimeout(tick, 2600);
  });

  /* ---------- prototype: forms never send anything ---------- */
  document.addEventListener('submit', function (e) {
    var f = e.target; if (f.hasAttribute('data-live')) return;
    e.preventDefault(); toast(f.getAttribute('data-done') || 'Thanks, we have got it');
  });
})();
