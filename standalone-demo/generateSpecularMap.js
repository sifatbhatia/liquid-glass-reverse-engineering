/**
 * Specular rim + edge highlight maps aligned 1:1 with displacement maps.
 * Rim from surface-normal dot lightDir; edge from displacement-magnitude gradient.
 * @see https://aave.com/design/building-glass-for-the-web
 */
(() => {
  const SNELL_SAMPLES = 127;
  const N1 = 1;
  const N2 = 1.5;
  const ETA = N1 / N2;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

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

  function rimFadeAt(distInside) {
    return 0.22 + 0.78 * smoothstep(0, 7, distInside);
  }

  function magnitudeAt(px, py, w, h, r, bezelWidth, snellTable, splay, edgeEmphasis) {
    const d = roundedBoxSdf(px, py, w, h, r);
    if (d >= 0) return 0;

    const distInside = -d;
    if (distInside >= bezelWidth) return 0;

    const t = distInside / bezelWidth;
    const edgeBoost = 1 + (edgeEmphasis ?? 0) * Math.pow(1 - t, 0.55);
    const mag = snellMagnitudeAt(t, snellTable) * edgeBoost * rimFadeAt(distInside);
    const [gx, gy] = roundedBoxGrad(px, py, w, h, r);
    const dx = -gx * mag * splay;
    const dy = -gy * mag;
    return Math.hypot(dx, dy);
  }

  function profileNormal2D(t) {
    const derivative = convexSquircleDerivative(t);
    const mag = Math.hypot(derivative, 1);
    return [-derivative / mag, -1 / mag];
  }

  function rimAt(px, py, w, h, r, bezelWidth, specularPower, lightDir) {
    const d = roundedBoxSdf(px, py, w, h, r);
    if (d >= 0) return 0;

    const distInside = -d;
    if (distInside >= bezelWidth) return 0;

    const t = distInside / bezelWidth;
    const [pnx, pny] = profileNormal2D(t);
    const [gx, gy] = roundedBoxGrad(px, py, w, h, r);
    const radialLen = Math.hypot(gx, gy) || 1;
    const nx = (-gx / radialLen) * Math.abs(pnx) + pnx * 0.35;
    const ny = (-gy / radialLen) * Math.abs(pny) + pny * 0.35;
    const nLen = Math.hypot(nx, ny) || 1;
    const nd = Math.max(0, (nx / nLen) * lightDir[0] + (ny / nLen) * lightDir[1]);
    let rim = Math.pow(nd, specularPower) * convexSquircle(t);

    const capR = Math.min(r, h / 2);
    if (px < capR * 1.35) {
      rim *= smoothstep(0, 1, px / (capR * 1.35));
    } else if (px > w - capR * 1.35) {
      rim *= smoothstep(0, 1, (w - px) / (capR * 1.35));
    }

    return rim;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function encodeGray(value, maxVal) {
    if (maxVal < 1e-6) return 128;
    return Math.round(clamp(128 + (value / maxVal) * 127, 0, 255));
  }

  /**
   * Material density — symmetric cap pockets + subtle bottom band.
   * Returns 0-1 brightness multiplier; 1 = no darkening.
   */
  function densityAt(px, py, w, h, r) {
    const d = roundedBoxSdf(px, py, w, h, r);
    if (d >= 0) return 1;

    const capR = Math.min(r, h / 2);
    const capCenters = [capR, w - capR];
    let capDark = 0;
    for (const cx of capCenters) {
      const cd = Math.hypot(px - cx, py - h / 2) / (capR * 1.15);
      capDark = Math.max(capDark, clamp(1 - cd, 0, 1));
    }

    let dark = capDark * 0.1;
    dark += clamp((py / h - 0.88) / 0.12, 0, 1) * 0.1;

    return 1 - clamp(dark, 0, 0.35);
  }

  function generateSpecularMap(config) {
    const width = Math.max(4, Math.round(config.width));
    const height = Math.max(4, Math.round(config.height));
    const borderRadius = Math.min(config.borderRadius ?? height / 2, width / 2, height / 2);
    const glassThickness = config.glassThickness ?? 14;
    const splay = config.splay ?? 1;
    const edgeEmphasis = config.edgeEmphasis ?? 0;
    const specularPower = config.specularPower ?? 6;
    const specularAngle = config.specularAngle ?? -42;
    const minDim = Math.min(width, height);
    const bezelWidth = config.bezelWidth
      ?? (config.bezelWidthRatio ?? 0.88) * minDim;

    const angleRad = (specularAngle * Math.PI) / 180;
    const lightDir = [Math.cos(angleRad), Math.sin(angleRad)];
    const snellTable = buildSnellTable(bezelWidth, glassThickness);

    const specCanvas = document.createElement('canvas');
    const edgeCanvas = document.createElement('canvas');
    const densityCanvas = document.createElement('canvas');
    specCanvas.width = width;
    specCanvas.height = height;
    edgeCanvas.width = width;
    edgeCanvas.height = height;
    densityCanvas.width = width;
    densityCanvas.height = height;

    const specData = specCanvas.getContext('2d').createImageData(width, height);
    const edgeData = edgeCanvas.getContext('2d').createImageData(width, height);
    const densityData = densityCanvas.getContext('2d').createImageData(width, height);
    const specPixels = specData.data;
    const edgePixels = edgeData.data;
    const densityPixels = densityData.data;

    const magScratch = new Float32Array(width * height);
    const rimScratch = new Float32Array(width * height);
    const edgeScratch = new Float32Array(width * height);
    let maxRim = 0;
    let maxEdge = 0;

    const halfW = Math.ceil(width / 2);
    const halfH = Math.ceil(height / 2);

    for (let py = 0; py < halfH; py += 1) {
      for (let px = 0; px < halfW; px += 1) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const mag = magnitudeAt(cx, cy, width, height, borderRadius, bezelWidth, snellTable, splay, edgeEmphasis);
        const rim = rimAt(cx, cy, width, height, borderRadius, bezelWidth, specularPower, lightDir);
        maxRim = Math.max(maxRim, rim);

        const pairs = [
          [px, py, mag, rim],
          [width - 1 - px, py, mag, rim],
          [px, height - 1 - py, mag, rim],
          [width - 1 - px, height - 1 - py, mag, rim],
        ];

        for (const [qx, qy, qmag, qrim] of pairs) {
          const si = qy * width + qx;
          magScratch[si] = qmag;
          rimScratch[si] = qrim;
        }
      }
    }

    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const si = py * width + px;
        const d = roundedBoxSdf(px + 0.5, py + 0.5, width, height, borderRadius);
        let edgeVal = 0;

        if (d < 0) {
          const distInside = -d;
          if (distInside < bezelWidth) {
            const t = distInside / bezelWidth;
            const px1 = clamp(px + 1, 0, width - 1);
            const px0 = clamp(px - 1, 0, width - 1);
            const py1 = clamp(py + 1, 0, height - 1);
            const py0 = clamp(py - 1, 0, height - 1);
            const magX = magScratch[py * width + px1] - magScratch[py * width + px0];
            const magY = magScratch[py1 * width + px] - magScratch[py0 * width + px];
            const gradMag = Math.hypot(magX, magY);
            edgeVal = gradMag * (1 - t);
          }
        }

        maxEdge = Math.max(maxEdge, edgeVal);
        edgeScratch[si] = edgeVal;
      }
    }

    if (maxRim < 1e-6) maxRim = 1;
    if (maxEdge < 1e-6) maxEdge = 1;

    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const si = py * width + px;
        const i = si * 4;
        const rimGray = encodeGray(rimScratch[si], maxRim);
        const edgeGray = encodeGray(edgeScratch[si], maxEdge);
        const densityGray = Math.round(clamp(densityAt(px + 0.5, py + 0.5, width, height, borderRadius) * 255, 0, 255));

        specPixels[i] = rimGray;
        specPixels[i + 1] = rimGray;
        specPixels[i + 2] = rimGray;
        specPixels[i + 3] = 255;

        edgePixels[i] = edgeGray;
        edgePixels[i + 1] = edgeGray;
        edgePixels[i + 2] = edgeGray;
        edgePixels[i + 3] = 255;

        densityPixels[i] = densityGray;
        densityPixels[i + 1] = densityGray;
        densityPixels[i + 2] = densityGray;
        densityPixels[i + 3] = 255;
      }
    }

    specCanvas.getContext('2d').putImageData(specData, 0, 0);
    edgeCanvas.getContext('2d').putImageData(edgeData, 0, 0);
    densityCanvas.getContext('2d').putImageData(densityData, 0, 0);

    return {
      specularDataUrl: specCanvas.toDataURL('image/png'),
      edgeDataUrl: edgeCanvas.toDataURL('image/png'),
      densityDataUrl: densityCanvas.toDataURL('image/png'),
      width,
      height,
    };
  }

  window.generateSpecularMap = generateSpecularMap;
})();
