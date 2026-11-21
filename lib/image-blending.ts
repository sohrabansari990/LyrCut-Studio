export type LayerBlendMode =
  | 'source-over'
  | 'screen'
  | 'lighten'
  | 'lighter'
  | 'overlay'
  | 'soft-light'
  | 'multiply';

export type LayerKeyMode =
  | 'none'
  | 'chroma-green'
  | 'chroma-blue'
  | 'remove-black'
  | 'remove-white'
  | 'remove-checkerboard'
  | 'auto-corner';

export interface LayerKeyingConfig {
  mode: LayerKeyMode;
  tolerance: number; // 0..100
  softness: number; // 0..100
  spillSuppress: number; // 0..100
  edgeFade: number; // 0..60 (% border feathering to melt edges into background)
}

export const DEFAULT_LAYER_KEYING_CONFIG: LayerKeyingConfig = {
  mode: 'none',
  tolerance: 38,
  softness: 32,
  spillSuppress: 75,
  edgeFade: 0,
};

export const BLEND_MODE_OPTIONS: ReadonlyArray<{
  id: LayerBlendMode;
  label: string;
  hint: string;
}> = [
  { id: 'source-over', label: 'Normal', hint: 'Standard alpha compositing' },
  { id: 'screen', label: 'Screen', hint: 'Drops black backgrounds smoothly' },
  { id: 'lighten', label: 'Lighten', hint: 'Keeps lighter pixels over dark BG' },
  { id: 'soft-light', label: 'Soft Light', hint: 'Blends subject mood into BG' },
  { id: 'overlay', label: 'Overlay', hint: 'High-contrast atmospheric blend' },
  { id: 'lighter', label: 'Add / Glow', hint: 'Luminous stage light blend' },
  { id: 'multiply', label: 'Multiply', hint: 'Drops white backgrounds cleanly' },
];

export const KEY_MODE_OPTIONS: ReadonlyArray<{
  id: LayerKeyMode;
  label: string;
  hint: string;
}> = [
  { id: 'none', label: 'Original', hint: 'Keep original image / native PNG alpha' },
  { id: 'chroma-green', label: 'Green Screen', hint: 'Remove green screen + hair spill suppression' },
  { id: 'remove-black', label: 'Black BG', hint: 'Remove outer black background while keeping dark hair' },
  { id: 'remove-checkerboard', label: 'Checkerboard', hint: 'Remove baked gray/white PNG checkerboard' },
  { id: 'remove-white', label: 'White BG', hint: 'Remove outer white background cleanly' },
  { id: 'chroma-blue', label: 'Blue Screen', hint: 'Remove blue screen + spill suppression' },
  { id: 'auto-corner', label: 'Auto Corner', hint: 'Sample border color & knock out background' },
];

export function isKeyingActive(keying?: LayerKeyingConfig | null): boolean {
  if (!keying) return false;
  return keying.mode !== 'none' || keying.edgeFade > 0.5;
}

export function getKeyingCacheSignature(keying?: LayerKeyingConfig | null): string {
  if (!keying || !isKeyingActive(keying)) return 'none';
  return `${keying.mode}|${Math.round(keying.tolerance)}|${Math.round(keying.softness)}|${Math.round(keying.spillSuppress)}|${Math.round(keying.edgeFade)}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Fast border inspection to detect whether an uploaded cutout image has:
 * - native transparency ('none')
 * - green screen ('chroma-green')
 * - blue screen ('chroma-blue')
 * - fake gray/white checkerboard ('remove-checkerboard')
 * - solid black backdrop ('remove-black')
 * - solid white backdrop ('remove-white')
 * - other solid corner color ('auto-corner')
 */
export function detectBackgroundType(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): LayerKeyMode {
  if (width < 4 || height < 4 || rgba.length < width * height * 4) {
    return 'none';
  }

  let total = 0;
  let transparentCount = 0;
  let greenCount = 0;
  let blueCount = 0;
  let blackCount = 0;
  let whiteCount = 0;
  let midGrayCount = 0;

  const samplePixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const a = rgba[idx + 3];
    total++;

    if (a < 210) {
      transparentCount++;
      return;
    }

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;

    if (g >= 72 && g - Math.max(r, b) >= 28) {
      greenCount++;
    } else if (b >= 72 && b - Math.max(r, g) >= 30) {
      blueCount++;
    } else if (luma <= 20) {
      blackCount++;
    } else if (sat <= 20 && luma >= 232) {
      whiteCount++;
    } else if (sat <= 20 && luma >= 145 && luma < 232) {
      midGrayCount++;
    }
  };

  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  const insetX = Math.min(3, Math.floor(width / 8));
  const insetY = Math.min(3, Math.floor(height / 8));

  for (let x = 0; x < width; x += stepX) {
    samplePixel(x, insetY);
    samplePixel(x, height - 1 - insetY);
  }
  for (let y = 0; y < height; y += stepY) {
    samplePixel(insetX, y);
    samplePixel(width - 1 - insetX, y);
  }

  if (total === 0) return 'none';

  // Already a real transparent PNG/WebP
  if (transparentCount / total >= 0.12) return 'none';
  if (greenCount / total >= 0.35) return 'chroma-green';
  if (blueCount / total >= 0.35) return 'chroma-blue';

  // Checkerboard has BOTH white squares AND neutral mid-gray squares along borders
  const neutralLightRatio = (whiteCount + midGrayCount) / total;
  if (
    neutralLightRatio >= 0.42 &&
    whiteCount / total >= 0.12 &&
    midGrayCount / total >= 0.12
  ) {
    return 'remove-checkerboard';
  }

  if (blackCount / total >= 0.42) return 'remove-black';
  if (whiteCount / total >= 0.42) return 'remove-white';

  return 'auto-corner';
}

/**
 * Border-connected BFS flood-fill returning a mask where:
 *   1 = outer background pixel to remove
 *   0 = protected interior / foreground pixel
 */
function floodFillBorderMask(
  width: number,
  height: number,
  isBgPixel: (pixelIndex: number) => boolean
): Uint8Array {
  const count = width * height;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;

  const tryEnqueue = (x: number, y: number) => {
    const p = y * width + x;
    if (visited[p]) return;
    if (!isBgPixel(p)) return;
    visited[p] = 1;
    queue[tail++] = p;
  };

  for (let x = 0; x < width; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    tryEnqueue(0, y);
    tryEnqueue(width - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p - x) / width;

    if (x > 0) tryEnqueue(x - 1, y);
    if (x + 1 < width) tryEnqueue(x + 1, y);
    if (y > 0) tryEnqueue(x, y - 1);
    if (y + 1 < height) tryEnqueue(x, y + 1);
  }

  return visited;
}

/**
 * Pure deterministic pixel-level keying & edge blending processor.
 * Returns a new Uint8ClampedArray (never mutates the input array).
 */
export function processKeyedImagePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  config: LayerKeyingConfig
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  const count = width * height;
  if (count === 0 || out.length < count * 4) return out;

  const tol = clamp(config.tolerance, 0, 100);
  const soft = clamp(config.softness, 0, 100);
  const spill = clamp(config.spillSuppress, 0, 100) / 100;

  if (config.mode === 'chroma-green' || config.mode === 'chroma-blue') {
    const isGreen = config.mode === 'chroma-green';
    // Higher tolerance lowers the excess threshold so darker/shaded green near hair is keyed out
    const keyThreshold = 58 - tol * 0.48; // ~10..58
    const softBand = 12 + soft * 0.65; // ~12..77

    for (let p = 0; p < count; p++) {
      const i = p * 4;
      const a0 = out[i + 3];
      if (a0 === 0) continue;

      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];

      const primary = isGreen ? g : b;
      const otherMax = isGreen ? Math.max(r, b) : Math.max(r, g);
      const excess = primary - otherMax;

      if (excess > keyThreshold) {
        const keyRatio = smoothstep(keyThreshold, keyThreshold + softBand, excess);
        const newAlpha = Math.round(a0 * (1 - keyRatio));
        out[i + 3] = newAlpha;
      }

      // Spill suppression: strip green/blue reflection halo on translucent hair strands & skin edges
      if (spill > 0.01 && excess > 0) {
        const reduced = Math.round(primary - excess * spill);
        if (isGreen) {
          out[i + 1] = clamp(reduced, 0, 255);
        } else {
          out[i + 2] = clamp(reduced, 0, 255);
        }
      }
    }
  } else if (config.mode === 'remove-black') {
    const lumaThreshold = 14 + tol * 0.72; // ~14..86
    const softBand = 10 + soft * 0.6;

    const bgMask = floodFillBorderMask(width, height, (p) => {
      const i = p * 4;
      const luma = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
      return luma <= lumaThreshold;
    });

    // Clear border-connected black background
    for (let p = 0; p < count; p++) {
      if (bgMask[p]) {
        out[p * 4 + 3] = 0;
      }
    }

    // Soften 2-ring boundary around keyed background so dark hair wisps blend cleanly
    const haloRings = Math.max(1, Math.round(1 + soft / 28));
    let frontier = bgMask;
    for (let ring = 0; ring < haloRings; ring++) {
      const nextFrontier = new Uint8Array(frontier);
      const ringFactor = (ring + 1) / (haloRings + 1);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const p = y * width + x;
          if (frontier[p]) continue;
          if (
            frontier[p - 1] ||
            frontier[p + 1] ||
            frontier[p - width] ||
            frontier[p + width]
          ) {
            const i = p * 4;
            const luma = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
            const feather = smoothstep(
              lumaThreshold * 0.7,
              lumaThreshold + softBand,
              luma
            );
            const blendedAlpha = Math.round(
              out[i + 3] * (ringFactor + (1 - ringFactor) * feather)
            );
            out[i + 3] = Math.min(out[i + 3], blendedAlpha);
            nextFrontier[p] = 1;
          }
        }
      }
      frontier = nextFrontier;
    }
  } else if (config.mode === 'remove-checkerboard') {
    const maxSat = 18 + tol * 0.28;
    const minLuma = Math.max(95, 158 - tol * 0.52);

    const bgMask = floodFillBorderMask(width, height, (p) => {
      const i = p * 4;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      return maxC - minC <= maxSat && luma >= minLuma;
    });

    for (let p = 0; p < count; p++) {
      if (bgMask[p]) {
        out[p * 4 + 3] = 0;
      }
    }

    // Soften & defringe boundary pixels touching removed checkerboard
    const haloRings = Math.max(1, Math.round(1 + soft / 30));
    let frontier = bgMask;
    for (let ring = 0; ring < haloRings; ring++) {
      const nextFrontier = new Uint8Array(frontier);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const p = y * width + x;
          if (frontier[p]) continue;
          if (
            frontier[p - 1] ||
            frontier[p + 1] ||
            frontier[p - width] ||
            frontier[p + width]
          ) {
            const i = p * 4;
            const r = out[i];
            const g = out[i + 1];
            const b = out[i + 2];
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            // Neutral bright edge pixel -> fade & defringe so no bright checkerboard halo shows
            if (sat <= maxSat + 18 && luma >= minLuma - 28) {
              const factor = ring === 0 ? 0.35 : 0.72;
              out[i + 3] = Math.round(out[i + 3] * factor);
              if (spill > 0.1) {
                const darken = 1 - spill * 0.45;
                out[i] = Math.round(r * darken);
                out[i + 1] = Math.round(g * darken);
                out[i + 2] = Math.round(b * darken);
              }
            }
            nextFrontier[p] = 1;
          }
        }
      }
      frontier = nextFrontier;
    }
  } else if (config.mode === 'remove-white' || config.mode === 'auto-corner') {
    let refR = 255;
    let refG = 255;
    let refB = 255;

    if (config.mode === 'auto-corner') {
      // Average the 4 corner pixels (2px inset)
      const corners = [
        [Math.min(2, width - 1), Math.min(2, height - 1)],
        [Math.max(0, width - 3), Math.min(2, height - 1)],
        [Math.min(2, width - 1), Math.max(0, height - 3)],
        [Math.max(0, width - 3), Math.max(0, height - 3)],
      ];
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (const [cx, cy] of corners) {
        const idx = (cy * width + cx) * 4;
        sr += out[idx];
        sg += out[idx + 1];
        sb += out[idx + 2];
      }
      refR = sr / 4;
      refG = sg / 4;
      refB = sb / 4;
    }

    const maxDist = 22 + tol * 1.45;
    const softBand = 16 + soft * 0.7;

    const colorDist = (i: number) => {
      const dr = out[i] - refR;
      const dg = out[i + 1] - refG;
      const db = out[i + 2] - refB;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    const bgMask = floodFillBorderMask(width, height, (p) => colorDist(p * 4) <= maxDist);

    for (let p = 0; p < count; p++) {
      if (bgMask[p]) {
        out[p * 4 + 3] = 0;
      }
    }

    // Soften 2-ring boundary
    let frontier = bgMask;
    const haloRings = Math.max(1, Math.round(1 + soft / 30));
    for (let ring = 0; ring < haloRings; ring++) {
      const nextFrontier = new Uint8Array(frontier);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const p = y * width + x;
          if (frontier[p]) continue;
          if (
            frontier[p - 1] ||
            frontier[p + 1] ||
            frontier[p - width] ||
            frontier[p + width]
          ) {
            const i = p * 4;
            const d = colorDist(i);
            const alphaMult = smoothstep(maxDist * 0.85, maxDist + softBand, d);
            out[i + 3] = Math.round(out[i + 3] * Math.max(0.2 * (ring + 1), alphaMult));
            nextFrontier[p] = 1;
          }
        }
      }
      frontier = nextFrontier;
    }
  }

  // Optional soft border edge feathering so rectangular overlay edges melt into the background
  const edgeFadePct = clamp(config.edgeFade, 0, 60);
  if (edgeFadePct > 0.5) {
    const fadeX = Math.max(1, Math.round((width * edgeFadePct) / 100));
    const fadeY = Math.max(1, Math.round((height * edgeFadePct) / 100));
    for (let y = 0; y < height; y++) {
      const dy = Math.min(y, height - 1 - y);
      const fy = dy < fadeY ? smoothstep(0, fadeY, dy) : 1;
      for (let x = 0; x < width; x++) {
        const dx = Math.min(x, width - 1 - x);
        const fx = dx < fadeX ? smoothstep(0, fadeX, dx) : 1;
        const mult = fx * fy;
        if (mult < 0.999) {
          const idx = (y * width + x) * 4 + 3;
          out[idx] = Math.round(out[idx] * mult);
        }
      }
    }
  }

  return out;
}
