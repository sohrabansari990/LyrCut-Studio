import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptLayersToRatio,
  areClipLayersInSync,
  bringLayerForward,
  clearLayerAnimation,
  createDefaultLayers,
  duplicateCanvasLayer,
  formatLayerDisplayLabel,
  getClipLayerId,
  getCursorForLayerHandle,
  hasLayerAnimation,
  hitTestCanvasLayer,
  hitTestLayerHandle,
  resizeLayerByHandle,
  sendLayerBackward,
  snapLayerPosition,
  snapLayerResize,
  syncVisualClipsToLayers,
} from './canvas-layers';
import { evaluateLayerAtTime } from './timeline-engine';

test('createDefaultLayers and adaptLayersToRatio map coordinates cleanly between 16:9 and 9:16', () => {
  const landscape = createDefaultLayers('16:9');
  assert.equal(landscape[0].width, 1920);
  assert.equal(landscape[0].height, 1080);

  const portrait = adaptLayersToRatio(landscape, '16:9', '9:16');
  assert.equal(portrait[0].width, 1080);
  assert.equal(portrait[0].height, 1920);
  assert.ok(portrait[4].width <= 1080);
});

test('hitTestCanvasLayer respects z-order, lock state, and scrolling-lyrics mode', () => {
  const layers = createDefaultLayers('16:9');
  const hitScrolling = hitTestCanvasLayer(layers, 960, 540, true);
  assert.equal(hitScrolling?.type, 'scrolling-lyrics');

  const hitFarsiClassic = hitTestCanvasLayer(layers, 960, 780, false);
  assert.equal(hitFarsiClassic?.type, 'lyric-farsi');
});

test('snapLayerPosition snaps layer center to canvas center within threshold', () => {
  const layers = createDefaultLayers('16:9');
  const box = { ...layers[4], width: 400, height: 200 };
  // Canvas center X = 960; box at x=755 has center 955 (within 14px)
  const snapped = snapLayerPosition(box, 755, 444, 1920, 1080, 14);
  assert.equal(snapped.x, 760);
  assert.equal(snapped.y, 440);
  assert.equal(snapped.snapCenterX, true);
  assert.equal(snapped.snapCenterY, true);
});

test('resizeLayerByHandle preserves aspect ratio when lockAspect is true', () => {
  const layers = createDefaultLayers('16:9');
  const box = { ...layers[4], x: 100, y: 100, width: 400, height: 200, aspectLocked: false };
  const resized = resizeLayerByHandle(box, 'se', 200, 10, true);
  assert.equal(resized.width, 600);
  assert.equal(resized.height, 300);
});

test('bringLayerForward, sendLayerBackward, and duplicateCanvasLayer update z-order reliably', () => {
  const layers = createDefaultLayers('16:9');
  const firstId = layers[0].id;
  const movedForward = bringLayerForward(layers, firstId);
  assert.equal(movedForward[1].id, firstId);

  const movedBack = sendLayerBackward(movedForward, firstId);
  assert.equal(movedBack[0].id, firstId);

  const dup = duplicateCanvasLayer(layers, firstId);
  assert.equal(dup.layers.length, layers.length + 1);
  assert.ok(dup.newLayerId);
});

test('syncVisualClipsToLayers creates independent V1 and V2 layers with unique IDs and isolated animation', () => {
  const base = createDefaultLayers('16:9');
  const clips = [
    {
      id: 'v1-bg',
      name: 'Background Stage',
      kind: 'image' as const,
      url: '/bg.jpg',
      startTime: 0,
      endTime: 24,
      trackIndex: 0,
      opacity: 1,
    },
    {
      id: 'v2-singer',
      name: 'Singer Cutout',
      kind: 'image' as const,
      url: '/singer.png',
      startTime: 0,
      endTime: 12,
      trackIndex: 1,
      opacity: 1,
      fitMode: 'contain' as const,
    },
  ];
  const dims = new Map([
    ['/bg.jpg', { width: 1920, height: 1080 }],
    ['/singer.png', { width: 768, height: 1376 }],
  ]);

  const synced = syncVisualClipsToLayers(base, clips, '16:9', dims);
  assert.equal(areClipLayersInSync(synced, clips), true);
  assert.equal(
    synced.some((l) => l.type === 'background-media'),
    false,
    'shared background-media placeholder must be replaced by independent clip layers'
  );

  const v1 = synced.find((l) => l.id === getClipLayerId('v1-bg'));
  const v2 = synced.find((l) => l.id === getClipLayerId('v2-singer'));
  assert.ok(v1 && v2);
  assert.notEqual(v1.id, v2.id);
  assert.equal(formatLayerDisplayLabel(v1), 'V1 · Background Stage');
  assert.equal(formatLayerDisplayLabel(v2), 'V2 · Singer Cutout');
  assert.equal(v1.width, 1920);
  assert.ok(v2.width < 1920, 'portrait V2 image should have a tight centered bounding box');

  // Apply slide-right animation ONLY to V2
  const animatedV2 = {
    ...v2,
    animation: {
      enterPreset: 'slide-right' as const,
      exitPreset: 'none' as const,
      inDuration: 1.0,
      outDuration: 0.6,
      easing: 'ease-out' as const,
    },
  };

  const evalV1 = evaluateLayerAtTime(v1, 0.25, 1920, 1080, 24);
  const evalV2 = evaluateLayerAtTime(animatedV2, 0.25, 1920, 1080, 24);
  assert.equal(evalV1.visible, true);
  assert.equal(evalV2.visible, true);
  assert.equal(evalV1.layer.x, 0, 'V1 background must stay stationary');
  assert.ok(evalV2.layer.x > animatedV2.x + 50, 'V2 singer must slide in from the right');

  // Clear animation from V2 leaves V2 intact with no animation or keyframes
  assert.equal(hasLayerAnimation(animatedV2), true);
  const clearedV2 = clearLayerAnimation(animatedV2);
  assert.equal(hasLayerAnimation(clearedV2), false);
  const evalCleared = evaluateLayerAtTime(clearedV2, 0.25, 1920, 1080, 24);
  assert.equal(evalCleared.layer.x, clearedV2.x);
});

test('hitTestLayerHandle and getCursorForLayerHandle distinguish 4 corners vs 4 side stretch edges', () => {
  const layers = createDefaultLayers('16:9');
  const box = { ...layers[4], x: 400, y: 200, width: 600, height: 400, rotation: 0 };

  // Corners -> diagonal resize arrows
  assert.equal(hitTestLayerHandle(box, 400, 200), 'nw');
  assert.equal(getCursorForLayerHandle('nw', 0), 'nwse-resize');
  assert.equal(hitTestLayerHandle(box, 1000, 200), 'ne');
  assert.equal(getCursorForLayerHandle('ne', 0), 'nesw-resize');
  assert.equal(hitTestLayerHandle(box, 1000, 600), 'se');
  assert.equal(getCursorForLayerHandle('se', 0), 'nwse-resize');
  assert.equal(hitTestLayerHandle(box, 400, 600), 'sw');
  assert.equal(getCursorForLayerHandle('sw', 0), 'nesw-resize');

  // Side edges (including off-center points along edge) -> horizontal/vertical stretch arrows
  assert.equal(hitTestLayerHandle(box, 700, 200), 'n');
  assert.equal(hitTestLayerHandle(box, 550, 202), 'n');
  assert.equal(getCursorForLayerHandle('n', 0), 'ns-resize');
  assert.equal(hitTestLayerHandle(box, 1000, 350), 'e');
  assert.equal(getCursorForLayerHandle('e', 0), 'ew-resize');
  assert.equal(hitTestLayerHandle(box, 400, 480), 'w');
  assert.equal(getCursorForLayerHandle('w', 0), 'ew-resize');
  assert.equal(hitTestLayerHandle(box, 800, 600), 's');
  assert.equal(getCursorForLayerHandle('s', 0), 'ns-resize');

  // Side-handle resize stretches ONLY that side even when aspectLocked is true
  const lockedBox = { ...box, aspectLocked: true };
  const stretchedRight = resizeLayerByHandle(lockedBox, 'e', 150, 80, true);
  assert.equal(stretchedRight.width, 750);
  assert.equal(stretchedRight.height, 400, 'stretching right edge must not alter height');
  const stretchedBottom = resizeLayerByHandle(lockedBox, 's', 80, 120, true);
  assert.equal(stretchedBottom.height, 520);
  assert.equal(stretchedBottom.width, 600, 'stretching bottom edge must not alter width');
});

test('snapLayerPosition and snapLayerResize magnetically stick to sibling layers and canvas edges', () => {
  const base = createDefaultLayers('16:9');
  const sibling = {
    ...base[4],
    id: 'layer-a',
    x: 200,
    y: 150,
    width: 400,
    height: 300,
    visible: true,
  };
  const moving = {
    ...base[4],
    id: 'layer-b',
    x: 700,
    y: 155,
    width: 300,
    height: 200,
    visible: true,
  };

  // Drag layer-b near sibling's right edge (200+400 = 600) and top edge (150)
  const snapped = snapLayerPosition(moving, 608, 156, 1920, 1080, 14, [sibling]);
  assert.equal(snapped.x, 600, 'layer-b left edge must snap flush to sibling right edge');
  assert.equal(snapped.y, 150, 'layer-b top edge must align with sibling top edge');
  assert.deepEqual(snapped.verticalGuides, [600]);
  assert.deepEqual(snapped.horizontalGuides, [150]);

  // Drag layer-b left edge near canvas vertical center (960) for split-screen alignment
  const centerSnapped = snapLayerPosition(moving, 966, 200, 1920, 1080, 14, [sibling]);
  assert.equal(centerSnapped.x, 960);
  assert.equal(centerSnapped.snapCenterX, true);

  // Resize layer-b right edge near canvas right border (1920)
  const resized = snapLayerResize(
    moving.id,
    { x: 1500, y: 200, width: 412, height: 300 },
    'e',
    1920,
    1080,
    14,
    [sibling]
  );
  assert.equal(resized.width, 420);
  assert.deepEqual(resized.verticalGuides, [1920]);
});

test('formatTimerCounterText and computeTimerProgress support stopwatch, countdown, and elapsed/total modes', async () => {
  const { formatTimerCounterText, computeTimerProgress } = await import('./canvas-layers');

  assert.equal(
    formatTimerCounterText(3.4, 180, {
      timerMode: 'count-up',
      timerFormat: 'hh:mm:ss',
      timerScope: 'song',
    }),
    '00:00:03'
  );

  assert.equal(
    formatTimerCounterText(65.7, 180, {
      timerMode: 'count-up',
      timerFormat: 'mm:ss.d',
      timerPrefix: 'REC',
      timerScope: 'song',
    }),
    'REC 01:05.7'
  );

  assert.equal(
    formatTimerCounterText(50, 180, {
      timerMode: 'count-down',
      timerFormat: 'mm:ss',
      timerScope: 'song',
    }),
    '02:10'
  );

  assert.equal(
    formatTimerCounterText(45, 180, {
      timerMode: 'elapsed-total',
      timerFormat: 'mm:ss',
      timerScope: 'song',
    }),
    '00:45 / 03:00'
  );

  assert.equal(
    computeTimerProgress(15, 180, { startTime: 10, endTime: 30, timerScope: 'layer' }),
    0.25
  );
});



