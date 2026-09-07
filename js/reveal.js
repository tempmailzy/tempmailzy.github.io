/* =========================================================
   Mailzy — scroll-reveal
   Purely decorative: fades/slides feature cards and legal-page
   sections into view as they enter the viewport. Generic by
   design — targets existing class names, no per-page markup
   needed, so it works unchanged on every page that includes it.

   Fails safe: if IntersectionObserver isn't available, or this
   script doesn't run at all, content is fully visible by default
   (see css/styles.css — the fade-out state only applies once
   .js-reveal-ready is present on <html>, added below).
   ========================================================= */
(function () {
  'use strict';

  const targets = document.querySelectorAll('.feature-card, .legal-page section');
  if (!targets.length) return;

  document.documentElement.classList.add('js-reveal-ready');

  targets.forEach((el, i) => {
    el.classList.add('reveal-target');
    // A light stagger, capped so a long legal page doesn't end up
    // with a multi-second tail of delayed sections.
    el.style.transitionDelay = `${Math.min(i, 6) * 60}ms`;
  });

  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach((el) => observer.observe(el));
})();
