import { AspectRatio } from './lyrics-parser';
import { LayerBlendMode, LayerKeyingConfig } from './image-blending';

export type CanvasLayerType =
  | 'background-media'
  | 'media-clip'
  | 'scrolling-lyrics'
  | 'lyric-farsi'
  | 'lyric-romanized'
  | 'lyric-english'
  | 'image'
  | 'shape'
  | 'text'
  | 'timer-counter';

export type ShapeKind = 'rectangle' | 'pill' | 'circle';

export type TimerCounterMode = 'count-up' | 'count-down' | 'elapsed-total';
export type TimerCounterFormat = 'mm:ss' | 'mm:ss.d' | 'hh:mm:ss' | 'ss';
export type TimerCounterStyle =
  | 'minimal-glass'
  | 'stopwatch-hud'
  | 'neon-amber'
  | 'clean-plain';

export type LayerAnimationPreset =
  | 'none'
  | 'slide-right'
  | 'slide-left'
  | 'slide-top'
  | 'slide-bottom'
  | 'zoom-in'
  | 'fade'
  | 'pop-bounce';

export type KeyframeEasing = 'linear' | 'ease-out' | 'ease-in-out';

export interface LayerAnimationConfig {
  enterPreset: LayerAnimationPreset;
  exitPreset: LayerAnimationPreset;
  inDuration: number; // seconds
  outDuration: number; // seconds
  easing: KeyframeEasing;
}

export interface LayerKeyframe {
  id: string;
  time: number; // seconds
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number; // 1 = 100%
  opacity: number;
  rotation: number;
  easing: KeyframeEasing;
}

export interface CanvasLayer {
  id: string;
  type: CanvasLayerType;
  name: string;
  x: number; // left edge in native 1080p canvas coords
  y: number; // top edge in native 1080p canvas coords
  width: number;
  height: number;
  scale?: number; // independent uniform scale multiplier (default 1)
  rotation: number; // degrees
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  aspectLocked: boolean;
  // Link to an independent timeline clip (V1, V2, V3...)
  clipId?: string;
  trackIndex?: number;
  mediaKind?: 'image' | 'video';
  fitMode?: 'cover' | 'contain' | 'stretch';
  // Blending & background keying (chroma green/blue, black BG, checkerboard, edge feather)
  blendMode?: LayerBlendMode;
  keying?: LayerKeyingConfig;
  // Optional time window, entrance/exit presets, and keyframe animation
  startTime?: number;
  endTime?: number;
  animation?: LayerAnimationConfig;
  keyframes?: LayerKeyframe[];
  // Optional payloads for custom overlay elements
  mediaUrl?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  shadowBlur?: number;
  backgroundColor?: string;
  color?: string;
  fillColor?: string;
  strokeColor?: string;
  shapeKind?: ShapeKind;
  // Optional payloads for timer-counter layers
  timerMode?: TimerCounterMode;
  timerFormat?: TimerCounterFormat;
  timerStyle?: TimerCounterStyle;
  timerPrefix?: string;
  timerScope?: 'song' | 'layer';
  timerShowProgress?: boolean;
  timerAccentColor?: string;
  timerBgColor?: string;
  timerBgOpacity?: number; // 0 = transparent (default), 0..1
  timerBorderOpacity?: number; // 0 = no border (default), 0..1
  timerShowDot?: boolean;
}

export interface SyncableVisualClip {
  id: string;
  name: string;
  kind: 'image' | 'video';
  url: string;
  trackIndex?: number;
  startTime: number;
  endTime: number;
  opacity?: number;
  fitMode?: 'cover' | 'contain' | 'stretch';
}

function formatSingleClock(seconds: number, format: TimerCounterFormat): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (format === 'ss') {
    return `${Math.floor(safe).toString().padStart(2, '0')}s`;
  }
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  if (format === 'hh:mm:ss') {
    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  const totalMins = Math.floor(safe / 60);
  const mmss = `${totalMins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
  if (format === 'mm:ss.d') {
    return `${mmss}.${tenths}`;
  }
  return mmss;
}

export function computeTimerProgress(
  currentTime: number,
  projectDuration: number,
  layer: Pick<CanvasLayer, 'startTime' | 'endTime' | 'timerScope'>
): number {
  const scope = layer.timerScope ?? 'song';
  const start = scope === 'layer' ? layer.startTime ?? 0 : 0;
  const end =
    scope === 'layer' && typeof layer.endTime === 'number' && layer.endTime > start
      ? layer.endTime
      : Math.max(1, projectDuration || 24);
  const span = Math.max(0.1, end - start);
  return Math.max(0, Math.min(1, (currentTime - start) / span));
}

export function formatTimerCounterText(
  currentTime: number,
  projectDuration: number,
  layer: Pick<
    CanvasLayer,
    'startTime' | 'endTime' | 'timerMode' | 'timerFormat' | 'timerPrefix' | 'timerScope'
  >
): string {
  const mode: TimerCounterMode = layer.timerMode ?? 'count-up';
  const format: TimerCounterFormat = layer.timerFormat ?? 'hh:mm:ss';
  const scope = layer.timerScope ?? 'song';
  const start = scope === 'layer' ? layer.startTime ?? 0 : 0;
  const totalDur =
    scope === 'layer' && typeof layer.endTime === 'number' && layer.endTime > start
      ? layer.endTime - start
      : Math.max(0, projectDuration || 0);
  const elapsed = Math.max(0, currentTime - start);
  const prefix = (layer.timerPrefix ?? '').trim();

  let core = '';
  if (mode === 'count-down') {
    const remaining = Math.max(0, totalDur - elapsed);
    core = formatSingleClock(remaining, format);
  } else if (mode === 'elapsed-total') {
    core = `${formatSingleClock(elapsed, format)} / ${formatSingleClock(totalDur, format)}`;
  } else {
    core = formatSingleClock(elapsed, format);
  }

  return prefix ? `${prefix} ${core}` : core;
}

export function getClipLayerId(clipId: string): string {
  return `layer-clip-${clipId}`;
}

export function isVisualClipLayer(layer: CanvasLayer | null | undefined): boolean {
  return Boolean(layer && layer.type === 'media-clip' && layer.clipId);
}

export function hasLayerAnimation(layer: CanvasLayer | null | undefined): boolean {
  if (!layer) return false;
  const hasPreset = Boolean(
    layer.animation &&
      (layer.animation.enterPreset !== 'none' || layer.animation.exitPreset !== 'none')
  );
  const hasKfs = Boolean(layer.keyframes && layer.keyframes.length > 0);
  return hasPreset || hasKfs;
}

export function clearLayerAnimation(layer: CanvasLayer): CanvasLayer {
  return {
    ...layer,
    animation: undefined,
    keyframes: [],
  };
}

export function formatLayerDisplayLabel(layer: CanvasLayer): string {
  if (layer.type === 'media-clip') {
    const trackNum = (layer.trackIndex ?? 0) + 1;
    return `V${trackNum} · ${layer.name}`;
  }
  return layer.name;
}

export type LayerHandleId =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rotate';

export interface LayerHandlePoint {
  id: LayerHandleId;
  x: number;
  y: number;
}

export function getCanvasDimensions(ratio: AspectRatio): { width: number; height: number } {
  return ratio === '16:9'
    ? { width: 1920, height: 1080 }
    : { width: 1080, height: 1920 };
}

export function createDefaultLayers(ratio: AspectRatio): CanvasLayer[] {
  const { width, height } = getCanvasDimensions(ratio);
  const isPortrait = ratio === '9:16';

  return [
    {
      id: 'layer-bg-media',
      type: 'background-media',
      name: 'Background Media',
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      aspectLocked: true,
    },
    {
      id: 'layer-lyric-farsi',
      type: 'lyric-farsi',
      name: 'Farsi / Dari Track',
      x: Math.round(width * 0.08),
      y: Math.round(isPortrait ? height * 0.64 : height * 0.68),
      width: Math.round(width * 0.84),
      height: Math.round(isPortrait ? 140 : 110),
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      aspectLocked: false,
    },
    {
      id: 'layer-lyric-romanized',
      type: 'lyric-romanized',
      name: 'Romanized Track',
      x: Math.round(width * 0.08),
      y: Math.round(isPortrait ? height * 0.74 : height * 0.79),
      width: Math.round(width * 0.84),
      height: Math.round(isPortrait ? 90 : 75),
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      aspectLocked: false,
    },
    {
      id: 'layer-lyric-english',
      type: 'lyric-english',
      name: 'English Track',
      x: Math.round(width * 0.08),
      y: Math.round(isPortrait ? height * 0.81 : height * 0.87),
      width: Math.round(width * 0.84),
      height: Math.round(isPortrait ? 85 : 70),
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      aspectLocked: false,
    },
    {
      id: 'layer-scrolling-lyrics',
      type: 'scrolling-lyrics',
      name: 'Scrolling Lyrics Group',
      x: Math.round(width * 0.08),
      y: Math.round(isPortrait ? height * 0.19 : height * 0.12),
      width: Math.round(width * 0.84),
      height: Math.round(isPortrait ? height * 0.62 : height * 0.76),
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      aspectLocked: false,
    },
  ];
}

/**
 * Proportionally adapts layer bounds when toggling between 16:9 Landscape and 9:16 Portrait.
 */
export function adaptLayersToRatio(
  layers: CanvasLayer[],
  fromRatio: AspectRatio,
  toRatio: AspectRatio
): CanvasLayer[] {
  if (fromRatio === toRatio) return layers;
  const fromDim = getCanvasDimensions(fromRatio);
  const toDim = getCanvasDimensions(toRatio);

  return layers.map((layer) => {
    if (
      layer.type === 'background-media' ||
      (layer.type === 'media-clip' && (layer.trackIndex ?? 0) === 0)
    ) {
      const wasFullFrame =
        Math.abs(layer.x) < 4 &&
        Math.abs(layer.y) < 4 &&
        Math.abs(layer.width - fromDim.width) < 8 &&
        Math.abs(layer.height - fromDim.height) < 8;
      if (wasFullFrame) {
        return {
          ...layer,
          x: 0,
          y: 0,
          width: toDim.width,
          height: toDim.height,
        };
      }
    }

    const cxPct = (layer.x + layer.width / 2) / fromDim.width;
    const cyPct = (layer.y + layer.height / 2) / fromDim.height;
    const wPct = layer.width / fromDim.width;
    const hPct = layer.height / fromDim.height;

    const nextW = Math.max(60, Math.round(wPct * toDim.width));
    const nextH =
      layer.aspectLocked && layer.width > 0
        ? Math.max(40, Math.round(nextW * (layer.height / layer.width)))
        : Math.max(40, Math.round(hPct * toDim.height));

    return {
      ...layer,
      x: Math.round(cxPct * toDim.width - nextW / 2),
      y: Math.round(cyPct * toDim.height - nextH / 2),
      width: nextW,
      height: nextH,
    };
  });
}

function computeInitialClipBounds(
  clip: SyncableVisualClip,
  dim: { width: number; height: number },
  mediaDimensions?: Map<string, { width: number; height: number }>
): { x: number; y: number; width: number; height: number } {
  const trackIdx = clip.trackIndex ?? 0;
  if (trackIdx === 0) {
    return { x: 0, y: 0, width: dim.width, height: dim.height };
  }

  const natural = mediaDimensions?.get(clip.url);
  if (natural && natural.width > 0 && natural.height > 0) {
    const srcRatio = natural.width / natural.height;
    const destRatio = dim.width / dim.height;
    let w = dim.width;
    let h = dim.height;
    if (srcRatio >= destRatio) {
      // Landscape/widescreen image fills full player width cleanly
      w = dim.width;
      h = Math.max(60, Math.round(w / srcRatio));
    } else {
      // Portrait cutout fills full player height cleanly without clipping
      h = dim.height;
      w = Math.max(60, Math.round(h * srcRatio));
    }
    return {
      x: Math.round((dim.width - w) / 2),
      y: Math.round((dim.height - h) / 2),
      width: w,
      height: h,
    };
  }

  // Default to full-frame bounds until natural dimensions load
  return {
    x: 0,
    y: 0,
    width: dim.width,
    height: dim.height,
  };
}

/**
 * Ensures every VisualTimelineClip has its own independent CanvasLayer with a unique ID,
 * independent transform, start/end time, animation, and keyframes.
 * Never mutates an existing layer's position/scale/rotation/animation/keyframes.
 */
export function syncVisualClipsToLayers(
  layers: CanvasLayer[],
  visualClips: SyncableVisualClip[],
  ratio: AspectRatio,
  mediaDimensions?: Map<string, { width: number; height: number }>
): CanvasLayer[] {
  const dim = getCanvasDimensions(ratio);
  const clipById = new Map<string, SyncableVisualClip>();
  for (const clip of visualClips) {
    clipById.set(clip.id, clip);
  }

  // Keep existing layers, updating timeline-owned metadata for matching clip layers
  // and dropping orphaned media-clip layers or the legacy shared background-media placeholder.
  const existingClipIds = new Set<string>();
  const retained: CanvasLayer[] = [];

  for (const layer of layers) {
    if (layer.type === 'background-media' && visualClips.length > 0) {
      // Replaced by independent per-clip layers
      continue;
    }
    if (layer.type === 'media-clip' && layer.clipId) {
      const clip = clipById.get(layer.clipId);
      if (!clip) {
        // Clip was deleted from timeline
        continue;
      }
      existingClipIds.add(clip.id);
      const nextTrack = clip.trackIndex ?? 0;
      const nextFit =
        clip.fitMode ??
        (layer.fitMode === 'stretch' ? 'stretch' : nextTrack === 0 ? 'cover' : 'contain');
      retained.push({
        ...layer,
        name: clip.name,
        mediaUrl: clip.url,
        mediaKind: clip.kind,
        trackIndex: nextTrack,
        startTime: clip.startTime,
        endTime: clip.endTime,
        fitMode: nextFit,
      });
    } else {
      retained.push(layer);
    }
  }

  // Build layers for newly added clips (sorted bottom-to-top by trackIndex: V1 -> V2 -> V3)
  const missingClips = visualClips
    .filter((c) => !existingClipIds.has(c.id))
    .sort((a, b) => (a.trackIndex ?? 0) - (b.trackIndex ?? 0));

  if (missingClips.length === 0) {
    return retained;
  }

  const nextLayers = [...retained];
  for (const clip of missingClips) {
    const trackIdx = clip.trackIndex ?? 0;
    const bounds = computeInitialClipBounds(clip, dim, mediaDimensions);
    const newLayer: CanvasLayer = {
      id: getClipLayerId(clip.id),
      type: 'media-clip',
      clipId: clip.id,
      trackIndex: trackIdx,
      mediaKind: clip.kind,
      mediaUrl: clip.url,
      fitMode: clip.fitMode ?? (trackIdx === 0 ? 'cover' : 'contain'),
      name: clip.name,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      scale: 1,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: clip.opacity ?? 1,
      aspectLocked: true,
      startTime: clip.startTime,
      endTime: clip.endTime,
    };

    // Insert right after the highest existing media-clip layer with trackIndex <= new trackIndex,
    // keeping video/image clip layers below lyrics & custom overlays by default.
    let insertIdx = 0;
    for (let i = 0; i < nextLayers.length; i++) {
      const candidate = nextLayers[i];
      if (candidate.type === 'media-clip' && (candidate.trackIndex ?? 0) <= trackIdx) {
        insertIdx = i + 1;
      }
    }
    nextLayers.splice(insertIdx, 0, newLayer);
  }

  return nextLayers;
}

export function areClipLayersInSync(
  layers: CanvasLayer[],
  visualClips: SyncableVisualClip[]
): boolean {
  if (visualClips.length > 0 && layers.some((l) => l.type === 'background-media')) {
    return false;
  }
  const clipLayers = layers.filter((l) => l.type === 'media-clip' && l.clipId);
  if (clipLayers.length !== visualClips.length) return false;
  const byId = new Map<string, CanvasLayer>();
  for (const l of clipLayers) {
    if (l.clipId) byId.set(l.clipId, l);
  }
  for (const clip of visualClips) {
    const layer = byId.get(clip.id);
    if (!layer) return false;
    const expectedTrack = clip.trackIndex ?? 0;
    const expectedFit =
      clip.fitMode ??
      (layer.fitMode === 'stretch' ? 'stretch' : expectedTrack === 0 ? 'cover' : 'contain');
    if (
      layer.name !== clip.name ||
      layer.mediaUrl !== clip.url ||
      layer.mediaKind !== clip.kind ||
      (layer.trackIndex ?? 0) !== expectedTrack ||
      layer.startTime !== clip.startTime ||
      layer.endTime !== clip.endTime ||
      (layer.fitMode ?? expectedFit) !== expectedFit
    ) {
      return false;
    }
  }
  return true;
}

export function getLayerHandles(layer: CanvasLayer): LayerHandlePoint[] {
  const { x, y, width, height } = layer;
  const cx = x + width / 2;
  const cy = y + height / 2;
  return [
    { id: 'nw', x, y },
    { id: 'n', x: cx, y },
    { id: 'ne', x: x + width, y },
    { id: 'e', x: x + width, y: cy },
    { id: 'se', x: x + width, y: y + height },
    { id: 's', x: cx, y: y + height },
    { id: 'sw', x, y: y + height },
    { id: 'w', x, y: cy },
    { id: 'rotate', x: cx, y: y - Math.max(36, Math.round(Math.min(width, height) * 0.08)) },
  ];
}

function toLayerLocalPoint(
  layer: CanvasLayer,
  px: number,
  py: number
): { lx: number; ly: number } {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rad = (-layer.rotation * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    lx: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    ly: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

export function hitTestCanvasLayer(
  layers: CanvasLayer[],
  px: number,
  py: number,
  scrollingEnabled: boolean
): CanvasLayer | null {
  // Search topmost first (end of array -> start)
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.visible || layer.locked) continue;
    if (
      scrollingEnabled &&
      (layer.type === 'lyric-farsi' ||
        layer.type === 'lyric-romanized' ||
        layer.type === 'lyric-english')
    ) {
      continue;
    }
    if (!scrollingEnabled && layer.type === 'scrolling-lyrics') {
      continue;
    }
    const { lx, ly } = toLayerLocalPoint(layer, px, py);
    if (
      lx >= layer.x &&
      lx <= layer.x + layer.width &&
      ly >= layer.y &&
      ly <= layer.y + layer.height
    ) {
      return layer;
    }
  }
  return null;
}

export function hitTestLayerHandle(
  layer: CanvasLayer,
  px: number,
  py: number,
  thresholdPx = 28
): LayerHandleId | null {
  const { lx, ly } = toLayerLocalPoint(layer, px, py);
  const handles = getLayerHandles(layer);

  // 1. Check 4 corner handles first (highest priority so corner arrows always trigger cleanly)
  const cornerIds: LayerHandleId[] = ['nw', 'ne', 'se', 'sw'];
  for (const id of cornerIds) {
    const h = handles.find((pt) => pt.id === id);
    if (h && Math.hypot(lx - h.x, ly - h.y) <= thresholdPx) {
      return id;
    }
  }

  // 2. Check rotate handle (including clamped-inside fallback when layer sits at top edge y <= 24)
  const rot = handles.find((pt) => pt.id === 'rotate');
  if (rot) {
    const clampedRotY = layer.y <= 28 ? layer.y + 30 : rot.y;
    if (
      Math.hypot(lx - rot.x, ly - rot.y) <= thresholdPx ||
      Math.hypot(lx - rot.x, ly - clampedRotY) <= thresholdPx * 0.8
    ) {
      return 'rotate';
    }
  }

  // 3. Check 4 side stretch handles (both midpoint pill AND anywhere along that edge segment!)
  const sideIds: LayerHandleId[] = ['n', 's', 'e', 'w'];
  for (const id of sideIds) {
    const h = handles.find((pt) => pt.id === id);
    if (h && Math.hypot(lx - h.x, ly - h.y) <= thresholdPx) {
      return id;
    }
  }

  const edgeTol = Math.max(14, thresholdPx * 0.7);
  const cornerPad = Math.min(thresholdPx, Math.min(layer.width, layer.height) * 0.25);
  const left = layer.x;
  const right = layer.x + layer.width;
  const top = layer.y;
  const bottom = layer.y + layer.height;

  if (lx >= left + cornerPad && lx <= right - cornerPad) {
    if (Math.abs(ly - top) <= edgeTol) return 'n';
    if (Math.abs(ly - bottom) <= edgeTol) return 's';
  }
  if (ly >= top + cornerPad && ly <= bottom - cornerPad) {
    if (Math.abs(lx - left) <= edgeTol) return 'w';
    if (Math.abs(lx - right) <= edgeTol) return 'e';
  }

  return null;
}

/**
 * Returns the exact CSS cursor for any canvas handle (accounting for layer rotation):
 * - 4 corners -> diagonal resize arrows (nwse-resize / nesw-resize)
 * - 4 sides -> single-side stretch arrows (ns-resize / ew-resize)
 * - rotate -> grab, body -> move, empty canvas -> default
 */
export function getCursorForLayerHandle(
  handle: LayerHandleId | 'move' | null,
  rotationDeg = 0
): string {
  if (!handle) return 'default';
  if (handle === 'move') return 'move';
  if (handle === 'rotate') return 'grab';

  const baseAngleByHandle: Record<Exclude<LayerHandleId, 'rotate'>, number> = {
    n: 0,
    ne: 45,
    e: 90,
    se: 135,
    s: 180,
    sw: 225,
    w: 270,
    nw: 315,
  };
  const angle = (((baseAngleByHandle[handle] + rotationDeg) % 180) + 180) % 180;
  if (angle < 22.5 || angle >= 157.5) return 'ns-resize';
  if (angle < 67.5) return 'nesw-resize';
  if (angle < 112.5) return 'ew-resize';
  return 'nwse-resize';
}

export interface CanvasSnapResult {
  x: number;
  y: number;
  snapCenterX: boolean;
  snapCenterY: boolean;
  verticalGuides: number[];
  horizontalGuides: number[];
}

export function snapLayerPosition(
  layer: CanvasLayer,
  nextX: number,
  nextY: number,
  canvasWidth: number,
  canvasHeight: number,
  snapThreshold = 14,
  otherLayers: CanvasLayer[] = []
): CanvasSnapResult {
  const xTargets = new Set<number>([0, canvasWidth / 2, canvasWidth]);
  const yTargets = new Set<number>([0, canvasHeight / 2, canvasHeight]);

  for (const other of otherLayers) {
    if (other.id === layer.id || !other.visible) continue;
    xTargets.add(other.x);
    xTargets.add(other.x + other.width / 2);
    xTargets.add(other.x + other.width);
    yTargets.add(other.y);
    yTargets.add(other.y + other.height / 2);
    yTargets.add(other.y + other.height);
  }

  let x = nextX;
  let bestXDist = snapThreshold + 0.001;
  let snappedXGuide: number | null = null;
  const xAnchors: Array<{ offset: number }> = [
    { offset: 0 },
    { offset: layer.width / 2 },
    { offset: layer.width },
  ];
  for (const target of xTargets) {
    for (const anchor of xAnchors) {
      const dist = Math.abs(nextX + anchor.offset - target);
      if (dist < bestXDist) {
        bestXDist = dist;
        x = target - anchor.offset;
        snappedXGuide = target;
      }
    }
  }

  let y = nextY;
  let bestYDist = snapThreshold + 0.001;
  let snappedYGuide: number | null = null;
  const yAnchors: Array<{ offset: number }> = [
    { offset: 0 },
    { offset: layer.height / 2 },
    { offset: layer.height },
  ];
  for (const target of yTargets) {
    for (const anchor of yAnchors) {
      const dist = Math.abs(nextY + anchor.offset - target);
      if (dist < bestYDist) {
        bestYDist = dist;
        y = target - anchor.offset;
        snappedYGuide = target;
      }
    }
  }

  const finalX = Math.round(x);
  const finalY = Math.round(y);
  const snapCenterX =
    snappedXGuide !== null && Math.abs(snappedXGuide - canvasWidth / 2) <= 1;
  const snapCenterY =
    snappedYGuide !== null && Math.abs(snappedYGuide - canvasHeight / 2) <= 1;

  return {
    x: finalX,
    y: finalY,
    snapCenterX,
    snapCenterY,
    verticalGuides: snappedXGuide !== null ? [Math.round(snappedXGuide)] : [],
    horizontalGuides: snappedYGuide !== null ? [Math.round(snappedYGuide)] : [],
  };
}

/**
 * Magnetically snaps the active edge(s) during a canvas resize/stretch operation
 * against canvas borders, canvas center, and all visible sibling layers' edges.
 */
export function snapLayerResize(
  layerId: string,
  resized: Pick<CanvasLayer, 'x' | 'y' | 'width' | 'height'>,
  handle: Exclude<LayerHandleId, 'rotate'>,
  canvasWidth: number,
  canvasHeight: number,
  snapThreshold = 14,
  otherLayers: CanvasLayer[] = []
): Pick<CanvasLayer, 'x' | 'y' | 'width' | 'height'> & {
  verticalGuides: number[];
  horizontalGuides: number[];
} {
  const minSize = 48;
  let { x, y, width, height } = resized;
  const verticalGuides: number[] = [];
  const horizontalGuides: number[] = [];

  const xTargets = new Set<number>([0, canvasWidth / 2, canvasWidth]);
  const yTargets = new Set<number>([0, canvasHeight / 2, canvasHeight]);
  for (const other of otherLayers) {
    if (other.id === layerId || !other.visible) continue;
    xTargets.add(other.x);
    xTargets.add(other.x + other.width / 2);
    xTargets.add(other.x + other.width);
    yTargets.add(other.y);
    yTargets.add(other.y + other.height / 2);
    yTargets.add(other.y + other.height);
  }

  const findNearest = (val: number, targets: Set<number>): number | null => {
    let best = snapThreshold + 0.001;
    let hit: number | null = null;
    for (const t of targets) {
      const d = Math.abs(val - t);
      if (d < best) {
        best = d;
        hit = t;
      }
    }
    return hit;
  };

  if (handle.includes('w')) {
    const hit = findNearest(x, xTargets);
    if (hit !== null) {
      const right = x + width;
      const nextW = Math.max(minSize, right - hit);
      x = right - nextW;
      width = nextW;
      verticalGuides.push(Math.round(hit));
    }
  }
  if (handle.includes('e')) {
    const hit = findNearest(x + width, xTargets);
    if (hit !== null) {
      width = Math.max(minSize, hit - x);
      verticalGuides.push(Math.round(hit));
    }
  }
  if (handle.includes('n')) {
    const hit = findNearest(y, yTargets);
    if (hit !== null) {
      const bottom = y + height;
      const nextH = Math.max(minSize, bottom - hit);
      y = bottom - nextH;
      height = nextH;
      horizontalGuides.push(Math.round(hit));
    }
  }
  if (handle.includes('s')) {
    const hit = findNearest(y + height, yTargets);
    if (hit !== null) {
      height = Math.max(minSize, hit - y);
      horizontalGuides.push(Math.round(hit));
    }
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    verticalGuides,
    horizontalGuides,
  };
}

export function resizeLayerByHandle(
  initial: CanvasLayer,
  handle: Exclude<LayerHandleId, 'rotate'>,
  dx: number,
  dy: number,
  lockAspect: boolean
): Pick<CanvasLayer, 'x' | 'y' | 'width' | 'height'> {
  const minSize = 48;
  let x = initial.x;
  let y = initial.y;
  let width = initial.width;
  let height = initial.height;

  const affectsW = handle.includes('w');
  const affectsE = handle.includes('e');
  const affectsN = handle.includes('n');
  const affectsS = handle.includes('s');

  if (affectsE) {
    width = Math.max(minSize, initial.width + dx);
  }
  if (affectsW) {
    const nextW = Math.max(minSize, initial.width - dx);
    x = initial.x + (initial.width - nextW);
    width = nextW;
  }
  if (affectsS) {
    height = Math.max(minSize, initial.height + dy);
  }
  if (affectsN) {
    const nextH = Math.max(minSize, initial.height - dy);
    y = initial.y + (initial.height - nextH);
    height = nextH;
  }

  const isCorner = (affectsN || affectsS) && (affectsW || affectsE);
  if ((lockAspect || initial.aspectLocked) && isCorner && initial.height > 0) {
    const aspect = initial.width / initial.height;
    const widthScale = width / Math.max(1, initial.width);
    const heightScale = height / Math.max(1, initial.height);
    if (Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)) {
      const targetH = Math.max(minSize, Math.round(width / aspect));
      if (affectsN) {
        y = initial.y + (initial.height - targetH);
      }
      height = targetH;
    } else {
      const targetW = Math.max(minSize, Math.round(height * aspect));
      if (affectsW) {
        x = initial.x + (initial.width - targetW);
      }
      width = targetW;
    }
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function bringLayerForward(layers: CanvasLayer[], id: string): CanvasLayer[] {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx === -1 || idx >= layers.length - 1) return layers;
  const copy = [...layers];
  const [item] = copy.splice(idx, 1);
  copy.splice(idx + 1, 0, item);
  return copy;
}

export function sendLayerBackward(layers: CanvasLayer[], id: string): CanvasLayer[] {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx <= 0) return layers;
  const copy = [...layers];
  const [item] = copy.splice(idx, 1);
  copy.splice(idx - 1, 0, item);
  return copy;
}

export function duplicateCanvasLayer(
  layers: CanvasLayer[],
  id: string
): { layers: CanvasLayer[]; newLayerId: string | null } {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx === -1) return { layers, newLayerId: null };
  const target = layers[idx];
  const newId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const copy: CanvasLayer = {
    ...target,
    id: newId,
    name: `${target.name} Copy`,
    x: target.x + 36,
    y: target.y + 36,
    locked: false,
  };
  const next = [...layers];
  next.splice(idx + 1, 0, copy);
  return { layers: next, newLayerId: newId };
}
