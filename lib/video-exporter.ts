import {
  ArrayBufferTarget as Mp4ArrayBufferTarget,
  Muxer as Mp4Muxer,
} from 'mp4-muxer';
import {
  ArrayBufferTarget as WebmArrayBufferTarget,
  Muxer as WebmMuxer,
} from 'webm-muxer';
import {
  AspectRatio,
  EnabledTracks,
  LyricCue,
  LyricStyleConfig,
  MediaFitMode,
} from './lyrics-parser';
import { CanvasLayer } from './canvas-layers';
import { FocusedScrollingConfig } from './scrolling-lyrics';
import { StackedMediaLayer, renderFrameToCanvas } from './canvas-renderer';
import {
  AudioBeatAnalysis,
  BeatEffectsConfig,
  DEFAULT_BEAT_EFFECTS_CONFIG,
  computeAudioAnalysisFromPcm,
} from './beat-effects';
import {
  AudioTimelineClip,
  TimedEffectClip,
  VisualTimelineClip,
  getActiveAudioClipsAtTime,
  getActiveVisualClipsAtTime,
} from './timeline-engine';

export type ExportQualityPreset = 'high' | 'ultra';

export interface ExportQualitySpec {
  id: ExportQualityPreset;
  label: string;
  videoBitrate: number;
  audioBitrate: number;
  description: string;
}

export const EXPORT_QUALITY_PRESETS: Record<ExportQualityPreset, ExportQualitySpec> = {
  high: {
    id: 'high',
    label: 'High Full HD (12 Mbps)',
    videoBitrate: 12_000_000,
    audioBitrate: 192_000,
    description: '12 Mbps · Balanced file size',
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra Full HD (20 Mbps)',
    videoBitrate: 20_000_000,
    audioBitrate: 256_000,
    description: '20 Mbps · Maximum detail',
  },
};

export type ExportContainerFormat = 'mp4' | 'webm';

export interface EncoderTargetConfig {
  container: ExportContainerFormat;
  mimeType: string;
  ext: ExportContainerFormat;
  videoCodecString: string;
  muxerVideoCodec: 'avc' | 'V_VP9' | 'V_VP8';
  audioCodecString: string | null;
  muxerAudioCodec: 'aac' | 'A_OPUS' | null;
  displayLabel: string;
}

export interface ExportProgressInfo {
  percent: number;
  currentFrame: number;
  totalFrames: number;
  formatLabel: string;
}

export interface ExportVideoResult {
  blob: Blob;
  ext: ExportContainerFormat;
  mimeType: string;
  formatLabel: string;
  totalFrames: number;
  hasAudio: boolean;
}

export interface ExportVideoParams {
  width: number;
  height: number;
  fps?: number;
  duration: number;
  ratio: AspectRatio;
  quality: ExportQualityPreset;
  mediaFit: MediaFitMode;
  visualItem: { kind: 'image' | 'video'; url: string } | null;
  audioSrcUrl: string | null;
  visualClips?: VisualTimelineClip[];
  audioClips?: AudioTimelineClip[];
  effectClips?: TimedEffectClip[];
  hiddenVisualTracks?: number[];
  mutedAudioTracks?: number[];
  cues: LyricCue[];
  globalOffset: number;
  enabledTracks: EnabledTracks;
  style: LyricStyleConfig;
  scrollingConfig: FocusedScrollingConfig;
  beatEffects?: BeatEffectsConfig;
  layers: CanvasLayer[];
  layerImages: Map<string, HTMLImageElement>;
  farsiFontFamily: string;
  nastaliqFontFamily: string;
  latinFontFamily: string;
  coverThumbnailUrl?: string | null;
  signal?: AbortSignal;
  onProgress?: (info: ExportProgressInfo) => void;
}

export function ensureEvenDimension(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function computeFrameSchedule(
  durationSeconds: number,
  fps = 30
): {
  fps: number;
  exportDuration: number;
  totalFrames: number;
  frameDurationUs: number;
} {
  const safeFps = Math.max(1, Math.round(fps));
  const exportDuration = Math.max(1, Number.isFinite(durationSeconds) ? durationSeconds : 2);
  const totalFrames = Math.max(1, Math.round(exportDuration * safeFps));
  const frameDurationUs = Math.round(1_000_000 / safeFps);
  return {
    fps: safeFps,
    exportDuration,
    totalFrames,
    frameDurationUs,
  };
}

export function estimateExportSizeMb(
  durationSeconds: number,
  quality: ExportQualityPreset,
  hasAudio = true
): number {
  const spec = EXPORT_QUALITY_PRESETS[quality];
  const totalBitsPerSec = spec.videoBitrate + (hasAudio ? spec.audioBitrate : 0);
  const bytes = (totalBitsPerSec / 8) * Math.max(1, durationSeconds);
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

export async function selectWebCodecsTarget(options: {
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  hasAudio: boolean;
  sampleRate?: number;
  numberOfChannels?: number;
  checkVideoSupport?: (config: VideoEncoderConfig) => Promise<boolean>;
  checkAudioSupport?: (config: AudioEncoderConfig) => Promise<boolean>;
}): Promise<EncoderTargetConfig | null> {
  const {
    width,
    height,
    fps,
    videoBitrate,
    audioBitrate,
    hasAudio,
    sampleRate = 48000,
    numberOfChannels = 2,
  } = options;

  const isVideoSupported =
    options.checkVideoSupport ??
    (async (config: VideoEncoderConfig) => {
      if (typeof VideoEncoder === 'undefined') return false;
      try {
        const res = await VideoEncoder.isConfigSupported(config);
        return Boolean(res.supported);
      } catch {
        return false;
      }
    });

  const isAudioSupported =
    options.checkAudioSupport ??
    (async (config: AudioEncoderConfig) => {
      if (typeof AudioEncoder === 'undefined') return false;
      try {
        const res = await AudioEncoder.isConfigSupported(config);
        return Boolean(res.supported);
      } catch {
        return false;
      }
    });

  // 1. Try MP4 (H.264 + AAC) — universal Windows Media Player, macOS QuickTime, mobile & browser support
  const h264Candidates = [
    'avc1.64002a', // High Profile L4.2 (1080p30+)
    'avc1.4d002a', // Main Profile L4.2
    'avc1.640028', // High Profile L4.0
    'avc1.42E028', // Baseline Profile L4.0
    'avc1.42E01E', // Baseline Profile L3.0
  ];

  let supportedAvc: string | null = null;
  for (const codec of h264Candidates) {
    const ok = await isVideoSupported({
      codec,
      width,
      height,
      bitrate: videoBitrate,
      framerate: fps,
      latencyMode: 'realtime',
      avc: { format: 'avc' },
    });
    if (ok) {
      supportedAvc = codec;
      break;
    }
  }

  let supportedAac = false;
  if (hasAudio && supportedAvc) {
    supportedAac = await isAudioSupported({
      codec: 'mp4a.40.2',
      sampleRate,
      numberOfChannels,
      bitrate: audioBitrate,
    });
  }

  if (supportedAvc && (!hasAudio || supportedAac)) {
    return {
      container: 'mp4',
      mimeType: supportedAac ? 'video/mp4;codecs=avc1,mp4a.40.2' : 'video/mp4;codecs=avc1',
      ext: 'mp4',
      videoCodecString: supportedAvc,
      muxerVideoCodec: 'avc',
      audioCodecString: supportedAac ? 'mp4a.40.2' : null,
      muxerAudioCodec: supportedAac ? 'aac' : null,
      displayLabel: supportedAac ? 'MP4 (H.264 + AAC) · Seekable' : 'MP4 (H.264) · Seekable',
    };
  }

  // 2. Try WebM (VP9 or VP8 + Opus) with full Cues + Duration headers via webm-muxer
  const webmVideoCandidates: Array<{ codec: string; muxer: 'V_VP9' | 'V_VP8'; label: string }> = [
    { codec: 'vp09.00.41.08', muxer: 'V_VP9', label: 'VP9' },
    { codec: 'vp09.00.31.08', muxer: 'V_VP9', label: 'VP9' },
    { codec: 'vp8', muxer: 'V_VP8', label: 'VP8' },
  ];

  let supportedWebmVideo: { codec: string; muxer: 'V_VP9' | 'V_VP8'; label: string } | null = null;
  for (const cand of webmVideoCandidates) {
    const ok = await isVideoSupported({
      codec: cand.codec,
      width,
      height,
      bitrate: videoBitrate,
      framerate: fps,
      latencyMode: 'realtime',
    });
    if (ok) {
      supportedWebmVideo = cand;
      break;
    }
  }

  let supportedOpus = false;
  if (hasAudio && supportedWebmVideo) {
    supportedOpus = await isAudioSupported({
      codec: 'opus',
      sampleRate,
      numberOfChannels,
      bitrate: audioBitrate,
    });
  }

  if (supportedWebmVideo && (!hasAudio || supportedOpus)) {
    const vCodecTag = supportedWebmVideo.muxer === 'V_VP8' ? 'vp8' : 'vp9';
    return {
      container: 'webm',
      mimeType: supportedOpus ? `video/webm;codecs=${vCodecTag},opus` : `video/webm;codecs=${vCodecTag}`,
      ext: 'webm',
      videoCodecString: supportedWebmVideo.codec,
      muxerVideoCodec: supportedWebmVideo.muxer,
      audioCodecString: supportedOpus ? 'opus' : null,
      muxerAudioCodec: supportedOpus ? 'A_OPUS' : null,
      displayLabel: supportedOpus
        ? `WebM (${supportedWebmVideo.label} + Opus) · Seekable`
        : `WebM (${supportedWebmVideo.label}) · Seekable`,
    };
  }

  // 3. Fallback: MP4 video-only if H.264 worked without AAC/Opus
  if (supportedAvc) {
    return {
      container: 'mp4',
      mimeType: 'video/mp4;codecs=avc1',
      ext: 'mp4',
      videoCodecString: supportedAvc,
      muxerVideoCodec: 'avc',
      audioCodecString: null,
      muxerAudioCodec: null,
      displayLabel: 'MP4 (H.264) · Seekable',
    };
  }

  return null;
}

function yieldToMain(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seekVideoToTime(video: HTMLVideoElement, targetTime: number): Promise<void> {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
  const wrapped = targetTime % duration;
  if (Math.abs(video.currentTime - wrapped) < 0.008) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 150);
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = wrapped;
  });
}

async function decodeAndNormalizeAudio(
  audioSrcUrl: string,
  targetSampleRate = 48000,
  targetChannels = 2
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(audioSrcUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;

    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;

    const decodeCtx = new OfflineCtx(targetChannels, 1, targetSampleRate);
    const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));

    if (
      decoded.sampleRate === targetSampleRate &&
      decoded.numberOfChannels === targetChannels
    ) {
      return decoded;
    }

    const resampledLength = Math.max(
      1,
      Math.ceil(decoded.duration * targetSampleRate)
    );
    const resampleCtx = new OfflineCtx(targetChannels, resampledLength, targetSampleRate);
    const src = resampleCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(resampleCtx.destination);
    src.start(0);
    return await resampleCtx.startRendering();
  } catch {
    return null;
  }
}

export async function exportFullHdVideo(params: ExportVideoParams): Promise<ExportVideoResult> {
  const width = ensureEvenDimension(params.width);
  const height = ensureEvenDimension(params.height);
  const qualitySpec = EXPORT_QUALITY_PRESETS[params.quality];
  const { fps, exportDuration, totalFrames, frameDurationUs } = computeFrameSchedule(
    params.duration,
    params.fps ?? 30
  );

  // Check if WebCodecs is available
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error(
      'Your browser does not support WebCodecs high-speed seekable export. Please use the latest Chrome, Edge, Safari, or Firefox.'
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Could not initialize Full HD 2D rendering canvas.');
  }

  const loadedVisualMedia = new Map<string, HTMLImageElement | HTMLVideoElement>();
  const videoElementsToCleanup: HTMLVideoElement[] = [];

  try {
    const activeVisualClips = params.visualClips ?? [];
    const activeAudioClips = params.audioClips ?? [];
    const activeEffectClips = params.effectClips ?? [];
    const hiddenVisualSet = new Set<number>(params.hiddenVisualTracks ?? []);
    const mutedAudioSet = new Set<number>(params.mutedAudioTracks ?? []);

    const loadVisualAsset = async (kind: 'image' | 'video', url: string) => {
      if (loadedVisualMedia.has(url)) return;
      if (kind === 'image') {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = 'anonymous';
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Failed to load background image for export.'));
          el.src = url;
        });
        loadedVisualMedia.set(url, img);
      } else {
        const v = await new Promise<HTMLVideoElement>((resolve, reject) => {
          const el = document.createElement('video');
          el.crossOrigin = 'anonymous';
          el.playsInline = true;
          el.muted = true;
          el.preload = 'auto';
          el.onloadeddata = () => resolve(el);
          el.onerror = () => reject(new Error('Failed to load background video for export.'));
          el.src = url;
        });
        loadedVisualMedia.set(url, v);
        videoElementsToCleanup.push(v);
      }
    };

    if (activeVisualClips.length > 0) {
      for (const clip of activeVisualClips) {
        await loadVisualAsset(clip.kind, clip.url);
      }
    } else if (params.visualItem) {
      await loadVisualAsset(params.visualItem.kind, params.visualItem.url);
    }

    let coverThumbnailImg: HTMLImageElement | null = null;
    if (params.coverThumbnailUrl) {
      try {
        coverThumbnailImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = 'anonymous';
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Failed to load cover thumbnail.'));
          el.src = params.coverThumbnailUrl!;
        });
      } catch {
        coverThumbnailImg = null;
      }
    }

    const decodedAudioMap = new Map<string, AudioBuffer>();
    if (activeAudioClips.length > 0) {
      for (const aClip of activeAudioClips) {
        if (!decodedAudioMap.has(aClip.url)) {
          const buf = await decodeAndNormalizeAudio(aClip.url, 48000, 2);
          if (buf && buf.length > 0) {
            decodedAudioMap.set(aClip.url, buf);
          }
        }
      }
    } else if (params.audioSrcUrl) {
      const buf = await decodeAndNormalizeAudio(params.audioSrcUrl, 48000, 2);
      if (buf && buf.length > 0) {
        decodedAudioMap.set(params.audioSrcUrl, buf);
      }
    }

    const primaryAudioUrl =
      activeAudioClips[0]?.url ?? params.audioSrcUrl ?? null;
    const decodedAudio = primaryAudioUrl
      ? decodedAudioMap.get(primaryAudioUrl) ?? decodedAudioMap.values().next().value ?? null
      : null;

    const exportAudioAnalysisMap = new Map<string, AudioBeatAnalysis>();
    decodedAudioMap.forEach((buf, url) => {
      if (buf.length > 0) {
        exportAudioAnalysisMap.set(
          url,
          computeAudioAnalysisFromPcm(buf.getChannelData(0), buf.sampleRate, fps, 24)
        );
      }
    });

    const exportAudioAnalysis: AudioBeatAnalysis | null =
      (primaryAudioUrl ? exportAudioAnalysisMap.get(primaryAudioUrl) : null) ??
      exportAudioAnalysisMap.values().next().value ??
      null;

    const hasAudio = decodedAudioMap.size > 0 && Boolean(decodedAudio && decodedAudio.length > 0);
    const targetConfig = await selectWebCodecsTarget({
      width,
      height,
      fps,
      videoBitrate: qualitySpec.videoBitrate,
      audioBitrate: qualitySpec.audioBitrate,
      hasAudio,
      sampleRate: decodedAudio?.sampleRate ?? 48000,
      numberOfChannels: decodedAudio?.numberOfChannels ?? 2,
    });

    if (!targetConfig) {
      throw new Error(
        'No compatible hardware or software video codec (H.264 / VP9 / VP8) was found in this browser.'
      );
    }

    if (params.signal?.aborted) {
      throw new DOMException('Export cancelled', 'AbortError');
    }

    // Create Muxer
    let mp4Muxer: Mp4Muxer<Mp4ArrayBufferTarget> | null = null;
    let webmMuxer: WebmMuxer<WebmArrayBufferTarget> | null = null;

    if (targetConfig.container === 'mp4') {
      mp4Muxer = new Mp4Muxer({
        target: new Mp4ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width,
          height,
          frameRate: fps,
        },
        ...(targetConfig.muxerAudioCodec && decodedAudio
          ? {
              audio: {
                codec: 'aac',
                numberOfChannels: decodedAudio.numberOfChannels,
                sampleRate: decodedAudio.sampleRate,
              },
            }
          : {}),
        fastStart: 'in-memory',
      });
    } else {
      webmMuxer = new WebmMuxer({
        target: new WebmArrayBufferTarget(),
        video: {
          codec: targetConfig.muxerVideoCodec as 'V_VP9' | 'V_VP8',
          width,
          height,
          frameRate: fps,
        },
        ...(targetConfig.muxerAudioCodec && decodedAudio
          ? {
              audio: {
                codec: 'A_OPUS',
                numberOfChannels: decodedAudio.numberOfChannels,
                sampleRate: decodedAudio.sampleRate,
              },
            }
          : {}),
      });
    }

    let encoderFailure: Error | null = null;

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (mp4Muxer) {
          mp4Muxer.addVideoChunk(chunk, meta);
        } else if (webmMuxer) {
          webmMuxer.addVideoChunk(chunk, meta);
        }
      },
      error: (err) => {
        encoderFailure = err instanceof Error ? err : new Error(String(err));
      },
    });

    videoEncoder.configure({
      codec: targetConfig.videoCodecString,
      width,
      height,
      bitrate: qualitySpec.videoBitrate,
      framerate: fps,
      latencyMode: 'realtime',
      ...(targetConfig.container === 'mp4' ? { avc: { format: 'avc' } } : {}),
    });

    let audioEncoder: AudioEncoder | null = null;
    if (targetConfig.audioCodecString && decodedAudio) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          if (mp4Muxer) {
            mp4Muxer.addAudioChunk(chunk, meta);
          } else if (webmMuxer) {
            webmMuxer.addAudioChunk(chunk, meta);
          }
        },
        error: (err) => {
          encoderFailure = err instanceof Error ? err : new Error(String(err));
        },
      });

      audioEncoder.configure({
        codec: targetConfig.audioCodecString,
        sampleRate: decodedAudio.sampleRate,
        numberOfChannels: decodedAudio.numberOfChannels,
        bitrate: qualitySpec.audioBitrate,
      });
    }

    const audioSampleRate = decodedAudio?.sampleRate ?? 48000;
    const audioChannels = decodedAudio?.numberOfChannels ?? 2;
    const audioSrcLength = decodedAudio?.length ?? 0;
    const totalOutputSamples = Math.round(exportDuration * audioSampleRate);
    const audioChunkFrames = 4096;
    const audioChannelArrays = decodedAudio
      ? Array.from({ length: audioChannels }, (_, ch) => decodedAudio.getChannelData(ch))
      : [];
    let audioSampleCursor = 0;

    const audioChannelCache = new Map<string, Float32Array[]>();
    decodedAudioMap.forEach((buf, url) => {
      audioChannelCache.set(
        url,
        Array.from({ length: Math.min(audioChannels, buf.numberOfChannels) }, (_, ch) =>
          buf.getChannelData(ch)
        )
      );
    });

    const pushAudioUpToSample = async (targetSample: number) => {
      if (!audioEncoder || !decodedAudio || audioSrcLength === 0) return;
      const limit = Math.min(totalOutputSamples, targetSample);
      while (audioSampleCursor < limit) {
        if (params.signal?.aborted) {
          throw new DOMException('Export cancelled', 'AbortError');
        }
        if (encoderFailure) throw encoderFailure;

        const framesThisChunk = Math.min(
          audioChunkFrames,
          totalOutputSamples - audioSampleCursor
        );
        const planar = new Float32Array(framesThisChunk * audioChannels);

        if (activeAudioClips.length > 0) {
          for (let i = 0; i < framesThisChunk; i++) {
            const outSampleIdx = audioSampleCursor + i;
            const tSec = outSampleIdx / audioSampleRate;
            const hits = getActiveAudioClipsAtTime(
              activeAudioClips,
              tSec,
              mutedAudioSet
            );
            if (hits.length === 0) continue;
            for (let ch = 0; ch < audioChannels; ch++) {
              let mixed = 0;
              for (const hit of hits) {
                if (hit.gain <= 0.0001) continue;
                const chArrays = audioChannelCache.get(hit.clip.url);
                if (!chArrays || chArrays.length === 0) continue;
                const len = chArrays[0].length;
                if (len === 0) continue;
                const srcIdx = Math.floor(hit.localAudioTime * audioSampleRate) % len;
                const srcCh = chArrays[Math.min(ch, chArrays.length - 1)];
                mixed += srcCh[srcIdx] * hit.gain;
              }
              planar[ch * framesThisChunk + i] = Math.max(-1, Math.min(1, mixed));
            }
          }
        } else {
          for (let ch = 0; ch < audioChannels; ch++) {
            const srcData = audioChannelArrays[ch];
            const destBase = ch * framesThisChunk;
            for (let i = 0; i < framesThisChunk; i++) {
              planar[destBase + i] = srcData[(audioSampleCursor + i) % audioSrcLength];
            }
          }
        }

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: audioSampleRate,
          numberOfFrames: framesThisChunk,
          numberOfChannels: audioChannels,
          timestamp: Math.round((audioSampleCursor / audioSampleRate) * 1_000_000),
          data: planar,
        });

        audioEncoder.encode(audioData);
        audioData.close();
        audioSampleCursor += framesThisChunk;

        while (audioEncoder.encodeQueueSize >= 24) {
          if (encoderFailure) throw encoderFailure;
          await yieldToMain(2);
        }
      }
    };

    // Encode video frames & interleaved audio deterministically at exact 30fps timestamps
    for (let f = 0; f < totalFrames; f++) {
      if (params.signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }
      if (encoderFailure) throw encoderFailure;

      const t = f / fps;
      let frameMediaSource: HTMLImageElement | HTMLVideoElement | null = null;
      let frameMediaOpacity = 1;
      let frameMediaLayers: StackedMediaLayer[] | undefined = undefined;
      const frameClipSources = new Map<string, HTMLImageElement | HTMLVideoElement>();
      const frameClipEnvelopes = new Map<string, number>();

      if (activeVisualClips.length > 0) {
        const hits = getActiveVisualClipsAtTime(
          activeVisualClips,
          t,
          hiddenVisualSet
        );
        if (hits.length > 0) {
          const stacked: StackedMediaLayer[] = [];
          for (const hitVisual of hits) {
            const loaded = loadedVisualMedia.get(hitVisual.clip.url) ?? null;
            if (!loaded) continue;
            if (
              typeof HTMLVideoElement !== 'undefined' &&
              loaded instanceof HTMLVideoElement
            ) {
              await seekVideoToTime(loaded, hitVisual.localMediaTime);
            }
            frameClipSources.set(hitVisual.clip.id, loaded);
            frameClipSources.set(hitVisual.clip.url, loaded);
            const clipBaseOp = hitVisual.clip.opacity ?? 1;
            const envOnly = clipBaseOp > 0.001 ? Math.min(1, hitVisual.opacity / clipBaseOp) : 1;
            frameClipEnvelopes.set(hitVisual.clip.id, envOnly);
            stacked.push({
              source: loaded,
              opacity: hitVisual.opacity,
              trackIndex: hitVisual.trackIndex,
              fitMode: hitVisual.clip.fitMode,
            });
          }
          frameMediaLayers = stacked;
          if (stacked.length > 0) {
            frameMediaSource = stacked[0].source as HTMLImageElement | HTMLVideoElement;
            frameMediaOpacity = stacked[0].opacity;
          }
        }
      } else if (params.visualItem) {
        const loaded = loadedVisualMedia.get(params.visualItem.url) ?? null;
        if (
          loaded &&
          typeof HTMLVideoElement !== 'undefined' &&
          loaded instanceof HTMLVideoElement
        ) {
          await seekVideoToTime(loaded, t);
        }
        frameMediaSource = loaded;
      }

      let frameAudioAnalysis: AudioBeatAnalysis | null = exportAudioAnalysis;
      let frameAudioAnalysisTime = t;
      if (activeAudioClips.length > 0) {
        const audioHits = getActiveAudioClipsAtTime(
          activeAudioClips,
          t,
          mutedAudioSet
        );
        const primaryHit = audioHits.find((h) => h.gain > 0.001) ?? audioHits[0];
        if (primaryHit) {
          frameAudioAnalysis =
            exportAudioAnalysisMap.get(primaryHit.clip.url) ?? exportAudioAnalysis;
          frameAudioAnalysisTime = primaryHit.localAudioTime;
        } else {
          frameAudioAnalysis = null;
        }
      }

      if (f === 0 && coverThumbnailImg) {
        ctx.fillStyle = '#090B0F';
        ctx.fillRect(0, 0, width, height);
        const imgAspect =
          coverThumbnailImg.naturalWidth / Math.max(1, coverThumbnailImg.naturalHeight);
        const targetAspect = width / height;
        let dw = width;
        let dh = height;
        let dx = 0;
        let dy = 0;
        if (imgAspect > targetAspect) {
          dh = height;
          dw = dh * imgAspect;
          dx = (width - dw) / 2;
        } else {
          dw = width;
          dh = dw / imgAspect;
          dy = (height - dh) / 2;
        }
        ctx.drawImage(coverThumbnailImg, dx, dy, dw, dh);
      } else {
        renderFrameToCanvas({
          ctx,
          width,
          height,
          ratio: params.ratio,
          mediaSource: frameMediaSource,
          mediaLayers: frameMediaLayers,
          clipMediaSources: frameClipSources,
          clipEnvelopeOpacities: frameClipEnvelopes,
          hiddenVisualTracks: hiddenVisualSet,
          mediaOpacity: frameMediaOpacity,
          mediaFit: params.mediaFit,
          cues: params.cues,
          currentTime: t,
          globalOffset: params.globalOffset,
          enabledTracks: params.enabledTracks,
          style: params.style,
          scrollingConfig: params.scrollingConfig,
          beatEffects: params.beatEffects ?? DEFAULT_BEAT_EFFECTS_CONFIG,
          effectClips: activeEffectClips,
          projectDuration: exportDuration,
          audioAnalysis: frameAudioAnalysis,
          audioAnalysisTime: frameAudioAnalysisTime,
          layers: params.layers,
          layerImages: params.layerImages,
          farsiFontFamily: params.farsiFontFamily,
          nastaliqFontFamily: params.nastaliqFontFamily,
          latinFontFamily: params.latinFontFamily,
          drawSafeZones: false,
          drawLayerHandles: false,
        });
      }

      const timestamp = Math.round((f * 1_000_000) / fps);
      const videoFrame = new VideoFrame(canvas, {
        timestamp,
        duration: frameDurationUs,
      });

      // Keyframe every 1.0s (every 30 frames) guarantees crisp instant scrubbing in Windows Media Player
      videoEncoder.encode(videoFrame, { keyFrame: f % fps === 0 });
      videoFrame.close();

      await pushAudioUpToSample(Math.ceil(((f + 1) / fps) * audioSampleRate));

      while (videoEncoder.encodeQueueSize >= 10) {
        if (params.signal?.aborted) {
          throw new DOMException('Export cancelled', 'AbortError');
        }
        if (encoderFailure) throw encoderFailure;
        await yieldToMain(2);
      }

      if (f % 4 === 0 || f === totalFrames - 1) {
        params.onProgress?.({
          percent: Math.min(98, Math.round(((f + 1) / totalFrames) * 98)),
          currentFrame: f + 1,
          totalFrames,
          formatLabel: targetConfig.displayLabel,
        });
        await yieldToMain(0);
      }
    }

    await pushAudioUpToSample(totalOutputSamples);

    if (params.signal?.aborted) {
      throw new DOMException('Export cancelled', 'AbortError');
    }

    await videoEncoder.flush();
    videoEncoder.close();

    if (audioEncoder) {
      await audioEncoder.flush();
      audioEncoder.close();
    }

    if (encoderFailure) throw encoderFailure;

    let buffer: ArrayBuffer;
    if (mp4Muxer) {
      mp4Muxer.finalize();
      buffer = mp4Muxer.target.buffer;
    } else if (webmMuxer) {
      webmMuxer.finalize();
      buffer = webmMuxer.target.buffer;
    } else {
      throw new Error('No muxer initialized during export.');
    }

    params.onProgress?.({
      percent: 100,
      currentFrame: totalFrames,
      totalFrames,
      formatLabel: targetConfig.displayLabel,
    });

    const blob = new Blob([buffer], { type: targetConfig.mimeType });
    return {
      blob,
      ext: targetConfig.ext,
      mimeType: targetConfig.mimeType,
      formatLabel: targetConfig.displayLabel,
      totalFrames,
      hasAudio: Boolean(audioEncoder),
    };
  } finally {
    for (const v of videoElementsToCleanup) {
      v.pause();
      v.src = '';
    }
  }
}
