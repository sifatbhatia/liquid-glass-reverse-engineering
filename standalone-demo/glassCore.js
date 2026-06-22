/**
 * Single glass stack shared by index navbar + gallery components.
 * Same DOM shell (.glassNav / .navRefract / .navTopcoat / .navContent),
 * same LENS/TINT, same mirror + SVG filter pipeline as main.js.
 */
(() => {
  const BASE_LENS = {
    glassThickness: 18,
    curvature: 48,
    scale: 1.06,
    splay: 1.08,
    bezelWidthRatio: 0.93,
    edgeEmphasis: 0.28,
    chroma: 0.025,
    seamStrength: 0.28,
    portalStrength: 0.35,
    blur: 0.4,
    glow: 0.04,
    edgeHighlight: 0,
    specularAngle: -38,
    specularOpacity: 0.28,
  };

  const BASE_TINT = {
    tintEnabled: true,
    autoEnabled: true,
    tint: 0.26,
    milkiness: 0,
    density: 0.12,
    autoStrength: 0.85,
  };

  const MAP_PARAMS = new Set([
    'glassThickness',
    'splay',
    'bezelWidthRatio',
    'edgeEmphasis',
    'specularAngle',
    'seamStrength',
    'portalStrength',
  ]);

  const quantize = (v, step) => Math.round(v / step) * step;

  function mountShell(host, contentHtml) {
    host.classList.add('glassNav');
    host.innerHTML = `
      <div class="navRefract"></div>
      <div class="navTopcoat" aria-hidden="true"></div>
      <div class="navContent"></div>
    `;
    const refract = host.querySelector('.navRefract');
    const topcoat = host.querySelector('.navTopcoat');
    const content = host.querySelector('.navContent');
    const mirrorCanvas = document.createElement('canvas');
    mirrorCanvas.setAttribute('aria-hidden', 'true');
    refract.appendChild(mirrorCanvas);
    if (contentHtml) content.innerHTML = contentHtml;
    return {
      refract,
      topcoat,
      content,
      mirrorCanvas,
      mirrorCtx: mirrorCanvas.getContext('2d', { alpha: false }),
    };
  }

  /**
   * @param {{
   *   id: string,
   *   host: HTMLElement,
   *   sceneCanvas: HTMLCanvasElement,
   *   scrollRoot: HTMLElement,
   *   lens?: typeof BASE_LENS,
   *   tint?: typeof BASE_TINT,
   *   autoTint?: ReturnType<typeof createAutoTintController> | null,
   *   fixed?: boolean,
   *   borderRadius?: number,
   *   contentHtml?: string,
   *   lumBucket?: number,
   * }} config
   */
  function createGlassNav(config) {
    const id = config.id;
    const host = config.host;
    const sceneCanvas = config.sceneCanvas;
    const scrollRoot = config.scrollRoot;
    const lens = config.lens ?? BASE_LENS;
    const tint = config.tint ?? BASE_TINT;
    const autoTint = config.autoTint ?? null;
    const fixed = config.fixed ?? false;
    const borderRadius = config.borderRadius;
    const lumBucket = config.lumBucket ?? 24;

    const parts = mountShell(host, config.contentHtml);

    let cachedMap = null;
    let cachedSpecularMaps = null;
    let lastLensKey = '';
    let lastFilterKey = '';
    let lastMirrorKey = '';

    function lensMapKey(w, h) {
      return [
        Math.round(w),
        Math.round(h),
        borderRadius ?? h / 2,
        lens.glassThickness,
        lens.splay,
        lens.bezelWidthRatio,
        lens.edgeEmphasis,
        lens.specularAngle,
        lens.seamStrength,
        lens.portalStrength,
      ].join('|');
    }

    function lensConfig(w, h) {
      return {
        width: Math.round(w),
        height: Math.round(h),
        borderRadius: borderRadius ?? h / 2,
        glassThickness: lens.glassThickness,
        curvature: lens.curvature,
        splay: lens.splay,
        bezelWidthRatio: lens.bezelWidthRatio,
        edgeEmphasis: lens.edgeEmphasis,
        specularAngle: lens.specularAngle,
        seamStrength: lens.seamStrength,
        portalStrength: lens.portalStrength,
      };
    }

    function tintMaterial() {
      if (!tint.tintEnabled) return { tint: 0, milkiness: 0 };
      if (tint.autoEnabled && autoTint) {
        return autoTint.material(id, tint.tint);
      }
      return { tint: tint.tint, milkiness: tint.milkiness };
    }

    function autoLumBucket() {
      if (!tint.autoEnabled || !autoTint) return -1;
      return Math.round(autoTint.getLum(id) / lumBucket) * lumBucket;
    }

    function filterOptions() {
      const { tint: t, milkiness } = tintMaterial();
      return {
        scale: lens.scale,
        chroma: lens.chroma,
        blur: lens.blur,
        glow: lens.glow,
        edgeHighlight: lens.edgeHighlight,
        specularOpacity: lens.specularOpacity,
        tintEnabled: tint.tintEnabled,
        tint: quantize(t, 0.02),
        milkiness: quantize(milkiness, 0.02),
        density: tint.tintEnabled ? tint.density : 0,
        reducedMotion: window.glassPrefersReducedMotion?.() ?? false,
      };
    }

    function filterKey(w, h) {
      const opts = filterOptions();
      return [
        lensMapKey(w, h),
        opts.scale,
        opts.chroma,
        opts.blur,
        opts.glow,
        opts.edgeHighlight,
        opts.specularOpacity,
        opts.tintEnabled,
        opts.tint,
        opts.milkiness,
        opts.density,
        autoLumBucket(),
      ].join('|');
    }

    function rebuildMaps(w, h) {
      const key = lensMapKey(w, h);
      if (key === lastLensKey && cachedMap && cachedSpecularMaps) return false;
      lastLensKey = key;
      cachedMap = window.generateLensMap(lensConfig(w, h));
      cachedSpecularMaps = window.generateSpecularMap(lensConfig(w, h));
      lastFilterKey = '';
      return true;
    }

    function mirrorKey(scrollY, rect) {
      return [
        Math.round(scrollY),
        Math.round(rect.left * 10),
        Math.round(rect.top * 10),
        Math.round(rect.width * 10),
        Math.round(rect.height * 10),
        scrollRoot.clientWidth,
        sceneCanvas.width,
        fixed ? 1 : 0,
      ].join('|');
    }

    function applyFilter(w, h) {
      if (!cachedMap || !window.applyGlassFilter) return;
      const key = filterKey(w, h);
      if (key === lastFilterKey) return;
      lastFilterKey = key;
      window.applyGlassFilter(parts.mirrorCanvas, cachedMap, cachedSpecularMaps, filterOptions());
    }

    function repaintMirror(scrollY, rect, w, h) {
      const key = mirrorKey(scrollY, rect);
      if (key === lastMirrorKey) return false;
      lastMirrorKey = key;

      const bitmapW = w;
      const dpr = window.glassMirrorDpr ? window.glassMirrorDpr() : Math.min(window.devicePixelRatio || 1, 1.5);
      const outW = Math.max(1, Math.round(bitmapW * dpr));
      const outH = Math.max(1, Math.round(h * dpr));

      if (parts.mirrorCanvas.width !== outW || parts.mirrorCanvas.height !== outH) {
        parts.mirrorCanvas.width = outW;
        parts.mirrorCanvas.height = outH;
      }

      parts.mirrorCanvas.style.width = `${bitmapW}px`;
      parts.mirrorCanvas.style.height = `${h}px`;
      parts.mirrorCanvas.style.left = '0';
      parts.mirrorCanvas.style.top = '0';

      const canvasRect = sceneCanvas.getBoundingClientRect();
      const scaleX = sceneCanvas.width / Math.max(1, canvasRect.width);
      const scaleY = sceneCanvas.height / Math.max(1, canvasRect.height);

      const sx = (rect.left - canvasRect.left) * scaleX;
      const sy = (rect.top - canvasRect.top) * scaleY;
      const sw = bitmapW * scaleX;
      const sh = h * scaleY;

      parts.mirrorCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts.mirrorCtx.fillStyle = '#070810';
      parts.mirrorCtx.fillRect(0, 0, bitmapW, h);
      parts.mirrorCtx.drawImage(sceneCanvas, sx, sy, sw, sh, 0, 0, bitmapW, h);
      return true;
    }

    function updateAutoTint() {
      if (!autoTint || !tint.tintEnabled || !tint.autoEnabled) return;
      autoTint.update(id, parts.mirrorCanvas);
    }

    function setTintTopcoat(enabled) {
      parts.topcoat.style.opacity = enabled ? '1' : '0';
    }

    return {
      id,
      host,
      lens,
      tint,
      setTintTopcoat,
      invalidateMaps() {
        lastLensKey = '';
        lastFilterKey = '';
        lastMirrorKey = '';
      },
      invalidateFilter() { lastFilterKey = ''; },
      invalidateMirror() { lastMirrorKey = ''; },
      tick(scrollY) {
        const rect = host.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        if (w < 2 || h < 2) return false;

        rebuildMaps(w, h);
        const painted = repaintMirror(scrollY, rect, w, h);
        if (painted && autoTint) {
          (host._autoTintThrottled ?? (host._autoTintThrottled = window.createGlassAutoTintThrottler?.()))?.(
            () => updateAutoTint(),
          );
        }
        applyFilter(w, h);
        return painted;
      },
      destroy() {
        if (window.removeGlassFilterForElement) {
          window.removeGlassFilterForElement(parts.mirrorCanvas);
        }
        host.replaceChildren();
      },
    };
  }

  window.GLASS_BASE_LENS = BASE_LENS;
  window.GLASS_BASE_TINT = BASE_TINT;
  window.GLASS_MAP_PARAMS = MAP_PARAMS;
  window.createGlassNav = createGlassNav;
})();
