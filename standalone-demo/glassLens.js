/**
 * Shared glass lens primitive — mirror, displacement maps, SVG filter, topcoat.
 * Used by gallery components; navbar can adopt later without duplicating pipeline logic.
 */
(() => {
  const MAP_PARAMS = new Set([
    'glassThickness',
    'splay',
    'bezelWidthRatio',
    'edgeEmphasis',
    'specularAngle',
    'seamStrength',
    'portalStrength',
  ]);

  const LENS_PRESETS = {
    navbar: {
      glassThickness: 16,
      scale: 1.22,
      splay: 1.18,
      bezelWidthRatio: 0.91,
      edgeEmphasis: 0.4,
      chroma: 0.05,
      glow: 0.08,
      specularOpacity: 0.38,
      seamStrength: 1,
      portalStrength: 1,
      tint: 0.22,
    },
    search: {
      glassThickness: 14,
      scale: 1.05,
      splay: 1.1,
      bezelWidthRatio: 0.9,
      edgeEmphasis: 0.3,
      chroma: 0.05,
      glow: 0.06,
      specularOpacity: 0.34,
      seamStrength: 0.85,
      portalStrength: 0.9,
      tint: 0.26,
    },
    switch: {
      glassThickness: 10,
      scale: 0.85,
      splay: 1.05,
      bezelWidthRatio: 0.9,
      edgeEmphasis: 0.25,
      chroma: 0.04,
      glow: 0.05,
      specularOpacity: 0.5,
      seamStrength: 0.45,
      portalStrength: 0.5,
      tint: 0.24,
    },
    slider: {
      glassThickness: 12,
      scale: 0.75,
      splay: 1.0,
      bezelWidthRatio: 0.92,
      edgeEmphasis: 0.2,
      chroma: 0.04,
      glow: 0.04,
      specularOpacity: 0.45,
      seamStrength: 0.4,
      portalStrength: 0.45,
      tint: 0.25,
    },
    chip: {
      glassThickness: 12,
      scale: 1.0,
      splay: 1.08,
      bezelWidthRatio: 0.9,
      edgeEmphasis: 0.25,
      chroma: 0.05,
      glow: 0.06,
      specularOpacity: 0.36,
      seamStrength: 0.7,
      portalStrength: 0.75,
      tint: 0.24,
    },
    fab: {
      glassThickness: 14,
      scale: 1.15,
      splay: 1.0,
      bezelWidthRatio: 0.85,
      edgeEmphasis: 0.35,
      chroma: 0.05,
      glow: 0.1,
      specularOpacity: 0.42,
      seamStrength: 0.6,
      portalStrength: 0.8,
      tint: 0.2,
    },
  };

  const quantize = (v, step) => Math.round(v / step) * step;

  function mergeLens(presetName, overrides = {}) {
    const base = LENS_PRESETS[presetName] ?? LENS_PRESETS.navbar;
    return { ...base, ...overrides };
  }

  function buildShell(host, className) {
    if (!host.classList.contains('glassLens')) host.classList.add('glassLens');
    if (className) host.classList.add(className);
    host.innerHTML = `
      <div class="glassRefract"></div>
      <div class="glassTopcoat" aria-hidden="true"></div>
      <div class="glassContent"></div>
    `;
    return {
      refract: host.querySelector('.glassRefract'),
      topcoat: host.querySelector('.glassTopcoat'),
      content: host.querySelector('.glassContent'),
    };
  }

  /**
   * @param {{
   *   id: string,
   *   host?: HTMLElement,
   *   className?: string,
   *   preset?: keyof typeof LENS_PRESETS,
   *   lens?: Record<string, number>,
   *   width?: number,
   *   height?: number,
   *   borderRadius?: number,
   *   fixed?: boolean,
   *   hoverable?: boolean,
   *   contentHtml?: string,
   *   getSourceCanvas: () => HTMLCanvasElement,
   *   getSampleRect?: (ctx: { scrollY: number, scrollRoot: HTMLElement }) => DOMRect | null,
   *   autoTint?: ReturnType<typeof createAutoTintController> | null,
   *   tintState?: { tintEnabled: boolean, autoEnabled: boolean, tint: number, milkiness: number, density: number, autoStrength: number },
   *   globalLens?: Record<string, number>,
   *   lumBucket?: number,
   * }} options
   */
  function createGlassLens(options) {
    const id = options.id;
    const host = options.host ?? document.createElement('div');
    const parts = buildShell(host, options.className);
    const mirrorCanvas = document.createElement('canvas');
    mirrorCanvas.setAttribute('aria-hidden', 'true');
    parts.refract.appendChild(mirrorCanvas);
    const mirrorCtx = mirrorCanvas.getContext('2d', { alpha: false });

    if (options.contentHtml) {
      parts.content.innerHTML = options.contentHtml;
    }

    const presetLens = mergeLens(options.preset ?? 'navbar', options.lens ?? {});
    const fixed = options.fixed ?? false;
    const hoverable = options.hoverable ?? true;
    const lumBucket = options.lumBucket ?? 24;
    const borderRadius = options.borderRadius;

    let cachedMap = null;
    let cachedSpecularMaps = null;
    let lastLensKey = '';
    let lastFilterKey = '';
    let lastMirrorKey = '';
    let isHovered = false;
    let tintTopcoat = true;

    function effectiveLens() {
      return { ...presetLens, ...(options.globalLens ?? {}) };
    }

    function lensMapKey(w, h) {
      const L = effectiveLens();
      return [
        Math.round(w),
        Math.round(h),
        borderRadius ?? h / 2,
        L.glassThickness,
        L.splay,
        L.bezelWidthRatio,
        L.edgeEmphasis,
        L.specularAngle ?? -42,
        L.seamStrength,
        L.portalStrength,
      ].join('|');
    }

    function lensConfig(w, h) {
      const L = effectiveLens();
      return {
        width: Math.round(w),
        height: Math.round(h),
        borderRadius: borderRadius ?? h / 2,
        glassThickness: L.glassThickness,
        splay: L.splay,
        bezelWidthRatio: L.bezelWidthRatio,
        edgeEmphasis: L.edgeEmphasis,
        specularAngle: L.specularAngle ?? -42,
        seamStrength: L.seamStrength,
        portalStrength: L.portalStrength,
      };
    }

    function tintMaterial() {
      const tintState = options.tintState;
      const L = effectiveLens();
      if (!tintState?.tintEnabled) {
        return { tint: 0, milkiness: 0 };
      }
      const baseTint = tintState.tint ?? L.tint ?? 0.22;
      if (tintState.autoEnabled && options.autoTint) {
        return options.autoTint.material(id, baseTint);
      }
      return { tint: baseTint, milkiness: tintState.milkiness ?? 0 };
    }

    function autoLumBucket() {
      if (!options.tintState?.autoEnabled || !options.autoTint) return -1;
      return Math.round(options.autoTint.getLum(id) / lumBucket) * lumBucket;
    }

    function filterOptions() {
      const L = effectiveLens();
      const hoverScale = hoverable && isHovered ? 1.15 : 1;
      const hoverSpec = hoverable && isHovered ? 1.2 : 1;
      let { tint, milkiness } = tintMaterial();
      if (hoverable && isHovered) {
        tint *= 0.9;
        milkiness += 0.12;
      }
      const tintState = options.tintState;
      return {
        scale: L.scale * hoverScale,
        chroma: L.chroma ?? 0.05,
        blur: L.blur ?? 0,
        glow: L.glow ?? 0.08,
        edgeHighlight: L.edgeHighlight ?? 0,
        specularOpacity: Math.min(1, (L.specularOpacity ?? 0.38) * hoverSpec),
        tintEnabled: tintState?.tintEnabled ?? false,
        tint: quantize(tint, 0.02),
        milkiness: quantize(milkiness, 0.02),
        density: tintState?.tintEnabled ? (tintState.density ?? 0.18) : 0,
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

    function rightEdgePad() {
      const L = effectiveLens();
      if (!cachedMap?.maxDisplacement) return 10;
      const hoverScale = hoverable && isHovered ? 1.15 : 1;
      return Math.ceil(cachedMap.maxDisplacement * L.scale * hoverScale * 1.1) + 6;
    }

    function mirrorKey(rect, scrollY, scrollRoot) {
      return [
        Math.round(scrollY),
        Math.round(rect.left * 10),
        Math.round(rect.top * 10),
        Math.round(rect.width * 10),
        Math.round(rect.height * 10),
        scrollRoot.clientWidth,
        options.getSourceCanvas()?.width ?? 0,
      ].join('|');
    }

    function rebuildMaps(w, h) {
      const key = lensMapKey(w, h);
      if (key === lastLensKey && cachedMap && cachedSpecularMaps) return false;
      lastLensKey = key;
      const cfg = lensConfig(w, h);
      cachedMap = window.generateLensMap(cfg);
      cachedSpecularMaps = window.generateSpecularMap(cfg);
      lastFilterKey = '';
      return true;
    }

    function applyFilter(w, h) {
      if (!cachedMap || !window.applyGlassFilter) return;
      const key = filterKey(w, h);
      if (key === lastFilterKey) return;
      lastFilterKey = key;
      window.applyGlassFilter(parts.refract, cachedMap, cachedSpecularMaps, filterOptions());
    }

    function repaintMirror(rect, scrollY, scrollRoot) {
      const key = mirrorKey(rect, scrollY, scrollRoot);
      if (key === lastMirrorKey) return false;
      lastMirrorKey = key;

      const source = options.getSourceCanvas();
      if (!source?.width) return false;

      const w = rect.width;
      const h = rect.height;
      const localSource = !!options.getSampleRect;
      const padR = localSource ? 0 : rightEdgePad();
      const bitmapW = w + padR;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const outW = Math.max(1, Math.round(bitmapW * dpr));
      const outH = Math.max(1, Math.round(h * dpr));

      if (mirrorCanvas.width !== outW || mirrorCanvas.height !== outH) {
        mirrorCanvas.width = outW;
        mirrorCanvas.height = outH;
      }
      mirrorCanvas.style.width = `${bitmapW}px`;
      mirrorCanvas.style.height = `${h}px`;
      mirrorCanvas.style.left = '0';

      let sx;
      let sy;
      const sourceRect = source.getBoundingClientRect?.() ?? rect;
      const scaleX = source.width / (sourceRect.width || 1);
      const scaleY = source.height / (sourceRect.height || 1);

      if (options.getSampleRect) {
        const custom = options.getSampleRect({ scrollY, scrollRoot });
        sx = (custom.left - sourceRect.left) * scaleX;
        sy = (custom.top - sourceRect.top) * scaleY;
      } else if (fixed) {
        sx = (rect.left - sourceRect.left) * scaleX;
        sy = scrollY * scaleY;
      } else {
        const rootRect = scrollRoot.getBoundingClientRect();
        const docY = rect.top - rootRect.top + scrollY;
        sx = (rect.left - sourceRect.left) * scaleX;
        sy = docY * scaleY;
      }

      const sw = w * scaleX;
      const sh = h * scaleY;

      mirrorCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mirrorCtx.clearRect(0, 0, bitmapW, h);
      mirrorCtx.drawImage(source, sx, sy, sw, sh, 0, 0, bitmapW, h);
      return true;
    }

    function updateAutoTint() {
      const tintState = options.tintState;
      if (!options.autoTint || !tintState?.tintEnabled || !tintState.autoEnabled) return;
      options.autoTint.update(id, mirrorCanvas);
    }

    function setTintTopcoat(enabled) {
      tintTopcoat = enabled;
      parts.topcoat.style.opacity = enabled ? '1' : '0';
    }

    function invalidateMaps() {
      lastLensKey = '';
      lastFilterKey = '';
      lastMirrorKey = '';
    }

    function invalidateFilter() {
      lastFilterKey = '';
    }

    function invalidateMirror() {
      lastMirrorKey = '';
    }

    if (hoverable) {
      host.addEventListener('mouseenter', () => {
        isHovered = true;
        lastFilterKey = '';
      });
      host.addEventListener('mouseleave', () => {
        isHovered = false;
        lastFilterKey = '';
      });
    }

    return {
      id,
      host,
      element: host,
      refract: parts.refract,
      topcoat: parts.topcoat,
      content: parts.content,
      mirrorCanvas,
      preset: options.preset,
      fixed,
      setTintTopcoat,
      invalidateMaps,
      invalidateFilter,
      invalidateMirror,
      getMaps: () => ({ map: cachedMap, specular: cachedSpecularMaps }),
      tick(ctx) {
        const { scrollY, scrollRoot } = ctx;
        const rect = host.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        if (w < 2 || h < 2) return;

        rebuildMaps(w, h);
        const painted = repaintMirror(rect, scrollY, scrollRoot);
        if (painted) {
          updateAutoTint();
          lastFilterKey = '';
        }
        applyFilter(w, h);
      },
      destroy() {
        if (window.removeGlassFilterForElement) {
          window.removeGlassFilterForElement(parts.refract);
        } else {
          parts.refract.style.filter = '';
        }
        host.replaceChildren();
      },
    };
  }

  window.createGlassLens = createGlassLens;
  window.GLASS_LENS_PRESETS = LENS_PRESETS;
  window.GLASS_LENS_MAP_PARAMS = MAP_PARAMS;
})();
