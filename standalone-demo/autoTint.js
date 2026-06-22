/**
 * Auto tint: derives material darkness + milkiness from the luminance of
 * whatever sits behind each glass lens. Separate from manual tint —
 * manual is the base/floor, auto modulates on top per lens.
 * @see Dark Tint Polish plan §2b
 */
(() => {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /**
   * Map a background luminance (0-255) to material tint + milkiness.
   * Brighter backgrounds darken and go milkier; very dark clears up.
   */
  function computeAutoMaterial(lum, baseTint, strength) {
    const s = clamp(strength, 0, 1);
    const tint = clamp(
      baseTint
        + s * smoothstep(90, 200, lum) * 0.22
        - s * smoothstep(90, 40, lum) * 0.1,
      0,
      0.5,
    );
    const milkiness = clamp(s * smoothstep(130, 210, lum) * 0.38, 0, 0.4);
    return { tint, milkiness };
  }

  function createAutoTintController({ enabled = true, strength = 0.85 } = {}) {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 8;
    sampleCanvas.height = 4;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    const state = { enabled, strength };
    const smoothedLum = new Map();

    /** Cheap luminance read: GPU-downscale the source to 8x4, average 32 px. */
    function sample(sourceCanvas) {
      if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return 128;
      sampleCtx.clearRect(0, 0, 8, 4);
      sampleCtx.drawImage(sourceCanvas, 0, 0, 8, 4);
      const data = sampleCtx.getImageData(0, 0, 8, 4).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      return sum / (data.length / 4);
    }

    /** Advance the per-lens smoothed luminance (asymmetric EMA). */
    function update(id, sourceCanvas) {
      const target = sample(sourceCanvas);
      let current = smoothedLum.get(id);
      if (current === undefined) {
        current = target;
      } else if (target > current) {
        current += (target - current) * 0.35;
      } else {
        current += (target - current) * 0.12;
      }
      smoothedLum.set(id, current);
      return current;
    }

    function getLum(id) {
      return smoothedLum.get(id) ?? 128;
    }

    function settled(id) {
      return smoothedLum.has(id);
    }

    function material(id, baseTint) {
      return computeAutoMaterial(getLum(id), baseTint, state.strength);
    }

    return { state, sample, update, getLum, settled, material };
  }

  window.createAutoTintController = createAutoTintController;
  window.computeAutoMaterial = computeAutoMaterial;
})();
