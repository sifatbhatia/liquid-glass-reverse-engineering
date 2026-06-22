/**
 * Lenis smooth scroll for index demo. Respects prefers-reduced-motion.
 */
(() => {
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {HTMLElement} content
   * @param {(scrollY: number) => void} onScroll
   */
  function initLenisScroll(wrapper, content, onScroll) {
    if (prefersReducedMotion() || typeof Lenis === 'undefined') {
      wrapper.classList.remove('lenis');
      return null;
    }

    wrapper.classList.add('lenis');

    const lenis = new Lenis({
      wrapper,
      content,
      lerp: 0.09,
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.15,
    });

    lenis.on('scroll', () => {
      onScroll?.(lenis.scroll);
    });

    let rafId = 0;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return {
      instance: lenis,
      getScrollY: () => lenis.scroll,
      scrollTo(target, opts = {}) {
        if (typeof target === 'number') {
          lenis.scrollTo(target, opts);
          return;
        }
        if (target instanceof Element) {
          lenis.scrollTo(target, {
            offset: opts.offset ?? 0,
            duration: opts.duration ?? 1.15,
            ...opts,
          });
        }
      },
      destroy() {
        cancelAnimationFrame(rafId);
        lenis.destroy();
        wrapper.classList.remove('lenis');
      },
    };
  }

  window.initLenisScroll = initLenisScroll;
})();
