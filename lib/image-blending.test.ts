import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LAYER_KEYING_CONFIG,
  detectBackgroundType,
  processKeyedImagePixels,
} from './image-blending';

function makeImage(
  w: number,
  h: number,
  fill: (x: number, y: number) => [number, number, number, number]
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * w + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

test('chroma-green removes green screen, preserves subject skin, and suppresses green hair spill', () => {
  const w = 20;
  const h = 20;
  const src = makeImage(w, h, (x, y) => {
    // Center subject (skin tone)
    if (x >= 7 && x <= 13 && y >= 7 && y <= 13) return [210, 155, 130, 255];
    // Hair fringe with green spill at x=6
    if (x === 6 && y >= 7 && y <= 13) return [80, 105, 75, 255];
    // Pure green screen background
    return [35, 185, 70, 255];
  });

  assert.equal(detectBackgroundType(src, w, h), 'chroma-green');

  const out = processKeyedImagePixels(src, w, h, {
    ...DEFAULT_LAYER_KEYING_CONFIG,
    mode: 'chroma-green',
    tolerance: 40,
    softness: 30,
    spillSuppress: 85,
  });

  // Outer green screen must be fully transparent
  assert.equal(out[(1 * w + 1) * 4 + 3], 0);
  // Subject skin center stays solid opaque
  assert.equal(out[(10 * w + 10) * 4 + 3], 255);
  // Green fringe pixel at (6, 10) has green channel suppressed down near max(r, b)
  const fringeIdx = (10 * w + 6) * 4;
  assert.ok(
    out[fringeIdx + 1] < 90,
    `expected green spill suppressed below 90, got ${out[fringeIdx + 1]}`
  );
});

test('remove-black clears outer black background via border flood-fill while protecting enclosed dark hair/eyes', () => {
  const w = 24;
  const h = 24;
  const src = makeImage(w, h, (x, y) => {
    // Enclosed dark pupil inside bright face (must stay opaque!)
    if (x >= 11 && x <= 13 && y >= 11 && y <= 13) return [5, 5, 6, 255];
    // Bright face ring surrounding the dark pupil
    if (x >= 8 && x <= 16 && y >= 8 && y <= 16) return [205, 160, 135, 255];
    // Outer pure black backdrop
    return [2, 2, 3, 255];
  });

  assert.equal(detectBackgroundType(src, w, h), 'remove-black');

  const out = processKeyedImagePixels(src, w, h, {
    ...DEFAULT_LAYER_KEYING_CONFIG,
    mode: 'remove-black',
    tolerance: 35,
    softness: 25,
  });

  // Outer black corner becomes transparent
  assert.equal(out[(1 * w + 1) * 4 + 3], 0);
  // Enclosed dark pupil inside face remains 100% opaque (not punched out!)
  assert.equal(out[(12 * w + 12) * 4 + 3], 255);
  // Skin remains opaque
  assert.equal(out[(9 * w + 12) * 4 + 3], 255);
});

test('remove-checkerboard detects and removes baked gray+white checkerboard squares while preserving subject', () => {
  const w = 24;
  const h = 24;
  const src = makeImage(w, h, (x, y) => {
    // Colored subject on right side
    if (x >= 14 && x <= 21 && y >= 6 && y <= 18) return [195, 140, 115, 255];
    // Baked gray/white 4x4 checkerboard pattern
    const isWhite = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
    return isWhite ? [252, 252, 252, 255] : [204, 204, 204, 255];
  });

  assert.equal(detectBackgroundType(src, w, h), 'remove-checkerboard');

  const out = processKeyedImagePixels(src, w, h, {
    ...DEFAULT_LAYER_KEYING_CONFIG,
    mode: 'remove-checkerboard',
    tolerance: 40,
    softness: 25,
  });

  // Both white square (1,1) and gray square (5,1) become transparent
  assert.equal(out[(1 * w + 1) * 4 + 3], 0);
  assert.equal(out[(1 * w + 5) * 4 + 3], 0);
  // Subject interior stays solid opaque
  assert.equal(out[(12 * w + 18) * 4 + 3], 255);
});

test('detectBackgroundType returns none for native transparent PNG and edgeFade softens borders', () => {
  const w = 20;
  const h = 20;
  const transparentPng = makeImage(w, h, (x, y) =>
    x >= 6 && x <= 14 && y >= 6 && y <= 14 ? [200, 150, 130, 255] : [0, 0, 0, 0]
  );
  assert.equal(detectBackgroundType(transparentPng, w, h), 'none');

  const solid = makeImage(w, h, () => [180, 140, 120, 255]);
  const faded = processKeyedImagePixels(solid, w, h, {
    ...DEFAULT_LAYER_KEYING_CONFIG,
    mode: 'none',
    edgeFade: 25,
  });

  // Outer edge alpha faded to 0, center stays 255
  assert.equal(faded[0 * 4 + 3], 0);
  assert.equal(faded[(10 * w + 10) * 4 + 3], 255);
});
