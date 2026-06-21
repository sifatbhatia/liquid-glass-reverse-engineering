# Liquid Glass Demo — Project Retrospective

*Snapshot: June 2025 — scroll-page navbar demo on SVG displacement stack*

---

## We are not building one thing

There are **three products** in this repo, and we have been tuning all of them at once without choosing:

| Track | What it optimizes for | Where it lives |
|-------|----------------------|----------------|
| **Reference reverse-engineering** | Measured Apple-style pill: cap portals, liquid seams (including u≈0.505), milky adaptive tint, orange orb, active-state swell | `analysis/frame-analysis.md`, `liquid-glass.js` |
| **Kube/Aave SVG glass** | Snell bezel + displacement map + specular, reusable via CSS `filter` | `generateLensMap.js`, `glassSvgFilter.js` |
| **Scroll-page demo** | Fixed nav + long page + bento tiles + “whatever is behind the pill should bend” | `main.js`, scene canvas mirror |

The README still describes track 1. The index page runs track 3 on top of track 2. The measured constants in `GLASS_CONSTANTS` (seams at 0.505, `leftCapDensity: 0.48`, cap bubbles) **disagree** with navbar `LENS` today (`seamStrength: 0`, `portalStrength: 0`, softer density).

So when you report a center seam or cap triangles, we have been **turning off the reference effect** to fix demo artifacts. That is not polish — it is a **product decision we never made explicitly**:

- Faithful liquid glass (seams and cap pockets are features)
- Clean wide navbar (seams and portals are bugs)

We cannot optimize for both with one slider preset.

---

## The hard constraint: glass only sees what you feed it

This is the deepest issue, and it explains the bento headline bug, the hero gap, and most future “why doesn’t X refract?” reports.

```txt
Real DOM page          Hidden #sceneCanvas          Navbar mirror
─────────────────      ─────────────────────        ───────────────
<img>, text, CSS   →   manual paintPageScene()  →   composeNavBand()
gradients, tiles       (partial, hand-maintained)   feDisplacementMap
```

The navbar does **not** look through the page. It warps a **bitmap we maintain**. Anything not explicitly painted into `#sceneCanvas` is optically invisible to the glass.

That is correct engineering (same reason the README rejects `backdrop-filter`), but it means we built a **second renderer** for the page — one that currently knows about:

- Hero photo ✓
- Bento forest ✓
- Bento header text ✓ (recent)
- Section copy ✓
- Hero guide ✗
- Bento scrim gradient ✗
- Card borders, tags, tile labels ✗
- Real CSS typography (wrapping, subpixel, `strong`, lists) ✗

Every new block of content is a new paint pass. That does not scale. It will keep breaking.

### The `.scenePainted` trap

We “fixed” refracting text by:

1. Painting text on the hidden canvas
2. Setting DOM text to `color: transparent`

But `#sceneCanvas` is `opacity: 0`. The canvas text is **never seen directly** — only sampled when the nav band copies that region.

So for section copy and bento header, we may have traded “doesn’t refract” for **“isn’t visible unless the pill happens to scroll over those exact pixels.”** That is the wrong invariant.

The reference is explicit: **text stays crisp on a layer above the glass**. Our demo added a second requirement — *page* headlines should warp when the nav crosses them — without solving how to show them when the nav is not there.

The right model is not “hide DOM text, paint canvas text.” It is one of:

- **A.** Accept reference behavior: only **media** refracts; all typography stays DOM-crisp (simplest, honest)
- **B.** Duplicate: visible DOM text + canvas duplicate for sampling (must handle double-draw where nav doesn’t cover)
- **C.** Nav-band snapshot: each frame, rasterize only the viewport strip under the pill (hard on web, expensive, but no full-page duplicate renderer)

We are stuck in a broken hybrid of B without solving visibility.

---

## SVG displacement is an approximation — know its ceiling

`generateLensMap.js` uses real Snell math for the **bezel profile**, which is good. But the full effect is still:

```txt
fixed 2D displacement map  ×  finite mirror bitmap  ×  SVG filter region
```

Not ray-traced glass. Implications:

### 1. Displacement ≠ refraction

`feDisplacementMap` moves pixels that already exist in the mirror. It does not fetch new scene content from outside the pill. Strong edge displacement without enough filter padding → dark wedges (the “triangles” you saw). We treated that as a tuning bug; structurally it is **undersampled boundary + finite source**.

### 2. 4-fold symmetry creates a center line

The map mirrors a quadrant. On an even-width bar, the center column is a **mathematical join**, not necessarily the u=0.505 artistic seam from the reference video. We averaged columns and set `seamStrength: 0` — fighting geometry with more geometry.

### 3. Chromatic pass triples cost

Three displacement passes + channel isolation on desktop was a real perf hit. Turning chroma off on wide screens is a band-aid, not a fix.

### 4. `liquid-glass.js` is closer to the reference’s mental model

Per-pixel displacement inside an SDF capsule, fixed internal folds, cap density, orb, hover state — all aligned with `frame-analysis.md`. The index demo **abandoned that path** for SVG composability. We have been debugging the SVG stack while the measured tuning notes still point at the Canvas2D stack.

---

## What we actually accomplished

Credit where it is due — non-trivial work shipped:

- **Proof that scroll-synced glass is possible** without `backdrop-filter`: scene canvas + viewport band + filter pipeline
- **Clipped scene painting** so sections don’t bleed into each other
- **Shared glass primitive** (`glassCore.js`) reused by bento tiles
- **Perf scaffolding**: scroll-coalesced scheduler, mirror DPR cap, band/mirror cache keys, auto-tint throttling
- **Debug surface** to iterate lens/tint live
- **Clear UX split for nav labels**: DOM text on top, background warps underneath (when the background exists on canvas)

That is a real demo architecture. It is not yet a **coherent product**.

---

## Where we actually are

### Working (with caveats)

- Hero photo bending through nav when painted region aligns
- Bento forest bending through nav and tiles
- Lower sections’ images bending; copy refracts **if** canvas paint + scroll alignment agree
- Nav links stay readable

### Structurally fragile

- Any unpainted DOM content = no refraction
- `.scenePainted` may hide text from normal reading
- `layoutBox()` (offsetTop chain) vs `getBoundingClientRect()` (mirror band) can drift with transforms, fonts, subpixel rounding
- Full `#sceneCanvas` rebuild on layout changes — cost grows with page height
- Six bento tiles each running mirror + SVG filter on scroll

### Deliberately not implemented (but in the reference)

- Orange orb
- Active/hover optical swell (text fade, stronger glare)
- Cap magnifying pockets on navbar
- Fixed liquid seams on navbar
- Milky adaptive material on bright scenes (partial via auto-tint, not reference-grade)

### Documentation debt

- README describes a different demo than `index.html` runs
- `glassCore.js` defaults ≠ `main.js` defaults
- No shared preset system despite three consumers

---

## What improvement actually means (prioritized by leverage)

### Tier 0 — Decide the product

Before more tuning, answer:

1. **Are we reverse-engineering the reference pill, or shipping scroll-page glass UI?**
2. **Should page typography ever refract, or only photos/video?** (Reference says no.)
3. **Is the navbar allowed to have cap portals and center stems?** (Reference says yes.)

Everything else follows from those three answers.

### Tier 1 — Fix the scene model (highest leverage)

If the scroll-page demo continues:

| Do | Don’t |
|----|-------|
| Keep DOM text **visible** always | `color: transparent` on content users must read |
| Paint scene canvas for **glass sampling only**, or paint a **nav-height strip** each frame | Hand-maintain per-section paint lists forever |
| Introduce `data-glass-sample` (or similar) declarative registry | Add another one-off block in `paintPageScene()` |

Concrete next step: **`composeNavBand` samples a strip; only that strip needs text/media**, not the full page height canvas every time. That cuts memory, repaint cost, and sync surface.

### Tier 2 — Reconcile renderers

Pick a primary stack:

- **Option A — Canvas2D pill (`liquid-glass.js`)** for reference fidelity; use as navbar background renderer with known scene sources
- **Option B — SVG filter stack** for composability; accept that reference seams/portals need **navbar-specific map generation** (no 4-fold symmetry on wide bars; asymmetric cap maps)

Running both without a migration story is why tuning feels whack-a-mole.

### Tier 3 — Honest artifact budget

If navbar stays wide (~5:1+):

- **Disable 4-fold symmetry**; generate full-width displacement map once
- **Reintroduce cap portals with symmetric mirror padding**, not `portalStrength: 0`
- **Keep u=0.505 seam optional** via `seamStrength`, but don’t conflate it with symmetry seam

Artifacts we removed were often **misconfigured features**, not wrong features.

### Tier 4 — Performance (after architecture)

Micro-optimizations already applied. Structural wins left:

- Scene strip only under nav / visible tiles
- `IntersectionObserver` — don’t tick off-screen bento glass
- Separate **scene resolution** from **mirror resolution**
- WebGL displacement path with SVG/Canvas fallback (README already suggests this)

### Tier 5 — Verification

One Playwright scroll filmstrip: hero → bento → section copy. Catch:

- Dark left block regressions
- Seam reappearance
- Invisible `.scenePainted` text
- Mirror/scene misalignment > 1px

---

## Architecture diagram

```txt
scrollRoot (Lenis) → pageShell (transformed) → sceneCanvas (hidden, full page) + DOM sections
glassNav (fixed, outside scrollRoot) → mirrorCanvas → SVG filter
composeNavBand() samples sceneCanvas at nav viewport position
```

**Key files:** `main.js`, `glassCore.js`, `glassPerf.js`, `glassSvgFilter.js`, `generateLensMap.js`, `generateSpecularMap.js`, `lenisScroll.js`, `bentoGlass.js`, `styles.css`, `index.css`, `index.html`

---

## The uncomfortable summary

We have been **debugging symptoms of an unsettled architecture**:

- A hidden duplicate page renderer that will always lag the real DOM
- A text strategy that fights the reference and may hide content
- A navbar tuned **against** the measured effect we set out to reverse-engineer
- Two render stacks where constants and docs disagree

The demo **proves the technique**. It does not yet **prove the product**.

The breather worth taking is not “add hero guide to `paintPageScene`” (though that helps). It is choosing:

> **Reference-faithful pill over known media**  
> vs  
> **Practical scroll glass over arbitrary pages, with crisp typography and only media refraction**

Once that choice is made, the next month of work becomes obvious instead of an endless seam-and-triangle loop.

**Decision to make first:** Should page headlines warp under the nav, or should only imagery warp while all text stays crisp? That single answer determines almost everything else.
