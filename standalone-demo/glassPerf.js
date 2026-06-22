/**
 * Shared Safari perf helpers for liquid glass demos.
 * Scroll-coalesced scheduling, mirror DPR cap, band compositor, optional stats.
 */
(() => {
  const MIRROR_DPR_MAX = 1.25;
  const AUTO_TINT_MIN_MS = 120;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function prefersReducedMotion() {
    return reducedMotionQuery.matches;
  }

  function createScrollScheduler(onFrame, scrollEl) {
    let rafId = 0;
    let dirty = true;
    let running = false;
    const root = scrollEl || document.getElementById('scrollRoot') || document.scrollingElement;

    function frame() {
      rafId = 0;
      if (!dirty) {
        running = false;
        return;
      }
      dirty = false;
      onFrame();
      if (dirty) {
        rafId = requestAnimationFrame(frame);
      } else {
        running = false;
      }
    }

    function markDirty() {
      dirty = true;
      if (!rafId) {
        running = true;
        rafId = requestAnimationFrame(frame);
      }
    }

    function forceFrame() {
      dirty = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(frame);
    }

    root?.addEventListener('scroll', markDirty, { passive: true });
    window.addEventListener('resize', markDirty, { passive: true });

    return { markDirty, forceFrame, isRunning: () => running };
  }

  function mirrorDpr() {
    return Math.min(window.devicePixelRatio || 1, MIRROR_DPR_MAX);
  }

  function bandIntersects(rect, bandTop, bandBottom) {
    return rect.y + rect.h > bandTop && rect.y < bandBottom;
  }

  /** Gradient + waves for a horizontal strip (scene Y = bandTop at local y=0). */
  function paintBandBackground(ctx, bw, bh, bandTop, pageW) {
    const h = Math.max(bh, 1);
    const pageH = Math.max(bh * 40, 5200);
    const bg = ctx.createLinearGradient(0, 0, 0, bh);
    const y0 = bandTop / pageH;
    const y1 = (bandTop + bh) / pageH;
    bg.addColorStop(0, lerpColor('#070810', '#101524', y0 / 0.35));
    bg.addColorStop(0.5, lerpColor('#101524', '#0a0f17', (y0 + y1) * 0.5));
    bg.addColorStop(1, lerpColor('#0a0f17', '#050609', y1));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, bw, bh);

    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    const waveStart = Math.floor(bandTop / 48) * 48;
    for (let gy = waveStart; gy < bandTop + bh; gy += 48) {
      const ly = gy - bandTop;
      ctx.beginPath();
      ctx.moveTo(0, ly);
      for (let x = 0; x <= pageW; x += 72) {
        ctx.lineTo(x, ly + Math.sin(x * 0.008 + gy * 0.004) * 10);
      }
      ctx.stroke();
    }
  }

  function lerpColor(a, b, t) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const pa = hexRgb(a);
    const pb = hexRgb(b);
    const u = Math.max(0, Math.min(1, t));
    const r = clamp(pa.r + (pb.r - pa.r) * u);
    const g = clamp(pa.g + (pb.g - pa.g) * u);
    const bl = clamp(pa.b + (pb.b - pa.b) * u);
    return `rgb(${r},${g},${bl})`;
  }

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function createAutoTintThrottler(minMs = AUTO_TINT_MIN_MS) {
    let lastAt = 0;
    let pending = null;

    return function run(fn) {
      const now = performance.now();
      const elapsed = now - lastAt;
      if (elapsed >= minMs) {
        lastAt = now;
        pending = null;
        fn();
        return;
      }
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        lastAt = performance.now();
        fn();
      }, minMs - elapsed);
    };
  }

  function createPerfMonitor(enabled) {
    if (!enabled) {
      return { frameStart: () => {}, frameEnd: () => {}, paintMirror: () => {}, filterApply: () => {} };
    }

    const el = document.createElement('div');
    el.className = 'glassPerfHud';
    el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:200;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.72);color:#8f8;font:11px/1.4 ui-monospace,monospace;pointer-events:none';
    document.body.appendChild(el);

    let frames = 0;
    let msSum = 0;
    let mirrorPaints = 0;
    let filterApplies = 0;
    let t0 = 0;

    setInterval(() => {
      const avg = frames ? (msSum / frames).toFixed(2) : '0';
      el.textContent = `avg ${avg}ms | mirror ${mirrorPaints}/s | filter ${filterApplies}/s`;
      frames = 0;
      msSum = 0;
      mirrorPaints = 0;
      filterApplies = 0;
    }, 1000);

    return {
      frameStart() { t0 = performance.now(); },
      frameEnd() {
        msSum += performance.now() - t0;
        frames += 1;
      },
      paintMirror() { mirrorPaints += 1; },
      filterApply() { filterApplies += 1; },
    };
  }

  /**
   * Mirror repaint into a pre-composed band canvas (small) instead of full scene.
   */
  function repaintMirrorFromBand({
    mirrorCanvas,
    mirrorCtx,
    bandCanvas,
    navW,
    navH,
    padL,
    padR,
    dpr = mirrorDpr(),
  }) {
    const bitmapW = padL + navW + padR;
    const outW = Math.max(1, Math.round(bitmapW * dpr));
    const outH = Math.max(1, Math.round(navH * dpr));

    if (mirrorCanvas.width !== outW || mirrorCanvas.height !== outH) {
      mirrorCanvas.width = outW;
      mirrorCanvas.height = outH;
    }

    mirrorCanvas.style.width = `${bitmapW}px`;
    mirrorCanvas.style.height = `${navH}px`;
    mirrorCanvas.style.left = padL > 0 ? `${-padL}px` : '0';

    mirrorCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mirrorCtx.fillStyle = '#070810';
    mirrorCtx.fillRect(0, 0, bitmapW, navH);
    mirrorCtx.drawImage(bandCanvas, 0, 0, bitmapW, navH, 0, 0, bitmapW, navH);
  }

  window.GLASS_MIRROR_DPR_MAX = MIRROR_DPR_MAX;
  window.glassPrefersReducedMotion = prefersReducedMotion;
  window.createGlassScrollScheduler = createScrollScheduler;
  window.glassMirrorDpr = mirrorDpr;
  window.glassBandIntersects = bandIntersects;
  window.glassPaintBandBackground = paintBandBackground;
  window.createGlassAutoTintThrottler = createAutoTintThrottler;
  window.createGlassPerfMonitor = createPerfMonitor;
  window.glassRepaintMirrorFromBand = repaintMirrorFromBand;
})();
