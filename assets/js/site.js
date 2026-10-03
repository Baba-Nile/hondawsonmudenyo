/* Sauti Ya Kwanza - shared page behaviour (nav, scroll reveal). No dependencies. */
(function () {
  var toggle = document.querySelector('.nav__toggle');
  var panel = document.getElementById('nav-panel');
  if (toggle && panel) {
    var set = function (open) {
      panel.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', function () { set(!panel.classList.contains('is-open')); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) { set(false); toggle.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('is-open') && !panel.contains(e.target) && !toggle.contains(e.target)) set(false);
    });
    window.matchMedia('(min-width:1024px)').addEventListener('change', function () { set(false); });
  }
  var items = document.querySelectorAll('.rv');
  if (!('IntersectionObserver' in window)) { items.forEach(function (n) { n.classList.add('is-in'); }); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach(function (n) { io.observe(n); });
})();

/* Figures count up once when they scroll into view. The final value is already in the HTML,
   so nothing depends on this running (no JS, reduced motion, or no IntersectionObserver). */
(function () {
  var nums = document.querySelectorAll('[data-count]');
  if (!nums.length || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var fmt = function (n) { return n.toLocaleString('en-US'); };
  var run = function (el) {
    var end = parseInt(el.getAttribute('data-count'), 10), final = el.textContent, t0 = null, dur = 1100;
    var tick = function (t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? fmt(Math.round(end * e)) : final;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
  }, { threshold: .6 });
  nums.forEach(function (n) { io.observe(n); });
})();

/* Sticky programme nav: mark the link whose section is in view. */
(function () {
  var links = [].slice.call(document.querySelectorAll('.subnav a[href^="#"]'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  var map = {};
  links.forEach(function (a) { var t = document.getElementById(a.getAttribute('href').slice(1)); if (t) map[t.id] = a; });
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
      var a = map[e.target.id]; if (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'true');
        var bar = a.parentNode.parentNode; if (bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: a.offsetLeft - 24, behavior: 'smooth' }); }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
})();
