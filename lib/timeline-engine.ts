import {
  BeatEffectsConfig,
  BeatSyncTarget,
  BeatVisualEffectType,
} from './beat-effects';
import {
  CanvasLayer,
  KeyframeEasing,
  LayerAnimationConfig,
  LayerAnimationPreset,
  LayerKeyframe,
} from './canvas-layers';
import { LyricCue } from './lyrics-parser';

export interface VisualTimelineClip {
  id: string;
  mediaId: string;
  name: string;
  kind: 'image' | 'video';
  url: string;
  trackIndex?: number; // 0 = V1 (base), 1 = V2 (above V1), 2 = V3 (above V2), ...
  startTime: number;
  endTime: number;
  sourceStart: number; // offset inside source video (seconds)
  sourceDuration: number; // natural duration (or 0 for still image)
  fadeIn: number;
  fadeOut: number;
  opacity?: number; // 0..1 (defaults to 1)
  fitMode?: 'cover' | 'contain' | 'stretch'; // optional per-clip fit override (V2+ defaults to contain; side-stretching switches to stretch)
}

export interface AudioTimelineClip {
  id: string;
  mediaId: string;
  name: string;
  url: string;
  trackIndex?: number; // 0 = A1, 1 = A2, 2 = A3, ... (all unmuted tracks mix simultaneously)
  startTime: number;
  endTime: number;
  sourceStart: number;
  sourceDuration: number;
  fadeIn: number;
  fadeOut: number;
  volume: number; // 0..1
}

export interface ActiveVisualClipHit {
  clip: VisualTimelineClip;
  trackIndex: number;
  localMediaTime: number;
  opacity: number;
}

export interface ActiveAudioClipHit {
  clip: AudioTimelineClip;
  trackIndex: number;
  localAudioTime: number;
  gain: number;
}

export interface TimedEffectClip {
  id: string;
  name: string;
  effectType: Exclude<BeatVisualEffectType, 'none'>;
  syncTarget: BeatSyncTarget;
  intensity: number; // 0.1..1
  sensitivity: number; // 0.4..1.8
  startTime: number;
  endTime: number;
}

export const LAYER_ANIMATION_PRESETS: Array<{
  id: LayerAnimationPreset;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { id: 'none', label: 'None', shortLabel: 'None', description: 'Static position (no preset motion)' },
  {
    id: 'slide-right',
    label: 'Slide from Right',
    shortLabel: 'Right',
    description: 'Enters smoothly from right edge and stays in place',
  },
  {
    id: 'slide-left',
    label: 'Slide from Left',
    shortLabel: 'Left',
    description: 'Enters smoothly from left edge and stays in place',
  },
  {
    id: 'slide-top',
    label: 'Slide from Top',
    shortLabel: 'Top',
    description: 'Drops smoothly from top edge into place',
  },
  {
    id: 'slide-bottom',
    label: 'Slide from Bottom',
    shortLabel: 'Bottom',
    description: 'Rises smoothly from bottom edge into place',
  },
  {
    id: 'zoom-in',
    label: 'Zoom In',
    shortLabel: 'Zoom',
    description: 'Scales smoothly from small to full size',
  },
  {
    id: 'fade',
    label: 'Fade In',
    shortLabel: 'Fade',
    description: 'Gentle opacity fade transition',
  },
  {
    id: 'pop-bounce',
    label: 'Pop Bounce',
    shortLabel: 'Bounce',
    description: 'Springy pop-in entrance with subtle overshoot',
  },
];

export const DEFAULT_LAYER_ANIMATION: LayerAnimationConfig = {
  enterPreset: 'none',
  exitPreset: 'none',
  inDuration: 0.9,
  outDuration: 0.6,
  easing: 'ease-out',
};

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function roundTime(t: number): number {
  return Number(Math.max(0, t).toFixed(3));
}

export function applyEasing(t: number, easing: KeyframeEasing): number {
  const x = clamp(t, 0, 1);
  if (easing === 'linear') return x;
  if (easing === 'ease-out') {
    return 1 - Math.pow(1 - x, 3);
  }
  // ease-in-out cubic
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutBack(t: number): number {
  const x = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * Ensures the timeline ruler gives comfortable breathing room (~50% occupancy for the song)
 * so users can easily see & grab audio fade-in / fade-out handles and cut end segments.
 */
export function computeTimelineDisplayDuration(projectDuration: number): number {
  const safe = Math.max(8, Number.isFinite(projectDuration) ? projectDuration : 24);
  return Math.round(Math.max(safe * 1.9, safe + 16));
}

export function computeEnvelopeGain(
  localTime: number,
  clipDuration: number,
  fadeIn: number,
  fadeOut: number
): number {
  if (clipDuration <= 0 || localTime < 0 || localTime > clipDuration) return 0;
  let gain = 1;
  const safeIn = Math.max(0, Math.min(fadeIn, clipDuration * 0.5));
  const safeOut = Math.max(0, Math.min(fadeOut, clipDuration * 0.5));
  if (safeIn > 0.005 && localTime < safeIn) {
    gain *= clamp(localTime / safeIn, 0, 1);
  }
  if (safeOut > 0.005 && clipDuration - localTime < safeOut) {
    gain *= clamp((clipDuration - localTime) / safeOut, 0, 1);
  }
  return clamp(gain, 0, 1);
}

export function getVisualTrackCount(
  clips: VisualTimelineClip[],
  explicitTrackCount = 1
): number {
  const maxTrack = clips.reduce((m, c) => Math.max(m, c.trackIndex ?? 0), 0);
  return Math.max(1, explicitTrackCount, maxTrack + 1);
}

export function getAudioTrackCount(
  clips: AudioTimelineClip[],
  explicitTrackCount = 1
): number {
  const maxTrack = clips.reduce((m, c) => Math.max(m, c.trackIndex ?? 0), 0);
  return Math.max(1, explicitTrackCount, maxTrack + 1);
}

export function moveClipToTrack<T extends { id: string; trackIndex?: number }>(
  clips: T[],
  clipId: string,
  nextTrackIndex: number
): T[] {
  const clampedTrack = Math.max(0, Math.floor(nextTrackIndex));
  return clips.map((c) => (c.id === clipId ? { ...c, trackIndex: clampedTrack } : c));
}

/**
 * Returns ALL active visual clips across stacked video/image tracks at timestamp `time`,
 * sorted bottom-to-top (trackIndex 0 -> 1 -> 2 ...) for Painter's Algorithm compositing.
 */
export function getActiveVisualClipsAtTime(
  clips: VisualTimelineClip[],
  time: number,
  hiddenTracks?: Set<number>
): ActiveVisualClipHit[] {
  const byTrack = new Map<number, ActiveVisualClipHit>();
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const trackIdx = clip.trackIndex ?? 0;
    if (hiddenTracks && hiddenTracks.has(trackIdx)) continue;
    if (time >= clip.startTime && time < clip.endTime) {
      const elapsed = Math.max(0, time - clip.startTime);
      const clipDuration = Math.max(0.05, clip.endTime - clip.startTime);
      const rawMediaTime = clip.sourceStart + elapsed;
      const localMediaTime =
        clip.kind === 'video' && clip.sourceDuration > 0.1
          ? rawMediaTime % clip.sourceDuration
          : rawMediaTime;
      const env = computeEnvelopeGain(elapsed, clipDuration, clip.fadeIn, clip.fadeOut);
      const baseOpacity = clamp(clip.opacity ?? 1, 0, 1);
      byTrack.set(trackIdx, {
        clip,
        trackIndex: trackIdx,
        localMediaTime,
        opacity: clamp(env * baseOpacity, 0, 1),
      });
    }
  }
  return Array.from(byTrack.values()).sort((a, b) => a.trackIndex - b.trackIndex);
}

export function getActiveVisualClipAtTime(
  clips: VisualTimelineClip[],
  time: number
): { clip: VisualTimelineClip; localMediaTime: number; opacity: number } | null {
  const hits = getActiveVisualClipsAtTime(clips, time);
  if (hits.length === 0) return null;
  const top = hits[hits.length - 1];
  return { clip: top.clip, localMediaTime: top.localMediaTime, opacity: top.opacity };
}

/**
 * Returns ALL active audio clips across simultaneous audio tracks (A1, A2, A3...) at `time`
 * so multi-track audio mixes together cleanly in live preview and Full HD export.
 */
export function getActiveAudioClipsAtTime(
  clips: AudioTimelineClip[],
  time: number,
  mutedTracks?: Set<number>
): ActiveAudioClipHit[] {
  const byTrack = new Map<number, ActiveAudioClipHit>();
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const trackIdx = clip.trackIndex ?? 0;
    if (mutedTracks && mutedTracks.has(trackIdx)) continue;
    if (time >= clip.startTime && time < clip.endTime) {
      const elapsed = Math.max(0, time - clip.startTime);
      const clipDuration = Math.max(0.05, clip.endTime - clip.startTime);
      const rawTime = clip.sourceStart + elapsed;
      const localAudioTime =
        clip.sourceDuration > 0.1 ? rawTime % clip.sourceDuration : rawTime;
      const env = computeEnvelopeGain(elapsed, clipDuration, clip.fadeIn, clip.fadeOut);
      byTrack.set(trackIdx, {
        clip,
        trackIndex: trackIdx,
        localAudioTime,
        gain: clamp(env * clip.volume, 0, 1),
      });
    }
  }
  return Array.from(byTrack.values()).sort((a, b) => a.trackIndex - b.trackIndex);
}

export function getActiveAudioClipAtTime(
  clips: AudioTimelineClip[],
  time: number
): { clip: AudioTimelineClip; localAudioTime: number; gain: number } | null {
  const hits = getActiveAudioClipsAtTime(clips, time);
  if (hits.length === 0) return null;
  const top = hits[hits.length - 1];
  return { clip: top.clip, localAudioTime: top.localAudioTime, gain: top.gain };
}

export function splitVisualClipAtTime(
  clips: VisualTimelineClip[],
  clipId: string,
  splitTime: number
): VisualTimelineClip[] {
  const idx = clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return clips;
  const clip = clips[idx];
  const minSeg = 0.25;
  if (splitTime <= clip.startTime + minSeg || splitTime >= clip.endTime - minSeg) {
    return clips;
  }

  const cut = roundTime(splitTime);
  const leftDuration = cut - clip.startTime;
  const left: VisualTimelineClip = {
    ...clip,
    endTime: cut,
    fadeOut: 0,
  };
  const right: VisualTimelineClip = {
    ...clip,
    id: `${clip.id}-cut-${Math.round(cut * 1000)}`,
    startTime: cut,
    sourceStart:
      clip.kind === 'video' ? roundTime(clip.sourceStart + leftDuration) : clip.sourceStart,
    fadeIn: 0,
  };

  const next = [...clips];
  next.splice(idx, 1, left, right);
  return next;
}

export function splitAudioClipAtTime(
  clips: AudioTimelineClip[],
  clipId: string,
  splitTime: number
): AudioTimelineClip[] {
  const idx = clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return clips;
  const clip = clips[idx];
  const minSeg = 0.25;
  if (splitTime <= clip.startTime + minSeg || splitTime >= clip.endTime - minSeg) {
    return clips;
  }

  const cut = roundTime(splitTime);
  const leftDuration = cut - clip.startTime;
  const left: AudioTimelineClip = {
    ...clip,
    endTime: cut,
    fadeOut: 0,
  };
  const right: AudioTimelineClip = {
    ...clip,
    id: `${clip.id}-cut-${Math.round(cut * 1000)}`,
    startTime: cut,
    sourceStart: roundTime(clip.sourceStart + leftDuration),
    fadeIn: 0,
  };

  const next = [...clips];
  next.splice(idx, 1, left, right);
  return next;
}

export function splitEffectClipAtTime(
  clips: TimedEffectClip[],
  clipId: string,
  splitTime: number
): TimedEffectClip[] {
  const idx = clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return clips;
  const clip = clips[idx];
  const minSeg = 0.25;
  if (splitTime <= clip.startTime + minSeg || splitTime >= clip.endTime - minSeg) {
    return clips;
  }

  const cut = roundTime(splitTime);
  const left: TimedEffectClip = { ...clip, endTime: cut };
  const right: TimedEffectClip = {
    ...clip,
    id: `${clip.id}-cut-${Math.round(cut * 1000)}`,
    startTime: cut,
  };

  const next = [...clips];
  next.splice(idx, 1, left, right);
  return next;
}

export function resolveBeatEffectsAtTime(
  baseConfig: BeatEffectsConfig,
  effectClips: TimedEffectClip[],
  time: number
): BeatEffectsConfig {
  if (!effectClips || effectClips.length === 0) return baseConfig;
  // Last matching timed FX clip wins (topmost priority)
  for (let i = effectClips.length - 1; i >= 0; i--) {
    const fx = effectClips[i];
    if (time >= fx.startTime && time < fx.endTime) {
      return {
        ...baseConfig,
        effectType: fx.effectType,
        syncTarget: fx.syncTarget,
        intensity: fx.intensity,
        sensitivity: fx.sensitivity,
      };
    }
  }
  return baseConfig;
}

export function upsertLayerKeyframe(
  layer: CanvasLayer,
  time: number,
  easing: KeyframeEasing = 'ease-out'
): CanvasLayer {
  const t = roundTime(time);
  const existing = layer.keyframes ? [...layer.keyframes] : [];
  const nextKf: LayerKeyframe = {
    id: `kf-${Math.round(t * 1000)}`,
    time: t,
    x: Math.round(layer.x),
    y: Math.round(layer.y),
    width: Math.round(layer.width),
    height: Math.round(layer.height),
    scale: Number(clamp(layer.scale ?? 1, 0.05, 5).toFixed(3)),
    opacity: Number(clamp(layer.opacity, 0, 1).toFixed(2)),
    rotation: Math.round(layer.rotation),
    easing,
  };

  const matchIdx = existing.findIndex((k) => Math.abs(k.time - t) < 0.08);
  if (matchIdx >= 0) {
    existing[matchIdx] = { ...nextKf, id: existing[matchIdx].id };
  } else {
    existing.push(nextKf);
  }
  existing.sort((a, b) => a.time - b.time);
  return { ...layer, keyframes: existing };
}

export function removeLayerKeyframe(layer: CanvasLayer, keyframeId: string): CanvasLayer {
  const existing = layer.keyframes ?? [];
  return {
    ...layer,
    keyframes: existing.filter((k) => k.id !== keyframeId),
  };
}

function applyPresetTransform(
  layer: CanvasLayer,
  preset: LayerAnimationPreset,
  progress: number, // 0 = fully off/hidden, 1 = resting target state
  canvasWidth: number,
  canvasHeight: number
): CanvasLayer {
  if (preset === 'none' || progress >= 0.999) return layer;
  const p = clamp(progress, 0, 1);

  switch (preset) {
    case 'slide-right': {
      const startX = canvasWidth + Math.max(40, layer.width * 0.15);
      return {
        ...layer,
        x: Math.round(startX + (layer.x - startX) * p),
        opacity: layer.opacity * clamp(p * 1.4, 0, 1),
      };
    }
    case 'slide-left': {
      const startX = -layer.width - Math.max(40, layer.width * 0.15);
      return {
        ...layer,
        x: Math.round(startX + (layer.x - startX) * p),
        opacity: layer.opacity * clamp(p * 1.4, 0, 1),
      };
    }
    case 'slide-top': {
      const startY = -layer.height - 40;
      return {
        ...layer,
        y: Math.round(startY + (layer.y - startY) * p),
        opacity: layer.opacity * clamp(p * 1.4, 0, 1),
      };
    }
    case 'slide-bottom': {
      const startY = canvasHeight + 40;
      return {
        ...layer,
        y: Math.round(startY + (layer.y - startY) * p),
        opacity: layer.opacity * clamp(p * 1.4, 0, 1),
      };
    }
    case 'zoom-in': {
      const scale = 0.25 + 0.75 * p;
      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      const nextW = Math.max(12, Math.round(layer.width * scale));
      const nextH = Math.max(12, Math.round(layer.height * scale));
      return {
        ...layer,
        x: Math.round(cx - nextW / 2),
        y: Math.round(cy - nextH / 2),
        width: nextW,
        height: nextH,
        opacity: layer.opacity * p,
      };
    }
    case 'pop-bounce': {
      const scale = Math.max(0.1, easeOutBack(p));
      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      const nextW = Math.max(12, Math.round(layer.width * scale));
      const nextH = Math.max(12, Math.round(layer.height * scale));
      return {
        ...layer,
        x: Math.round(cx - nextW / 2),
        y: Math.round(cy - nextH / 2),
        width: nextW,
        height: nextH,
        opacity: layer.opacity * clamp(p * 1.8, 0, 1),
      };
    }
    case 'fade':
      return {
        ...layer,
        opacity: layer.opacity * p,
      };
    default:
      return layer;
  }
}

/**
 * Pure deterministic evaluator for any layer at timestamp `time`.
 * Evaluates active time window [startTime, endTime], interpolates keyframes,
 * and applies entrance/exit animation presets. Used identically in live preview & 1080p export.
 */
export function evaluateLayerAtTime(
  layer: CanvasLayer,
  time: number,
  canvasWidth: number,
  canvasHeight: number,
  projectDuration?: number
): { visible: boolean; layer: CanvasLayer } {
  if (!layer.visible) return { visible: false, layer };

  const start = layer.startTime ?? 0;
  const hasExplicitEnd = typeof layer.endTime === 'number' && Number.isFinite(layer.endTime);
  const end = hasExplicitEnd
    ? (layer.endTime as number)
    : Math.max(start + 0.5, projectDuration ?? Number.POSITIVE_INFINITY);

  if (time < start - 0.0001 || (hasExplicitEnd && time > end + 0.0001)) {
    return { visible: false, layer };
  }

  let evaluated: CanvasLayer = { ...layer };

  // 1. Keyframe interpolation
  const kfs = layer.keyframes;
  if (kfs && kfs.length > 0) {
    const sorted = [...kfs].sort((a, b) => a.time - b.time);
    if (time <= sorted[0].time) {
      const first = sorted[0];
      evaluated = {
        ...evaluated,
        x: first.x,
        y: first.y,
        width: first.width,
        height: first.height,
        scale: first.scale ?? evaluated.scale ?? 1,
        opacity: first.opacity,
        rotation: first.rotation,
      };
    } else if (time >= sorted[sorted.length - 1].time) {
      const last = sorted[sorted.length - 1];
      evaluated = {
        ...evaluated,
        x: last.x,
        y: last.y,
        width: last.width,
        height: last.height,
        scale: last.scale ?? evaluated.scale ?? 1,
        opacity: last.opacity,
        rotation: last.rotation,
      };
    } else {
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (time >= a.time && time <= b.time) {
          const span = Math.max(0.001, b.time - a.time);
          const rawP = clamp((time - a.time) / span, 0, 1);
          const p = applyEasing(rawP, b.easing || 'ease-out');
          const aScale = a.scale ?? 1;
          const bScale = b.scale ?? 1;
          evaluated = {
            ...evaluated,
            x: Math.round(a.x + (b.x - a.x) * p),
            y: Math.round(a.y + (b.y - a.y) * p),
            width: Math.max(24, Math.round(a.width + (b.width - a.width) * p)),
            height: Math.max(24, Math.round(a.height + (b.height - a.height) * p)),
            scale: clamp(aScale + (bScale - aScale) * p, 0.05, 5),
            opacity: clamp(a.opacity + (b.opacity - a.opacity) * p, 0, 1),
            rotation: Math.round(a.rotation + (b.rotation - a.rotation) * p),
          };
          break;
        }
      }
    }
  }

  // 2. Entrance & exit animation presets
  const anim = layer.animation;
  if (anim) {
    if (anim.enterPreset !== 'none' && anim.inDuration > 0.01) {
      const elapsed = time - start;
      if (elapsed < anim.inDuration) {
        const rawP = clamp(elapsed / anim.inDuration, 0, 1);
        const eased =
          anim.enterPreset === 'pop-bounce' ? rawP : applyEasing(rawP, anim.easing);
        evaluated = applyPresetTransform(
          evaluated,
          anim.enterPreset,
          eased,
          canvasWidth,
          canvasHeight
        );
      }
    }

    if (
      anim.exitPreset !== 'none' &&
      anim.outDuration > 0.01 &&
      Number.isFinite(end)
    ) {
      const remaining = end - time;
      if (remaining < anim.outDuration) {
        const rawP = clamp(remaining / anim.outDuration, 0, 1);
        const eased = applyEasing(rawP, anim.easing);
        evaluated = applyPresetTransform(
          evaluated,
          anim.exitPreset,
          eased,
          canvasWidth,
          canvasHeight
        );
      }
    }
  }

  return { visible: evaluated.opacity > 0.005, layer: evaluated };
}

/**
 * Multi-select clipboard paste for lyric cues (preserves relative offsets).
 */
export function pasteCuesAtTime(
  existing: LyricCue[],
  copied: LyricCue[],
  playheadTime: number
): LyricCue[] {
  if (copied.length === 0) return existing;
  const sorted = [...copied].sort((a, b) => a.startTime - b.startTime);
  const anchor = sorted[0].startTime;
  const stamp = Date.now();
  const pasted = sorted.map((c, idx) => {
    const offset = c.startTime - anchor;
    const len = Math.max(0.3, c.endTime - c.startTime);
    const startTime = roundTime(playheadTime + offset);
    return {
      ...c,
      id: `cue-paste-${stamp}-${idx}`,
      startTime,
      endTime: roundTime(startTime + len),
    };
  });
  return [...existing, ...pasted].sort((a, b) => a.startTime - b.startTime);
}

/**
 * Multi-select clipboard paste for any timed clip array (visual, audio, or FX).
 */
export function pasteTimedClipsAtTime<
  T extends { id: string; startTime: number; endTime: number }
>(existing: T[], copied: T[], playheadTime: number, prefix: string): T[] {
  if (copied.length === 0) return existing;
  const sorted = [...copied].sort((a, b) => a.startTime - b.startTime);
  const anchor = sorted[0].startTime;
  const stamp = Date.now();
  const pasted = sorted.map((clip, idx) => {
    const offset = clip.startTime - anchor;
    const len = Math.max(0.3, clip.endTime - clip.startTime);
    const startTime = roundTime(playheadTime + offset);
    return {
      ...clip,
      id: `${prefix}-paste-${stamp}-${idx}`,
      startTime,
      endTime: roundTime(startTime + len),
    };
  });
  return [...existing, ...pasted].sort((a, b) => a.startTime - b.startTime);
}

export interface MagneticSnapResult {
  startTime: number;
  endTime: number;
  snapped: boolean;
  guideTime: number | null;
}

/**
 * Collects all magnetic snap anchor times across the timeline:
 * time 0, current playhead, user markers, and every non-excluded clip/cue boundary.
 */
export function collectTimelineSnapTargets(params: {
  visualClips: Array<{ id: string; startTime: number; endTime: number }>;
  audioClips: Array<{ id: string; startTime: number; endTime: number }>;
  effectClips: Array<{ id: string; startTime: number; endTime: number }>;
  cues: Array<{ id: string; startTime: number; endTime: number }>;
  markers: Array<{ time: number }>;
  currentTime: number;
  excludeId?: string;
}): number[] {
  const { visualClips, audioClips, effectClips, cues, markers, currentTime, excludeId } =
    params;
  const set = new Set<number>([0, roundTime(currentTime)]);
  for (const m of markers) set.add(roundTime(m.time));
  const addItems = (list: Array<{ id: string; startTime: number; endTime: number }>) => {
    for (const item of list) {
      if (excludeId && item.id === excludeId) continue;
      set.add(roundTime(item.startTime));
      set.add(roundTime(item.endTime));
    }
  };
  addItems(visualClips);
  addItems(audioClips);
  addItems(effectClips);
  addItems(cues);
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Magnetically snaps a moving clip (checking BOTH its start edge and end edge)
 * to the nearest timeline snap target within `thresholdSec`.
 */
export function snapClipMoveToTargets(
  candidateStart: number,
  clipDuration: number,
  targets: number[],
  thresholdSec: number,
  maxStart?: number
): MagneticSnapResult {
  const rawStart = Math.max(
    0,
    maxStart !== undefined ? Math.min(maxStart, candidateStart) : candidateStart
  );
  const rawEnd = rawStart + clipDuration;
  let bestDiff = thresholdSec + 0.0001;
  let bestStart = rawStart;
  let guideTime: number | null = null;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const diffStart = Math.abs(rawStart - target);
    if (diffStart < bestDiff) {
      bestDiff = diffStart;
      bestStart = Math.max(0, target);
      guideTime = target;
    }
    const diffEnd = Math.abs(rawEnd - target);
    if (diffEnd < bestDiff && target - clipDuration >= -0.001) {
      bestDiff = diffEnd;
      bestStart = Math.max(0, target - clipDuration);
      guideTime = target;
    }
  }

  const finalStart = Number(Math.max(0, bestStart).toFixed(2));
  const finalEnd = Number((finalStart + clipDuration).toFixed(2));
  return {
    startTime: finalStart,
    endTime: finalEnd,
    snapped: guideTime !== null,
    guideTime: guideTime !== null ? Number(guideTime.toFixed(2)) : null,
  };
}

/**
 * Magnetically snaps a single resized edge (left or right trim handle) to the nearest target.
 */
export function snapClipEdgeToTargets(
  candidateTime: number,
  targets: number[],
  thresholdSec: number,
  minTime: number,
  maxTime?: number
): { time: number; snapped: boolean; guideTime: number | null } {
  const clamped = Math.max(
    minTime,
    maxTime !== undefined ? Math.min(maxTime, candidateTime) : candidateTime
  );
  let bestDiff = thresholdSec + 0.0001;
  let bestTime = clamped;
  let guideTime: number | null = null;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (target < minTime - 0.001) continue;
    if (maxTime !== undefined && target > maxTime + 0.001) continue;
    const diff = Math.abs(clamped - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestTime = target;
      guideTime = target;
    }
  }

  return {
    time: Number(Math.max(minTime, bestTime).toFixed(2)),
    snapped: guideTime !== null,
    guideTime: guideTime !== null ? Number(guideTime.toFixed(2)) : null,
  };
}

/**
 * Filmora-style magnetic ripple: closes all gaps on a specific track (or all items if
 * `targetTrackIndex` is undefined), packing clips flush back-to-back starting at `startAnchor` (0s)
 * with zero gaps left behind. Preserves each clip's duration and relative order.
 */
export function closeTrackGaps<
  T extends { id: string; startTime: number; endTime: number; trackIndex?: number }
>(clips: T[], targetTrackIndex?: number, startAnchor = 0): T[] {
  const onTrack = clips.filter((c) =>
    targetTrackIndex === undefined ? true : (c.trackIndex ?? 0) === targetTrackIndex
  );
  if (onTrack.length === 0) return clips;

  const sorted = [...onTrack].sort((a, b) =>
    a.startTime !== b.startTime ? a.startTime - b.startTime : a.endTime - b.endTime
  );

  const packedById = new Map<string, { startTime: number; endTime: number }>();
  let cursor = Math.max(0, startAnchor);
  for (const clip of sorted) {
    const len = Math.max(0.25, clip.endTime - clip.startTime);
    const startTime = Number(cursor.toFixed(2));
    const endTime = Number((startTime + len).toFixed(2));
    packedById.set(clip.id, { startTime, endTime });
    cursor = endTime;
  }

  return clips.map((c) => {
    const packed = packedById.get(c.id);
    if (!packed) return c;
    return { ...c, startTime: packed.startTime, endTime: packed.endTime };
  });
}

/**
 * Magnetic track reorder + zero-gap close after dragging a clip on a track.
 * Orders clips by midpoint (using the dragged clip's new position) so dragging a clip
 * across neighbors swaps them cleanly and closes any gap left behind.
 */
export function closeGapsAfterTrackMove<
  T extends { id: string; startTime: number; endTime: number; trackIndex?: number }
>(clips: T[], movedId: string, targetTrackIndex?: number): T[] {
  const onTrack = clips.filter((c) =>
    targetTrackIndex === undefined ? true : (c.trackIndex ?? 0) === targetTrackIndex
  );
  if (onTrack.length === 0) return clips;

  const sorted = [...onTrack].sort((a, b) => {
    const startDiff = a.startTime - b.startTime;
    if (Math.abs(startDiff) <= 0.15) {
      if (a.id === movedId) return -1;
      if (b.id === movedId) return 1;
    }
    if (Math.abs(startDiff) > 0.001) return startDiff;
    return a.endTime - b.endTime;
  });

  const packedById = new Map<string, { startTime: number; endTime: number }>();
  let cursor = 0;
  for (const clip of sorted) {
    const len = Math.max(0.25, clip.endTime - clip.startTime);
    const startTime = Number(cursor.toFixed(2));
    const endTime = Number((startTime + len).toFixed(2));
    packedById.set(clip.id, { startTime, endTime });
    cursor = endTime;
  }

  return clips.map((c) => {
    const packed = packedById.get(c.id);
    if (!packed) return c;
    return { ...c, startTime: packed.startTime, endTime: packed.endTime };
  });
}

/**
 * Extends full-timeline still image clips whenever the project duration increases
 * (for example, when the user uploads a 3-minute song after adding background/overlay images).
 */
export function extendFullTimelineImageClips(
  clips: VisualTimelineClip[],
  prevDuration: number,
  nextDuration: number
): VisualTimelineClip[] {
  if (!Number.isFinite(nextDuration) || nextDuration <= prevDuration + 0.05) {
    return clips;
  }
  const roundedNext = Number(nextDuration.toFixed(2));
  return clips.map((clip) => {
    if (
      clip.kind === 'image' &&
      clip.startTime <= 0.05 &&
      clip.endTime >= Math.max(0, prevDuration - 0.5)
    ) {
      return { ...clip, endTime: roundedNext };
    }
    return clip;
  });
}

