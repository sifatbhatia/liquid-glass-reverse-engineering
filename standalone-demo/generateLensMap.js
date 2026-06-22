/**
 * Snell's-law displacement map generator (kube.io / Aave approach).
 * Convex squircle bezel profile, 4-fold symmetry, rounded-rect SDF direction field.
 * @see https://kube.io/blog/liquid-glass-css-svg
 * @see https://aave.com/design/building-glass-for-the-web
 */
(() => {
  const SNELL_SAMPLES = 127;
  const N1 = 1;
  const N2 = 1.5;
  const ETA = N1 / N2;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  /** Off-center liquid folds only — no u=0.5 seam (reads as a center hairline on wide bars). */
  const DEFAULT_SEAMS = [
    { u: 0.18, s: 0.064 },
    { u: 0.355, s: 0.024 },
    { u: 0.67, s: 0.087 },
    { u: 0.845, s: 0.062 },
  ];
  const DEFAULT_SEAM_X = [32, -40, -18, 12];
  const DEFAULT_SEAM_Y = [14, -18, -7, 5];

  function gauss(x, mu, sigma) {
    const z = (x - mu) / sigma;
    return Math.exp(-z * z);
  }

  function convexSquircle(t) {
    t = clamp(t, 0, 1);
    return Math.pow(1 - Math.pow(1 - t, 4), 0.25);
  }

  function convexSquircleDerivative(t) {
    const delta = 0.001;
    const y1 = convexSquircle(clamp(t - delta, 0, 1));
    const y2 = convexSquircle(clamp(t + delta, 0, 1));
    return (y2 - y1) / (2 * delta);
  }

  function refract2D(incident, normal) {
    const dotNI = incident[0] * normal[0] + incident[1] * normal[1];
    const k = 1 - ETA * ETA * (1 - dotNI * dotNI);
    if (k < 0) return [0, 0];
    const sqrtK = Math.sqrt(k);
    return [
      ETA * incident[0] - (ETA * dotNI + sqrtK) * normal[0],
      ETA * incident[1] - (ETA * dotNI + sqrtK) * normal[1],
    ];
  }

  function buildSnellTable(bezelWidth, glassThickness) {
    const table = new Float32Array(SNELL_SAMPLES);
    const incident = [0, 1];

    for (let i = 0; i < SNELL_SAMPLES; i += 1) {
      const t = i / (SNELL_SAMPLES - 1);
      const derivative = convexSquircleDerivative(t);
      const mag = Math.hypot(derivative, 1);
      const normal = [-derivative / mag, -1 / mag];
      const refracted = refract2D(incident, normal);

      if (Math.abs(refracted[1]) < 1e-6) {
        table[i] = 0;
        continue;
      }

      const height = convexSquircle(t);
      const totalHeight = height * bezelWidth + glassThickness;
      table[i] = Math.abs((refracted[0] * totalHeight) / refracted[1]);
    }

    return table;
  }

  function roundedBoxSdf(px, py, w, h, r) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const lx = px - cx;
    const ly = py - cy;
    const hx = w * 0.5 - r;
    const hy = h * 0.5 - r;
    const ax = Math.abs(lx) - hx;
    const ay = Math.abs(ly) - hy;
    const ox = Math.max(ax, 0);
    const oy = Math.max(ay, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(ax, ay), 0) - r;
  }

  function roundedBoxGrad(px, py, w, h, r) {
    const e = 0.5;
    const gx = (roundedBoxSdf(px + e, py, w, h, r) - roundedBoxSdf(px - e, py, w, h, r)) / (2 * e);
    const gy = (roundedBoxSdf(px, py + e, w, h, r) - roundedBoxSdf(px, py - e, w, h, r)) / (2 * e);
    const len = Math.hypot(gx, gy) || 1;
    return [gx / len, gy / len];
  }

  function snellMagnitudeAt(t, snellTable) {
    const idx = clamp(Math.round(t * (SNELL_SAMPLES - 1)), 0, SNELL_SAMPLES - 1);
    return snellTable[idx];
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /** Softer rim entry — avoids a dead neutral band that reads as white under specular. */
  function rimFadeAt(distInside) {
    return 0.22 + 0.78 * smoothstep(0, 7, distInside);
  }

  function bodyMask(py, h) {
    const v2 = (py / h) * 2 - 1;
    return clamp(1 - v2 * v2, 0, 1);
  }

  /** Vertical liquid folds — alternating X pulls create internal refraction stems. */
  function seamDisplacement(px, py, w, h, r, bezelWidth, seams, seamX, seamY, seamStrength) {
    const d = roundedBoxSdf(px, py, w, h, r);
    if (d >= 0) return [0, 0];

    const distInside = -d;
    if (distInside >= bezelWidth) return [0, 0];

    const u = px / w;
    const body = bodyMask(py, h);
    const hScale = h / 72;
    const strength = seamStrength ?? 1;
    let sdx = 0;
    let sdy = 0;

    for (let i = 0; i < seams.length; i += 1) {
      const g = gauss(u, seams[i].u, seams[i].s);
      sdx += g * (seamX[i] ?? 0) * hScale * body * strength;
      sdy += g * (seamY[i] ?? 0) * hScale * body * strength * 0.4;
    }

    return [sdx, sdy];
  }

  /** Symmetric end-cap magnifying pockets (left and right). */
  function capPortalDisplacement(px, py, w, h, r, bezelWidth, portalStrength) {
    const d = roundedBoxSdf(px, py, w, h, r);
    if (d >= 0) return [0, 0];

    const distInside = -d;
    if (distInside >= bezelWidth) return [0, 0];

    const cx = w * 0.5;
    const lx = px - cx;
    const ly = py - h * 0.5;
    const capR = Math.min(r, h / 2);
    const capA = w / 2 - capR;
    const body = bodyMask(py, h);
    const strength = portalStrength ?? 1;
    let pdx = 0;
    let pdy = 0;

    if (Math.abs(lx) > capA) {
      const cdx = lx < 0 ? lx + capA : lx - capA;
      const cdy = ly;
      const cd = Math.hypot(cdx, cdy) / capR;
      const bubble = gauss(cd, 0.5, 0.34) * body * strength * 0.38;
      pdx -= bubble * cdx * 0.48;
      pdy -= bubble * cdy * 0.36;
    }

    return [pdx, pdy];
  }

  function displacementAt(px, py, w, h, r, bezelWidth, snellTable, splay, edgeEmphasis, extras) {
    const d = roundedBoxSdf(px, py, w, h, r);
    if (d >= 0) return [0, 0];

    const distInside = -d;
    if (distInside >= bezelWidth) return [0, 0];

    const t = distInside / bezelWidth;
    const edgeBoost = 1 + edgeEmphasis * Math.pow(1 - t, 0.55);
    const rimFade = rimFadeAt(distInside);
    const mag = snellMagnitudeAt(t, snellTable) * edgeBoost * rimFade;
    const [gx, gy] = roundedBoxGrad(px, py, w, h, r);
    let dx = -gx * mag * splay;
    let dy = -gy * mag;

    if (extras) {
      const [sdx, sdy] = seamDisplacement(
        px,
        py,
        w,
        h,
        r,
        bezelWidth,
        extras.seams,
        extras.seamX,
        extras.seamY,
        extras.seamStrength,
      );
      const [pdx, pdy] = capPortalDisplacement(
        px,
        py,
        w,
        h,
        r,
        bezelWidth,
        extras.portalStrength,
      );
      dx += sdx + pdx;
      dy += sdy + pdy;
    }

    return [dx, dy];
  }

  function generateLensMap(config) {
    const width = Math.max(4, Math.round(config.width));
    const height = Math.max(4, Math.round(config.height));
    const borderRadius = Math.min(config.borderRadius ?? height / 2, width / 2, height / 2);
    const glassThickness = config.glassThickness ?? 14;
    const splay = config.splay ?? 1;
    const edgeEmphasis = config.edgeEmphasis ?? 0;
    const seamStrength = config.seamStrength ?? 1;
    const portalStrength = config.portalStrength ?? 1;
    const seams = config.seams ?? DEFAULT_SEAMS;
    const seamX = config.seamX ?? DEFAULT_SEAM_X;
    const seamY = config.seamY ?? DEFAULT_SEAM_Y;
    const extras = seamStrength > 0.001 || portalStrength > 0.001
      ? { seams, seamX, seamY, seamStrength, portalStrength }
      : null;
    const minDim = Math.min(width, height);
    const bezelWidth = config.bezelWidth
      ?? (config.bezelWidthRatio ?? 0.88) * minDim;

    const snellTable = buildSnellTable(bezelWidth, glassThickness);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    let maxDisp = 0;
    const halfW = Math.ceil(width / 2);
    const halfH = Math.ceil(height / 2);
    const dispScratch = new Float32Array(width * height * 2);

    for (let py = 0; py < halfH; py += 1) {
      for (let px = 0; px < halfW; px += 1) {
        const [dx, dy] = displacementAt(
          px + 0.5,
          py + 0.5,
          width,
          height,
          borderRadius,
          bezelWidth,
          snellTable,
          splay,
          edgeEmphasis,
          extras,
        );
        maxDisp = Math.max(maxDisp, Math.abs(dx), Math.abs(dy));

        const pairs = [
          [px, py, dx, dy],
          [width - 1 - px, py, -dx, dy],
          [px, height - 1 - py, dx, -dy],
          [width - 1 - px, height - 1 - py, -dx, -dy],
        ];

        for (const [qx, qy, qdx, qdy] of pairs) {
          const si = (qy * width + qx) * 2;
          dispScratch[si] = qdx;
          dispScratch[si + 1] = qdy;
        }
      }
    }

    if (width % 2 === 0) {
      const c0 = width / 2 - 1;
      const c1 = width / 2;
      for (let py = 0; py < height; py += 1) {
        const i0 = (py * width + c0) * 2;
        const i1 = (py * width + c1) * 2;
        dispScratch[i0] = dispScratch[i1] = (dispScratch[i0] + dispScratch[i1]) * 0.5;
        dispScratch[i0 + 1] = dispScratch[i1 + 1] = (dispScratch[i0 + 1] + dispScratch[i1 + 1]) * 0.5;
      }
    }

    if (maxDisp < 0.001) maxDisp = 1;

    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const si = (py * width + px) * 2;
        const ndx = dispScratch[si] / maxDisp;
        const ndy = dispScratch[si + 1] / maxDisp;
        const i = (py * width + px) * 4;
        data[i] = Math.round(clamp(128 + ndx * 127, 0, 255));
        data[i + 1] = Math.round(clamp(128 + ndy * 127, 0, 255));
        data[i + 2] = 128;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      maxDisplacement: maxDisp,
      width,
      height,
    };
  }

  window.generateLensMap = generateLensMap;
})();
