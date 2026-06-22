const scrollRoot = document.getElementById('scrollRoot');
const sceneCanvas = document.getElementById('sceneCanvas');
const debugSliders = document.getElementById('debugSliders');
const tintToggle = document.getElementById('tintToggle');
const autoToggle = document.getElementById('autoToggle');
const lumReadout = document.getElementById('lumReadout');
const presetButtons = document.getElementById('presetButtons');
const sectionJump = document.getElementById('sectionJump');
const galleryRail = document.querySelector('.galleryRailNav');

const switchTrack = document.getElementById('switchTrack');
const switchThumbHost = document.getElementById('switchThumb');
const sliderTrack = document.getElementById('sliderTrack');
const sliderFill = document.getElementById('sliderFill');
const sliderHandleHost = document.getElementById('sliderHandle');
const galleryChipsHost = document.getElementById('galleryChips');
const sliderValue = document.getElementById('sliderValue');
const switchState = document.getElementById('switchState');
const chipClear = document.getElementById('chipClear');
const searchResults = document.getElementById('searchResults');
const alertsPreview = document.getElementById('alertsPreview');
const sliderTime = document.getElementById('sliderTime');
const sliderMood = document.getElementById('sliderMood');
const signalBars = document.getElementById('signalBars');
const filteredGrid = document.getElementById('filteredGrid');
const createdList = document.getElementById('createdList');

const sceneCtx = sceneCanvas.getContext('2d', { alpha: false });

const SCENE_H = 6200;

const LENS = { ...window.GLASS_BASE_LENS };
const TINT = { ...window.GLASS_BASE_TINT };
const MAP_PARAMS = window.GLASS_MAP_PARAMS;

const PRESETS = {
  subtle: { scale: 1.05, edgeEmphasis: 0.2, tint: 0.28 },
  balanced: { scale: 1.22, edgeEmphasis: 0.4, tint: 0.22 },
  strong: { scale: 1.45, edgeEmphasis: 0.55, tint: 0.15 },
};

const STOCK = [
  'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1800&q=82',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1500&q=82',
  'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1500&q=82',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1500&q=82',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1500&q=82',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1500&q=82',
];

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

const autoTint = window.createAutoTintController
  ? window.createAutoTintController({ enabled: TINT.autoEnabled, strength: TINT.autoStrength })
  : null;

let sceneBuilt = false;
let stockImages = [];
let navs = [];
let navById = new Map();
let switchOn = false;
let sliderPct = 0.5;
let draggingSlider = false;
let activeSection = 'section-navbar';
const visibleSections = new Set(['section-navbar']);

const SECTION_NAV_IDS = {
  'section-navbar': ['gallery-navbar'],
  'section-search': ['gallery-search'],
  'section-switch': ['gallery-switch'],
  'section-slider': ['gallery-slider'],
  'section-chips': ['gallery-chip-all', 'gallery-chip-design', 'gallery-chip-code', 'gallery-chip-ship'],
  'section-fab': ['gallery-fab'],
};

const SEARCH_ITEMS = [
  { title: 'Glass Navbar', type: 'Component', target: 'section-navbar', tags: ['navigation', 'hero', 'wide'] },
  { title: 'Command Search', type: 'Component', target: 'section-search', tags: ['input', 'search', 'keyboard'] },
  { title: 'Scene Alerts', type: 'Control', target: 'section-switch', tags: ['switch', 'settings', 'state'] },
  { title: 'Signal Drift', type: 'Control', target: 'section-slider', tags: ['slider', 'media', 'range'] },
  { title: 'Editorial Filters', type: 'Component', target: 'section-chips', tags: ['chips', 'filter', 'tags'] },
  { title: 'Create Action', type: 'Action', target: 'section-fab', tags: ['fab', 'button', 'create'] },
];

const FILTER_ITEMS = [
  { title: 'Glass Navbar', category: 'Design', status: 'Ready' },
  { title: 'Search Field', category: 'Code', status: 'Interactive' },
  { title: 'Switch Thumb', category: 'Design', status: 'Tuned' },
  { title: 'Slider Puck', category: 'Ship', status: 'Motion' },
  { title: 'Filter Chips', category: 'Code', status: 'Live' },
  { title: 'FAB Lens', category: 'Ship', status: 'Ready' },
];

const sharedNavOpts = () => ({
  sceneCanvas,
  scrollRoot,
  lens: LENS,
  tint: TINT,
  autoTint,
  fixed: false,
});

function loadStockPhotos() {
  STOCK.forEach((src, i) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      stockImages[i] = img;
      sceneBuilt = false;
      galleryScheduler?.markDirty();
    };
    img.src = src;
  });
}

function resizeScene() {
  const w = scrollRoot.clientWidth;
  const h = Math.max(SCENE_H, Math.ceil(window.innerHeight * 6.6));
  sceneCanvas.width = Math.max(1, w);
  sceneCanvas.height = h;
  sceneCanvas.style.width = `${w}px`;
  sceneCanvas.style.height = `${h}px`;
  sceneBuilt = false;
  navs.forEach((n) => n.invalidateMirror());
}

function coverDraw(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, x + (w - dw) * 0.5, y + (h - dh) * 0.5, dw, dh);
}

function drawCheckerboard(ctx, x, y, w, h, cell) {
  for (let row = 0; row < h / cell; row += 1) {
    for (let col = 0; col < w / cell; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#f0f0f0' : '#1a1a1a';
      ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
    }
  }
}

function drawVerticalStripes(ctx, x, y, w, h, stripeW) {
  for (let sx = 0; sx < w; sx += stripeW * 2) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + sx, y, stripeW, h);
    ctx.fillStyle = '#111111';
    ctx.fillRect(x + sx + stripeW, y, stripeW, h);
  }
}

/** Draw the same editorial image wells that the DOM presents. */
function drawTallScene() {
  const w = sceneCanvas.width;
  const h = sceneCanvas.height;

  const bg = sceneCtx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#070810');
  bg.addColorStop(0.35, '#101524');
  bg.addColorStop(0.7, '#0a0f17');
  bg.addColorStop(1, '#050609');
  sceneCtx.fillStyle = bg;
  sceneCtx.fillRect(0, 0, w, h);

  sceneCtx.strokeStyle = 'rgba(255,255,255,0.055)';
  sceneCtx.lineWidth = 1;
  for (let y = 0; y < h; y += 42) {
    sceneCtx.beginPath();
    sceneCtx.moveTo(0, y);
    for (let x = 0; x <= w; x += 64) {
      sceneCtx.lineTo(x, y + Math.sin(x * 0.009 + y * 0.005) * 12);
    }
    sceneCtx.stroke();
  }

  const rootRect = scrollRoot.getBoundingClientRect();
  const frames = [...document.querySelectorAll('.mediaFrame')];

  frames.forEach((frame, i) => {
    const img = stockImages[Math.min(i, stockImages.length - 1)];
    const rect = frame.getBoundingClientRect();
    const x = rect.left - rootRect.left;
    const y = rect.top - rootRect.top + scrollRoot.scrollTop;
    const fw = rect.width;
    const fh = rect.height;

    const cardGradient = sceneCtx.createLinearGradient(x, y, x + fw, y + fh);
    cardGradient.addColorStop(0, 'rgba(255,255,255,0.12)');
    cardGradient.addColorStop(1, 'rgba(255,255,255,0.03)');
    sceneCtx.fillStyle = cardGradient;
    sceneCtx.beginPath();
    sceneCtx.roundRect(x, y, fw, fh, 42);
    sceneCtx.fill();

    if (!img) return;
    sceneCtx.save();
    sceneCtx.beginPath();
    sceneCtx.roundRect(x, y, fw, fh, 42);
    sceneCtx.clip();
    coverDraw(sceneCtx, img, x, y, fw, fh);
    const shade = sceneCtx.createLinearGradient(x, y, x, y + fh);
    shade.addColorStop(0, 'rgba(0,0,0,0.04)');
    shade.addColorStop(1, 'rgba(0,0,0,0.54)');
    sceneCtx.fillStyle = shade;
    sceneCtx.fillRect(x, y, fw, fh);
    sceneCtx.restore();

    sceneCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    sceneCtx.lineWidth = 1.5;
    sceneCtx.beginPath();
    sceneCtx.roundRect(x, y, fw, fh, 42);
    sceneCtx.stroke();
  });

  sceneBuilt = true;
}

function registerNav(nav) {
  navs.push(nav);
  navById.set(nav.id, nav);
  nav.setTintTopcoat(TINT.tintEnabled);
  return nav;
}

function buildNavs() {
  navs = [];
  navById.clear();

  registerNav(window.createGlassNav({
    id: 'gallery-navbar',
    host: document.getElementById('galleryNavbar'),
    contentHtml: `
      <a class="navLogo" href="#">Sif</a>
      <div class="navLinks">
        <a href="#section-search" data-gallery-nav="section-search">Search</a>
        <a href="#section-switch" data-gallery-nav="section-switch">Controls</a>
        <a href="#section-chips" data-gallery-nav="section-chips">Filters</a>
        <a class="navCta" href="#section-fab" data-gallery-nav="section-fab">Create</a>
      </div>
    `,
    ...sharedNavOpts(),
  }));

  registerNav(window.createGlassNav({
    id: 'gallery-search',
    host: document.getElementById('gallerySearch'),
    contentHtml: `
      <form class="searchForm" role="search">
        <span class="searchIcon" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </span>
        <input class="searchInput" type="search" placeholder="Search components, presets, docs…" aria-label="Search" />
        <kbd class="searchKbd">⌘K</kbd>
      </form>
    `,
    ...sharedNavOpts(),
  }));

  registerNav(window.createGlassNav({
    id: 'gallery-switch',
    host: switchThumbHost,
    ...sharedNavOpts(),
  }));

  registerNav(window.createGlassNav({
    id: 'gallery-slider',
    host: sliderHandleHost,
    ...sharedNavOpts(),
  }));

  registerNav(window.createGlassNav({
    id: 'gallery-fab',
    host: document.getElementById('galleryFab'),
    borderRadius: 32,
    contentHtml: `
      <button class="fabBtn" type="button" aria-label="Create new item">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      </button>
    `,
    ...sharedNavOpts(),
  }));

  const chipDefs = [
    { text: 'All', width: 92, active: true },
    { text: 'Design', width: 118, active: false },
    { text: 'Code', width: 104, active: false },
    { text: 'Ship', width: 108, active: false },
  ];

  for (const chip of chipDefs) {
    const host = document.createElement('button');
    host.type = 'button';
    host.className = `galleryChip${chip.active ? ' is-active' : ''}`;
    host.style.width = `${chip.width}px`;
    host.setAttribute('aria-pressed', String(chip.active));
    host.dataset.chip = chip.text;
    host.dataset.filter = chip.text;
    galleryChipsHost.appendChild(host);

    const nav = registerNav(window.createGlassNav({
      id: `gallery-chip-${chip.text.toLowerCase()}`,
      host,
      contentHtml: `<span class="chipDot" aria-hidden="true"></span><span class="chipText">${chip.text}</span>`,
      ...sharedNavOpts(),
    }));

    host.addEventListener('click', () => {
      const on = host.classList.toggle('is-active');
      host.setAttribute('aria-pressed', String(on));
      if (chip.text === 'All' && on) {
        document.querySelectorAll('.galleryChip:not([data-filter="All"])').forEach((other) => {
          other.classList.remove('is-active');
          other.setAttribute('aria-pressed', 'false');
        });
      } else if (chip.text !== 'All' && on) {
        const allChip = document.querySelector('.galleryChip[data-filter="All"]');
        allChip?.classList.remove('is-active');
        allChip?.setAttribute('aria-pressed', 'false');
      }
      nav.invalidateFilter();
      renderFilteredItems();
    });
  }
}

function visibleNavIds() {
  const ids = new Set();
  for (const sectionId of visibleSections) {
    for (const navId of SECTION_NAV_IDS[sectionId] || []) {
      ids.add(navId);
    }
  }
  if (!ids.size) ids.add('gallery-navbar');
  return ids;
}

function setupSectionObserver() {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleSections.add(entry.target.id);
      else visibleSections.delete(entry.target.id);
    }
  }, { root: scrollRoot, threshold: 0.35 });

  document.querySelectorAll('.gallerySection').forEach((section) => observer.observe(section));
}

function updateLumReadout() {
  if (!lumReadout) return;
  if (!TINT.tintEnabled || !TINT.autoEnabled || !autoTint) {
    lumReadout.textContent = 'auto tint off';
    return;
  }
  const { tint } = autoTint.material('gallery-navbar', TINT.tint);
  lumReadout.textContent = `lum: ${Math.round(autoTint.getLum('gallery-navbar'))} -> tint ${tint.toFixed(2)}`;
}

function renderSearchResults(query = '') {
  if (!searchResults) return;
  const q = query.trim().toLowerCase();
  const matches = SEARCH_ITEMS
    .filter((item) => {
      if (!q) return true;
      return [item.title, item.type, ...item.tags].some((value) => value.toLowerCase().includes(q));
    })
    .slice(0, 4);

  searchResults.innerHTML = matches.map((item) => `
    <button type="button" class="searchResult" data-target="${item.target}">
      <span>
        <strong>${item.title}</strong>
        <small>${item.tags.join(' / ')}</small>
      </span>
      <em>${item.type}</em>
    </button>
  `).join('');
}

function activeFilters() {
  return [...document.querySelectorAll('.galleryChip.is-active')]
    .map((chip) => chip.dataset.filter)
    .filter(Boolean);
}

function renderFilteredItems() {
  if (!filteredGrid) return;
  const filters = activeFilters();
  const showAll = !filters.length || filters.includes('All');
  const items = FILTER_ITEMS.filter((item) => showAll || filters.includes(item.category));

  filteredGrid.innerHTML = items.map((item) => `
    <article class="filteredItem">
      <span>${item.category}</span>
      <strong>${item.title}</strong>
      <em>${item.status}</em>
    </article>
  `).join('') || '<p class="emptyState">No matching components.</p>';
}

let createdCount = 0;
function createFabItem() {
  if (!createdList) return;
  createdCount += 1;
  const item = document.createElement('article');
  item.className = 'createdItem';
  item.innerHTML = `
    <span>${String(createdCount).padStart(2, '0')}</span>
    <strong>Glass draft ${createdCount}</strong>
    <em>Created just now</em>
  `;
  createdList.prepend(item);
  while (createdList.children.length > 3) {
    createdList.lastElementChild.remove();
  }
}

function updateNavActive(id) {
  document.querySelectorAll('[data-gallery-nav]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.galleryNav === id);
  });
}

function setRailActive(id) {
  activeSection = id;
  if (sectionJump) sectionJump.value = id;
  galleryRail?.querySelectorAll('[data-jump]').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.jump === id);
  });
  updateNavActive(id);
}

function jumpToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setRailActive(id);
}

function updateActiveSection() {
  const mid = scrollRoot.scrollTop + scrollRoot.clientHeight * 0.45;
  const sections = [...document.querySelectorAll('.gallerySection')];
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
  if (best?.id && best.id !== activeSection) setRailActive(best.id);
}

function setSliderPct(pct) {
  sliderPct = Math.max(0, Math.min(1, pct));
  sliderFill.style.width = `${sliderPct * 100}%`;
  sliderHandleHost.style.left = `${sliderPct * 100}%`;
  const percent = Math.round(sliderPct * 100);
  const seconds = Math.round(222 * sliderPct);
  const mood = percent < 34 ? 'Quiet' : percent < 67 ? 'Balanced' : 'Intense';
  if (sliderValue) sliderValue.textContent = `${percent}%`;
  if (sliderTime) sliderTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  if (sliderMood) sliderMood.textContent = mood;
  if (signalBars) {
    [...signalBars.children].forEach((bar, i) => {
      bar.classList.toggle('is-on', i < Math.ceil(sliderPct * signalBars.children.length));
    });
  }
  navById.get('gallery-slider')?.invalidateMirror();
}

function bindInteractions() {
  const searchInput = document.querySelector('.searchInput');
  searchInput?.addEventListener('input', () => {
    renderSearchResults(searchInput.value);
  });
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = searchResults?.querySelector('.searchResult');
      first?.click();
    }
  });

  searchResults?.addEventListener('click', (e) => {
    const result = e.target.closest('.searchResult');
    if (!result) return;
    jumpToSection(result.dataset.target);
  });

  switchTrack?.addEventListener('click', () => {
    switchOn = !switchOn;
    switchTrack.classList.toggle('is-on', switchOn);
    switchTrack.setAttribute('aria-checked', String(switchOn));
    if (switchState) switchState.textContent = switchOn ? 'On' : 'Off';
    if (alertsPreview) {
      alertsPreview.classList.toggle('is-on', switchOn);
      alertsPreview.innerHTML = switchOn
        ? '<span>Alerts routing</span><strong>Live glass mode</strong>'
        : '<span>Alerts paused</span><strong>Quiet mode</strong>';
    }
    navById.get('gallery-switch')?.invalidateMirror();
  });

  switchTrack?.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      switchTrack.click();
    }
  });

  sliderTrack?.addEventListener('pointerdown', (e) => {
    draggingSlider = true;
    sliderTrack.setPointerCapture(e.pointerId);
    const rect = sliderTrack.getBoundingClientRect();
    setSliderPct((e.clientX - rect.left) / rect.width);
  });

  sliderTrack?.addEventListener('pointermove', (e) => {
    if (!draggingSlider) return;
    const rect = sliderTrack.getBoundingClientRect();
    setSliderPct((e.clientX - rect.left) / rect.width);
  });

  sliderTrack?.addEventListener('pointerup', () => {
    draggingSlider = false;
  });

  galleryRail?.addEventListener('click', (e) => {
    const link = e.target.closest('[data-jump]');
    if (!link) return;
    e.preventDefault();
    jumpToSection(link.dataset.jump);
  });

  document.querySelector('.galleryNavbar')?.addEventListener('click', (e) => {
    const link = e.target.closest('[data-gallery-nav]');
    if (!link) return;
    e.preventDefault();
    jumpToSection(link.dataset.galleryNav);
  });

  sectionJump?.addEventListener('change', () => {
    jumpToSection(sectionJump.value);
  });

  chipClear?.addEventListener('click', () => {
    document.querySelectorAll('.galleryChip').forEach((chip) => {
      chip.classList.remove('is-active');
      chip.setAttribute('aria-pressed', 'false');
    });
    navs.filter((n) => n.id.startsWith('gallery-chip-')).forEach((n) => n.invalidateFilter());
    renderFilteredItems();
  });

  document.querySelector('.galleryFab')?.addEventListener('click', createFabItem);
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

function invalidateAllMaps() {
  navs.forEach((n) => n.invalidateMaps());
  galleryScheduler?.markDirty();
}

function invalidateAllFilters() {
  navs.forEach((n) => n.invalidateFilter());
  galleryScheduler?.markDirty();
}

function invalidateAllMirrors() {
  navs.forEach((n) => n.invalidateMirror());
  galleryScheduler?.markDirty();
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
  invalidateAllMaps();
}

function buildDebugHud() {
  if (debugSliders) {
    for (const def of SLIDER_DEFS) {
      debugSliders.appendChild(buildSliderRow(def, LENS, (key) => {
        if (MAP_PARAMS.has(key)) invalidateAllMaps();
        else invalidateAllFilters();
      }));
    }
    for (const def of TINT_SLIDER_DEFS) {
      const row = buildSliderRow(def, TINT, (key, val) => {
        if (key === 'autoStrength' && autoTint) autoTint.state.strength = val;
        invalidateAllFilters();
      });
      if (def.key === 'milkiness') milkRow = row;
      debugSliders.appendChild(row);
    }
  }

  tintToggle?.addEventListener('change', () => {
    TINT.tintEnabled = tintToggle.checked;
    navs.forEach((n) => n.setTintTopcoat(TINT.tintEnabled));
    updateMilkVisibility();
    invalidateAllFilters();
  });

  autoToggle?.addEventListener('change', () => {
    TINT.autoEnabled = autoToggle.checked;
    if (autoTint) autoTint.state.enabled = autoToggle.checked;
    updateMilkVisibility();
    invalidateAllFilters();
  });

  presetButtons?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-preset]');
    if (btn) applyPreset(btn.dataset.preset);
  });

  updateMilkVisibility();
}

function runGalleryFrame() {
  if (!sceneBuilt || sceneCanvas.width !== scrollRoot.clientWidth) {
    resizeScene();
    drawTallScene();
  }

  if (!window.generateLensMap || !window.generateSpecularMap || !window.applyGlassFilter || !window.createGlassNav) {
    return;
  }

  const scrollY = scrollRoot.scrollTop;
  const activeIds = visibleNavIds();
  for (const nav of navs) {
    if (activeIds.has(nav.id)) nav.tick(scrollY);
  }

  updateLumReadout();
  updateActiveSection();
}

const galleryScheduler = window.createGlassScrollScheduler?.(runGalleryFrame, scrollRoot) ?? {
  markDirty: () => requestAnimationFrame(runGalleryFrame),
};

window.addEventListener('resize', () => {
  sceneBuilt = false;
  navs.forEach((n) => n.invalidateMaps());
  galleryScheduler.markDirty();
});

loadStockPhotos();
buildNavs();
setupSectionObserver();
bindInteractions();
buildDebugHud();
setSliderPct(0.5);
renderSearchResults();
renderFilteredItems();
createFabItem();
resizeScene();
setRailActive('section-navbar');
galleryScheduler.markDirty();
