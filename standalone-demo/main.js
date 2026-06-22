const scrollRoot = document.getElementById('scrollRoot');
const sceneCanvas = document.getElementById('sceneCanvas');
const glassNav = document.getElementById('glassNav');
const navRefract = document.getElementById('navRefract');
const mirrorCanvas = document.getElementById('mirrorCanvas');
const debugSliders = document.getElementById('debugSliders');
const dispPreview = document.getElementById('dispPreview');
const specPreview = document.getElementById('specPreview');
const tintToggle = document.getElementById('tintToggle');
const autoToggle = document.getElementById('autoToggle');
const lumReadout = document.getElementById('lumReadout');
const presetButtons = document.getElementById('presetButtons');

const sceneCtx = sceneCanvas.getContext('2d', { alpha: false });
const mirrorCtx = mirrorCanvas.getContext('2d', { alpha: false });

const bandCanvas = document.createElement('canvas');
const bandCtx = bandCanvas.getContext('2d', { alpha: false });
let paintCtx = sceneCtx;

const PERF = window.createGlassPerfMonitor?.(new URLSearchParams(location.search).has('perf'));
const throttledAutoTint = window.createGlassAutoTintThrottler?.();
const reducedMotion = () => window.glassPrefersReducedMotion?.() ?? false;

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
reducedMotionQuery.addEventListener('change', () => { lastFilterKey = ''; scheduler?.markDirty(); });

const SCENE_IMAGES = new Map();

const LENS = {
  glassThickness: 18,
  curvature: 48,
  scale: 1.06,
  splay: 1.08,
  bezelWidthRatio: 0.93,
  edgeEmphasis: 0.18,
  chroma: 0.025,
  seamStrength: 0,
  portalStrength: 0,
  blur: 0.15,
  glow: 0.02,
  edgeHighlight: 0,
  specularAngle: -38,
  specularOpacity: 0.22,
};

const TINT = {
  tintEnabled: true,
  autoEnabled: true,
  tint: 0.26,
  milkiness: 0.0,
  density: 0.04,
  autoStrength: 0.85,
};

const PRESETS = {
  subtle: { scale: 0.92, edgeEmphasis: 0.15, tint: 0.30 },
  balanced: { scale: 1.06, edgeEmphasis: 0.28, tint: 0.26 },
  strong: { scale: 1.22, edgeEmphasis: 0.42, tint: 0.18 },
};

const autoTint = window.createAutoTintController
  ? window.createAutoTintController({ enabled: TINT.autoEnabled, strength: TINT.autoStrength })
  : null;

const LENS_ID = 'navbar';
const LUM_BUCKET = 24;

const MAP_PARAMS = new Set([
  'glassThickness',
  'splay',
  'bezelWidthRatio',
  'edgeEmphasis',
  'specularAngle',
  'seamStrength',
  'portalStrength',
]);


const SLIDER_DEFS = [
  { key: 'glassThickness', label: 'glassThickness', min: 4, max: 32, step: 1 },
  { key: 'splay', label: 'splay', min: 0.5, max: 2.5, step: 0.05 },
  { key: 'bezelWidthRatio', label: 'bezelWidthRatio', min: 0.6, max: 0.98, step: 0.01 },
  { key: 'edgeEmphasis', label: 'edgeEmphasis', min: 0, max: 2.5, step: 0.05 },
  { key: 'seamStrength', label: 'seamStrength', min: 0, max: 2, step: 0.05 },
  { key: 'portalStrength', label: 'portalStrength', min: 0, max: 2, step: 0.05 },
  { key: 'scale', label: 'scale', min: 0.4, max: 2.5, step: 0.05 },
  { key: 'chroma', label: 'chroma', min: 0, max: 0.5, step: 0.01 },
  { key: 'blur', label: 'blur', min: 0, max: 4, step: 0.1 },
  { key: 'glow', label: 'glow', min: 0, max: 0.5, step: 0.01 },
  { key: 'edgeHighlight', label: 'edgeHighlight', min: 0, max: 0.8, step: 0.01 },
  { key: 'specularAngle', label: 'specularAngle', min: -90, max: 90, step: 1 },
  { key: 'specularOpacity', label: 'specularOpacity', min: 0, max: 1, step: 0.01 },
];

const TINT_SLIDER_DEFS = [
  { key: 'tint', label: 'tint', min: 0, max: 0.6, step: 0.01 },
  { key: 'milkiness', label: 'milkiness', min: 0, max: 0.4, step: 0.01 },
  { key: 'density', label: 'density', min: 0, max: 0.5, step: 0.01 },
  { key: 'autoStrength', label: 'autoStrength', min: 0, max: 1, step: 0.05 },
];

let lastLensKey = '';
let lastFilterKey = '';
let layoutDirty = true;
let cachedNavGeom = '';
let cachedNavLeft = 0;
let cachedNavW = 0;
let cachedNavH = 0;
let cachedMap = null;
let cachedSpecularMaps = null;
let lenisScroll = null;
let bentoGlass = null;
let sceneBuilt = false;
let lastBandKey = '';

function getScrollY() {
  return lenisScroll?.getScrollY?.() ?? scrollRoot.scrollTop;
}

function loadSceneImages() {
  const urls = [...new Set(
    [...document.querySelectorAll('[data-scene-src]')]
      .map((el) => el.dataset.sceneSrc)
      .filter(Boolean),
  )];

  urls.forEach((src) => {
    if (SCENE_IMAGES.has(src)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      SCENE_IMAGES.set(src, img);
      sceneBuilt = false;
      layoutDirty = true;
      scheduler?.markDirty();
    };
    img.src = src;
  });
}


function resizeScene() {
  const pageShell = document.getElementById('pageShell');
  const w = scrollRoot.clientWidth;
  const h = Math.max(
    pageShell?.scrollHeight ?? 0,
    scrollRoot.scrollHeight,
    scrollRoot.clientHeight,
  );
  sceneCanvas.width = Math.max(1, w);
  sceneCanvas.height = Math.max(1, h);
  sceneCanvas.style.width = `${w}px`;
  sceneCanvas.style.height = `${h}px`;
  sceneBuilt = false;
  layoutDirty = true;
  lastBandKey = '';
  lastLensKey = '';
  bentoGlass?.invalidateMirror?.();
  scheduler?.markDirty();
}

function coverDraw(ctx, img, x, y, w, h, focusX = 0.5, focusY = 0.5) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, x + (w - dw) * focusX, y + (h - dh) * focusY, dw, dh);
}

/** Fixed layout rect on the scene canvas (offsetTop chain — no scroll mixed in). */
function layoutBox(el) {
  const shell = document.getElementById('pageShell');
  let x = 0;
  let y = 0;
  let node = el;
  while (node && node !== shell) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return {
    x,
    y,
    w: el.offsetWidth,
    h: el.offsetHeight,
  };
}

function paintClippedCover(ctx, img, box, focusX = 0.5, focusY = 0.5) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  coverDraw(ctx, img, box.x, box.y, box.w, box.h, focusX, focusY);
  ctx.restore();
}

function paintTextOnScene(el) {
  const text = (el.textContent || '').trim();
  if (!text) return;
  const rect = layoutBox(el);
  sceneCtx.save();
  sceneCtx.font = fontFrom(el);
  sceneCtx.fillStyle = textColorFor(el);
  const y = baselineY(el, rect);
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.58;
  if (
    el.classList.contains('heroGuideLead')
    || el.classList.contains('sectionLead')
    || el.classList.contains('sectionDesc')
    || el.classList.contains('bentoLead')
  ) {
    wrapFillText(text, rect.x, y, rect.w, lineHeight);
  } else {
    sceneCtx.fillText(text, rect.x, y);
  }
  sceneCtx.restore();
}

function paintPageScene() {
  const w = sceneCanvas.width;
  const h = sceneCanvas.height;
  if (w < 2 || h < 2) return;

  paintCtx = sceneCtx;
  sceneCtx.fillStyle = '#070810';
  sceneCtx.fillRect(0, 0, w, h);

  const heroMedia = document.querySelector('.heroMedia');
  const heroSrc = document.getElementById('section-hero')?.dataset.sceneSrc;
  const heroImg = heroSrc && SCENE_IMAGES.get(heroSrc);
  if (heroMedia && heroImg) {
    paintClippedCover(sceneCtx, heroImg, layoutBox(heroMedia), 0.5, 0.24);
  }

  const bentoSection = document.getElementById('section-bento');
  const forestSrc = bentoSection?.dataset.sceneSrc;
  const forestImg = forestSrc && SCENE_IMAGES.get(forestSrc);
  if (bentoSection && forestImg) {
    paintClippedCover(sceneCtx, forestImg, layoutBox(bentoSection), 0.5, 0.38);
    bentoSection.querySelector('.bentoHeader')
      ?.querySelectorAll('.bentoKicker, h2, .bentoLead')
      .forEach(paintTextOnScene);
  }

  document.querySelectorAll('[data-scene-src]:not(#section-hero):not(#section-bento)').forEach((section) => {
    const src = section.dataset.sceneSrc;
    const img = src && SCENE_IMAGES.get(src);
    if (img) {
      paintClippedCover(sceneCtx, img, layoutBox(section));
    }

    const copy = section.querySelector('.sectionCopy');
    copy?.querySelectorAll('.sectionIndex, h2, .sectionDesc').forEach(paintTextOnScene);

    const card = section.querySelector('.sceneCard');
    if (!card || !img) return;
    const r = layoutBox(card);
    drawSceneCard(r.x, r.y, r.w, r.h, Math.min(40, r.w * 0.04), img);
  });

  sceneBuilt = true;
  layoutDirty = false;
  lastBandKey = '';
  bentoGlass?.invalidateMirror?.();
}

/** Copy the scene strip under the fixed navbar (1:1 with visible pill). */
function composeNavBand(navW, navH) {
  const navRect = glassNav.getBoundingClientRect();
  const canvasRect = sceneCanvas.getBoundingClientRect();
  const scaleX = sceneCanvas.width / Math.max(1, canvasRect.width);
  const scaleY = sceneCanvas.height / Math.max(1, canvasRect.height);

  if (bandCanvas.width !== navW) bandCanvas.width = navW;
  if (bandCanvas.height !== navH) bandCanvas.height = navH;

  bandCtx.fillStyle = '#070810';
  bandCtx.fillRect(0, 0, navW, navH);
  if (!sceneBuilt || sceneCanvas.width <= 1) return;

  const sx = (navRect.left - canvasRect.left) * scaleX;
  const sy = (navRect.top - canvasRect.top) * scaleY;
  const sw = navW * scaleX;
  const sh = navH * scaleY;

  bandCtx.drawImage(sceneCanvas, sx, sy, sw, sh, 0, 0, navW, navH);
}

function textColorFor(el) {
  if (
    el.classList.contains('heroGuideKicker')
    || el.classList.contains('sectionKicker')
    || el.classList.contains('sectionIndex')
    || el.classList.contains('bentoKicker')
  ) {
    return 'rgba(165, 215, 255, 0.68)';
  }
  if (el.tagName === 'H1' || el.tagName === 'H2') return 'rgba(255, 255, 255, 0.96)';
  if (el.classList.contains('heroGuideLead') || el.classList.contains('sectionLead')) return 'rgba(236, 242, 255, 0.62)';
  if (el.classList.contains('sectionDesc') || el.classList.contains('bentoLead')) return 'rgba(236, 242, 255, 0.56)';
  return 'rgba(255, 255, 255, 0.9)';
}

function fontFrom(el) {
  const s = getComputedStyle(el);
  return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
}

function baselineY(el, rect) {
  const style = getComputedStyle(el);
  paintCtx.font = fontFrom(el);
  const metrics = paintCtx.measureText(el.textContent || 'M');
  const ascent = metrics.actualBoundingBoxAscent || parseFloat(style.fontSize) * 0.78;
  return rect.y + ascent;
}

function wrapFillText(text, x, y, maxW, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  let lineY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (paintCtx.measureText(test).width > maxW && line) {
      paintCtx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) paintCtx.fillText(line, x, lineY);
}

function drawSceneCard(x, y, w, h, radius, img) {
  paintCtx.save();
  paintCtx.beginPath();
  paintCtx.roundRect(x, y, w, h, radius);
  paintCtx.clip();
  coverDraw(paintCtx, img, x, y, w, h);
  const shade = paintCtx.createLinearGradient(x, y, x, y + h);
  shade.addColorStop(0, 'rgba(0,0,0,0.03)');
  shade.addColorStop(1, 'rgba(0,0,0,0.5)');
  paintCtx.fillStyle = shade;
  paintCtx.fillRect(x, y, w, h);
  paintCtx.restore();

  paintCtx.strokeStyle = 'rgba(255,255,255,0.16)';
  paintCtx.lineWidth = 1.5;
  paintCtx.beginPath();
  paintCtx.roundRect(x, y, w, h, radius);
  paintCtx.stroke();
}

function drawTallScene() {
  sceneBuilt = false;
  layoutDirty = true;
  scheduler?.markDirty();
}

function updateNavActive(id) {
  document.querySelectorAll('[data-scroll]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.scroll === id);
  });
}

function updateActiveSection() {
  const mid = getScrollY() + scrollRoot.clientHeight * 0.42;
  const sections = [...document.querySelectorAll('.scrollSection')];
  let best = sections[0];
  let bestDist = Infinity;
  for (const sec of sections) {
    const center = sec.offsetTop + sec.offsetHeight * 0.5;
    const dist = Math.abs(center - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = sec;
    }
  }
  if (best?.id) updateNavActive(best.id);
}

function bindScrollNav() {
  const scrollToSection = (target, offset = -scrollRoot.clientHeight * 0.08) => {
    if (!target) return;
    if (lenisScroll) {
      lenisScroll.scrollTo(target, { offset, duration: 1.15 });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  document.querySelectorAll('[data-scroll]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.scroll);
      scrollToSection(target);
      updateNavActive(link.dataset.scroll);
    });
  });

  document.querySelector('.navLogo')?.addEventListener('click', (e) => {
    e.preventDefault();
    const hero = document.getElementById('section-hero');
    if (lenisScroll) {
      lenisScroll.scrollTo(hero, { offset: 0, duration: 1.2 });
    } else {
      hero?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    updateNavActive('section-hero');
  });
}

function lensMapKey(navW, navH) {
  return [
    Math.round(navW),
    Math.round(navH),
    LENS.glassThickness,
    LENS.splay,
    LENS.bezelWidthRatio,
    LENS.edgeEmphasis,
    LENS.specularAngle,
    LENS.seamStrength,
    LENS.portalStrength,
  ].join('|');
}

function lensConfig(navW, navH) {
  return {
    width: Math.round(navW),
    height: Math.round(navH),
    borderRadius: navH / 2,
    glassThickness: LENS.glassThickness,
    curvature: LENS.curvature,
    splay: LENS.splay,
    bezelWidthRatio: LENS.bezelWidthRatio,
    edgeEmphasis: LENS.edgeEmphasis,
    specularAngle: LENS.specularAngle,
    seamStrength: LENS.seamStrength,
    portalStrength: LENS.portalStrength,
  };
}

const quantize = (v, step) => Math.round(v / step) * step;

function tintMaterial() {
  if (!TINT.tintEnabled) {
    return { tint: 0, milkiness: 0 };
  }
  if (TINT.autoEnabled && autoTint) {
    const auto = autoTint.material(LENS_ID, TINT.tint);
    return { tint: auto.tint, milkiness: auto.milkiness };
  }
  return { tint: TINT.tint, milkiness: TINT.milkiness };
}

function autoLumBucket() {
  if (!TINT.autoEnabled || !autoTint) return -1;
  return Math.round(autoTint.getLum(LENS_ID) / LUM_BUCKET) * LUM_BUCKET;
}

function filterOptions() {
  let { tint, milkiness } = tintMaterial();
  const lowPower = scrollRoot.clientWidth > 820;

  return {
    scale: LENS.scale,
    chroma: lowPower ? 0 : LENS.chroma,
    blur: LENS.blur,
    glow: LENS.glow,
    edgeHighlight: LENS.edgeHighlight,
    specularOpacity: LENS.specularOpacity,
    tintEnabled: TINT.tintEnabled,
    tint: quantize(tint, 0.02),
    milkiness: quantize(milkiness, 0.02),
    density: TINT.tintEnabled ? TINT.density : 0,
    reducedMotion: reducedMotion(),
  };
}

function filterKey(navW, navH) {
  const opts = filterOptions();
  return [
    lensMapKey(navW, navH),
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

function updateMapPreviews() {
  if (dispPreview && cachedMap?.dataUrl) {
    dispPreview.src = cachedMap.dataUrl;
  }
  if (specPreview && cachedSpecularMaps?.specularDataUrl) {
    specPreview.src = cachedSpecularMaps.specularDataUrl;
  }
}

function rebuildLensMaps(navW, navH) {
  const key = lensMapKey(navW, navH);
  if (key === lastLensKey && cachedMap && cachedSpecularMaps) return false;

  lastLensKey = key;

  const cfg = lensConfig(navW, navH);
  cachedMap = window.generateLensMap(cfg);
  cachedSpecularMaps = window.generateSpecularMap(cfg);
  updateMapPreviews();

  lastFilterKey = '';
  return true;
}

function applyFilterIfNeeded(navW, navH) {
  if (!cachedMap || !window.applyGlassFilter) return;

  const key = filterKey(navW, navH);
  if (key === lastFilterKey) return;

  lastFilterKey = key;
  PERF?.filterApply();
  window.applyGlassFilter(mirrorCanvas, cachedMap, cachedSpecularMaps, filterOptions());
}

function readNavGeom() {
  const navRect = glassNav.getBoundingClientRect();
  const rootRect = scrollRoot.getBoundingClientRect();
  cachedNavLeft = navRect.left - rootRect.left;
  cachedNavW = navRect.width;
  cachedNavH = navRect.height;
  cachedNavGeom = [
    Math.round(cachedNavLeft * 10),
    Math.round(cachedNavW * 10),
    Math.round(cachedNavH * 10),
    scrollRoot.clientWidth,
  ].join('|');
  return cachedNavGeom;
}

function bandKey() {
  const canvasRect = sceneCanvas.getBoundingClientRect();
  return [
    Math.round(getScrollY()),
    Math.round(canvasRect.top * 2) / 2,
    Math.round(canvasRect.left * 2) / 2,
    cachedNavGeom,
    sceneBuilt ? 1 : 0,
  ].join('|');
}

function repaintMirror() {
  if (cachedNavGeom === '') readNavGeom();

  const key = bandKey();
  if (key === lastBandKey && !layoutDirty && sceneBuilt) return false;
  lastBandKey = key;

  if (!sceneBuilt || layoutDirty) {
    paintPageScene();
  }

  const navW = cachedNavW;
  const navH = cachedNavH;

  composeNavBand(navW, navH);
  window.glassRepaintMirrorFromBand({
    mirrorCanvas,
    mirrorCtx,
    bandCanvas,
    navW,
    navH,
    padL: 0,
    padR: 0,
    dpr: window.glassMirrorDpr?.(),
  });
  PERF?.paintMirror();
  return true;
}

function updateAutoTint() {
  if (!autoTint || !TINT.tintEnabled || !TINT.autoEnabled) {
    if (lumReadout) lumReadout.textContent = 'auto tint off';
    return;
  }

  autoTint.update(LENS_ID, mirrorCanvas);

  if (lumReadout) {
    const { tint } = tintMaterial();
    lumReadout.textContent = `lum: ${Math.round(autoTint.getLum(LENS_ID))} -> tint ${tint.toFixed(2)}`;
  }
}

function onLensParamChange(key) {
  if (MAP_PARAMS.has(key)) {
    lastLensKey = '';
    lastFilterKey = '';
  } else {
    lastFilterKey = '';
  }
  scheduler?.markDirty();
}

const sliderInputs = new Map();
let milkRow = null;

function buildSliderRow(def, target, onChange) {
  const row = document.createElement('label');
  row.className = 'debugRow';

  const name = document.createElement('span');
  name.textContent = def.label;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(def.min);
  input.max = String(def.max);
  input.step = String(def.step);
  input.value = String(target[def.key]);
  input.dataset.key = def.key;

  const value = document.createElement('output');
  value.textContent = String(target[def.key]);

  input.addEventListener('input', () => {
    const parsed = def.step < 1 ? parseFloat(input.value) : parseInt(input.value, 10);
    target[def.key] = parsed;
    value.textContent = String(parsed);
    onChange(def.key, parsed);
  });

  row.appendChild(name);
  row.appendChild(input);
  row.appendChild(value);
  sliderInputs.set(def.key, { input, value });
  return row;
}

function syncSlider(key, val) {
  const ref = sliderInputs.get(key);
  if (!ref) return;
  ref.input.value = String(val);
  ref.value.textContent = String(val);
}

function applyTintTopcoat() {
  document.documentElement.style.setProperty('--tint-topcoat', TINT.tintEnabled ? '1' : '0');
  bentoGlass?.setTintEnabled?.(TINT.tintEnabled);
}

function updateMilkVisibility() {
  if (!milkRow) return;
  const hide = !TINT.tintEnabled || TINT.autoEnabled;
  milkRow.classList.toggle('is-hidden', hide);
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  LENS.scale = preset.scale;
  LENS.edgeEmphasis = preset.edgeEmphasis;
  TINT.tint = preset.tint;
  syncSlider('scale', preset.scale);
  syncSlider('edgeEmphasis', preset.edgeEmphasis);
  syncSlider('tint', preset.tint);
  onLensParamChange('edgeEmphasis');
}

function buildDebugHud() {
  if (debugSliders) {
    for (const def of SLIDER_DEFS) {
      debugSliders.appendChild(buildSliderRow(def, LENS, (key) => onLensParamChange(key)));
    }
    for (const def of TINT_SLIDER_DEFS) {
      const row = buildSliderRow(def, TINT, (key, val) => {
        if (key === 'autoStrength' && autoTint) autoTint.state.strength = val;
        lastFilterKey = '';
        scheduler?.markDirty();
      });
      if (def.key === 'milkiness') milkRow = row;
      debugSliders.appendChild(row);
    }
  }

  if (tintToggle) {
    tintToggle.checked = TINT.tintEnabled;
    tintToggle.addEventListener('change', () => {
      TINT.tintEnabled = tintToggle.checked;
      applyTintTopcoat();
      updateMilkVisibility();
      lastFilterKey = '';
      scheduler?.markDirty();
    });
  }

  if (autoToggle) {
    autoToggle.checked = TINT.autoEnabled;
    autoToggle.addEventListener('change', () => {
      TINT.autoEnabled = autoToggle.checked;
      if (autoTint) autoTint.state.enabled = autoToggle.checked;
      updateMilkVisibility();
      lastFilterKey = '';
      scheduler?.markDirty();
    });
  }

  if (presetButtons) {
    presetButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-preset]');
      if (btn) applyPreset(btn.dataset.preset);
    });
  }

  applyTintTopcoat();
  updateMilkVisibility();
}

function runGlassFrame() {
  PERF?.frameStart();

  if (layoutDirty || cachedNavGeom === '') {
    readNavGeom();
  }

  const navW = cachedNavW;
  const navH = cachedNavH;

  if (
    !window.generateLensMap
    || !window.generateSpecularMap
    || !window.applyGlassFilter
    || navW < 2
    || navH < 2
  ) {
    PERF?.frameEnd();
    return;
  }

  rebuildLensMaps(navW, navH);

  const painted = repaintMirror();
  if (painted && throttledAutoTint) {
    throttledAutoTint(() => {
      updateAutoTint();
      applyFilterIfNeeded(cachedNavW, cachedNavH);
    });
  } else if (painted) {
    updateAutoTint();
  }

  applyFilterIfNeeded(navW, navH);
  updateActiveSection();
  if (painted) bentoGlass?.tick?.();

  mirrorCanvas.style.willChange = painted ? 'filter' : '';

  PERF?.frameEnd();
}

const scheduler = window.createGlassScrollScheduler?.(runGlassFrame, scrollRoot) ?? {
  markDirty: () => requestAnimationFrame(runGlassFrame),
  forceFrame: () => requestAnimationFrame(runGlassFrame),
};

window.addEventListener('resize', () => {
  sceneBuilt = false;
  layoutDirty = true;
  cachedNavGeom = '';
  lastBandKey = '';
  lastLensKey = '';
  lastFilterKey = '';
  resizeScene();
  bentoGlass?.invalidateMirror?.();
  scheduler.markDirty();
});

function bootDemo() {
  window.removeGlassFilterForElement?.(mirrorCanvas);
  lastFilterKey = '';
  lastLensKey = '';
  const pageShell = document.getElementById('pageShell');
  if (window.initLenisScroll && pageShell) {
    lenisScroll = window.initLenisScroll(scrollRoot, pageShell, () => {
      scheduler.markDirty();
    });
  }

  buildDebugHud();
  bindScrollNav();
  loadSceneImages();
  resizeScene();
  readNavGeom();
  updateNavActive('section-hero');
  document.fonts?.ready?.then(() => { layoutDirty = true; scheduler.markDirty(); });
  scheduler.markDirty();

  bentoGlass = window.initBentoGlass?.({
    sceneCanvas,
    scrollRoot,
    getScrollY,
    onDirty: () => scheduler.markDirty(),
  });
}

bootDemo();
