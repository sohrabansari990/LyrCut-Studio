import { LyricCue } from './lyrics-parser';

export interface FocusedScrollingConfig {
  enabled: boolean;
  visibleLines: number; // Default 5
  activePosition: 'top' | 'center' | 'bottom'; // Default 'center'
  scrollDirection: 'bottom-to-top' | 'top-to-bottom'; // Default 'bottom-to-top'
  scrollSpeed: number; // 0.5 to 2.0 (default 1.0)
  transitionDuration: number; // seconds (default 0.45)
  outerBlur: number; // px (default 4.5)
  innerBlur: number; // px (default 1.6)
  outerOpacity: number; // 0..1 (default 0.18)
  innerOpacity: number; // 0..1 (default 0.35)
  activeOpacity: number; // 0..1 (default 1.0)
  verticalSpacing: number; // normalized 1080p px (default 106)
  activeScale: number; // 0.8..1.5 (default 1.12)
  outerScale: number; // 0.6..1.1 (default 0.85)
  farsiFont: string;
  romanFont: string;
  englishFont: string;
  farsiFontSize: number; // normalized px at 1080p (default 48)
  englishFontSize: number; // normalized px at 1080p (default 25)
  textColor: string;
  activeColor: string;
  glowStrength: number; // 0..1 (default 0.45)
  shadowStrength: number; // 0..1 (default 0.75)
  textAlign: 'left' | 'center' | 'right';
  areaPosition: 'top' | 'center' | 'bottom';
  areaWidthPct: number; // 50..96
  backgroundGradient: boolean;
  motionBlur: boolean;
  easing: 'linear' | 'ease-in-out';
}

export const DEFAULT_FOCUSED_SCROLLING_CONFIG: FocusedScrollingConfig = {
  enabled: true,
  visibleLines: 5,
  activePosition: 'center',
  scrollDirection: 'bottom-to-top',
  scrollSpeed: 1.0,
  transitionDuration: 0.45,
  outerBlur: 4.5,
  innerBlur: 1.6,
  outerOpacity: 0.18,
  innerOpacity: 0.35,
  activeOpacity: 1.0,
  verticalSpacing: 108,
  activeScale: 1.12,
  outerScale: 0.85,
  farsiFont: 'Noto Nastaliq Urdu',
  romanFont: 'Plus Jakarta Sans',
  englishFont: 'Plus Jakarta Sans',
  farsiFontSize: 48,
  englishFontSize: 25,
  textColor: '#D4D4D8',
  activeColor: '#FFFFFF',
  glowStrength: 0.45,
  shadowStrength: 0.75,
  textAlign: 'center',
  areaPosition: 'center',
  areaWidthPct: 84,
  backgroundGradient: true,
  motionBlur: false,
  easing: 'ease-in-out',
};

export interface PositionedLyricItem {
  cue: LyricCue;
  cueIndex: number;
  /** Signed distance from the focused center slot (-2, -1, 0, +1, +2) */
  slotDelta: number;
  /** Offset in normalized 1080p pixels relative to the focused anchor */
  yOffset: number;
  opacity: number;
  blur: number;
  scale: number;
  isActive: boolean;
  motionBlur: number;
}

export interface ScrollingLayoutResult {
  adjustedTime: number;
  activeCueIndex: number;
  scrollFloatIndex: number;
  items: PositionedLyricItem[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function applyEasing(t: number, mode: 'linear' | 'ease-in-out'): number {
  const c = clamp(t, 0, 1);
  if (mode === 'linear') return c;
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Computes continuous interpolated positions, opacity, blur, and scale for all
 * visible scrolling lyric lines around `adjustedTime = currentTime + globalOffset`.
 */
export function computeScrollingLyricLayout(
  cues: LyricCue[],
  currentTime: number,
  globalOffset: number,
  config: FocusedScrollingConfig
): ScrollingLayoutResult {
  const adjustedTime = currentTime + globalOffset;
  if (cues.length === 0) {
    return {
      adjustedTime,
      activeCueIndex: -1,
      scrollFloatIndex: 0,
      items: [],
    };
  }

  const speed = clamp(config.scrollSpeed || 1, 0.3, 3);
  const baseTransition = Math.max(0.08, config.transitionDuration / speed);

  let activeCueIndex = -1;
  for (let i = 0; i < cues.length; i++) {
    if (adjustedTime >= cues[i].startTime && adjustedTime < cues[i].endTime) {
      activeCueIndex = i;
      break;
    }
  }

  let scrollFloatIndex = 0;
  let velocityNorm = 0;

  if (adjustedTime < cues[0].startTime) {
    // Smooth pre-roll before cue 0 starts
    const untilFirst = cues[0].startTime - adjustedTime;
    if (untilFirst < baseTransition) {
      const t = 1 - untilFirst / baseTransition;
      const eased = applyEasing(t, config.easing);
      scrollFloatIndex = lerp(-0.35, 0, eased);
      velocityNorm = t < 1 ? 0.35 : 0;
    } else {
      scrollFloatIndex = -0.35;
    }
  } else if (activeCueIndex !== -1) {
    const activeCue = cues[activeCueIndex];
    const cueLen = Math.max(0.2, activeCue.endTime - activeCue.startTime);
    const effTransition = Math.min(baseTransition, cueLen * 0.72);
    const elapsed = adjustedTime - activeCue.startTime;

    if (elapsed < effTransition) {
      const t = clamp(elapsed / effTransition, 0, 1);
      const eased = applyEasing(t, config.easing);
      // If coming from a previous cue or gap, complete the glide cleanly to activeCueIndex
      const prevGap =
        activeCueIndex > 0
          ? activeCue.startTime - cues[activeCueIndex - 1].endTime
          : 0;
      const startFrom =
        activeCueIndex === 0
          ? -0.35
          : prevGap > 0.05
          ? activeCueIndex - 0.55
          : activeCueIndex - 1;
      scrollFloatIndex = lerp(startFrom, activeCueIndex, eased);
      velocityNorm = Math.sin(t * Math.PI);
    } else {
      scrollFloatIndex = activeCueIndex;
    }
  } else {
    // Inside an instrumental pause after cue `prevIdx` or after the final cue
    let prevIdx = cues.length - 1;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i].endTime <= adjustedTime) {
        prevIdx = i;
      } else {
        break;
      }
    }

    if (prevIdx >= cues.length - 1) {
      scrollFloatIndex = cues.length - 1;
    } else {
      const nextCue = cues[prevIdx + 1];
      const sinceEnd = adjustedTime - cues[prevIdx].endTime;
      const gap = Math.max(0.05, nextCue.startTime - cues[prevIdx].endTime);
      const effTransition = Math.min(baseTransition, gap * 0.85);
      const t = clamp(sinceEnd / effTransition, 0, 1);
      const eased = applyEasing(t, config.easing);
      scrollFloatIndex = lerp(prevIdx, prevIdx + 0.45, eased);
      velocityNorm = t < 1 ? Math.sin(t * Math.PI) * 0.5 : 0;
    }
  }

  const visibleCount = clamp(Math.round(config.visibleLines), 3, 9);
  const halfSpan = (visibleCount - 1) / 2;
  const dirSign = config.scrollDirection === 'top-to-bottom' ? -1 : 1;

  // Shift focal center if activePosition is 'top' or 'bottom'
  const anchorShiftSlots =
    config.activePosition === 'top'
      ? -halfSpan * 0.5
      : config.activePosition === 'bottom'
      ? halfSpan * 0.5
      : 0;

  const items: PositionedLyricItem[] = [];
  const minIdx = Math.max(0, Math.floor(scrollFloatIndex - halfSpan - 1));
  const maxIdx = Math.min(cues.length - 1, Math.ceil(scrollFloatIndex + halfSpan + 1));

  for (let i = minIdx; i <= maxIdx; i++) {
    const slotDelta = i - scrollFloatIndex;
    const absDelta = Math.abs(slotDelta);

    // Beyond visible window edges: fade smoothly to zero
    if (absDelta > halfSpan + 0.85) continue;

    let opacity: number;
    let blur: number;
    let scale: number;

    const midScale = (config.activeScale + config.outerScale) / 2;

    if (absDelta <= 1) {
      const t = absDelta;
      opacity = lerp(config.activeOpacity, config.innerOpacity, t);
      blur = lerp(0, config.innerBlur, t);
      scale = lerp(config.activeScale, midScale, t);
    } else if (absDelta <= 2) {
      const t = absDelta - 1;
      opacity = lerp(config.innerOpacity, config.outerOpacity, t);
      blur = lerp(config.innerBlur, config.outerBlur, t);
      scale = lerp(midScale, config.outerScale, t);
    } else {
      const extraT = clamp((absDelta - 2) / Math.max(0.5, halfSpan - 1.2), 0, 1);
      opacity = lerp(config.outerOpacity, 0, extraT);
      blur = lerp(config.outerBlur, config.outerBlur * 1.4, extraT);
      scale = lerp(config.outerScale, config.outerScale * 0.92, extraT);
    }

    // Fade outer edges when outside exact halfSpan
    if (absDelta > halfSpan) {
      const edgeFade = clamp(1 - (absDelta - halfSpan) / 0.85, 0, 1);
      opacity *= edgeFade;
    }

    if (opacity <= 0.01) continue;

    const yOffset = (slotDelta * dirSign + anchorShiftSlots) * config.verticalSpacing;
    const isActive = i === activeCueIndex || absDelta < 0.28;
    const motionBlur = config.motionBlur ? Number((velocityNorm * 2.4).toFixed(2)) : 0;

    items.push({
      cue: cues[i],
      cueIndex: i,
      slotDelta: Number(slotDelta.toFixed(3)),
      yOffset: Number(yOffset.toFixed(2)),
      opacity: Number(clamp(opacity, 0, 1).toFixed(3)),
      blur: Number(Math.max(0, blur).toFixed(2)),
      scale: Number(Math.max(0.4, scale).toFixed(3)),
      isActive,
      motionBlur,
    });
  }

  return {
    adjustedTime,
    activeCueIndex,
    scrollFloatIndex: Number(scrollFloatIndex.toFixed(3)),
    items,
  };
}
