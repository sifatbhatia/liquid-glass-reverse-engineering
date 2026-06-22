# Codex prompt: build Safari-first liquid glass / refractive pill

Build a Safari-first liquid glass pill based on the uploaded GIF/frame reference.

Important correction: **do not implement this as a CSS `backdrop-filter` glass effect.** The reference behaves like a rendered refractive lens. The pixels behind the capsule are sampled, displaced, shaded, and composited inside the pill. Normal backdrop blur cannot reproduce the bending/folding visible in the frames.

## Target

Create a reusable `LiquidGlassPill` component that visually matches the reference:

- Long rounded capsule.
- Clear/liquid refractive material, not frosted gray blur.
- Scene content inside the pill bends, magnifies, and smears.
- Distortion is strongest near the left/right caps and capsule edges.
- Several fixed internal vertical folds/stems create the liquid look.
- White/copper edge strokes and specular glints.
- Dark internal density/banding in the glass.
- Warm orange orb embedded near the right side.
- Text: `made`, `by`, `Tykra`.
- Text is usually crisp and rendered above the refractive glass.
- Hover/active state temporarily increases refraction/glare, brightens the orb, and blurs/fades text like frames 012-016 and 113-116.

## Hard constraints

- Safari/WebKit compatibility is core.
- Do not rely on `backdrop-filter` for the main effect.
- Do not rely on SVG displacement filters for the main effect.
- Do not rely on CSS masks as the core renderer.
- Do not require WebGL for the baseline.
- Keep text as DOM, not baked into the glass canvas, unless adding an optional special active state.
- The component must degrade cleanly if canvas sampling fails.
- The renderer must be tunable through a small set of constants/props.

## Correct architecture

The app must provide a known scene source to sample. This can be an image, video, or canvas. CSS cannot safely sample arbitrary DOM pixels without `backdrop-filter`, so do not fake that premise.

Use this pipeline:

```txt
source image/video/canvas
-> draw the visual scene into an offscreen scene buffer
-> compute the pill's x/y position inside the scene
-> render a clipped capsule canvas
-> use capsule SDF to displace sample coordinates
-> color-grade the sampled pixels as glass material
-> draw orange orb
-> draw topcoat highlights and edge strokes
-> render DOM text above the canvas
```

## Component API

Implement something close to:

```tsx
type LiquidGlassPillProps = {
  sourceRef: React.RefObject<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null>;
  sceneRef: React.RefObject<HTMLElement | null>;
  labels?: {
    left?: string;
    middle?: string;
    brand?: string;
  };
  width?: number | string;
  height?: number | string;
  maxDpr?: number;
  reduceTextOnHover?: boolean;
  className?: string;
};
```

Usage:

```tsx
const sceneRef = useRef<HTMLDivElement | null>(null);
const imageRef = useRef<HTMLImageElement | null>(null);

return (
  <main ref={sceneRef} className="scene">
    <img ref={imageRef} src="/background.jpg" className="sceneImage" alt="" />

    <div className="pillPositioner">
      <LiquidGlassPill sourceRef={imageRef} sceneRef={sceneRef} />
    </div>
  </main>
);
```

The `sceneRef` is the visual bounds. The `sourceRef` is what the renderer samples. Draw the source into an offscreen canvas with `object-fit: cover` logic so the sample matches what users see.

## Canvas renderer details

Create a function:

```ts
drawLiquidGlassPill({
  canvas,
  sourceCanvas,
  pillX,
  pillY,
  width,
  height,
  options,
});
```

Where:

- `canvas` is the visible pill canvas.
- `sourceCanvas` is the offscreen scene buffer.
- `pillX`, `pillY` are the pill's top-left coordinates in scene-buffer CSS pixels.
- `width`, `height` are CSS pixel dimensions.
- `options.time` drives subtle liquid motion.
- `options.hover` is 0-1 active state.
- `options.maxDpr` caps rendering cost, e.g. 1.5 or 1.6.

### Shape model

Use a horizontal capsule SDF.

Conceptually:

```ts
function capsuleSdf(lx, ly, w, h) {
  const r = h / 2;
  const a = w / 2 - r;
  const nearestX = clamp(lx, -a, a);
  return hypot(lx - nearestX, ly) - r;
}
```

Inside the pill, `d <= 0`. Use this for:

- alpha mask / antialiasing
- edge strength
- normal direction
- cap bubble strength

Edge strength:

```ts
const distInside = max(0, -d);
const edge = exp(-(distInside / (height * 0.34)) ** 2);
```

### Refraction model

For each pixel in the pill canvas:

```ts
const lx = x - width / 2;
const ly = y - height / 2;
const u = x / width;
const v = y / height;

let sx = pillX + width / 2 + lx / baseScale;
let sy = pillY + height / 2 + ly / baseScaleY;
```

Add displacement:

```ts
sx += normalX * edge * height * 0.36;
sy += normalY * edge * height * 0.17;
```

Then add fixed internal liquid folds. These are crucial. Use several gaussian columns in pill-local x-space:

```ts
const seamA = gauss(u, 0.18, 0.064);
const seamB = gauss(u, 0.355, 0.024);
const seamC = gauss(u, 0.505, 0.038);
const seamD = gauss(u, 0.67, 0.087);
const seamE = gauss(u, 0.845, 0.062);
const body = 1 - (v * 2 - 1) ** 2;

sx += (seamA * 21 - seamB * 27 + seamC * 17 - seamD * 11 + seamE * 8) * body;
sy += (sin(u * 26 + time * 1.1) * seamA * 9 + cos(u * 20 - time * 0.7) * seamB * 12) * body;
```

Add subtle liquid noise:

```ts
sx += sin(v * 18 + u * 6 + time * 1.3) * 1.6 * body;
sy += cos(u * 20 - v * 3 + time * 0.9) * 1.2 * body;
```

Hover/active should multiply these displacements by ~1.5-1.7.

### Sampling

Use bilinear sampling from the scene buffer. Nearest-neighbor will look cheap.

```ts
const [r, g, b] = bilinearSample(sourceData, sourceWidth, sourceHeight, sx, sy);
```

### Glass material pass

After sampling:

1. Slight desaturation.
2. Slight contrast.
3. Slight brightness reduction.
4. Dark density, especially left cap, right cap, and top/bottom edges.
5. White glints/caustic additions.

Pseudo:

```ts
const lum = r * 0.299 + g * 0.587 + b * 0.114;
r = lum + (r - lum) * saturation;
g = lum + (g - lum) * saturation;
b = lum + (b - lum) * saturation;

r = ((r - 128) * contrast + 128) * brightness;
g = ((g - 128) * contrast + 128) * brightness;
b = ((b - 128) * contrast + 128) * brightness;

const density = 0.12 + leftCap * 0.24 + rightCap * 0.08 + edge * 0.05;
r = mix(r, 18, density);
g = mix(g, 18, density);
b = mix(b, 16, density);
```

Add highlights:

```ts
const topSpec = gauss(v, 0.055, 0.028) * 0.18;
const bottomSpec = gauss(v, 0.91, 0.038) * 0.13;
const causticA = gauss(u, 0.39, 0.035) * body * 0.12;
const causticB = gauss(u, 0.70, 0.13) * gauss(v, 0.27, 0.33) * 0.18;
const white = clamp(topSpec + bottomSpec + causticA + causticB, 0, 0.62);

r += 255 * white;
g += 255 * white;
b += 255 * white;
```

### Orange orb

Draw the orb into the same canvas after the refracted image pass but before the final topcoat strokes.

Position:

```ts
const orbW = 45;
const orbH = 27;
const cx = width - 54;
const cy = height / 2;
```

Use radial gradients and several soft glow layers. During hover:

- shift color toward pale peach/yellow
- increase glow
- increase highlight opacity

### Topcoat

After orb, draw final topcoat:

- clipped capsule gradient overlay
- left/right cap radial ring highlights
- thin white outer stroke
- inner stroke
- top glint curve
- bottom glint curve
- broad milky glare lobe near the center/right

This pass is what sells the glass as a surface above the sampled pixels.

## CSS structure

Use this layer order:

```html
<div class="liquidGlassPill">
  <canvas class="liquidGlassPill__canvas" />
  <div class="liquidGlassPill__content">
    <span>made</span>
    <span>by</span>
    <strong>Tykra</strong>
    <span aria-hidden="true" />
  </div>
</div>
```

CSS:

```css
.liquidGlassPill {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  border-radius: 999px;
  transform: translateZ(0);
  box-shadow: 0 18px 55px rgba(0,0,0,.26), inset 0 0 0 1px rgba(255,255,255,.12);
}

.liquidGlassPill__canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.liquidGlassPill__content {
  position: absolute;
  z-index: 4;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr .72fr 1.45fr .82fr;
  align-items: center;
  padding-left: clamp(34px, 7vw, 92px);
  padding-right: clamp(28px, 5vw, 72px);
  color: white;
  letter-spacing: -0.045em;
  text-shadow: 0 1px 16px rgba(0,0,0,.34);
}
```

Hover/active text treatment:

```css
.liquidGlassPill__content--hoverBlur {
  filter: blur(calc(var(--hover) * 6px));
  opacity: calc(1 - var(--hover) * .48);
  transition: filter 180ms ease, opacity 180ms ease;
}
```

Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  .liquidGlassPill__content--hoverBlur {
    transition: none;
  }
}
```

## Safari details

- Use Canvas2D for baseline.
- Cap DPR around 1.5-1.6. The pill is small; more DPR usually costs more than it helps.
- Avoid Canvas2D `filter` in the baseline; some Safari versions have inconsistent support/perf.
- Use `transform: translateZ(0)` on the pill wrapper.
- Avoid reading pixels from remote images without CORS headers.
- If sampling fails due to a tainted canvas, leave the text visible and show a simple dark translucent fallback background.

## Acceptance criteria

- No `backdrop-filter` used for the main effect.
- Background pixels visibly bend inside the pill.
- Strong edge/cap refraction is visible.
- Fixed internal folds/stems are visible independent of background.
- The orange orb looks embedded below topcoat highlights.
- Text remains crisp in the normal state.
- Hover/active state increases distortion, brightens orb, and blurs/fades text.
- Works in Safari without SVG filters or WebGL.
- Code is split into renderer, component, and CSS.
- Main constants are easy to tune.
