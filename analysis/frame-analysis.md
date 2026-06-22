# Liquid glass reference - frame analysis

Input: `ezgif-5c24a8eb868f9990-jpg.zip` (120 frames, 2266×2160)

The pill stays locked in screen space while the media behind it changes. The effect is a rendered refractive capsule sampling the active scene — not a static translucent DOM element.

## Measured geometry (from frame crops)

```txt
pill bounds (full frame coords):
  x: 260–2085
  y: 850–1215
  width: ~1825px
  height: ~365px
  aspect ratio: 5.0 : 1
  cap radius: h/2 = 182.5px → caps occupy ~20% of width each
```

**Critical finding:** the previous prototype used ~8.6:1 aspect ratio (760×88), making caps too small and edge refraction invisible. The renderer now targets **5:1**.

## Measured luminance (center scanline, frame 001)

```txt
left cap avg lum:  45.2  (dark magnifying pocket)
center avg lum:   111.1
right cap avg lum: 145.8 (bright white ring, not dark)
vertical profile:  top 110 → mid 91 → bottom 51 (strong bottom band)
```

Dark fold positions (u along pill width):

```txt
u ≈ 0.07–0.22  left-cap portal folds
u ≈ 0.40       center-left stem
u ≈ 0.18, 0.355, 0.505, 0.67, 0.845  fixed liquid seams (confirmed on all backgrounds)
```

## Timeline read

### Frames 001–011: normal state, building background
- Background lines bend, pinch, and smear vertically — not blurred.
- Text is crisp above the glass layer.
- Orange orb embedded under topcoat highlights.
- Left cap has a dark bubble/pocket (avg lum 45 vs center 111).

### Frames 012–016: hover/active optical swell
- Text blurs/fades hard; nearly disappears in frames 013–015.
- Orange orb shifts brighter/yellower.
- Refraction intensity increases; broad milky glare crosses the pill.
- Confirmed deliberate interaction state.

### Frames 017–026: return to normal
- Text returns crisp. Orb returns to saturated red/orange.

### Frames 027–035: background pan, same pill
- Internal folds stay in pill-relative positions → part of glass normal field.

### Frames 036–060: bed/laptop/white fabric
- Pill becomes milky and low-contrast on bright backgrounds (not gray).
- Sticker details visibly warped — proof of pixel displacement.

### Frames 061–089: stone/pink mat/arm
- Background color bleeds strongly into glass.
- Pink mat makes capsule look pink; edge ring stays white.
- Dark lower band + bright top/bottom edge glints.

### Frames 090–112: street scene normal
- Left cap behaves like magnifying bubble/portal.
- Center-left vertical folds visible on every frame.

### Frames 113–116: second hover/active swell
- Same as 012–016.

## Renderer changes applied (from measurements)

| Parameter | Old | New | Reason |
|-----------|-----|-----|--------|
| `baseScale` | 1.072 | 0.84 | Stronger center magnification |
| `edgeDispX` | 0.36×h | 0.58×h | Cap/edge bending was too weak |
| `seamX coeffs` | 21/27/17/11/8 | 32/40/26/18/12 | Folds not visible enough |
| `leftCapDensity` | 0.24 | 0.48 | Measured left cap 3× darker |
| `pill aspect` | ~8.6:1 | 5:1 | Caps were proportionally too small |
| `stemDark` | none | 6 fixed stems | Folds visible on every background |
| `milky` | none | adaptive | Bright scenes go milky not gray |
| `cap bubble` | none | radial SDF | Hemispherical cap portal smear |
| `chroma` | none | edge aberration | Subtle RGB split at edges |

## Layer stack

1. Scene media (image/video/canvas)
2. Refracted scene sample clipped to capsule SDF
3. SDF/normal displacement + fixed internal vertical folds
4. Color grade: desaturation, adaptive milkiness, dark density, caustics
5. Orange orb layer
6. Glass topcoat: white edge strokes, cap rings, glints, hover bloom
7. DOM text layer (crisp in normal state)
8. Active state: text blur/fade + stronger refraction/glare/orb brightness

## Tuning entry point

All constants live in `GLASS_CONSTANTS` at the top of `react/liquidGlassRender.ts`. Rebuild standalone JS after edits:

```bash
npx esbuild react/liquidGlassRender.ts --bundle --format=iife --global-name=LiquidGlassRender --outfile=standalone-demo/liquid-glass.js --banner:js="window.drawLiquidGlass = LiquidGlassRender.drawLiquidGlassPill; window.GLASS_CONSTANTS = LiquidGlassRender.GLASS_CONSTANTS;"
```

## Compare against reference in standalone demo

```bash
cd standalone-demo
python -m http.server 8000
```

Use the **Scene** dropdown to load reference frames (building, laptop, pink mat, street) and hover the pill to compare active state.
