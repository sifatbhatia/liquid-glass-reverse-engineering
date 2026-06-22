# Liquid Glass Reverse Engineering Kit

This package contains a Safari-first refractive liquid glass prototype based on the uploaded frame sequence.

It intentionally does **not** use `backdrop-filter` as the core effect.

## What is included

```txt
standalone-demo/
  index.html              Self-contained browser demo
  styles.css
  liquid-glass.js          Canvas2D/SDF refractive renderer
  main.js                  Procedural background + demo wiring

react/
  LiquidGlassPill.tsx      Next/React component shell
  liquidGlassRender.ts     Canvas2D renderer + source-cover helper
  liquid-glass-pill.css
  demo-usage.tsx

analysis/
  frame-analysis.md        Reverse-engineering notes
  contact-sheet.jpg
  pill-crop-sheet.jpg
  frames-001-030-crop.jpg
  frames-091-120-crop.jpg
  prototype-preview.jpg

codex-instructions.md      Detailed instructions for Codex
```

## Run the standalone demo

No build step needed.

```bash
cd standalone-demo
python3 -m http.server 8000
```

Open the local page in Safari/Chrome/Firefox. Hover the pill to trigger the active state.

The demo uses a generated procedural scene so it does not need external assets. You can also use the file picker to test a local image.

## Core architecture

The effect works like this:

```txt
scene canvas / image / video
-> offscreen scene buffer
-> canvas pill clipped by a capsule SDF
-> pixel displacement / refraction
-> color grade / material density
-> orange orb
-> topcoat highlights / edge strokes
-> DOM text layer above
```

The renderer samples a known scene source. This is the correct substitute for `backdrop-filter`: instead of asking the browser to sample arbitrary DOM pixels, the app provides the same image/video/canvas source to the pill renderer.

## Why this is Safari-first

- Uses Canvas2D.
- No `backdrop-filter` dependency.
- No SVG filter dependency.
- No CSS masking dependency for the core effect.
- No WebGL requirement.
- Text remains real DOM text and stays accessible.
- Motion respects `prefers-reduced-motion` in the demo/component layer.

## Browser limitation to remember

If you sample an image/video into canvas, the media must be same-origin or CORS-clean. Otherwise the browser taints the canvas and `getImageData` fails. This is not specific to the effect; it is normal canvas security behavior.

## How to tune it

Start in `liquidGlassRender.ts` (`GLASS_CONSTANTS` object at top). Rebuild standalone JS after edits:

```bash
npx esbuild react/liquidGlassRender.ts --bundle --format=iife --global-name=LiquidGlassRender --outfile=standalone-demo/liquid-glass.js --banner:js="window.drawLiquidGlass = LiquidGlassRender.drawLiquidGlassPill; window.GLASS_CONSTANTS = LiquidGlassRender.GLASS_CONSTANTS;"
```

The values that matter most:

```txt
baseScale/baseScaleY       Lens magnification
edge displacement          Strength of capsule-edge bending
seamA-E                    Internal fixed liquid folds
activeGain                 Hover/active distortion multiplier
density                    Glass darkness/thickness
topSpec/bottomSpec         Edge highlights
causticA/causticB          Internal glare streaks
orbW/orbH/cx/cy            Orange orb position and size
```

For a closer Tykra-style look, do not start by adding blur. Increase fixed SDF folds and cap refraction first, then add subtle blur/glare only as topcoat.

## Production recommendation

Use the Canvas2D version as the stable baseline. If you need more FPS or more accurate optics, port `drawLiquidGlassPill` to a WebGL fragment shader and keep the Canvas2D version as the Safari-safe fallback.
