/**
 * Bento grid — in-flow liquid glass tiles sampling the shared page scene canvas.
 */
(() => {
  const TILE_COPY = {
    'bento-snells': {
      kicker: '01 / Refraction',
      title: 'Snell displacement',
      body: 'The misty path and tree trunks bend through curved glass — not a blur filter.',
    },
    'bento-chroma': {
      kicker: '02 / Chroma',
      title: 'Edge split',
      body: 'RGB channels separate slightly at the rim.',
    },
    'bento-specular': {
      kicker: '03 / Specular',
      title: 'Rim highlight',
      body: 'A soft glint tracks the lens angle over the forest.',
    },
    'bento-tint': {
      kicker: '04 / Tint',
      title: 'Adaptive darkening',
      body: 'Auto tint keeps bright mist readable.',
    },
    'bento-portals': {
      kicker: '05 / Caps',
      title: 'Cap portals',
      body: 'Rounded ends warp the trail deeper than the flat center.',
    },
  };

  let sceneCanvas = null;
  let scrollRoot = null;
  let getScrollY = () => 0;
  let navs = [];
  let tintEnabled = true;

  function tileContent(id) {
    const copy = TILE_COPY[id];
    if (!copy) return '';
    return `
      <div class="bentoTileCopy">
        <p class="bentoTileKicker">${copy.kicker}</p>
        <h3 class="bentoTileTitle">${copy.title}</h3>
        <p class="bentoTileBody">${copy.body}</p>
      </div>
    `;
  }

  function isSectionVisible() {
    const section = document.getElementById('section-bento');
    if (!section || !scrollRoot) return false;
    const rootRect = scrollRoot.getBoundingClientRect();
    const rect = section.getBoundingClientRect();
    return rect.bottom > rootRect.top + 20 && rect.top < rootRect.bottom - 20;
  }

  function buildTiles() {
    if (!window.createGlassNav || !sceneCanvas) return;

    const autoTint = window.createAutoTintController
      ? window.createAutoTintController({
        enabled: window.GLASS_BASE_TINT?.autoEnabled ?? true,
        strength: window.GLASS_BASE_TINT?.autoStrength ?? 0.85,
      })
      : null;

    navs = [];

    document.querySelectorAll('.bentoGlassHost[data-bento-id]').forEach((host) => {
      const id = host.dataset.bentoId;
      const radius = Number(host.dataset.bentoRadius) || 28;
      const tile = host.closest('.bentoTile');
      if (tile) tile.style.setProperty('--tile-r', `${radius}px`);

      const nav = window.createGlassNav({
        id,
        host,
        sceneCanvas,
        scrollRoot,
        lens: { ...window.GLASS_BASE_LENS },
        tint: { ...window.GLASS_BASE_TINT },
        autoTint,
        fixed: false,
        borderRadius: radius,
        contentHtml: tileContent(id),
      });

      nav.setTintTopcoat(tintEnabled);
      navs.push(nav);
    });
  }

  /**
   * @param {{
   *   sceneCanvas: HTMLCanvasElement,
   *   scrollRoot: HTMLElement,
   *   getScrollY: () => number,
   *   onDirty?: () => void,
   * }} config
   */
  function initBentoGlass(config) {
    sceneCanvas = config.sceneCanvas;
    scrollRoot = config.scrollRoot;
    getScrollY = config.getScrollY;
    if (!sceneCanvas || !scrollRoot) return null;

    buildTiles();

    return {
      tick() {
        if (!navs.length || !isSectionVisible()) return;
        const scrollY = getScrollY();
        for (const nav of navs) nav.tick(scrollY);
      },
      setTintEnabled(enabled) {
        tintEnabled = enabled;
        navs.forEach((nav) => nav.setTintTopcoat(enabled));
      },
      invalidateMirror() {
        navs.forEach((nav) => nav.invalidateMirror());
        config.onDirty?.();
      },
    };
  }

  window.initBentoGlass = initBentoGlass;
})();
