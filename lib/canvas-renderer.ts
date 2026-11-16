import {
  AspectRatio,
  EnabledTracks,
  LyricCue,
  LyricStyleConfig,
  MediaFitMode,
  detectScriptDirection,
  getActiveCueAtTime,
} from './lyrics-parser';

export interface Resolution {
  width: number;
  height: number;
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
  disableFade = false
): number {
  const duration = cue.endTime - cue.startTime;
  const fade = Math.min(fadeSeconds, duration * 0.25);
  if (currentTime < cue.startTime || currentTime >= cue.endTime) return 0;
  if (disableFade || fade <= 0.01) return 1;

  const sinceStart = currentTime - cue.startTime;
  const untilEnd = cue.endTime - currentTime;

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

export interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  ratio: AspectRatio;
  mediaSource: HTMLImageElement | HTMLVideoElement | null;
  mediaFit: MediaFitMode;
  cues: LyricCue[];
  currentTime: number;
  enabledTracks: EnabledTracks;
  style: LyricStyleConfig;
  farsiFontFamily?: string;
  latinFontFamily?: string;
  drawSafeZones?: boolean;
  disableFade?: boolean;
}

export function renderFrameToCanvas({
  ctx,
  width,
  height,
  ratio,
  mediaSource,
  mediaFit,
  cues,
  currentTime,
  enabledTracks,
  style,
  farsiFontFamily = '"Vazirmatn", "Plus Jakarta Sans", sans-serif',
  latinFontFamily = '"Plus Jakarta Sans", system-ui, sans-serif',
  drawSafeZones = false,
  disableFade = false,
}: RenderFrameParams): void {
  // 1. Base studio black
  ctx.save();
  ctx.fillStyle = '#090B0F';
  ctx.fillRect(0, 0, width, height);

  // 2. Draw visual media (Video or Image)
  if (mediaSource) {
    const srcW =
      mediaSource instanceof HTMLVideoElement
        ? mediaSource.videoWidth
        : mediaSource.naturalWidth;
    const srcH =
      mediaSource instanceof HTMLVideoElement
        ? mediaSource.videoHeight
        : mediaSource.naturalHeight;

    if (srcW > 0 && srcH > 0) {
      if (mediaFit === 'contain-blur') {
        const bgRect = computeFitRect(srcW, srcH, width, height, 'cover');
        ctx.save();
        ctx.filter = `blur(${Math.round(width * 0.022)}px) brightness(0.45)`;
        ctx.drawImage(mediaSource, bgRect.dx, bgRect.dy, bgRect.dw, bgRect.dh);
        ctx.restore();

        const fgRect = computeFitRect(srcW, srcH, width, height, 'contain');
        ctx.drawImage(mediaSource, fgRect.dx, fgRect.dy, fgRect.dw, fgRect.dh);
      } else if (mediaFit === 'contain-black') {
        const fgRect = computeFitRect(srcW, srcH, width, height, 'contain');
        ctx.drawImage(mediaSource, fgRect.dx, fgRect.dy, fgRect.dw, fgRect.dh);
      } else {
        const coverRect = computeFitRect(srcW, srcH, width, height, 'cover');
        ctx.drawImage(
          mediaSource,
          coverRect.dx,
          coverRect.dy,
          coverRect.dw,
          coverRect.dh
        );
      }
    }
  } else {
    // Subtle dark gradient backdrop if no visual media selected
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#121620');
    grad.addColorStop(1, '#080A0E');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // 3. Optional gradient scrim for subtitle legibility
  if (style.backdrop === 'scrim') {
    if (style.position === 'bottom') {
      const scrim = ctx.createLinearGradient(0, height * 0.52, 0, height);
      scrim.addColorStop(0, 'rgba(0,0,0,0)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.78)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, height * 0.52, width, height * 0.48);
    } else if (style.position === 'top') {
      const scrim = ctx.createLinearGradient(0, 0, 0, height * 0.48);
      scrim.addColorStop(0, 'rgba(0,0,0,0.78)');
      scrim.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, width, height * 0.48);
    } else {
      const scrim = ctx.createRadialGradient(
        width / 2,
        height / 2,
        width * 0.08,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.55
      );
      scrim.addColorStop(0, 'rgba(0,0,0,0.62)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // 4. Active lyric rendering
  const activeCue = getActiveCueAtTime(cues, currentTime);
  if (activeCue) {
    const opacity = computeCueOpacity(activeCue, currentTime, 0.16, disableFade);
    if (opacity > 0.01) {
      ctx.save();
      ctx.globalAlpha = opacity;

      const baseUnit = ratio === '16:9' ? width / 1920 : width / 1080;
      const horizontalMargin = ratio === '16:9' ? width * 0.1 : width * 0.09;
      const maxTextWidth = width - horizontalMargin * 2;

      const primarySize = Math.round(
        (ratio === '16:9' ? 54 : 48) * style.fontScale * baseUnit
      );
      const secondarySize = Math.round(
        (ratio === '16:9' ? 34 : 30) * style.fontScale * baseUnit
      );
      const tertiarySize = Math.round(
        (ratio === '16:9' ? 28 : 26) * style.fontScale * baseUnit
      );

      interface StyledBlock {
        lines: string[];
        font: string;
        size: number;
        lineHeight: number;
        color: string;
        direction: 'rtl' | 'ltr';
      }

      const blocks: StyledBlock[] = [];

      if (enabledTracks.primary && activeCue.primary.trim()) {
        const dir = detectScriptDirection(activeCue.primary);
        const fontFace = dir === 'rtl' ? farsiFontFamily : latinFontFamily;
        const font = `600 ${primarySize}px ${fontFace}`;
        ctx.font = font;
        blocks.push({
          lines: wrapTextLines(ctx, activeCue.primary, maxTextWidth),
          font,
          size: primarySize,
          lineHeight: primarySize * 1.38,
          color: style.primaryColor,
          direction: dir,
        });
      }

      if (enabledTracks.roman && activeCue.roman.trim()) {
        const dir = detectScriptDirection(activeCue.roman);
        const fontFace = dir === 'rtl' ? farsiFontFamily : latinFontFamily;
        const font = `500 ${secondarySize}px ${fontFace}`;
        ctx.font = font;
        blocks.push({
          lines: wrapTextLines(ctx, activeCue.roman, maxTextWidth),
          font,
          size: secondarySize,
          lineHeight: secondarySize * 1.35,
          color: style.secondaryColor,
          direction: dir,
        });
      }

      if (enabledTracks.english && activeCue.english.trim()) {
        const dir = detectScriptDirection(activeCue.english);
        const fontFace = dir === 'rtl' ? farsiFontFamily : latinFontFamily;
        const font = `400 ${tertiarySize}px ${fontFace}`;
        ctx.font = font;
        blocks.push({
          lines: wrapTextLines(ctx, activeCue.english, maxTextWidth),
          font,
          size: tertiarySize,
          lineHeight: tertiarySize * 1.35,
          color: 'rgba(244, 244, 245, 0.88)',
          direction: dir,
        });
      }

      if (blocks.length > 0) {
        const blockGap = Math.round(12 * style.fontScale * baseUnit);
        let totalBlockHeight = 0;
        let maxLineWidth = 0;

        for (let b = 0; b < blocks.length; b++) {
          const blk = blocks[b];
          ctx.font = blk.font;
          totalBlockHeight += blk.lines.length * blk.lineHeight;
          if (b < blocks.length - 1) totalBlockHeight += blockGap;
          for (const l of blk.lines) {
            maxLineWidth = Math.max(maxLineWidth, ctx.measureText(l).width);
          }
        }

        let anchorY: number;
        const offsetPx = (style.verticalOffsetPct / 100) * height;
        if (style.position === 'top') {
          anchorY = height * 0.14 + offsetPx;
        } else if (style.position === 'center') {
          anchorY = height * 0.5 - totalBlockHeight / 2 + offsetPx;
        } else {
          const bottomPad = ratio === '9:16' ? height * 0.16 : height * 0.1;
          anchorY = height - bottomPad - totalBlockHeight + offsetPx;
        }

        const anchorX =
          style.alignment === 'left'
            ? horizontalMargin
            : style.alignment === 'right'
            ? width - horizontalMargin
            : width / 2;

        // Draw optional translucent box behind multi-language block
        if (style.backdrop === 'box') {
          const padX = Math.round(34 * baseUnit);
          const padY = Math.round(22 * baseUnit);
          const boxW = Math.min(width - horizontalMargin, maxLineWidth + padX * 2);
          const boxH = totalBlockHeight + padY * 2;
          const boxX =
            style.alignment === 'left'
              ? anchorX - padX
              : style.alignment === 'right'
              ? anchorX - boxW + padX
              : width / 2 - boxW / 2;
          const boxY = anchorY - padY;
          const radius = Math.round(18 * baseUnit);

          ctx.fillStyle = 'rgba(9, 11, 15, 0.72)';
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, radius);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
          ctx.lineWidth = Math.max(1, 1.5 * baseUnit);
          ctx.stroke();
        }

        ctx.textBaseline = 'top';
        ctx.textAlign = style.alignment;

        let cursorY = anchorY;
        for (let b = 0; b < blocks.length; b++) {
          const blk = blocks[b];
          ctx.font = blk.font;
          ctx.fillStyle = blk.color;
          if ('direction' in ctx) {
            ctx.direction = blk.direction;
          }

          // Crisp shadow + subtle outline for readability over bright video frames
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = Math.round(14 * baseUnit);
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = Math.round(3 * baseUnit);

          for (const line of blk.lines) {
            ctx.fillText(line, anchorX, cursorY);
            cursorY += blk.lineHeight;
          }
          cursorY += blockGap;
        }
      }

      ctx.restore();
    }
  }

  // 5. Optional YouTube / Shorts safe-zone guide overlay (only during preview, never export)
  if (drawSafeZones) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = Math.max(1, width * 0.0015);
    ctx.setLineDash([width * 0.008, width * 0.006]);
    if (ratio === '9:16') {
      // YouTube Shorts / Reels safe margins (top 12%, bottom 22%, right 14%)
      ctx.strokeRect(
        width * 0.06,
        height * 0.12,
        width * 0.8,
        height * 0.66
      );
    } else {
      ctx.strokeRect(
        width * 0.05,
        height * 0.06,
        width * 0.9,
        height * 0.86
      );
    }
    ctx.restore();
  }

  ctx.restore();
}
