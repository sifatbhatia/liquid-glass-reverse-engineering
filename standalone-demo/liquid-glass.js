var LiquidGlassRender = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // react/liquidGlassRender.ts
  var liquidGlassRender_exports = {};
  __export(liquidGlassRender_exports, {
    GLASS_CONSTANTS: () => GLASS_CONSTANTS,
    drawCoverSourceToCanvas: () => drawCoverSourceToCanvas,
    drawLiquidGlassPill: () => drawLiquidGlassPill
  });
  var GLASS_CONSTANTS = {
    /** Lower = stronger center magnification. Reference ≈ 0.84. */
    baseScale: 0.84,
    baseScaleY: 0.88,
    /** SDF edge-band refraction strength (fraction of height). */
    edgeDispX: 0.58,
    edgeDispY: 0.32,
    /** Fixed internal liquid-fold X displacement coefficients at hScale=1. */
    seamX: [32, -40, 26, -18, 12],
    seamY: [14, -18, 10, -7, 5],
    /** Seam centers (u) and sigmas — measured from frame brightness dips. */
    seams: [
      { u: 0.18, s: 0.064 },
      { u: 0.355, s: 0.024 },
      { u: 0.505, s: 0.038 },
      { u: 0.67, s: 0.087 },
      { u: 0.845, s: 0.062 }
    ],
    /** Left-cap portal bubble (dark magnifying pocket). */
    leftPortalU: 0.06,
    leftPortalS: 0.07,
    leftPortalDispX: 0.62,
    leftPortalDispY: 0.48,
    /** Material density. Left cap avg lum 45 vs center 111 in reference. */
    leftCapDensity: 0.48,
    bottomBandDensity: 0.22,
    /** Internal dark stems — visible on every background. */
    stemDark: [
      { u: 0.1, s: 0.022, a: 0.42 },
      { u: 0.18, s: 0.038, a: 0.35 },
      { u: 0.355, s: 0.014, a: 0.28 },
      { u: 0.505, s: 0.024, a: 0.22 },
      { u: 0.67, s: 0.05, a: 0.18 },
      { u: 0.845, s: 0.034, a: 0.14 }
    ],
    /** Hover bloom across center (frames 012–016). */
    hoverBloom: 0.72,
    /** Orb size as fraction of pill height. */
    orbWFrac: 0.123,
    orbHFrac: 0.074,
    orbXFrac: 0.148
  };
  var clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  var gauss = (x, mu, sigma) => {
    const z = (x - mu) / sigma;
    return Math.exp(-z * z);
  };
  var smoothstep = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  var mix = (a, b, t) => a * (1 - t) + b * t;
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function roundedCapsulePath(ctx, w, h, inset = 0) {
    const r = Math.max(0, h / 2 - inset);
    const x0 = inset;
    const y0 = inset;
    const x1 = w - inset;
    const y1 = h - inset;
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x1 - r, y0);
    ctx.arc(x1 - r, y0 + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x0 + r, y1);
    ctx.arc(x0 + r, y0 + r, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
  }
  function capsuleSdf(lx, ly, w, h) {
    const r = h / 2;
    const a = w / 2 - r;
    const nearestX = clamp(lx, -a, a);
    const dx = lx - nearestX;
    const dy = ly;
    return Math.hypot(dx, dy) - r;
  }
  function capsuleNormal(lx, ly, w, h) {
    const r = h / 2;
    const a = w / 2 - r;
    const nearestX = clamp(lx, -a, a);
    let nx = lx - nearestX;
    let ny = ly;
    if (Math.abs(lx) <= a) {
      nx = 0;
      ny = ly >= 0 ? 1 : -1;
    }
    const len = Math.hypot(nx, ny) || 1;
    return [nx / len, ny / len];
  }
  function bilinearSample(src, sw, sh, x, y) {
    x = clamp(x, 0, sw - 2);
    y = clamp(y, 0, sh - 2);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const i00 = (y0 * sw + x0) * 4;
    const i10 = i00 + 4;
    const i01 = i00 + sw * 4;
    const i11 = i01 + 4;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    return [
      src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11,
      src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11,
      src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11
    ];
  }
  function drawOrb(ctx, w, h, hover, time) {
    const C = GLASS_CONSTANTS;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.3);
    const orbW = h * C.orbWFrac;
    const orbH = h * C.orbHFrac;
    const cx = w - h * C.orbXFrac;
    const cy = h / 2;
    ctx.save();
    roundedCapsulePath(ctx, w, h, 0);
    ctx.clip();
    for (let i = 7; i >= 1; i -= 1) {
      const grow = i * h * 0.014;
      const alpha = 0.022 + hover * 0.028;
      ctx.fillStyle = `rgba(255, 100, 52, ${alpha})`;
      roundRect(ctx, cx - orbW / 2 - grow, cy - orbH / 2 - grow, orbW + grow * 2, orbH + grow * 2, (orbH + grow * 2) / 2);
      ctx.fill();
    }
    const grad = ctx.createRadialGradient(cx - orbW * 0.2, cy - orbH * 0.25, 1, cx, cy, orbW * 0.75);
    grad.addColorStop(0, `rgba(255, ${176 + hover * 55}, ${130 + hover * 50}, 0.98)`);
    grad.addColorStop(0.45, `rgba(255, ${88 + hover * 65}, ${48 + hover * 40}, 0.92)`);
    grad.addColorStop(1, `rgba(200, ${58 + hover * 48}, ${28 + hover * 28}, 0.82)`);
    ctx.fillStyle = grad;
    roundRect(ctx, cx - orbW / 2, cy - orbH / 2, orbW, orbH, orbH / 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 225, 185, ${0.16 + hover * 0.42 + pulse * hover * 0.1})`;
    roundRect(ctx, cx - orbW * 0.28, cy - orbH * 0.42, orbW * 0.46, orbH * 0.26, orbH * 0.13);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 + hover * 0.18})`;
    ctx.lineWidth = Math.max(0.8, h * 0.012);
    roundRect(ctx, cx - orbW / 2 + 0.5, cy - orbH / 2 + 0.5, orbW - 1, orbH - 1, orbH / 2);
    ctx.stroke();
    ctx.restore();
  }
  function drawTopCoat(ctx, w, h, hover, time) {
    const sweep = 0.5 + 0.5 * Math.sin(time * 0.85);
    ctx.save();
    roundedCapsulePath(ctx, w, h, 0.5);
    ctx.clip();
    let g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(0,0,0,0.28)");
    g.addColorStop(0.08, "rgba(0,0,0,0.14)");
    g.addColorStop(0.14, "rgba(255,255,255,0.10)");
    g.addColorStop(0.22, "rgba(0,0,0,0.08)");
    g.addColorStop(0.38, "rgba(255,255,255,0.04)");
    g.addColorStop(0.62, "rgba(0,0,0,0.06)");
    g.addColorStop(0.82, "rgba(255,255,255,0.06)");
    g.addColorStop(0.92, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0.24)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(255,255,255,${0.42 + hover * 0.22})`);
    g.addColorStop(0.08, "rgba(255,255,255,0.08)");
    g.addColorStop(0.45, "rgba(255,255,255,0.00)");
    g.addColorStop(0.78, "rgba(0,0,0,0.06)");
    g.addColorStop(0.92, `rgba(255,255,255,${0.32 + hover * 0.14})`);
    g.addColorStop(1, `rgba(255,255,255,${0.22 + hover * 0.08})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (hover > 0.01) {
      const bloomX = w * (0.38 + sweep * 0.14);
      const bloom = ctx.createRadialGradient(bloomX, h * 0.46, 0, bloomX, h * 0.46, w * (0.28 + hover * 0.12));
      bloom.addColorStop(0, `rgba(255,255,255,${0.28 * hover})`);
      bloom.addColorStop(0.4, `rgba(255,255,255,${0.14 * hover})`);
      bloom.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(bloomX - w * 0.35, -h * 0.2, w * 0.7, h * 1.4);
    }
    const glintX = w * (0.52 + sweep * 0.12);
    const glint = ctx.createRadialGradient(glintX, h * 0.22, 0, glintX, h * 0.22, h * (1.3 + hover * 0.5));
    glint.addColorStop(0, `rgba(255,255,255,${0.14 + hover * 0.32})`);
    glint.addColorStop(0.28, "rgba(255,255,255,0.06)");
    glint.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glint;
    ctx.fillRect(glintX - h * 1.5, -h, h * 3, h * 3);
    const leftBubble = ctx.createRadialGradient(h * 0.5, h * 0.5, h * 0.08, h * 0.5, h * 0.5, h * 0.78);
    leftBubble.addColorStop(0, "rgba(0,0,0,0.18)");
    leftBubble.addColorStop(0.55, "rgba(0,0,0,0.08)");
    leftBubble.addColorStop(0.72, `rgba(255,255,255,${0.34 + hover * 0.22})`);
    leftBubble.addColorStop(0.88, `rgba(255,255,255,${0.18 + hover * 0.12})`);
    leftBubble.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = leftBubble;
    ctx.fillRect(0, 0, h * 1.1, h);
    const rightBubble = ctx.createRadialGradient(w - h * 0.5, h * 0.5, h * 0.06, w - h * 0.5, h * 0.5, h * 0.76);
    rightBubble.addColorStop(0, "rgba(255,255,255,0.04)");
    rightBubble.addColorStop(0.62, `rgba(255,255,255,${0.22 + hover * 0.18})`);
    rightBubble.addColorStop(0.82, `rgba(255,255,255,${0.38 + hover * 0.22})`);
    rightBubble.addColorStop(1, "rgba(0,0,0,0.04)");
    ctx.fillStyle = rightBubble;
    ctx.fillRect(w - h * 1.1, 0, h * 1.1, h);
    ctx.restore();
    ctx.save();
    roundedCapsulePath(ctx, w, h, 0.4);
    ctx.strokeStyle = `rgba(255,255,255,${0.62 + hover * 0.2})`;
    ctx.lineWidth = Math.max(1.2, h * 0.014);
    ctx.stroke();
    roundedCapsulePath(ctx, w, h, 1.8);
    ctx.strokeStyle = "rgba(210, 165, 120, 0.22)";
    ctx.lineWidth = Math.max(0.8, h * 0.01);
    ctx.stroke();
    ctx.globalAlpha = 0.62 + hover * 0.3;
    ctx.beginPath();
    ctx.moveTo(h * 1.2, h * 0.06);
    ctx.bezierCurveTo(w * 0.28, -h * 0.04, w * 0.72, h * 0.04, w - h * 1.15, h * 0.07);
    ctx.strokeStyle = "rgba(255,255,255,0.82)";
    ctx.lineWidth = Math.max(1, h * 0.014);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * 0.92);
    ctx.bezierCurveTo(w * 0.58, h * 0.98, w * 0.74, h * 0.91, w - h * 1, h * 0.87);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = Math.max(1.2, h * 0.018);
    ctx.stroke();
    ctx.restore();
  }
  function drawLiquidGlassPill({ canvas, sourceCanvas, pillX, pillY, width, height, options = {} }) {
    const C = GLASS_CONSTANTS;
    const deviceDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    const dpr = Math.min(deviceDpr, options.maxDpr ?? 1.6);
    const outW = Math.max(1, Math.round(width * dpr));
    const outH = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== outW || canvas.height !== outH) {
      canvas.width = outW;
      canvas.height = outH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext("2d", { alpha: true });
    const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !srcCtx) return;
    const sourceImage = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;
    const src = sourceImage.data;
    const image = ctx.createImageData(outW, outH);
    const dst = image.data;
    const time = options.time ?? performance.now() / 1e3;
    const hover = clamp(options.hover ?? 0, 0, 1);
    const sceneScaleX = options.sourceScaleX ?? 1;
    const sceneScaleY = options.sourceScaleY ?? 1;
    const hScale = height / 72;
    const activeGain = 1 + hover * 0.85;
    const baseScale = C.baseScale - hover * 0.05;
    const baseScaleY = C.baseScaleY - hover * 0.04;
    const capR = height / 2;
    const capA = width / 2 - capR;
    for (let py = 0; py < outH; py += 1) {
      const y = py / dpr;
      const ly = y - height / 2;
      const v = y / height;
      const v2 = v * 2 - 1;
      const body = clamp(1 - v2 * v2, 0, 1);
      for (let px = 0; px < outW; px += 1) {
        const x = px / dpr;
        const lx = x - width / 2;
        const u = x / width;
        const d = capsuleSdf(lx, ly, width, height);
        const mask = 1 - smoothstep(-0.9, 1.2, d);
        if (mask <= 2e-3) continue;
        const distInside = Math.max(0, -d);
        const edge = Math.exp(-Math.pow(distInside / (height * 0.3), 2));
        const [nx, ny] = capsuleNormal(lx, ly, width, height);
        const leftCap = gauss(u, 0.042, 0.058) * (0.35 + body * 0.65);
        const rightCap = gauss(u, 0.955, 0.055) * (0.35 + body * 0.65);
        const seams = C.seams.map((s, i2) => gauss(u, s.u, s.s));
        const leftPortal = gauss(u, C.leftPortalU, C.leftPortalS) * body * activeGain;
        let sx = pillX + width / 2 + lx / baseScale;
        let sy = pillY + height / 2 + ly / baseScaleY;
        sx += nx * edge * height * (C.edgeDispX + hover * 0.28) * activeGain;
        sy += ny * edge * height * (C.edgeDispY + hover * 0.16) * activeGain;
        sx += (seams[0] * C.seamX[0] + seams[1] * C.seamX[1] + seams[2] * C.seamX[2] + seams[3] * C.seamX[3] + seams[4] * C.seamX[4]) * hScale * body * activeGain;
        sy += (Math.sin(u * 26 + time * 1.1) * seams[0] * C.seamY[0] + Math.cos(u * 20 - time * 0.7) * seams[1] * C.seamY[1] + Math.sin(u * 16 + time * 0.4) * seams[2] * C.seamY[2] + Math.cos(u * 14 - time * 0.5) * seams[3] * C.seamY[3]) * hScale * body * activeGain;
        sx += Math.sin(v * 18 + u * 6 + time * 1.3) * hScale * (2.4 + hover * 3.2) * body;
        sy += Math.cos(u * 20 - v * 3 + time * 0.9) * hScale * (1.8 + hover * 2.4) * body;
        sx += leftPortal * height * C.leftPortalDispX;
        sy += leftPortal * Math.sin(v * Math.PI) * height * C.leftPortalDispY;
        if (lx < -capA) {
          const cdx = lx + capA;
          const cdy = ly;
          const cd = Math.hypot(cdx, cdy) / capR;
          const bubble = gauss(cd, 0.5, 0.32) * body * activeGain;
          sx -= bubble * cdx * 1.1;
          sy -= bubble * cdy * 0.85;
        } else if (lx > capA) {
          const cdx = lx - capA;
          const cdy = ly;
          const cd = Math.hypot(cdx, cdy) / capR;
          const bubble = gauss(cd, 0.5, 0.32) * body * activeGain;
          sx -= bubble * cdx * 0.9;
          sy -= bubble * cdy * 0.75;
        }
        const chroma = edge * 2.8 * hScale;
        const [sr, sg, sb] = bilinearSample(src, sw, sh, sx * sceneScaleX, sy * sceneScaleY);
        const [srR] = bilinearSample(src, sw, sh, (sx - chroma) * sceneScaleX, sy * sceneScaleY);
        const [, , sbB] = bilinearSample(src, sw, sh, (sx + chroma) * sceneScaleX, sy * sceneScaleY);
        let r = mix(sr, srR, edge * 0.35);
        let g = sg;
        let b = mix(sb, sbB, edge * 0.35);
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        const saturation = 0.92 + hover * 0.04;
        r = lum + (r - lum) * saturation;
        g = lum + (g - lum) * saturation;
        b = lum + (b - lum) * saturation;
        const contrast = 1.06 + hover * 0.04;
        const brightness = 0.96 + hover * 0.04;
        r = ((r - 128) * contrast + 128) * brightness;
        g = ((g - 128) * contrast + 128) * brightness;
        b = ((b - 128) * contrast + 128) * brightness;
        const milky = clamp((lum - 130) / 90, 0, 0.38) * body;
        r = mix(r, 242, milky);
        g = mix(g, 240, milky);
        b = mix(b, 236, milky);
        const bottomBand = gauss(v, 0.88, 0.12) * body;
        const density = clamp(
          0.06 + leftCap * C.leftCapDensity + bottomBand * C.bottomBandDensity + edge * 0.08 + (1 - body) * 0.1,
          0,
          0.55
        );
        r = mix(r, 14, density);
        g = mix(g, 14, density);
        b = mix(b, 12, density);
        let stemDark = 0;
        for (const stem of C.stemDark) {
          stemDark += gauss(u, stem.u, stem.s) * stem.a;
        }
        stemDark *= body;
        r = mix(r, 6, stemDark);
        g = mix(g, 6, stemDark);
        b = mix(b, 4, stemDark);
        const topSpec = gauss(v, 0.055, 0.026) * (0.22 + hover * 0.08);
        const bottomSpec = gauss(v, 0.91, 0.036) * (0.16 + hover * 0.08);
        const causticA = gauss(u, 0.39, 0.035) * body * (0.14 + hover * 0.12);
        const causticB = gauss(u, 0.7, 0.13) * gauss(v, 0.27, 0.33) * (0.2 + hover * 0.24);
        const capSpark = rightCap * edge * (0.22 + hover * 0.16);
        const hoverBloom = gauss(u, 0.45, 0.18 + hover * 0.1) * gauss(v, 0.48, 0.28) * hover * C.hoverBloom;
        const white = clamp(topSpec + bottomSpec + causticA + causticB + capSpark + hoverBloom, 0, 0.78);
        r += 255 * white;
        g += 255 * white;
        b += 255 * white;
        const alpha = mask * (0.92 + edge * 0.06);
        const i = (py * outW + px) * 4;
        dst[i] = clamp(r, 0, 255);
        dst[i + 1] = clamp(g, 0, 255);
        dst[i + 2] = clamp(b, 0, 255);
        dst[i + 3] = Math.round(alpha * 255);
      }
    }
    ctx.clearRect(0, 0, outW, outH);
    ctx.putImageData(image, 0, 0);
    ctx.save();
    ctx.scale(dpr, dpr);
    drawOrb(ctx, width, height, hover, time);
    drawTopCoat(ctx, width, height, hover, time);
    ctx.restore();
  }
  function drawCoverSourceToCanvas(source, target, width, height) {
    const ctx = target.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) return;
    target.width = Math.max(1, Math.round(width));
    target.height = Math.max(1, Math.round(height));
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!sourceWidth || !sourceHeight) return;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const dx = (width - drawWidth) * 0.5;
    const dy = (height - drawHeight) * 0.5;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, dx, dy, drawWidth, drawHeight);
  }
  return __toCommonJS(liquidGlassRender_exports);
})();
window.drawLiquidGlass = (c, src, x, y, w, h, opts) => LiquidGlassRender.drawLiquidGlassPill({ canvas: c, sourceCanvas: src, pillX: x, pillY: y, width: w, height: h, options: opts }); window.GLASS_CONSTANTS = LiquidGlassRender.GLASS_CONSTANTS;
