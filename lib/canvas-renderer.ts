import {
  AspectRatio,
  EnabledTracks,
  LyricCue,
  LyricStyleConfig,
  MediaFitMode,
  detectScriptDirection,
  getActiveCueAtTime,
} from './lyrics-parser';
import {
  CanvasLayer,
  computeTimerProgress,
  formatTimerCounterText,
  getCanvasDimensions,
  getLayerHandles,
} from './canvas-layers';
import {
  LayerKeyMode,
  LayerKeyingConfig,
  detectBackgroundType,
  getKeyingCacheSignature,
  isKeyingActive,
  processKeyedImagePixels,
} from './image-blending';
import {
  DEFAULT_FOCUSED_SCROLLING_CONFIG,
  FocusedScrollingConfig,
  computeScrollingLyricLayout,
} from './scrolling-lyrics';
import {
  AudioBeatAnalysis,
  BeatEffectsConfig,
  DEFAULT_BEAT_EFFECTS_CONFIG,
  SampledBeatFrame,
  computeBeatVisualTransform,
  sampleBeatFrameAtTime,
} from './beat-effects';
import {
  TimedEffectClip,
  evaluateLayerAtTime,
  resolveBeatEffectsAtTime,
} from './timeline-engine';

export interface Resolution {
  width: number;
  height: number;
}

export function quantizeBlurStep(blurPx: number): number {
  if (!Number.isFinite(blurPx) || blurPx <= 0.25) return 0;
  return Math.min(12, Math.round(blurPx * 2) / 2);
}

const MAX_BLUR_SPRITE_CACHE = 96;
const MAX_BG_CACHE = 8;
const MAX_KEYED_CACHE = 16;
const blurSpriteCache = new Map<string, HTMLCanvasElement>();
const bgImageCache = new Map<string, HTMLCanvasElement>();
const keyedImageCache = new Map<string, HTMLCanvasElement>();

function setBoundedCache<T>(map: Map<string, T>, key: string, value: T, maxSize: number): void {
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  while (map.size > maxSize) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

export function clearRenderCaches(): void {
  blurSpriteCache.clear();
  bgImageCache.clear();
  keyedImageCache.clear();
}

/**
 * Inspects a loaded HTMLImageElement's border pixels (downsampled to <=180px for <2ms speed)
 * to auto-detect Green Screen, Blue Screen, Black BG, Checkerboard, White BG, or native alpha.
 */
export function detectImageElementBackgroundType(
  img: HTMLImageElement
): LayerKeyMode {
  if (typeof document === 'undefined' || !img || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
    return 'none';
  }
  try {
    const maxDim = 180;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(8, Math.round(img.naturalWidth * scale));
    const h = Math.max(8, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 'none';
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    return detectBackgroundType(data, w, h);
  } catch {
    return 'auto-corner';
  }
}

function getKeyedImageSource(
  src: HTMLImageElement | HTMLVideoElement,
  keying?: LayerKeyingConfig
): HTMLImageElement | HTMLVideoElement | HTMLCanvasElement {
  if (!isKeyingActive(keying) || !keying || typeof document === 'undefined') {
    return src;
  }
  const isVideo = typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement;
  if (isVideo) {
    // Video keying can be very heavy per frame; return raw video (blendMode still applies!)
    return src;
  }
  const img = src as HTMLImageElement;
  if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return img;

  const sig = getKeyingCacheSignature(keying);
  const srcKey = img.currentSrc || img.src || `${img.naturalWidth}x${img.naturalHeight}`;
  const cacheKey = `${srcKey}|${sig}`;
  const cached = keyedImageCache.get(cacheKey);
  if (cached) {
    setBoundedCache(keyedImageCache, cacheKey, cached, MAX_KEYED_CACHE);
    return cached;
  }

  try {
    // Process at up to 1280px max edge for crisp 1080p cutouts with fast ~15ms one-time compute
    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(4, Math.round(img.naturalWidth * scale));
    const h = Math.max(4, Math.round(img.naturalHeight * scale));
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const oCtx = off.getContext('2d', { willReadFrequently: true });
    if (!oCtx) return img;
    oCtx.drawImage(img, 0, 0, w, h);
    const imgData = oCtx.getImageData(0, 0, w, h);
    const processed = processKeyedImagePixels(imgData.data, w, h, keying);
    imgData.data.set(processed);
    oCtx.putImageData(imgData, 0, 0);
    setBoundedCache(keyedImageCache, cacheKey, off, MAX_KEYED_CACHE);
    return off;
  } catch {
    return img;
  }
}

export function getResolutionForRatio(ratio: AspectRatio): Resolution {
  return ratio === '16:9'
    ? { width: 1920, height: 1080 }
    : { width: 1080, height: 1920 };
}

export interface DrawRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function computeFitRect(
  srcWidth: number,
  srcHeight: number,
  destWidth: number,
  destHeight: number,
  mode: 'cover' | 'contain'
): DrawRect {
  if (srcWidth <= 0 || srcHeight <= 0 || destWidth <= 0 || destHeight <= 0) {
    return { dx: 0, dy: 0, dw: destWidth, dh: destHeight };
  }
  const srcRatio = srcWidth / srcHeight;
  const destRatio = destWidth / destHeight;

  let dw = destWidth;
  let dh = destHeight;

  if (mode === 'cover') {
    if (srcRatio > destRatio) {
      dh = destHeight;
      dw = destHeight * srcRatio;
    } else {
      dw = destWidth;
      dh = destWidth / srcRatio;
    }
  } else {
    if (srcRatio > destRatio) {
      dw = destWidth;
      dh = destWidth / srcRatio;
    } else {
      dh = destHeight;
      dw = destHeight * srcRatio;
    }
  }

  return {
    dx: (destWidth - dw) / 2,
    dy: (destHeight - dh) / 2,
    dw,
    dh,
  };
}

export function computeCueOpacity(
  cue: LyricCue,
  currentTime: number,
  fadeSeconds = 0.16,
  disableFade = false,
  globalOffset = 0
): number {
  const adjustedTime = currentTime + globalOffset;
  const duration = cue.endTime - cue.startTime;
  const fade = Math.min(fadeSeconds, duration * 0.25);
  if (adjustedTime < cue.startTime || adjustedTime >= cue.endTime) return 0;
  if (disableFade || fade <= 0.01) return 1;

  const sinceStart = adjustedTime - cue.startTime;
  const untilEnd = cue.endTime - adjustedTime;

  if (cue.startTime > 0 && sinceStart < fade) {
    return Math.max(0, Math.min(1, sinceStart / fade));
  }
  if (untilEnd < fade) return Math.max(0, Math.min(1, untilEnd / fade));
  return 1;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === '')) return [];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function resolveFontStack(
  requested: string | undefined,
  resolvedFarsi: string,
  resolvedNastaliq: string,
  resolvedLatin: string,
  isRtl: boolean
): string {
  const clean = (requested ?? '').trim();
  if (!clean) {
    return isRtl ? resolvedFarsi : resolvedLatin;
  }
  const lower = clean.toLowerCase();
  if (lower.includes('noto nastaliq') || lower === 'nastaliq') {
    return `${resolvedNastaliq}, ${resolvedFarsi}`;
  }
  if (lower.includes('vazirmatn')) {
    return `${resolvedFarsi}, ${resolvedLatin}`;
  }
  if (lower.includes('plus jakarta')) {
    return resolvedLatin;
  }
  if (isRtl) {
    return `"${clean}", ${resolvedNastaliq}, ${resolvedFarsi}`;
  }
  return `"${clean}", ${resolvedLatin}`;
}

export interface SnapGuideState {
  centerX?: boolean;
  centerY?: boolean;
  verticalLines?: number[];
  horizontalLines?: number[];
}

export interface StackedMediaLayer {
  source: HTMLImageElement | HTMLVideoElement;
  opacity: number;
  trackIndex: number;
  fitMode?: 'cover' | 'contain' | 'stretch';
}

export interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  ratio: AspectRatio;
  mediaSource: HTMLImageElement | HTMLVideoElement | null;
  mediaLayers?: StackedMediaLayer[];
  clipMediaSources?: Map<string, HTMLImageElement | HTMLVideoElement>;
  clipEnvelopeOpacities?: Map<string, number>;
  hiddenVisualTracks?: Set<number>;
  mediaFit: MediaFitMode;
  cues: LyricCue[];
  currentTime: number;
  globalOffset?: number;
  enabledTracks: EnabledTracks;
  style: LyricStyleConfig;
  scrollingConfig?: FocusedScrollingConfig;
  beatEffects?: BeatEffectsConfig;
  effectClips?: TimedEffectClip[];
  mediaOpacity?: number;
  projectDuration?: number;
  audioAnalysis?: AudioBeatAnalysis | null;
  audioAnalysisTime?: number;
  layers?: CanvasLayer[];
  layerImages?: Map<string, HTMLImageElement>;
  selectedLayerId?: string | null;
  snapGuides?: SnapGuideState | null;
  farsiFontFamily?: string;
  nastaliqFontFamily?: string;
  latinFontFamily?: string;
  drawSafeZones?: boolean;
  drawLayerHandles?: boolean;
  disableFade?: boolean;
}

function applyLayerTransform(
  ctx: CanvasRenderingContext2D,
  layer: CanvasLayer,
  unit: number,
  drawFn: (w: number, h: number) => void
): void {
  const lx = layer.x * unit;
  const ly = layer.y * unit;
  const lw = layer.width * unit;
  const lh = layer.height * unit;
  const scale = Number.isFinite(layer.scale) ? Math.max(0.05, layer.scale as number) : 1;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  if (layer.blendMode && layer.blendMode !== 'source-over') {
    ctx.globalCompositeOperation = layer.blendMode;
  }
  if (layer.rotation !== 0 || Math.abs(scale - 1) > 0.0005) {
    const cx = lx + lw / 2;
    const cy = ly + lh / 2;
    ctx.translate(cx, cy);
    if (layer.rotation !== 0) {
      ctx.rotate((layer.rotation * Math.PI) / 180);
    }
    if (Math.abs(scale - 1) > 0.0005) {
      ctx.scale(scale, scale);
    }
    ctx.translate(-lw / 2, -lh / 2);
  } else {
    ctx.translate(lx, ly);
  }
  drawFn(lw, lh);
  ctx.restore();
}

export function renderFrameToCanvas({
  ctx,
  width,
  height,
  ratio,
  mediaSource,
  mediaLayers,
  clipMediaSources,
  clipEnvelopeOpacities,
  hiddenVisualTracks,
  mediaFit,
  cues,
  currentTime,
  globalOffset = 0,
  enabledTracks,
  style,
  scrollingConfig = DEFAULT_FOCUSED_SCROLLING_CONFIG,
  beatEffects = DEFAULT_BEAT_EFFECTS_CONFIG,
  effectClips = [],
  mediaOpacity = 1,
  projectDuration,
  audioAnalysis = null,
  audioAnalysisTime,
  layers,
  layerImages,
  selectedLayerId = null,
  snapGuides = null,
  farsiFontFamily = '"Vazirmatn", "Plus Jakarta Sans", sans-serif',
  nastaliqFontFamily = '"Noto Nastaliq Urdu", "IranNastaliq", "Vazirmatn", serif',
  latinFontFamily = '"Plus Jakarta Sans", system-ui, sans-serif',
  drawSafeZones = false,
  drawLayerHandles = false,
  disableFade = false,
}: RenderFrameParams): void {
  const nativeDim = getResolutionForRatio(ratio);
  const unit = width / nativeDim.width;
  const activeLayers: CanvasLayer[] = layers ?? [];
  const hasLayers = activeLayers.length > 0;

  const effectiveBeatEffects = resolveBeatEffectsAtTime(
    beatEffects,
    effectClips,
    currentTime
  );
  const beatSample: SampledBeatFrame = sampleBeatFrameAtTime(
    audioAnalysis,
    audioAnalysisTime ?? currentTime,
    effectiveBeatEffects.sensitivity
  );
  const beatTx = computeBeatVisualTransform(effectiveBeatEffects, beatSample, currentTime);

  // 1. Base studio black
  ctx.save();
  ctx.fillStyle = '#090B0F';
  ctx.fillRect(0, 0, width, height);

  const renderBackgroundDirect = (
    targetCtx: CanvasRenderingContext2D,
    media: HTMLImageElement | HTMLVideoElement,
    srcW: number,
    srcH: number,
    boxW: number,
    boxH: number
  ) => {
    if (mediaFit === 'contain-blur') {
      const bgRect = computeFitRect(srcW, srcH, boxW, boxH, 'cover');
      targetCtx.save();
      if ('filter' in targetCtx) {
        targetCtx.filter = `blur(${Math.round(boxW * 0.022)}px) brightness(0.45)`;
      }
      targetCtx.drawImage(media, bgRect.dx, bgRect.dy, bgRect.dw, bgRect.dh);
      targetCtx.restore();

      const fgRect = computeFitRect(srcW, srcH, boxW, boxH, 'contain');
      targetCtx.drawImage(media, fgRect.dx, fgRect.dy, fgRect.dw, fgRect.dh);
    } else if (mediaFit === 'contain-black') {
      targetCtx.fillStyle = '#090B0F';
      targetCtx.fillRect(0, 0, boxW, boxH);
      const fgRect = computeFitRect(srcW, srcH, boxW, boxH, 'contain');
      targetCtx.drawImage(media, fgRect.dx, fgRect.dy, fgRect.dw, fgRect.dh);
    } else {
      const coverRect = computeFitRect(srcW, srcH, boxW, boxH, 'cover');
      targetCtx.drawImage(media, coverRect.dx, coverRect.dy, coverRect.dw, coverRect.dh);
    }
  };

  const drawSingleMediaSource = (
    src: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    boxW: number,
    boxH: number,
    isBaseTrack: boolean,
    explicitFit?: 'cover' | 'contain' | 'stretch'
  ) => {
    const isVideo = typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement;
    const isCanvas = typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement;
    const srcW = isVideo
      ? (src as HTMLVideoElement).videoWidth
      : isCanvas
      ? (src as HTMLCanvasElement).width
      : (src as HTMLImageElement).naturalWidth;
    const srcH = isVideo
      ? (src as HTMLVideoElement).videoHeight
      : isCanvas
      ? (src as HTMLCanvasElement).height
      : (src as HTMLImageElement).naturalHeight;
    if (srcW <= 0 || srcH <= 0) return false;

    // Independent single-side stretch mode: fill the exact bounding box dimensions
    if (explicitFit === 'stretch') {
      ctx.drawImage(src, 0, 0, boxW, boxH);
      return true;
    }

    if (isBaseTrack) {
      if (!isVideo && !isCanvas && typeof document !== 'undefined') {
        const roundedW = Math.max(2, Math.round(boxW));
        const roundedH = Math.max(2, Math.round(boxH));
        const imgSrc = (src as HTMLImageElement).currentSrc || (src as HTMLImageElement).src;
        const bgKey = `${imgSrc}|${srcW}x${srcH}|${roundedW}x${roundedH}|${mediaFit}`;
        let cachedBg = bgImageCache.get(bgKey);
        if (!cachedBg) {
          const offBg = document.createElement('canvas');
          offBg.width = roundedW;
          offBg.height = roundedH;
          const oBgCtx = offBg.getContext('2d', { alpha: true });
          if (oBgCtx) {
            oBgCtx.clearRect(0, 0, roundedW, roundedH);
            renderBackgroundDirect(oBgCtx, src as HTMLImageElement, srcW, srcH, roundedW, roundedH);
            setBoundedCache(bgImageCache, bgKey, offBg, MAX_BG_CACHE);
            cachedBg = offBg;
          }
        } else {
          setBoundedCache(bgImageCache, bgKey, cachedBg, MAX_BG_CACHE);
        }
        if (cachedBg) {
          ctx.drawImage(cachedBg, 0, 0, boxW, boxH);
          return true;
        }
      }
      if (isCanvas) {
        const coverRect = computeFitRect(srcW, srcH, boxW, boxH, 'cover');
        ctx.drawImage(src, coverRect.dx, coverRect.dy, coverRect.dw, coverRect.dh);
        return true;
      }
      renderBackgroundDirect(ctx, src as HTMLImageElement | HTMLVideoElement, srcW, srcH, boxW, boxH);
      return true;
    }

    // Upper stacked visual track (V2, V3, ...): preserve alpha transparency cleanly over lower tracks!
    const fit: 'cover' | 'contain' = explicitFit ?? 'contain';
    const rect = computeFitRect(srcW, srcH, boxW, boxH, fit);
    ctx.drawImage(src, rect.dx, rect.dy, rect.dw, rect.dh);
    return true;
  };

  const drawBackgroundInBox = (boxW: number, boxH: number) => {
    if (mediaLayers && mediaLayers.length > 0) {
      let drewAny = false;
      for (let i = 0; i < mediaLayers.length; i++) {
        const item = mediaLayers[i];
        if (item.opacity <= 0.005) continue;
        ctx.save();
        ctx.globalAlpha *= Math.max(0, Math.min(1, item.opacity));
        const drawn = drawSingleMediaSource(
          item.source,
          boxW,
          boxH,
          item.trackIndex === 0 && i === 0,
          item.fitMode
        );
        ctx.restore();
        if (drawn) drewAny = true;
      }
      if (drewAny) return;
    }

    if (mediaSource) {
      const drawn = drawSingleMediaSource(mediaSource, boxW, boxH, true);
      if (drawn) return;
    }

    const grad = ctx.createLinearGradient(0, 0, boxW, boxH);
    grad.addColorStop(0, '#121620');
    grad.addColorStop(1, '#080A0E');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, boxW, boxH);
  };

  const drawScrollingLyricsBox = (boxW: number, boxH: number) => {
    const layout = computeScrollingLyricLayout(
      cues,
      currentTime,
      globalOffset,
      scrollingConfig
    );

    if (scrollingConfig.backgroundGradient) {
      const grad = ctx.createRadialGradient(
        boxW / 2,
        boxH / 2,
        boxW * 0.05,
        boxW / 2,
        boxH / 2,
        Math.max(boxW, boxH) * 0.62
      );
      grad.addColorStop(0, 'rgba(7, 9, 14, 0.72)');
      grad.addColorStop(0.65, 'rgba(7, 9, 14, 0.42)');
      grad.addColorStop(1, 'rgba(7, 9, 14, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, boxW, boxH);
    }

    if (layout.items.length === 0) return;

    const areaWidth = (scrollingConfig.areaWidthPct / 100) * boxW;
    const horizontalMargin = (boxW - areaWidth) / 2;
    const anchorX =
      scrollingConfig.textAlign === 'left'
        ? horizontalMargin
        : scrollingConfig.textAlign === 'right'
        ? boxW - horizontalMargin
        : boxW / 2;

    const anchorCenterY =
      scrollingConfig.areaPosition === 'top'
        ? boxH * 0.34
        : scrollingConfig.areaPosition === 'bottom'
        ? boxH * 0.66
        : boxH * 0.5;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, boxW, boxH);
    ctx.clip();

    const farsiStack = resolveFontStack(
      scrollingConfig.farsiFont,
      farsiFontFamily,
      nastaliqFontFamily,
      latinFontFamily,
      true
    );
    const romanStack = resolveFontStack(
      scrollingConfig.romanFont,
      farsiFontFamily,
      nastaliqFontFamily,
      latinFontFamily,
      false
    );
    const engStack = resolveFontStack(
      scrollingConfig.englishFont,
      farsiFontFamily,
      nastaliqFontFamily,
      latinFontFamily,
      false
    );

    const activeTrackCount =
      (enabledTracks.primary ? 1 : 0) +
      (enabledTracks.roman ? 1 : 0) +
      (enabledTracks.english ? 1 : 0);
    const trackSpacingFactor =
      activeTrackCount >= 3 ? 1.65 : activeTrackCount === 2 ? 1.32 : 1;

    for (const item of layout.items) {
      const { cue } = item;
      const centerY = anchorCenterY + item.yOffset * trackSpacingFactor * unit;

      interface SlotLine {
        lines: string[];
        font: string;
        lineHeight: number;
        color: string;
        direction: 'rtl' | 'ltr';
      }

      const blocks: SlotLine[] = [];
      const fSize = Math.round(scrollingConfig.farsiFontSize * item.scale * unit);
      const rSize = Math.round((scrollingConfig.englishFontSize + 3) * item.scale * unit);
      const eSize = Math.round(scrollingConfig.englishFontSize * item.scale * unit);
      const maxTextW = Math.max(120, areaWidth * 0.96);

      if (enabledTracks.primary && cue.primary.trim()) {
        const dir = detectScriptDirection(cue.primary);
        const font = `${item.isActive ? 700 : 500} ${fSize}px ${
          dir === 'rtl' ? farsiStack : engStack
        }`;
        ctx.font = font;
        const isNastaliq =
          dir === 'rtl' &&
          scrollingConfig.farsiFont.toLowerCase().includes('nastaliq');
        blocks.push({
          lines: wrapTextLines(ctx, cue.primary, maxTextW),
          font,
          lineHeight: fSize * (isNastaliq ? 1.72 : 1.38),
          color: item.isActive
            ? scrollingConfig.activeColor
            : scrollingConfig.textColor,
          direction: dir,
        });
      }

      if (enabledTracks.roman && cue.roman.trim()) {
        const dir = detectScriptDirection(cue.roman);
        const font = `${item.isActive ? 600 : 400} ${rSize}px ${romanStack}`;
        ctx.font = font;
        blocks.push({
          lines: wrapTextLines(ctx, cue.roman, maxTextW),
          font,
          lineHeight: rSize * 1.3,
          color: item.isActive ? style.secondaryColor : scrollingConfig.textColor,
          direction: dir,
        });
      }

      if (enabledTracks.english && cue.english.trim()) {
        const dir = detectScriptDirection(cue.english);
        const font = `400 ${eSize}px ${engStack}`;
        ctx.font = font;
        blocks.push({
          lines: wrapTextLines(ctx, cue.english, maxTextW),
          font,
          lineHeight: eSize * 1.28,
          color: item.isActive
            ? 'rgba(244, 244, 245, 0.92)'
            : scrollingConfig.textColor,
          direction: dir,
        });
      }

      if (blocks.length === 0) continue;

      const blockGap = Math.round(5 * item.scale * unit);
      const totalH =
        blocks.reduce((sum, blk) => sum + blk.lines.length * blk.lineHeight, 0) +
        Math.max(0, blocks.length - 1) * blockGap;

      ctx.save();
      ctx.globalAlpha *= item.opacity;
      const totalBlur = quantizeBlurStep((item.blur + item.motionBlur) * unit);
      const hasBlurFilter = totalBlur > 0.25;

      if (hasBlurFilter && typeof document !== 'undefined') {
        // Quantize blur to coarse integer buckets (2, 4, 6, 8, 10, 12) and cache at canonical scale 1.0
        // so smooth scroll transitions hit cache 99%+ of frames instead of allocating & blurring 300 canvases/sec!
        const bucketBlur = Math.max(2, Math.min(12, Math.round(totalBlur / 2) * 2));
        const invScale = item.scale > 0.05 ? 1 / item.scale : 1;
        const baseTotalH = totalH * invScale;
        const blurPad = Math.ceil(bucketBlur * 2.5 + 16 * unit);
        const spriteW = Math.max(64, Math.ceil(maxTextW + blurPad * 2 + 40 * unit));
        const topPad = Math.ceil(blurPad + 24 * unit);
        const spriteH = Math.max(32, Math.ceil(baseTotalH + topPad * 2));
        const localAnchorX =
          scrollingConfig.textAlign === 'left'
            ? blurPad
            : scrollingConfig.textAlign === 'right'
            ? spriteW - blurPad
            : spriteW / 2;

        const spriteKey = [
          cue.id,
          enabledTracks.primary ? cue.primary : '',
          enabledTracks.roman ? cue.roman : '',
          enabledTracks.english ? cue.english : '',
          item.isActive ? '1' : '0',
          bucketBlur,
          scrollingConfig.textAlign,
          scrollingConfig.textColor,
          scrollingConfig.activeColor,
          style.secondaryColor,
          scrollingConfig.farsiFont,
          scrollingConfig.romanFont,
          scrollingConfig.englishFont,
          Math.round(areaWidth),
          unit.toFixed(2),
        ].join('|');

        let sprite = blurSpriteCache.get(spriteKey);
        if (!sprite) {
          const spriteScale = 0.5;
          const off = document.createElement('canvas');
          off.width = Math.max(4, Math.ceil(spriteW * spriteScale));
          off.height = Math.max(4, Math.ceil(spriteH * spriteScale));
          const oCtx = off.getContext('2d');
          if (oCtx) {
            oCtx.save();
            oCtx.scale(spriteScale, spriteScale);
            if ('filter' in oCtx) {
              oCtx.filter = `blur(${bucketBlur}px)`;
            }
            oCtx.textBaseline = 'top';
            oCtx.textAlign = scrollingConfig.textAlign;

            const baseFSize = Math.round(scrollingConfig.farsiFontSize * unit);
            const baseRSize = Math.round((scrollingConfig.englishFontSize + 3) * unit);
            const baseESize = Math.round(scrollingConfig.englishFontSize * unit);
            const baseBlockGap = Math.round(5 * unit);

            let localY = topPad;
            const drawCanonical = (
              text: string,
              size: number,
              weight: number,
              stack: string,
              color: string,
              dir: 'rtl' | 'ltr',
              lhMult: number
            ) => {
              oCtx.font = `${weight} ${size}px ${stack}`;
              oCtx.fillStyle = color;
              if ('direction' in oCtx) oCtx.direction = dir;
              const wrapped = wrapTextLines(oCtx, text, maxTextW);
              for (const line of wrapped) {
                oCtx.fillText(line, localAnchorX, localY);
                localY += size * lhMult;
              }
              localY += baseBlockGap;
            };

            if (enabledTracks.primary && cue.primary.trim()) {
              const dir = detectScriptDirection(cue.primary);
              const isNast =
                dir === 'rtl' &&
                scrollingConfig.farsiFont.toLowerCase().includes('nastaliq');
              drawCanonical(
                cue.primary,
                baseFSize,
                item.isActive ? 700 : 500,
                dir === 'rtl' ? farsiStack : engStack,
                item.isActive ? scrollingConfig.activeColor : scrollingConfig.textColor,
                dir,
                isNast ? 1.72 : 1.38
              );
            }
            if (enabledTracks.roman && cue.roman.trim()) {
              drawCanonical(
                cue.roman,
                baseRSize,
                item.isActive ? 600 : 400,
                romanStack,
                item.isActive ? style.secondaryColor : scrollingConfig.textColor,
                detectScriptDirection(cue.roman),
                1.3
              );
            }
            if (enabledTracks.english && cue.english.trim()) {
              drawCanonical(
                cue.english,
                baseESize,
                400,
                engStack,
                item.isActive ? 'rgba(244, 244, 245, 0.92)' : scrollingConfig.textColor,
                detectScriptDirection(cue.english),
                1.28
              );
            }

            oCtx.restore();
            setBoundedCache(blurSpriteCache, spriteKey, off, MAX_BLUR_SPRITE_CACHE);
            sprite = off;
          }
        } else {
          setBoundedCache(blurSpriteCache, spriteKey, sprite, MAX_BLUR_SPRITE_CACHE);
        }

        if (sprite) {
          const drawW = spriteW * item.scale;
          const drawH = spriteH * item.scale;
          ctx.drawImage(
            sprite,
            anchorX - localAnchorX * item.scale,
            centerY - (baseTotalH / 2 + topPad) * item.scale,
            drawW,
            drawH
          );
          ctx.restore();
          continue;
        }
      }

      ctx.textBaseline = 'top';
      ctx.textAlign = scrollingConfig.textAlign;

      let cursorY = centerY - totalH / 2;
      for (let b = 0; b < blocks.length; b++) {
        const blk = blocks[b];
        ctx.font = blk.font;
        ctx.fillStyle = blk.color;
        if ('direction' in ctx) {
          ctx.direction = blk.direction;
        }

        if (hasBlurFilter) {
          ctx.shadowBlur = 0;
        } else if (item.isActive && scrollingConfig.glowStrength > 0.02) {
          ctx.shadowColor = scrollingConfig.activeColor;
          ctx.shadowBlur = Math.round(24 * scrollingConfig.glowStrength * unit);
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        } else if (scrollingConfig.shadowStrength > 0.02) {
          ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(
            0.95,
            scrollingConfig.shadowStrength
          )})`;
          ctx.shadowBlur = Math.round(12 * scrollingConfig.shadowStrength * unit);
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = Math.round(3 * unit);
        } else {
          ctx.shadowBlur = 0;
        }

        for (const line of blk.lines) {
          ctx.fillText(line, anchorX, cursorY);
          cursorY += blk.lineHeight;
        }
        cursorY += blockGap;
      }

      ctx.restore();
    }

    ctx.restore();
  };

  const drawSingleTrackCueInBox = (
    boxW: number,
    boxH: number,
    trackKind: 'farsi' | 'romanized' | 'english'
  ) => {
    const activeCue = getActiveCueAtTime(cues, currentTime, globalOffset);
    if (!activeCue) return;

    const text =
      trackKind === 'farsi'
        ? activeCue.primary
        : trackKind === 'romanized'
        ? activeCue.roman
        : activeCue.english;

    const enabled =
      trackKind === 'farsi'
        ? enabledTracks.primary
        : trackKind === 'romanized'
        ? enabledTracks.roman
        : enabledTracks.english;

    if (!enabled || !text.trim()) return;

    const opacity = computeCueOpacity(
      activeCue,
      currentTime,
      0.16,
      disableFade,
      globalOffset
    );
    if (opacity <= 0.01) return;

    ctx.save();
    ctx.globalAlpha *= opacity;

    const baseSize =
      trackKind === 'farsi'
        ? ratio === '16:9'
          ? 52
          : 46
        : trackKind === 'romanized'
        ? ratio === '16:9'
          ? 34
          : 30
        : ratio === '16:9'
        ? 28
        : 25;
    const fontSize = Math.round(baseSize * style.fontScale * unit);
    const dir = detectScriptDirection(text);
    const farsiStack = resolveFontStack(
      style.farsiFont,
      farsiFontFamily,
      nastaliqFontFamily,
      latinFontFamily,
      true
    );
    const latinStack = resolveFontStack(
      style.latinFont,
      farsiFontFamily,
      nastaliqFontFamily,
      latinFontFamily,
      false
    );
    const fontFace = dir === 'rtl' ? farsiStack : latinStack;
    const weight = trackKind === 'farsi' ? 600 : trackKind === 'romanized' ? 500 : 400;
    ctx.font = `${weight} ${fontSize}px ${fontFace}`;

    const lines = wrapTextLines(ctx, text, boxW * 0.94);
    const isNastaliq =
      dir === 'rtl' && style.farsiFont.toLowerCase().includes('nastaliq');
    const lineHeight = fontSize * (isNastaliq ? 1.7 : 1.35);
    const totalH = lines.length * lineHeight;

    if (style.backdrop === 'box' && lines.length > 0) {
      let maxW = 0;
      for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
      const padX = 28 * unit;
      const padY = 14 * unit;
      const rw = Math.min(boxW, maxW + padX * 2);
      const rh = totalH + padY * 2;
      const rx =
        style.alignment === 'left'
          ? 0
          : style.alignment === 'right'
          ? boxW - rw
          : boxW / 2 - rw / 2;
      const ry = boxH / 2 - rh / 2;
      ctx.fillStyle = 'rgba(9, 11, 15, 0.72)';
      ctx.beginPath();
      ctx.roundRect(rx, ry, rw, rh, 14 * unit);
      ctx.fill();
    }

    ctx.textBaseline = 'top';
    ctx.textAlign = style.alignment;
    if ('direction' in ctx) ctx.direction = dir;
    ctx.fillStyle =
      trackKind === 'farsi'
        ? style.primaryColor
        : trackKind === 'romanized'
        ? style.secondaryColor
        : 'rgba(244, 244, 245, 0.9)';

    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = Math.round(14 * unit);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(3 * unit);

    const anchorX =
      style.alignment === 'left'
        ? 12 * unit
        : style.alignment === 'right'
        ? boxW - 12 * unit
        : boxW / 2;
    let cursorY = Math.max(0, boxH / 2 - totalH / 2);

    for (const l of lines) {
      ctx.fillText(l, anchorX, cursorY);
      cursorY += lineHeight;
    }

    ctx.restore();
  };

  if (hasLayers) {
    let drewScrim = false;
    for (const rawLayer of activeLayers) {
      const evaluated = evaluateLayerAtTime(
        rawLayer,
        currentTime,
        nativeDim.width,
        nativeDim.height,
        projectDuration
      );
      if (!evaluated.visible) continue;
      const layer = evaluated.layer;

      if (layer.type === 'media-clip') {
        const trackIdx = layer.trackIndex ?? 0;
        if (hiddenVisualTracks && hiddenVisualTracks.has(trackIdx)) continue;
        const clipKey = layer.clipId ?? layer.id;
        const src =
          clipMediaSources?.get(clipKey) ??
          (layer.mediaUrl ? clipMediaSources?.get(layer.mediaUrl) : undefined) ??
          (layer.mediaUrl ? layerImages?.get(layer.mediaUrl) : undefined) ??
          null;
        const envOpacity = clipEnvelopeOpacities?.get(clipKey) ?? 1;
        if (!src || envOpacity <= 0.005) continue;

        const effectiveSrc = getKeyedImageSource(src, layer.keying);
        const clipLayerWithEnvelope =
          envOpacity < 0.999
            ? { ...layer, opacity: layer.opacity * Math.max(0, Math.min(1, envOpacity)) }
            : layer;
        const isBaseTrack = trackIdx === 0;
        const effectiveFit = layer.fitMode ?? (isBaseTrack ? 'cover' : 'contain');
        applyLayerTransform(ctx, clipLayerWithEnvelope, unit, (lw, lh) => {
          if (isBaseTrack) {
            ctx.beginPath();
            ctx.rect(0, 0, lw, lh);
            ctx.clip();
            if (beatTx.bgScale !== 1 || beatTx.bgOffsetX !== 0 || beatTx.bgOffsetY !== 0) {
              ctx.save();
              ctx.translate(
                lw / 2 + beatTx.bgOffsetX * unit,
                lh / 2 + beatTx.bgOffsetY * unit
              );
              ctx.scale(beatTx.bgScale, beatTx.bgScale);
              ctx.translate(-lw / 2, -lh / 2);
              drawSingleMediaSource(effectiveSrc, lw, lh, true, layer.fitMode);
              ctx.restore();
            } else {
              drawSingleMediaSource(effectiveSrc, lw, lh, true, layer.fitMode);
            }
          } else {
            // V2+ Character / Foreground Media Layer: supports independent beat bounce, ghost-clone, and neon-outline!
            const hasCharTx =
              beatTx.charScale !== 1 ||
              beatTx.charOffsetX !== 0 ||
              beatTx.charOffsetY !== 0;
            const drawForeground = () => {
              if (
                effectiveBeatEffects.effectType === 'ghost-clone' &&
                beatTx.cloneSpreadPx > 1
              ) {
                const spread = beatTx.cloneSpreadPx * unit;
                const swing = Math.sin(currentTime * 6.5) * 0.25 + 1;
                const dx = spread * swing;
                ctx.save();
                ctx.globalAlpha *= 0.34;
                ctx.translate(-dx, 0);
                drawSingleMediaSource(effectiveSrc, lw, lh, false, effectiveFit);
                ctx.restore();
                ctx.save();
                ctx.globalAlpha *= 0.34;
                ctx.translate(dx, 0);
                drawSingleMediaSource(effectiveSrc, lw, lh, false, effectiveFit);
                ctx.restore();
              }
              if (
                effectiveBeatEffects.effectType === 'neon-outline' &&
                beatTx.outlineGlowAlpha > 0.02
              ) {
                const auraColor = effectiveBeatEffects.visualizerColor || '#22D3EE';
                ctx.save();
                ctx.shadowColor = auraColor;
                ctx.shadowBlur = Math.round((16 + beatTx.fxPulse * 34) * unit);
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                drawSingleMediaSource(effectiveSrc, lw, lh, false, effectiveFit);
                ctx.restore();
              }
              drawSingleMediaSource(effectiveSrc, lw, lh, false, effectiveFit);
            };

            if (hasCharTx) {
              ctx.save();
              ctx.translate(
                lw / 2 + beatTx.charOffsetX * unit,
                lh / 2 + beatTx.charOffsetY * unit
              );
              ctx.scale(beatTx.charScale, beatTx.charScale);
              ctx.translate(-lw / 2, -lh / 2);
              drawForeground();
              ctx.restore();
            } else {
              drawForeground();
            }
          }
        });
        if (
          isBaseTrack &&
          !drewScrim &&
          style.backdrop === 'scrim' &&
          !scrollingConfig.enabled
        ) {
          drewScrim = true;
          const scrim = ctx.createLinearGradient(0, height * 0.52, 0, height);
          scrim.addColorStop(0, 'rgba(0,0,0,0)');
          scrim.addColorStop(1, 'rgba(0,0,0,0.75)');
          ctx.fillStyle = scrim;
          ctx.fillRect(0, height * 0.52, width, height * 0.48);
        }
      } else if (layer.type === 'background-media') {
        const bgLayerWithClipOpacity =
          mediaOpacity < 0.999
            ? { ...layer, opacity: layer.opacity * Math.max(0, Math.min(1, mediaOpacity)) }
            : layer;
        applyLayerTransform(ctx, bgLayerWithClipOpacity, unit, (lw, lh) => {
          ctx.beginPath();
          ctx.rect(0, 0, lw, lh);
          ctx.clip();
          if (
            beatTx.bgScale !== 1 ||
            beatTx.bgOffsetX !== 0 ||
            beatTx.bgOffsetY !== 0
          ) {
            ctx.save();
            ctx.translate(
              lw / 2 + beatTx.bgOffsetX * unit,
              lh / 2 + beatTx.bgOffsetY * unit
            );
            ctx.scale(beatTx.bgScale, beatTx.bgScale);
            ctx.translate(-lw / 2, -lh / 2);
            drawBackgroundInBox(lw, lh);
            ctx.restore();
          } else {
            drawBackgroundInBox(lw, lh);
          }
        });
        if (!drewScrim && style.backdrop === 'scrim' && !scrollingConfig.enabled) {
          drewScrim = true;
          const scrim = ctx.createLinearGradient(0, height * 0.52, 0, height);
          scrim.addColorStop(0, 'rgba(0,0,0,0)');
          scrim.addColorStop(1, 'rgba(0,0,0,0.75)');
          ctx.fillStyle = scrim;
          ctx.fillRect(0, height * 0.52, width, height * 0.48);
        }
      } else if (layer.type === 'shape') {
        applyLayerTransform(ctx, layer, unit, (lw, lh) => {
          ctx.fillStyle = layer.fillColor || 'rgba(245, 158, 11, 0.22)';
          ctx.strokeStyle = layer.strokeColor || 'rgba(245, 158, 11, 0.75)';
          ctx.lineWidth = Math.max(1.5, 2.5 * unit);
          ctx.beginPath();
          if (layer.shapeKind === 'circle') {
            ctx.ellipse(lw / 2, lh / 2, lw / 2, lh / 2, 0, 0, Math.PI * 2);
          } else if (layer.shapeKind === 'pill') {
            ctx.roundRect(0, 0, lw, lh, Math.min(lw, lh) / 2);
          } else {
            ctx.roundRect(0, 0, lw, lh, 18 * unit);
          }
          ctx.fill();
          ctx.stroke();
        });
      } else if (layer.type === 'image' && layer.mediaUrl) {
        const img = layerImages?.get(layer.mediaUrl);
        if (img && img.naturalWidth > 0) {
          const effectiveImg = getKeyedImageSource(img, layer.keying);
          const srcW =
            typeof HTMLCanvasElement !== 'undefined' &&
            effectiveImg instanceof HTMLCanvasElement
              ? effectiveImg.width
              : (effectiveImg as HTMLImageElement).naturalWidth;
          const srcH =
            typeof HTMLCanvasElement !== 'undefined' &&
            effectiveImg instanceof HTMLCanvasElement
              ? effectiveImg.height
              : (effectiveImg as HTMLImageElement).naturalHeight;
          applyLayerTransform(ctx, layer, unit, (lw, lh) => {
            const drawImgCore = () => {
              if (layer.fitMode === 'stretch') {
                ctx.drawImage(effectiveImg, 0, 0, lw, lh);
              } else {
                const fit = computeFitRect(
                  srcW,
                  srcH,
                  lw,
                  lh,
                  layer.fitMode === 'cover' ? 'cover' : 'contain'
                );
                ctx.drawImage(effectiveImg, fit.dx, fit.dy, fit.dw, fit.dh);
              }
            };
            const hasCharTx =
              beatTx.charScale !== 1 ||
              beatTx.charOffsetX !== 0 ||
              beatTx.charOffsetY !== 0;
            ctx.save();
            if (hasCharTx) {
              ctx.translate(
                lw / 2 + beatTx.charOffsetX * unit,
                lh / 2 + beatTx.charOffsetY * unit
              );
              ctx.scale(beatTx.charScale, beatTx.charScale);
              ctx.translate(-lw / 2, -lh / 2);
            }
            if (
              effectiveBeatEffects.effectType === 'ghost-clone' &&
              beatTx.cloneSpreadPx > 1
            ) {
              const dx = beatTx.cloneSpreadPx * unit;
              ctx.save();
              ctx.globalAlpha *= 0.34;
              ctx.translate(-dx, 0);
              drawImgCore();
              ctx.restore();
              ctx.save();
              ctx.globalAlpha *= 0.34;
              ctx.translate(dx, 0);
              drawImgCore();
              ctx.restore();
            }
            if (
              effectiveBeatEffects.effectType === 'neon-outline' &&
              beatTx.outlineGlowAlpha > 0.02
            ) {
              ctx.save();
              ctx.shadowColor = effectiveBeatEffects.visualizerColor || '#22D3EE';
              ctx.shadowBlur = Math.round((16 + beatTx.fxPulse * 34) * unit);
              drawImgCore();
              ctx.restore();
            }
            drawImgCore();
            ctx.restore();
          });
        }
      } else if (layer.type === 'timer-counter') {
        applyLayerTransform(ctx, layer, unit, (lw, lh) => {
          const timerStyle = layer.timerStyle ?? 'stopwatch-hud';
          const accent = layer.timerAccentColor || '#F59E0B';
          const textColor = layer.color || '#F8FAFC';
          const fontSize = Math.round((layer.fontSize ?? 44) * unit);
          const fontWeight = layer.fontWeight ?? 700;
          const displayText = formatTimerCounterText(
            currentTime,
            projectDuration ?? 24,
            layer
          );
          const showProgress =
            layer.timerShowProgress ?? layer.timerMode === 'elapsed-total';
          const progress = computeTimerProgress(
            currentTime,
            projectDuration ?? 24,
            layer
          );

          // Transparent by default (timerBgOpacity defaults to 0), fully customizable!
          const bgOpacity = Math.max(0, Math.min(1, layer.timerBgOpacity ?? 0));
          const borderOpacity = Math.max(0, Math.min(1, layer.timerBorderOpacity ?? 0));
          const bgHex = layer.timerBgColor || '#090B0F';

          if (bgOpacity > 0.01 || borderOpacity > 0.01) {
            ctx.save();
            const radius = Math.min(20 * unit, lh / 2);
            ctx.beginPath();
            ctx.roundRect(0, 0, lw, lh, radius);
            if (bgOpacity > 0.01) {
              ctx.save();
              ctx.globalAlpha *= bgOpacity;
              ctx.fillStyle = bgHex;
              ctx.fill();
              ctx.restore();
            }
            if (borderOpacity > 0.01) {
              ctx.save();
              ctx.globalAlpha *= borderOpacity;
              ctx.strokeStyle = timerStyle === 'neon-amber' ? accent : '#FFFFFF';
              if (timerStyle === 'neon-amber') {
                ctx.shadowColor = accent;
                ctx.shadowBlur = Math.round(14 * unit);
              }
              ctx.lineWidth = Math.max(1.2, 2 * unit);
              ctx.stroke();
              ctx.restore();
            }
            ctx.restore();
          }

          // Optional live recording / stopwatch dot
          const showDot =
            layer.timerShowDot !== undefined
              ? layer.timerShowDot
              : timerStyle === 'stopwatch-hud' || timerStyle === 'neon-amber';
          const dotRadius = Math.max(3, 5.5 * unit);
          const contentOffsetX = showDot ? dotRadius * 2.2 : 0;
          if (showDot) {
            const pulse = 0.55 + 0.45 * Math.sin(currentTime * Math.PI * 2);
            ctx.save();
            ctx.fillStyle = timerStyle === 'neon-amber' ? accent : '#FB7185';
            ctx.globalAlpha *= pulse;
            ctx.shadowColor = timerStyle === 'neon-amber' ? accent : '#FB7185';
            ctx.shadowBlur = Math.round(10 * unit);
            ctx.beginPath();
            ctx.arc(
              Math.max(dotRadius * 2.5, lw * 0.1),
              showProgress ? lh * 0.43 : lh / 2,
              dotRadius,
              0,
              Math.PI * 2
            );
            ctx.fill();
            ctx.restore();
          }

          // Crisp tabular numerals readable directly over video even on transparent BG
          const fontStack = layer.fontFamily
            ? `"${layer.fontFamily}", ui-monospace, "JetBrains Mono", Menlo, monospace`
            : `ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`;
          ctx.font = `${fontWeight} ${fontSize}px ${fontStack}`;
          ctx.fillStyle = timerStyle === 'neon-amber' ? accent : textColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor =
            timerStyle === 'neon-amber' ? accent : 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = Math.round(
            (timerStyle === 'neon-amber' ? 16 : layer.shadowBlur ?? 10) * unit
          );
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = Math.round(2.5 * unit);

          const textY = showProgress ? lh * 0.43 : lh / 2;
          ctx.fillText(displayText, lw / 2 + contentOffsetX * 0.4, textY, lw * 0.88);

          if (showProgress) {
            const barMargin = Math.max(12 * unit, lw * 0.08);
            const barW = Math.max(20, lw - barMargin * 2);
            const barH = Math.max(3, 5 * unit);
            const barY = lh * 0.77;
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.beginPath();
            ctx.roundRect(barMargin, barY, barW, barH, barH / 2);
            ctx.fill();

            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.roundRect(barMargin, barY, Math.max(barH, barW * progress), barH, barH / 2);
            ctx.fill();
            ctx.restore();
          }
        });
      } else if (layer.type === 'text') {
        applyLayerTransform(ctx, layer, unit, (lw, lh) => {
          const textVal = layer.text || layer.name;
          const dir = detectScriptDirection(textVal);
          const fontSize = Math.round((layer.fontSize ?? 48) * unit);
          const fontWeight = layer.fontWeight ?? 700;
          const fontStyle = layer.fontStyle ?? 'normal';
          const fontStack = resolveFontStack(
            layer.fontFamily,
            farsiFontFamily,
            nastaliqFontFamily,
            latinFontFamily,
            dir === 'rtl'
          );
          const align = layer.textAlign ?? 'center';
          const letterSp = (layer.letterSpacing ?? 0) * unit;

          if (layer.backgroundColor && layer.backgroundColor !== 'transparent') {
            ctx.save();
            ctx.fillStyle = layer.backgroundColor;
            ctx.beginPath();
            ctx.roundRect(0, 0, lw, lh, Math.min(20 * unit, lh / 2));
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.lineWidth = Math.max(1, 2 * unit);
            ctx.stroke();
            ctx.restore();
          }

          ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontStack}`;
          ctx.fillStyle = layer.color || '#FFFFFF';
          ctx.textAlign = align;
          ctx.textBaseline = 'middle';
          if ('direction' in ctx) ctx.direction = dir;
          if ('letterSpacing' in ctx) {
            (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
              `${letterSp.toFixed(1)}px`;
          }

          const sBlur = layer.shadowBlur ?? 12;
          if (sBlur > 0.2) {
            ctx.shadowColor = 'rgba(0,0,0,0.82)';
            ctx.shadowBlur = Math.round(sBlur * unit);
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = Math.round(2 * unit);
          } else {
            ctx.shadowBlur = 0;
          }

          const maxTextW = Math.max(40, lw * 0.92);
          const paragraphs = textVal.split('\n');
          const lines: string[] = [];
          for (const p of paragraphs) {
            const wrapped = wrapTextLines(ctx, p, maxTextW);
            if (wrapped.length > 0) {
              lines.push(...wrapped);
            } else {
              lines.push('');
            }
          }
          if (lines.length === 0) lines.push(textVal);

          const isNastaliq =
            dir === 'rtl' &&
            (layer.fontFamily ?? '').toLowerCase().includes('nastaliq');
          const lineHeight = fontSize * (isNastaliq ? 1.65 : 1.25);
          const totalH = lines.length * lineHeight;
          const anchorX =
            align === 'left' ? lw * 0.05 : align === 'right' ? lw * 0.95 : lw / 2;
          let cursorY = lh / 2 - totalH / 2 + lineHeight / 2;

          for (const line of lines) {
            ctx.fillText(line, anchorX, cursorY, maxTextW);
            cursorY += lineHeight;
          }
        });
      } else if (layer.type === 'scrolling-lyrics' && scrollingConfig.enabled) {
        applyLayerTransform(ctx, layer, unit, (lw, lh) => {
          if (beatTx.lyricScale !== 1 || beatTx.lyricOffsetY !== 0) {
            ctx.save();
            ctx.translate(lw / 2, lh / 2 + beatTx.lyricOffsetY * unit);
            ctx.scale(beatTx.lyricScale, beatTx.lyricScale);
            ctx.translate(-lw / 2, -lh / 2);
            drawScrollingLyricsBox(lw, lh);
            ctx.restore();
          } else {
            drawScrollingLyricsBox(lw, lh);
          }
        });
      } else if (
        !scrollingConfig.enabled &&
        (layer.type === 'lyric-farsi' ||
          layer.type === 'lyric-romanized' ||
          layer.type === 'lyric-english')
      ) {
        const trackKind =
          layer.type === 'lyric-farsi'
            ? 'farsi'
            : layer.type === 'lyric-romanized'
            ? 'romanized'
            : 'english';
        applyLayerTransform(ctx, layer, unit, (lw, lh) => {
          if (beatTx.lyricScale !== 1 || beatTx.lyricOffsetY !== 0) {
            ctx.save();
            ctx.translate(lw / 2, lh / 2 + beatTx.lyricOffsetY * unit);
            ctx.scale(beatTx.lyricScale, beatTx.lyricScale);
            ctx.translate(-lw / 2, -lh / 2);
            drawSingleTrackCueInBox(lw, lh, trackKind);
            ctx.restore();
          } else {
            drawSingleTrackCueInBox(lw, lh, trackKind);
          }
        });
      }
    }
  } else {
    // Legacy direct render path (preserves full backward compatibility in unit tests)
    drawBackgroundInBox(width, height);
    if (scrollingConfig.enabled) {
      drawScrollingLyricsBox(width, height);
    } else {
      const activeCue = getActiveCueAtTime(cues, currentTime, globalOffset);
      if (activeCue) {
        const opacity = computeCueOpacity(
          activeCue,
          currentTime,
          0.16,
          disableFade,
          globalOffset
        );
        if (opacity > 0.01) {
          ctx.save();
          ctx.globalAlpha = opacity;
          const fontSize = Math.round((ratio === '16:9' ? 54 : 48) * style.fontScale * unit);
          ctx.font = `600 ${fontSize}px ${farsiFontFamily}`;
          ctx.fillStyle = style.primaryColor;
          ctx.textAlign = style.alignment;
          ctx.textBaseline = 'middle';
          ctx.fillText(activeCue.primary, width / 2, height * 0.8);
          ctx.restore();
        }
      }
    }
  }

  // Beat-Synced Atmospheric & Body/Aura Visual Effects
  if (effectiveBeatEffects.effectType === 'ring-ripple' && beatTx.rippleAlpha > 0.02) {
    ctx.save();
    const minSide = Math.min(width, height);
    const cx = width / 2;
    const cy = height / 2;
    for (let ring = 0; ring < 3; ring++) {
      const phase = (beatTx.rippleProgress + ring / 3) % 1;
      const radius = minSide * (0.14 + phase * 0.44);
      const alpha = (1 - phase) * beatTx.rippleAlpha * 0.62;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = effectiveBeatEffects.visualizerColor || '#F59E0B';
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.lineWidth = Math.max(1.5, (6 - phase * 3.5) * unit);
      ctx.shadowColor = effectiveBeatEffects.visualizerColor || '#F59E0B';
      ctx.shadowBlur = Math.round(20 * unit);
      ctx.stroke();
    }
    ctx.restore();
  } else if (effectiveBeatEffects.effectType === 'flash-lamp' && beatTx.flashAlpha > 0.01) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width / 2,
      height * 0.42,
      width * 0.04,
      width / 2,
      height * 0.5,
      Math.max(width, height) * 0.72
    );
    grad.addColorStop(0, `rgba(255, 244, 214, ${beatTx.flashAlpha.toFixed(3)})`);
    grad.addColorStop(0.55, `rgba(245, 158, 11, ${(beatTx.flashAlpha * 0.5).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (effectiveBeatEffects.effectType === 'rgb-glitch' && beatTx.glitchOffsetPx > 0.4) {
    ctx.save();
    const shift = beatTx.glitchOffsetPx * unit;
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(244, 63, 94, ${(0.1 * effectiveBeatEffects.intensity).toFixed(3)})`;
    ctx.fillRect(shift, 0, width, height);
    ctx.fillStyle = `rgba(56, 189, 248, ${(0.1 * effectiveBeatEffects.intensity).toFixed(3)})`;
    ctx.fillRect(-shift, 0, width, height);
    for (let s = 0; s < 3; s++) {
      const stripY = ((currentTime * (280 + s * 130) + s * 210) % height);
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.16 * effectiveBeatEffects.intensity).toFixed(3)})`;
      ctx.fillRect(0, stripY, width, Math.max(2, (3 + s * 2) * unit));
    }
    ctx.restore();
  } else if (effectiveBeatEffects.effectType === 'neon-rush' && beatTx.fxEnergy > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.hypot(width, height) * 0.65;
    const rays = 24;
    const spin = currentTime * 0.55;
    const palette = ['#22D3EE', '#A855F7', '#EC4899', '#F59E0B', '#34D399'];
    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2 + spin;
      const bVal = beatSample.bands[i % beatSample.bands.length] ?? 0.5;
      const innerR = Math.min(width, height) * (0.16 - beatTx.fxPulse * 0.04);
      const outerR = innerR + maxR * (0.35 + bVal * 0.5 + beatTx.fxPulse * 0.25);
      const spread = (Math.PI / rays) * (0.28 + bVal * 0.35);
      const color = palette[i % palette.length];
      const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.25, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.max(0.05, Math.min(0.6, (0.14 + beatTx.fxPulse * 0.38) * effectiveBeatEffects.intensity));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle - spread) * innerR, cy + Math.sin(angle - spread) * innerR);
      ctx.lineTo(cx + Math.cos(angle - spread * 0.3) * outerR, cy + Math.sin(angle - spread * 0.3) * outerR);
      ctx.lineTo(cx + Math.cos(angle + spread * 0.3) * outerR, cy + Math.sin(angle + spread * 0.3) * outerR);
      ctx.lineTo(cx + Math.cos(angle + spread) * innerR, cy + Math.sin(angle + spread) * innerR);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else if (effectiveBeatEffects.effectType === 'lightning-vortex' && beatTx.fxEnergy > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const boltCount = 8;
    const stepSeed = Math.floor(currentTime * 18);
    const alpha = Math.min(0.92, (0.24 + beatTx.fxPulse * 0.72) * effectiveBeatEffects.intensity);
    for (let b = 0; b < boltCount; b++) {
      const fromLeft = b % 2 === 0;
      const startX = fromLeft ? 0 : width;
      const startY = ((b * 137 + stepSeed * 29) % 100) / 100 * height;
      const targetX = width * (fromLeft ? 0.32 : 0.68) + Math.sin(stepSeed + b * 3.1) * width * 0.14;
      const targetY = height * (0.2 + ((b * 0.23 + Math.sin(currentTime * 2 + b)) % 0.6 + 0.6) % 0.6);
      const segs = 7;

      const drawBoltPath = () => {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        for (let s = 1; s < segs; s++) {
          const frac = s / segs;
          const jitter = Math.sin(stepSeed * 12.7 + b * 19.3 + s * 7.1) * (36 + beatTx.fxPulse * 55) * unit;
          const bx = startX + (targetX - startX) * frac + jitter * 0.35;
          const by = startY + (targetY - startY) * frac + jitter;
          ctx.lineTo(bx, by);
        }
        ctx.lineTo(targetX, targetY);
      };

      // Electric blue outer arc
      ctx.strokeStyle = '#38BDF8';
      ctx.shadowColor = '#60A5FA';
      ctx.shadowBlur = Math.round(24 * unit);
      ctx.lineWidth = Math.max(2, (5 + beatTx.fxPulse * 5) * unit);
      ctx.globalAlpha = alpha * 0.78;
      drawBoltPath();
      ctx.stroke();

      // White hot core
      ctx.strokeStyle = '#FFFFFF';
      ctx.shadowBlur = Math.round(8 * unit);
      ctx.lineWidth = Math.max(1, (1.8 + beatTx.fxPulse * 2) * unit);
      ctx.globalAlpha = alpha;
      drawBoltPath();
      ctx.stroke();
    }
    ctx.restore();
  } else if (effectiveBeatEffects.effectType === 'abstract-glitter' && beatTx.fxEnergy > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const count = 56;
    const highBand =
      beatSample.bands.length > 4
        ? (beatSample.bands[beatSample.bands.length - 2] +
            beatSample.bands[beatSample.bands.length - 4]) *
          0.5
        : beatSample.energy;
    for (let i = 0; i < count; i++) {
      const seed = (i + 1) * 13.37;
      const px = ((Math.sin(seed * 4.1) * 0.5 + 0.5) * width + currentTime * (12 + (i % 5) * 6)) % width;
      const py = ((Math.cos(seed * 2.7) * 0.5 + 0.5) * height - currentTime * (18 + (i % 7) * 8) + height * 10) % height;
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(currentTime * (3.2 + (i % 5) * 1.1) + seed));
      const size = (2.5 + (i % 4) * 1.8 + (beatTx.fxPulse * 5 + highBand * 4)) * unit;
      const alpha = Math.min(0.95, twinkle * (0.35 + beatTx.fxPulse * 0.55) * effectiveBeatEffects.intensity);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i % 3 === 0 ? '#FDE68A' : i % 3 === 1 ? '#FFFFFF' : '#F9A8D4';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = Math.round(10 * unit);

      // 4-point star sparkle
      ctx.beginPath();
      ctx.moveTo(px, py - size * 1.4);
      ctx.lineTo(px + size * 0.32, py - size * 0.32);
      ctx.lineTo(px + size * 1.4, py);
      ctx.lineTo(px + size * 0.32, py + size * 0.32);
      ctx.lineTo(px, py + size * 1.4);
      ctx.lineTo(px - size * 0.32, py + size * 0.32);
      ctx.lineTo(px - size * 1.4, py);
      ctx.lineTo(px - size * 0.32, py - size * 0.32);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else if (effectiveBeatEffects.effectType === 'heart-particles' && beatTx.fxEnergy > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const count = 20;
    for (let i = 0; i < count; i++) {
      const speed = 42 + (i % 5) * 18;
      const cycle = ((currentTime * speed + i * 97) % (height + 160));
      const py = height + 60 - cycle;
      const baseX = ((i * 193.7) % 100) / 100 * width;
      const px = baseX + Math.sin(currentTime * 2.1 + i * 1.7) * 34 * unit;
      const s = (10 + (i % 4) * 5 + beatTx.fxPulse * 10) * unit;
      const edgeFade = Math.min(1, cycle / 140) * Math.min(1, (height + 160 - cycle) / 180);
      ctx.globalAlpha = Math.max(0, Math.min(0.85, edgeFade * (0.4 + beatTx.fxPulse * 0.5) * effectiveBeatEffects.intensity));
      ctx.fillStyle = i % 2 === 0 ? '#FB7185' : '#F472B6';
      ctx.shadowColor = '#EC4899';
      ctx.shadowBlur = Math.round(14 * unit);

      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 0.85, -s * 0.4, -s * 0.45, -s * 1.1, 0, -s * 0.35);
      ctx.bezierCurveTo(s * 0.45, -s * 1.1, s * 0.85, -s * 0.4, 0, s * 0.35);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  } else if (effectiveBeatEffects.effectType === 'speed-lines' && beatTx.fxEnergy > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cx = width / 2;
    const cy = height / 2;
    const outerR = Math.hypot(width, height) * 0.62;
    const lines = 40;
    const jitterStep = Math.floor(currentTime * 15);
    ctx.strokeStyle = '#FFFFFF';
    ctx.shadowColor = effectiveBeatEffects.visualizerColor || '#38BDF8';
    ctx.shadowBlur = Math.round(10 * unit);
    for (let i = 0; i < lines; i++) {
      const angle = (i / lines) * Math.PI * 2 + Math.sin(jitterStep + i) * 0.03;
      const innerFrac = 0.36 - beatTx.fxPulse * 0.14 + ((i * 17 + jitterStep * 7) % 11) * 0.014;
      const innerR = outerR * Math.max(0.18, innerFrac);
      ctx.globalAlpha = Math.min(0.75, (0.16 + beatTx.fxPulse * 0.55) * effectiveBeatEffects.intensity);
      ctx.lineWidth = Math.max(1.2, (1.5 + (i % 3) * 1.2 + beatTx.fxPulse * 2.5) * unit);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Deterministic Beat-Synced Audio Visualizers (12 Rich Presets using 24 Real Frequency Bands)
  if (effectiveBeatEffects.visualizerType !== 'none') {
    const vizType = effectiveBeatEffects.visualizerType;
    const vizPos = effectiveBeatEffects.visualizerPosition;
    const vizColor = effectiveBeatEffects.visualizerColor || '#F59E0B';
    const vizAlpha = Math.max(0.1, Math.min(1, effectiveBeatEffects.visualizerOpacity));
    const vizScaleH = Math.max(0.4, Math.min(2, effectiveBeatEffects.visualizerHeight));
    const bands = beatSample.bands;
    const bandLen = Math.max(1, bands.length);

    ctx.save();
    ctx.globalAlpha = vizAlpha;
    ctx.fillStyle = vizColor;
    ctx.strokeStyle = vizColor;

    const baseY =
      vizPos === 'top'
        ? height * 0.13
        : vizPos === 'center'
        ? height * 0.5
        : height * 0.89;

    if (vizType === 'spectrum-bars') {
      // Mirrored crisp Studio EQ Bars with floating peak dots
      const totalBars = Math.min(48, bandLen * 2);
      const half = Math.floor(totalBars / 2);
      const areaW = width * 0.78;
      const startX = (width - areaW) / 2;
      const gap = Math.max(2, 4.5 * unit);
      const barW = Math.max(3, (areaW - gap * (totalBars - 1)) / totalBars);
      const maxBarH = height * 0.17 * vizScaleH;

      ctx.shadowColor = vizColor;
      ctx.shadowBlur = Math.round(14 * unit);

      for (let i = 0; i < totalBars; i++) {
        const bIdx = Math.min(
          bandLen - 1,
          Math.floor(((i < half ? half - 1 - i : i - half) / Math.max(1, half)) * bandLen)
        );
        const val = Math.max(0.05, bands[bIdx] ?? 0);
        const h = Math.max(4 * unit, val * maxBarH);
        const x = startX + i * (barW + gap);
        const y =
          vizPos === 'top' ? baseY : vizPos === 'center' ? baseY - h / 2 : baseY - h;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, Math.min(barW / 2, 4 * unit));
        ctx.fill();
      }
    } else if (vizType === 'iridescent-bars') {
      // Cyan -> Indigo -> Violet -> Hot Magenta mirrored glowing digital wave bars
      const totalBars = Math.min(56, bandLen * 2);
      const half = Math.floor(totalBars / 2);
      const areaW = width * 0.84;
      const startX = (width - areaW) / 2;
      const gap = Math.max(2, 4 * unit);
      const barW = Math.max(3, (areaW - gap * (totalBars - 1)) / totalBars);
      const maxBarH = height * 0.19 * vizScaleH;

      const grad = ctx.createLinearGradient(startX, baseY, startX + areaW, baseY);
      grad.addColorStop(0, '#22D3EE');
      grad.addColorStop(0.28, '#6366F1');
      grad.addColorStop(0.5, '#A855F7');
      grad.addColorStop(0.75, '#EC4899');
      grad.addColorStop(1, '#F43F5E');

      ctx.fillStyle = grad;
      ctx.shadowColor = '#EC4899';
      ctx.shadowBlur = Math.round(18 * unit);

      for (let i = 0; i < totalBars; i++) {
        const distFromCenter = Math.abs(i - (totalBars - 1) / 2) / Math.max(1, half);
        // Classic Filmora wings profile: energetic outer wings + dynamic center bass
        const bIdx = Math.min(bandLen - 1, Math.floor(distFromCenter * bandLen));
        const val = Math.max(0.06, bands[bIdx] ?? 0);
        const h = Math.max(5 * unit, val * maxBarH);
        const x = startX + i * (barW + gap);
        const y =
          vizPos === 'top' ? baseY : vizPos === 'center' ? baseY - h / 2 : baseY - h;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, Math.min(barW / 2, 4 * unit));
        ctx.fill();

        // Subtle reflection underneath when anchored bottom
        if (vizPos === 'bottom') {
          ctx.save();
          ctx.globalAlpha *= 0.28;
          ctx.beginPath();
          ctx.roundRect(x, baseY + 3 * unit, barW, h * 0.32, Math.min(barW / 2, 3 * unit));
          ctx.fill();
          ctx.restore();
        }
      }
    } else if (vizType === 'dot-matrix') {
      // Segmented LED pixel matrix columns jumping per frequency band
      const cols = Math.min(36, bandLen + 8);
      const rows = 10;
      const areaW = width * 0.78;
      const startX = (width - areaW) / 2;
      const colStep = areaW / cols;
      const dotR = Math.max(2.2, Math.min(colStep * 0.28, 5.5 * unit));
      const rowStep = (height * 0.16 * vizScaleH) / rows;

      ctx.shadowColor = vizColor;
      ctx.shadowBlur = Math.round(10 * unit);

      for (let c = 0; c < cols; c++) {
        const mirrorFrac = Math.abs(c - (cols - 1) / 2) / Math.max(1, (cols - 1) / 2);
        const bIdx = Math.min(bandLen - 1, Math.floor(mirrorFrac * bandLen));
        const level = Math.max(0.08, bands[bIdx] ?? 0);
        const activeRows = Math.max(1, Math.round(level * rows));
        const cx = startX + (c + 0.5) * colStep;
        for (let r = 0; r < activeRows; r++) {
          const cy =
            vizPos === 'top'
              ? baseY + r * rowStep
              : vizPos === 'center'
              ? baseY - ((activeRows - 1) * rowStep) / 2 + r * rowStep
              : baseY - r * rowStep;
          ctx.globalAlpha = vizAlpha * (0.45 + 0.55 * ((r + 1) / rows));
          ctx.beginPath();
          ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (vizType === 'mirror-wave') {
      // Iridescent smooth filled mirrored sound wave
      const areaW = width * 0.84;
      const startX = (width - areaW) / 2;
      const maxAmp = height * 0.11 * vizScaleH;
      const pts = bandLen * 2;
      const grad = ctx.createLinearGradient(startX, baseY, startX + areaW, baseY);
      grad.addColorStop(0, '#22D3EE');
      grad.addColorStop(0.5, vizColor);
      grad.addColorStop(1, '#EC4899');

      ctx.fillStyle = grad;
      ctx.strokeStyle = grad;
      ctx.shadowColor = vizColor;
      ctx.shadowBlur = Math.round(18 * unit);
      ctx.lineWidth = Math.max(2, 3.2 * unit);

      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const frac = i / Math.max(1, pts - 1);
        const env = Math.sin(frac * Math.PI);
        const bIdx = Math.min(bandLen - 1, Math.floor(Math.abs(frac - 0.5) * 2 * bandLen));
        const amp = (0.06 + (bands[bIdx] ?? 0) * 0.94) * env * maxAmp;
        const x = startX + frac * areaW;
        const y = baseY - amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = pts - 1; i >= 0; i--) {
        const frac = i / Math.max(1, pts - 1);
        const env = Math.sin(frac * Math.PI);
        const bIdx = Math.min(bandLen - 1, Math.floor(Math.abs(frac - 0.5) * 2 * bandLen));
        const amp = (0.06 + (bands[bIdx] ?? 0) * 0.94) * env * maxAmp;
        const x = startX + frac * areaW;
        const y = baseY + amp * (vizPos === 'bottom' ? 0.35 : 1);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.save();
      ctx.globalAlpha = vizAlpha * 0.42;
      ctx.fill();
      ctx.restore();
      ctx.stroke();
    } else if (vizType === 'waving-line') {
      // Glowing cyan -> pink -> amber neon waving silk line
      const areaW = width * 0.88;
      const startX = (width - areaW) / 2;
      const maxAmp = height * 0.13 * vizScaleH;
      const pts = bandLen * 2;
      const grad = ctx.createLinearGradient(startX, baseY, startX + areaW, baseY);
      grad.addColorStop(0, '#22D3EE');
      grad.addColorStop(0.5, '#F472B6');
      grad.addColorStop(1, '#FBBF24');

      ctx.strokeStyle = grad;
      ctx.shadowColor = '#F472B6';
      ctx.shadowBlur = Math.round(20 * unit);
      ctx.lineWidth = Math.max(2.5, 4.5 * unit);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const frac = i / Math.max(1, pts - 1);
        const env = Math.pow(Math.sin(frac * Math.PI), 0.75);
        const bIdx = Math.min(bandLen - 1, Math.floor(frac * bandLen));
        const wave = Math.sin(frac * Math.PI * 5 + currentTime * 5.2);
        const val = bands[bIdx] ?? 0;
        const x = startX + frac * areaW;
        const y = baseY - (val * 0.75 + beatSample.beat * 0.25) * env * maxAmp * (0.45 + 0.55 * wave);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (vizType === 'circular-halo') {
      const cx = width / 2;
      const cy = vizPos === 'top' ? height * 0.28 : vizPos === 'bottom' ? height * 0.72 : height / 2;
      const baseR = Math.min(width, height) * (0.21 + beatSample.beat * 0.032);
      const maxRay = Math.min(width, height) * 0.11 * vizScaleH;
      const rays = bandLen * 3;
      ctx.shadowColor = vizColor;
      ctx.shadowBlur = Math.round(14 * unit);
      ctx.lineWidth = Math.max(2, 4 * unit);
      ctx.lineCap = 'round';

      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2 - Math.PI / 2;
        const bVal = bands[i % bandLen] ?? 0;
        const rayLen = Math.max(6 * unit, bVal * maxRay);
        const x0 = cx + Math.cos(angle) * baseR;
        const y0 = cy + Math.sin(angle) * baseR;
        const x1 = cx + Math.cos(angle) * (baseR + rayLen);
        const y1 = cy + Math.sin(angle) * (baseR + rayLen);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    } else if (vizType === 'iridescent-circle') {
      const cx = width / 2;
      const cy = vizPos === 'top' ? height * 0.28 : vizPos === 'bottom' ? height * 0.72 : height / 2;
      const baseR = Math.min(width, height) * (0.22 + beatSample.beat * 0.035);
      const maxRay = Math.min(width, height) * 0.12 * vizScaleH;
      const rays = bandLen * 3;

      const ringGrad = ctx.createLinearGradient(cx - baseR, cy - baseR, cx + baseR, cy + baseR);
      ringGrad.addColorStop(0, '#22D3EE');
      ringGrad.addColorStop(0.5, '#A855F7');
      ringGrad.addColorStop(1, '#EC4899');

      // Base glowing ring
      ctx.strokeStyle = ringGrad;
      ctx.shadowColor = '#EC4899';
      ctx.shadowBlur = Math.round(22 * unit);
      ctx.lineWidth = Math.max(2, 4 * unit);
      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx.stroke();

      // Bi-directional radial spikes (inward & outward)
      ctx.lineWidth = Math.max(2, 3.6 * unit);
      ctx.lineCap = 'round';
      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2 + currentTime * 0.35;
        const bVal = bands[i % bandLen] ?? 0;
        const spike = Math.max(4 * unit, bVal * maxRay);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * (baseR - spike * 0.25), cy + Math.sin(angle) * (baseR - spike * 0.25));
        ctx.lineTo(cx + Math.cos(angle) * (baseR + spike), cy + Math.sin(angle) * (baseR + spike));
        ctx.stroke();
      }
    } else if (vizType === 'bass-blob') {
      // Organic Bass Drops morphing neon multi-lobe ring
      const cx = width / 2;
      const cy = vizPos === 'top' ? height * 0.28 : vizPos === 'bottom' ? height * 0.72 : height / 2;
      const baseR = Math.min(width, height) * (0.19 + beatSample.bass * 0.04);
      const pts = 64;
      const layers = [
        { color: '#3B82F6', phase: 0, ampScale: 1.0, alpha: 0.72 },
        { color: '#A855F7', phase: 1.4, ampScale: 0.85, alpha: 0.65 },
        { color: '#EC4899', phase: 2.8, ampScale: 0.72, alpha: 0.78 },
      ];
      for (const blob of layers) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = vizAlpha * blob.alpha;
        ctx.strokeStyle = blob.color;
        ctx.shadowColor = blob.color;
        ctx.shadowBlur = Math.round(24 * unit);
        ctx.lineWidth = Math.max(3, (6 + beatSample.beat * 6) * unit);
        ctx.beginPath();
        for (let i = 0; i <= pts; i++) {
          const frac = i / pts;
          const angle = frac * Math.PI * 2;
          const bIdx = Math.min(bandLen - 1, Math.floor((i % bandLen)));
          const bandVal = bands[bIdx] ?? 0;
          const harmonic =
            Math.sin(angle * 3 + currentTime * 2.6 + blob.phase) * 0.55 +
            Math.cos(angle * 5 - currentTime * 3.1 + blob.phase) * 0.45;
          const r =
            baseR +
            (bandVal * 0.65 + beatSample.bass * 0.35) *
              Math.min(width, height) *
              0.085 *
              vizScaleH *
              blob.ampScale *
              (0.6 + 0.4 * harmonic);
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    } else if (vizType === 'audio-spectrum') {
      // Fine needle-sharp horizontal studio oscilloscope spikes
      const areaW = width * 0.86;
      const startX = (width - areaW) / 2;
      const maxAmp = height * 0.14 * vizScaleH;
      const needles = 72;
      const step = areaW / (needles - 1);

      ctx.strokeStyle = vizColor;
      ctx.shadowColor = vizColor;
      ctx.shadowBlur = Math.round(10 * unit);
      ctx.lineWidth = Math.max(1.2, 2.2 * unit);

      // Center baseline
      ctx.save();
      ctx.globalAlpha = vizAlpha * 0.35;
      ctx.beginPath();
      ctx.moveTo(startX, baseY);
      ctx.lineTo(startX + areaW, baseY);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      for (let i = 0; i < needles; i++) {
        const frac = i / (needles - 1);
        const env = Math.sin(frac * Math.PI);
        const bIdx = Math.min(bandLen - 1, Math.floor(frac * bandLen));
        const val = bands[bIdx] ?? 0;
        const sign = i % 2 === 0 ? 1 : -1;
        const jitter = 0.65 + 0.35 * Math.sin(i * 1.9 + currentTime * 14);
        const x = startX + i * step;
        const y = baseY + sign * val * env * maxAmp * jitter;
        if (i === 0) ctx.moveTo(x, baseY);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(startX + areaW, baseY);
      ctx.stroke();
    } else if (vizType === 'color-ribbon') {
      // Multi-color overlapping glowing sine ribbons (Emerald, Cyan, Magenta, Amber)
      const areaW = width * 0.88;
      const startX = (width - areaW) / 2;
      const maxAmp = height * 0.11 * vizScaleH;
      const pts = 56;
      const ribbons = [
        { color: '#34D399', freq: 3.0, phase: 0, bandShift: 0 },
        { color: '#38BDF8', freq: 3.6, phase: 1.5, bandShift: 4 },
        { color: '#F43F5E', freq: 2.7, phase: 3.1, bandShift: 8 },
        { color: '#FBBF24', freq: 4.2, phase: 4.6, bandShift: 12 },
      ];
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const rib of ribbons) {
        ctx.fillStyle = rib.color;
        ctx.globalAlpha = vizAlpha * 0.45;
        ctx.beginPath();
        for (let i = 0; i < pts; i++) {
          const frac = i / (pts - 1);
          const env = Math.pow(Math.sin(frac * Math.PI), 1.1);
          const bIdx = (Math.floor(frac * bandLen) + rib.bandShift) % bandLen;
          const val = 0.12 + (bands[bIdx] ?? 0) * 0.88;
          const wave = Math.sin(frac * Math.PI * rib.freq + currentTime * 4.2 + rib.phase);
          const x = startX + frac * areaW;
          const y = baseY + wave * val * env * maxAmp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let i = pts - 1; i >= 0; i--) {
          const frac = i / (pts - 1);
          const env = Math.pow(Math.sin(frac * Math.PI), 1.1);
          const bIdx = (Math.floor(frac * bandLen) + rib.bandShift) % bandLen;
          const val = 0.12 + (bands[bIdx] ?? 0) * 0.88;
          const wave = Math.sin(frac * Math.PI * rib.freq + currentTime * 4.2 + rib.phase);
          const x = startX + frac * areaW;
          const y = baseY - wave * val * env * maxAmp * 0.45;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else if (vizType === 'border-spectrum') {
      // Frame-hugging top & bottom club equalizer bars
      const barsPerEdge = Math.min(44, bandLen * 2);
      const gap = Math.max(2, 4 * unit);
      const barW = Math.max(3, (width - gap * (barsPerEdge + 1)) / barsPerEdge);
      const maxH = height * 0.11 * vizScaleH;
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, '#38BDF8');
      grad.addColorStop(0.5, '#A855F7');
      grad.addColorStop(1, '#EC4899');
      ctx.fillStyle = grad;
      ctx.shadowColor = '#A855F7';
      ctx.shadowBlur = Math.round(14 * unit);

      for (let i = 0; i < barsPerEdge; i++) {
        const bIdx = i % bandLen;
        const val = Math.max(0.06, bands[bIdx] ?? 0);
        const h = Math.max(4 * unit, val * maxH);
        const x = gap + i * (barW + gap);
        // Bottom edge rising up
        ctx.beginPath();
        ctx.roundRect(x, height - h, barW, h, [3 * unit, 3 * unit, 0, 0]);
        ctx.fill();
        // Top edge hanging down (mirrored frequency index)
        const topVal = Math.max(0.06, bands[(bandLen - 1 - bIdx)] ?? 0);
        const topH = Math.max(4 * unit, topVal * maxH * 0.82);
        ctx.beginPath();
        ctx.roundRect(x, 0, barW, topH, [0, 0, 3 * unit, 3 * unit]);
        ctx.fill();
      }
    } else if (vizType === 'pulse-particles') {
      // Beat Pulse halo ring + rhythm-burst particles & horizontal energy line
      const cx = width / 2;
      const cy = vizPos === 'top' ? height * 0.25 : vizPos === 'bottom' ? height * 0.78 : height / 2;
      const r = Math.min(width, height) * (0.14 + beatSample.beat * 0.045) * Math.min(1.4, vizScaleH);

      const grad = ctx.createLinearGradient(0, cy, width, cy);
      grad.addColorStop(0, '#22D3EE');
      grad.addColorStop(0.5, vizColor);
      grad.addColorStop(1, '#EC4899');

      // Horizontal beat-wave line piercing the halo
      ctx.strokeStyle = grad;
      ctx.shadowColor = vizColor;
      ctx.shadowBlur = Math.round(18 * unit);
      ctx.lineWidth = Math.max(2, 3.5 * unit);
      ctx.beginPath();
      const segs = 48;
      for (let i = 0; i <= segs; i++) {
        const frac = i / segs;
        const x = frac * width;
        const bVal = bands[Math.min(bandLen - 1, Math.floor(frac * bandLen))] ?? 0;
        const wave = Math.sin(frac * Math.PI * 10 + currentTime * 8) * bVal * height * 0.04 * vizScaleH;
        if (i === 0) ctx.moveTo(x, cy + wave);
        else ctx.lineTo(x, cy + wave);
      }
      ctx.stroke();

      // Glowing central halo circle
      ctx.lineWidth = Math.max(2.5, (4 + beatSample.beat * 5) * unit);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Radiating beat particles
      const pCount = 28;
      for (let i = 0; i < pCount; i++) {
        const angle = (i / pCount) * Math.PI * 2 + currentTime * 0.6;
        const bVal = bands[i % bandLen] ?? 0;
        const dist = r + (14 + bVal * 95 * vizScaleH + beatSample.beat * 45) * unit;
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;
        const pr = (2.2 + bVal * 4.5 + beatSample.beat * 2.5) * unit;
        ctx.fillStyle = i % 2 === 0 ? '#F472B6' : '#38BDF8';
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (vizType === 'pulse-line') {
      const areaW = width * (0.36 + beatSample.energy * 0.44);
      const startX = (width - areaW) / 2;
      const lineH = Math.max(3, (4 + beatSample.beat * 8 * vizScaleH) * unit);
      ctx.shadowColor = vizColor;
      ctx.shadowBlur = Math.round(20 * unit);
      ctx.beginPath();
      ctx.roundRect(startX, baseY - lineH / 2, areaW, lineH, lineH / 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Interactive Magnetic Snap Guides (preview only — canvas center, edges & sibling layers)
  if (drawLayerHandles && snapGuides) {
    const vLines = new Set<number>(snapGuides.verticalLines ?? []);
    const hLines = new Set<number>(snapGuides.horizontalLines ?? []);
    if (snapGuides.centerX) vLines.add(nativeDim.width / 2);
    if (snapGuides.centerY) hLines.add(nativeDim.height / 2);

    if (vLines.size > 0 || hLines.size > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.92)';
      ctx.lineWidth = Math.max(1.25, 2.2 * unit);
      ctx.setLineDash([8 * unit, 5 * unit]);
      for (const vx of vLines) {
        const px = Math.max(1, Math.min(width - 1, vx * unit));
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      }
      for (const hy of hLines) {
        const py = Math.max(1, Math.min(height - 1, hy * unit));
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Selected Layer Bounding Box + 4 Corner Handles + 4 Side Stretch Bars + Rotation Handle (preview only)
  if (drawLayerHandles && selectedLayerId && hasLayers) {
    const rawSelected = activeLayers.find((l) => l.id === selectedLayerId);
    const evalSelected = rawSelected
      ? evaluateLayerAtTime(
          rawSelected,
          currentTime,
          nativeDim.width,
          nativeDim.height,
          projectDuration
        )
      : null;
    const selected = evalSelected?.visible ? evalSelected.layer : null;
    const isHiddenTrack =
      selected?.type === 'media-clip' &&
      Boolean(hiddenVisualTracks?.has(selected.trackIndex ?? 0));
    if (selected && selected.visible && !isHiddenTrack) {
      const isScrollingMatch =
        scrollingConfig.enabled &&
        (selected.type === 'lyric-farsi' ||
          selected.type === 'lyric-romanized' ||
          selected.type === 'lyric-english');
      const isClassicMatch =
        !scrollingConfig.enabled && selected.type === 'scrolling-lyrics';

      if (!isScrollingMatch && !isClassicMatch) {
        const handles = getLayerHandles(selected);
        const cx = (selected.x + selected.width / 2) * unit;
        const cy = (selected.y + selected.height / 2) * unit;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((selected.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);

        const padInset = Math.max(1, 2 * unit);
        const bx = Math.max(padInset, Math.min(width - padInset, selected.x * unit));
        const by = Math.max(padInset, Math.min(height - padInset, selected.y * unit));
        const bx2 = Math.max(
          bx + 4,
          Math.min(width - padInset, (selected.x + selected.width) * unit)
        );
        const by2 = Math.max(
          by + 4,
          Math.min(height - padInset, (selected.y + selected.height) * unit)
        );

        ctx.strokeStyle = selected.locked ? '#71717A' : '#F59E0B';
        ctx.lineWidth = Math.max(1.5, 2.5 * unit);
        ctx.strokeRect(bx, by, bx2 - bx, by2 - by);

        if (!selected.locked) {
          const rotHandle = handles.find((h) => h.id === 'rotate');
          const topMid = handles.find((h) => h.id === 'n');
          const rotInward = selected.y <= 28;
          if (rotHandle && topMid) {
            const rx = Math.max(10 * unit, Math.min(width - 10 * unit, rotHandle.x * unit));
            const ry = rotInward ? by + 26 * unit : rotHandle.y * unit;
            ctx.beginPath();
            ctx.moveTo(rx, by);
            ctx.lineTo(rx, ry);
            ctx.stroke();
          }

          const edgeInset = Math.max(6, 9 * unit);
          for (const h of handles) {
            let hx = h.x * unit;
            let hy = h.y * unit;
            if (h.id === 'rotate') {
              hx = Math.max(edgeInset, Math.min(width - edgeInset, hx));
              hy = rotInward ? by + 26 * unit : Math.max(edgeInset, hy);
            } else {
              hx = Math.max(edgeInset, Math.min(width - edgeInset, hx));
              hy = Math.max(edgeInset, Math.min(height - edgeInset, hy));
            }

            ctx.strokeStyle = '#090B0F';
            ctx.lineWidth = Math.max(1.2, 2 * unit);
            ctx.beginPath();

            if (h.id === 'rotate') {
              const r = Math.max(5.5, 8.5 * unit);
              ctx.fillStyle = '#F59E0B';
              ctx.arc(hx, hy, r, 0, Math.PI * 2);
            } else if (h.id === 'n' || h.id === 's') {
              // Sleek horizontal stretch pill on top/bottom edges
              const pw = Math.max(14, 24 * unit);
              const ph = Math.max(5, 7 * unit);
              ctx.fillStyle = '#FFFFFF';
              ctx.roundRect(hx - pw / 2, hy - ph / 2, pw, ph, ph / 2);
            } else if (h.id === 'e' || h.id === 'w') {
              // Sleek vertical stretch pill on left/right edges
              const pw = Math.max(5, 7 * unit);
              const ph = Math.max(14, 24 * unit);
              ctx.fillStyle = '#FFFFFF';
              ctx.roundRect(hx - pw / 2, hy - ph / 2, pw, ph, pw / 2);
            } else {
              // 4 Corner resize squares (nw, ne, se, sw)
              const r = Math.max(5, 7.5 * unit);
              ctx.fillStyle = '#FFFFFF';
              ctx.roundRect(hx - r, hy - r, r * 2, r * 2, Math.max(1.5, 2.5 * unit));
            }
            ctx.fill();
            ctx.stroke();
          }
        }

        ctx.restore();
      }
    }
  }

  // Optional YouTube / Shorts safe-zone guide overlay (only during preview, never export)
  if (drawSafeZones) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.38)';
    ctx.lineWidth = Math.max(1, width * 0.0015);
    ctx.setLineDash([width * 0.008, width * 0.006]);
    if (ratio === '9:16') {
      ctx.strokeRect(width * 0.06, height * 0.12, width * 0.8, height * 0.66);
    } else {
      ctx.strokeRect(width * 0.05, height * 0.06, width * 0.9, height * 0.86);
    }
    ctx.restore();
  }

  ctx.restore();
}
