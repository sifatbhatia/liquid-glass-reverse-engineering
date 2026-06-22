/**
 * Safari-first SVG glass filter (CSS filter, NOT backdrop-filter).
 * Reuses filter DOM when structure unchanged; updates scales/tint in place.
 */
(() => {
  let filterSeq = 0;
  let sharedSvg = null;
  let sharedDefs = null;
  const elementFilters = new WeakMap();
  const filterCache = new WeakMap();

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function ensureSharedSvg() {
    if (sharedSvg) return sharedDefs;
    sharedSvg = document.createElementNS(SVG_NS, 'svg');
    sharedSvg.setAttribute('aria-hidden', 'true');
    sharedSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    sharedDefs = document.createElementNS(SVG_NS, 'defs');
    sharedSvg.appendChild(sharedDefs);
    document.body.appendChild(sharedSvg);
    return sharedDefs;
  }

  function removeFilterForElement(element) {
    const prevId = elementFilters.get(element);
    if (!prevId || !sharedDefs) return;
    sharedDefs.querySelector(`#${CSS.escape(prevId)}`)?.remove();
    elementFilters.delete(element);
    filterCache.delete(element);
    element.style.filter = '';
  }

  function removeFilterRoot() {
    if (sharedSvg?.parentNode) sharedSvg.parentNode.removeChild(sharedSvg);
    sharedSvg = null;
    sharedDefs = null;
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function el(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
    return node;
  }

  function appendMerge(filter, inputs, result) {
    const merge = el('feMerge', { result });
    for (const input of inputs) {
      merge.appendChild(el('feMergeNode', { in: input }));
    }
    filter.appendChild(merge);
  }

  function appendMaterialTint(filter, input, tint, milkiness) {
    let current = input;
    const sat = clamp(1 - tint * 0.4, 0, 1);
    if (sat < 0.999) {
      filter.appendChild(el('feColorMatrix', {
        in: current, type: 'saturate', values: sat, result: 'tintDesat',
      }));
      current = 'tintDesat';
    }
    if (tint > 0.001) {
      filter.appendChild(el('feFlood', {
        'flood-color': '#0c0c14',
        'flood-opacity': clamp(tint * 0.55, 0, 1),
        result: 'tintDarkFlood',
      }));
      filter.appendChild(el('feComposite', {
        in: 'tintDarkFlood', in2: current, operator: 'in', result: 'tintDarkClip',
      }));
      appendMerge(filter, [current, 'tintDarkClip'], 'tintDark');
      current = 'tintDark';
    }
    if (milkiness > 0.001) {
      filter.appendChild(el('feFlood', {
        'flood-color': '#f7f2ea',
        'flood-opacity': clamp(milkiness, 0, 1),
        result: 'tintMilkFlood',
      }));
      filter.appendChild(el('feComposite', {
        in: 'tintMilkFlood', in2: current, operator: 'in', result: 'tintMilkClip',
      }));
      filter.appendChild(el('feBlend', {
        in: current, in2: 'tintMilkClip', mode: 'screen', result: 'tintMilk',
      }));
      current = 'tintMilk';
    }
    return current;
  }

  function appendDensity(filter, input, href, width, height, density, mapX = 0) {
    const densityImage = el('feImage', {
      href, x: mapX, y: 0, width, height, result: 'densityMapRaw',
    });
    filter.appendChild(densityImage);
    const intercept = clamp(1 - density, 0, 1);
    const ct = el('feComponentTransfer', { in: 'densityMapRaw', result: 'densityMap' });
    for (const ch of ['feFuncR', 'feFuncG', 'feFuncB']) {
      ct.appendChild(el(ch, { type: 'linear', slope: density, intercept }));
    }
    filter.appendChild(ct);
    filter.appendChild(el('feBlend', {
      in: input, in2: 'densityMap', mode: 'multiply', result: 'withDensity',
    }));
    return { result: 'withDensity', densityImage };
  }

  function appendMapImage(filter, href, x, y, width, height, result) {
    const node = el('feImage', { href, x, y, width, height, result });
    filter.appendChild(node);
    return node;
  }

  function appendChannelIsolate(filter, input, channel, result) {
    const matrices = {
      R: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
      G: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
      B: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
    };
    filter.appendChild(el('feColorMatrix', {
      in: input, type: 'matrix', values: matrices[channel], result,
    }));
  }

  function appendDisplacementPass(filter, sourceIn, dispMap, scale, result) {
    const node = el('feDisplacementMap', {
      in: sourceIn, in2: dispMap, scale,
      xChannelSelector: 'R', yChannelSelector: 'G', result,
    });
    filter.appendChild(node);
    return node;
  }

  function appendChromaticRefraction(filter, sourceIn, dispMap, scaleR, scaleG, scaleB) {
    const nodes = [];
    nodes.push(appendDisplacementPass(filter, sourceIn, dispMap, scaleR, 'dispR'));
    appendChannelIsolate(filter, 'dispR', 'R', 'Ronly');
    nodes.push(appendDisplacementPass(filter, sourceIn, dispMap, scaleG, 'dispG'));
    appendChannelIsolate(filter, 'dispG', 'G', 'Gonly');
    nodes.push(appendDisplacementPass(filter, sourceIn, dispMap, scaleB, 'dispB'));
    appendChannelIsolate(filter, 'dispB', 'B', 'Bonly');
    filter.appendChild(el('feBlend', { in: 'Ronly', in2: 'Gonly', mode: 'screen', result: 'RG' }));
    filter.appendChild(el('feBlend', { in: 'RG', in2: 'Bonly', mode: 'screen', result: 'refracted' }));
    return nodes;
  }

  function appendMapBlend(filter, mapResult, input, output, opacity, saturation) {
    const sat = Math.max(0, saturation);
    const op = Math.max(0, opacity);
    const node = el('feColorMatrix', {
      in: mapResult, type: 'matrix',
      values: `${sat} 0 0 0 ${128 * (1 - sat)}  0 ${sat} 0 0 ${128 * (1 - sat)}  0 0 ${sat} 0 ${128 * (1 - sat)}  0 0 0 ${op} 0`,
      result: `${output}Tint`,
    });
    filter.appendChild(node);
    filter.appendChild(el('feBlend', {
      in: input, in2: `${output}Tint`, mode: 'screen', result: output,
    }));
    return node;
  }

  function structureKey(map, specularMaps, options) {
    const blur = options.blur ?? 0;
    const chroma = options.chroma ?? 0;
    const glow = options.glow ?? 0;
    const edgeHighlight = options.edgeHighlight ?? 0;
    const density = options.density ?? 0;
    const reduced = options.reducedMotion ?? false;
    return [
      map.width,
      map.height,
      reduced ? 'reduced' : 'full',
      chroma > 0.01 ? 1 : 0,
      blur >= 0.5 ? 1 : 0,
      specularMaps?.specularDataUrl ? 1 : 0,
      specularMaps?.edgeDataUrl && edgeHighlight > 0.01 ? 1 : 0,
      density > 0.001 && specularMaps?.densityDataUrl ? 1 : 0,
      glow > 0.01 && specularMaps?.specularDataUrl ? 1 : 0,
    ].join('|');
  }

  function buildFilterGraph(filter, map, specularMaps, options) {
    const baseScale = map.maxDisplacement * (options.scale ?? 1);
    const chroma = options.chroma ?? 0.12;
    const blur = options.blur ?? 0;
    const glow = options.glow ?? 0;
    const edgeHighlight = options.edgeHighlight ?? 0;
    const specularOpacity = options.specularOpacity ?? 0.45;
    const specularSaturation = options.specularSaturation ?? 1;
    const tintEnabled = options.tintEnabled ?? false;
    const tint = tintEnabled ? (options.tint ?? 0) : 0;
    const milkiness = tintEnabled ? (options.milkiness ?? 0) : 0;
    const density = tintEnabled ? (options.density ?? 0) : 0;
    const reduced = options.reducedMotion ?? false;

    const mapOffsetX = options.mapOffsetX ?? 0;
    const mapW = map.width;
    const mapH = map.height;
    const specW = specularMaps?.width ?? mapW;
    const specH = specularMaps?.height ?? mapH;
    const nodes = { dispImages: [], mapImages: [], dispMaps: [], specBlend: null, densityFuncs: [] };

    nodes.dispImages.push(appendMapImage(
      filter, map.dataUrl, mapOffsetX, 0, mapW, mapH, 'dispMap',
    ));
    nodes.mapImages.push(nodes.dispImages[0]);

    let sourceIn = 'SourceGraphic';
    if (blur >= 0.5) {
      filter.appendChild(el('feGaussianBlur', {
        in: 'SourceGraphic', stdDeviation: blur, result: 'blurred',
      }));
      sourceIn = 'blurred';
    }

    if (reduced) {
      nodes.dispMaps.push(appendDisplacementPass(filter, sourceIn, 'dispMap', 0, 'refracted'));
    } else if (chroma > 0.01) {
      nodes.dispMaps.push(...appendChromaticRefraction(
        filter, sourceIn, 'dispMap',
        baseScale * (1 + chroma), baseScale, baseScale * (1 - chroma),
      ));
    } else {
      nodes.dispMaps.push(appendDisplacementPass(filter, sourceIn, 'dispMap', baseScale, 'refracted'));
    }

    let current = 'refracted';
    if (tint > 0.001 || milkiness > 0.001) {
      current = appendMaterialTint(filter, current, tint, milkiness);
    }

    if (density > 0.001 && specularMaps?.densityDataUrl) {
      const densityPass = appendDensity(
        filter, current, specularMaps.densityDataUrl, specW, specH, density, mapOffsetX,
      );
      current = densityPass.result;
      nodes.mapImages.push(densityPass.densityImage);
      nodes.densityFuncs = [...filter.querySelectorAll('feFuncR')];
    }

    if (specularMaps?.specularDataUrl) {
      nodes.mapImages.push(appendMapImage(
        filter, specularMaps.specularDataUrl, mapOffsetX, 0, specW, specH, 'specMap',
      ));
      nodes.specBlend = appendMapBlend(filter, 'specMap', current, 'withSpec', specularOpacity, specularSaturation);
      current = 'withSpec';
    }

    if (specularMaps?.edgeDataUrl && edgeHighlight > 0.01) {
      nodes.mapImages.push(appendMapImage(
        filter, specularMaps.edgeDataUrl, mapOffsetX, 0, specW, specH, 'edgeMap',
      ));
      appendMapBlend(filter, 'edgeMap', current, 'withEdge', edgeHighlight, 1);
      current = 'withEdge';
    }

    if (glow > 0.01 && specularMaps?.specularDataUrl) {
      filter.appendChild(el('feGaussianBlur', {
        in: 'specMap', stdDeviation: glow * 12, result: 'specGlow',
      }));
      filter.appendChild(el('feColorMatrix', {
        in: 'specGlow', type: 'matrix',
        values: `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${Math.min(1, glow * 2.5)} 0`,
        result: 'specGlowFade',
      }));
      filter.appendChild(el('feBlend', {
        in: current, in2: 'specGlowFade', mode: 'screen', result: 'withGlow',
      }));
    }

    return nodes;
  }

  function updateFilterNodes(nodes, map, specularMaps, options) {
    const baseScale = map.maxDisplacement * (options.scale ?? 0);
    const chroma = options.chroma ?? 0;
    const reduced = options.reducedMotion ?? false;

    const mapOffsetX = options.mapOffsetX ?? 0;

    if (nodes.dispImages[0]) {
      nodes.dispImages[0].setAttribute('href', map.dataUrl);
    }

    nodes.mapImages?.forEach((img) => {
      img.setAttribute('x', String(mapOffsetX));
    });

    const dispMaps = nodes.dispMaps ?? [];

    if (reduced) {
      dispMaps.forEach((n) => n.setAttribute('scale', '0'));
    } else if (chroma > 0.01 && dispMaps.length >= 3) {
      dispMaps[0].setAttribute('scale', String(baseScale * (1 + chroma)));
      dispMaps[1].setAttribute('scale', String(baseScale));
      dispMaps[2].setAttribute('scale', String(baseScale * (1 - chroma)));
    } else if (dispMaps[0]) {
      dispMaps[0].setAttribute('scale', String(baseScale));
    }

    if (nodes.specBlend) {
      const op = options.specularOpacity ?? 0.45;
      const sat = options.specularSaturation ?? 1;
      nodes.specBlend.setAttribute(
        'values',
        `${sat} 0 0 0 ${128 * (1 - sat)}  0 ${sat} 0 0 ${128 * (1 - sat)}  0 0 ${sat} 0 ${128 * (1 - sat)}  0 0 0 ${op} 0`,
      );
    }

    if (nodes.densityFuncs?.length && options.density != null) {
      const intercept = clamp(1 - options.density, 0, 1);
      nodes.densityFuncs.forEach((fn) => {
        fn.setAttribute('slope', String(options.density));
        fn.setAttribute('intercept', String(intercept));
      });
    }
  }

  function applyGlassFilter(element, map, specularMaps = null, options = {}) {
    if (options.reducedMotion) {
      options = { ...options, chroma: 0, blur: 0, glow: 0 };
    }

    const sk = structureKey(map, specularMaps, options);
    const cached = filterCache.get(element);

    if (cached && cached.structureKey === sk && elementFilters.get(element) === cached.id) {
      updateFilterNodes(cached.nodes, map, specularMaps, options);
      return cached.id;
    }

    removeFilterForElement(element);

    const defs = ensureSharedSvg();
    const id = `aave-glass-${++filterSeq}`;
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = id;
    filter.setAttribute('x', '-40%');
    filter.setAttribute('y', '-45%');
    filter.setAttribute('width', '180%');
    filter.setAttribute('height', '190%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const nodes = buildFilterGraph(filter, map, specularMaps, options);

    defs.appendChild(filter);
    elementFilters.set(element, id);
    filterCache.set(element, { id, structureKey: sk, nodes });
    element.style.filter = `url(#${id})`;
    return id;
  }

  window.applyGlassFilter = applyGlassFilter;
  window.removeGlassFilterRoot = removeFilterRoot;
  window.removeGlassFilterForElement = removeFilterForElement;
})();
