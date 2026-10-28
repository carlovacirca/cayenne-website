/* Motion layer: tags each scroll stop with its own entrance, staggers its pieces, and lets one visual per screen float.
   Content is only ever hidden after this script has run and the browser can tell when it comes into view. */
(function () {
  'use strict';
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var ENTRANCES = ['rise', 'slide', 'scale', 'blur', 'tilt', 'wipe'];
  var FLOAT_PICK = '[data-float], .hv-float, .report, .hv, .rp-card, .cert, .cert-card, .wcard, .ex-card, .sv, .way';
  var SKIP = 'input, textarea, select, .card, .chips';

  /* the pieces of a stop: the content blocks inside its main wrapper, opening up one level for two-column layouts */
  function pieces(stop) {
    var wrap = stop.querySelector(':scope > .wrap, :scope > div > .wrap, :scope > .why > .wrap') || stop.querySelector('.wrap');
    if (!wrap) return [];
    var out = [];
    Array.prototype.forEach.call(wrap.children, function (el) {
      if (el.tagName === 'FOOTER' || el.classList.contains('heat')) return;
      var cs = getComputedStyle(el), kids = el.children;
      var split = (cs.display === 'grid' || (cs.display === 'flex' && cs.flexDirection === 'row')) && kids.length >= 2 && kids.length <= 4 && el.offsetHeight > 160;
      if (split) Array.prototype.forEach.call(kids, function (k, j) { if (j > 0) k.classList.add('m-r'); out.push(k); });
      else out.push(el);
    });
    /* a text column usually holds an eyebrow, a headline, a line and a button: give each its own beat */
    var flat = [];
    out.forEach(function (el) {
      var parts = el.children.length && el.children.length <= 6 && !el.matches('.report, .card, .wcard, ul, ol, .faq, .serv, .path') && el.querySelector(':scope > .sec-h, :scope > h1, :scope > h2');
      if (parts) Array.prototype.forEach.call(el.children, function (k) { flat.push(k); }); else flat.push(el);
    });
    return flat;
  }

  var stops = $$('.snap');
  root.classList.add('mo');
  stops.forEach(function (stop, n) {
    if (n === 0) return; /* the first screen has its own intro */
    stop.setAttribute('data-enter', stop.getAttribute('data-enter') || ENTRANCES[(n - 1) % ENTRANCES.length]);
    pieces(stop).forEach(function (el, i) { el.classList.add('m-i'); el.style.setProperty('--i', String(Math.min(i, 8))); });
  });

  /* stops that are already on screen when the page opens show at once */
  var vh = window.innerHeight;
  stops.forEach(function (s) { var r = s.getBoundingClientRect(); if (r.top < vh * 0.85 && r.bottom > 0) s.classList.add('on'); });

  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var s = e.target;
      if (e.isIntersecting) {
        if (!s.classList.contains('on')) {
          s.classList.add('on');
          /* once it has arrived, hand the pieces back so their own hover effects feel normal again */
          setTimeout(function () { $$('.m-i', s).forEach(function (el) { el.classList.remove('m-i', 'm-r'); el.style.removeProperty('--i'); }); startFloat(s); }, 1500);
        }
        $$('.floaty', s).forEach(function (f) { f.classList.remove('f-hold'); });
      } else {
        $$('.floaty', s).forEach(function (f) { f.classList.add('f-hold'); });
      }
    });
  }, { threshold: 0.22 });
  stops.forEach(function (s) { io.observe(s); });

  /* one floating visual per stop: a card or chip with no form controls and no animation of its own */
  function startFloat(stop) {
    if (stop.__floated) return; stop.__floated = true;
    var pick = $$(FLOAT_PICK, stop).filter(function (el) {
      if (el.closest('footer, .faq, .card, .sticky')) return false;
      if (el.querySelector(SKIP) || el.matches(SKIP)) return false;
      if (getComputedStyle(el).animationName !== 'none') return false;
      var r = el.getBoundingClientRect(); return r.width > 40 && r.height > 30 && r.width < window.innerWidth * 0.8;
    })[0];
    if (pick) { pick.classList.add('floaty'); if (stop.dataset.enter === 'tilt' || stop.dataset.enter === 'wipe') pick.classList.add('f-alt'); }
  }
  stops.forEach(function (s, n) { if (n === 0) setTimeout(function () { startFloat(s); }, 1800); else if (s.classList.contains('on')) setTimeout(function () { startFloat(s); }, 1600); });

  /* pages without scroll stops: their main blocks rise in once */
  if (!stops.length) {
    var blocks = $$('.read > *, main > section, .app > section, .app > div > section').filter(function (el) { return el.getBoundingClientRect().top > vh * 0.8; });
    var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('on'); io2.unobserve(e.target); } }); }, { threshold: 0.12 });
    blocks.forEach(function (b) { b.classList.add('m-b'); io2.observe(b); });
  }

  /* hold the floats still while someone types or picks options */
  document.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches('input, textarea, select')) root.classList.add('typing'); });
  document.addEventListener('focusout', function () { root.classList.remove('typing'); });
})();
