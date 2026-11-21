'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FolderOpen,
  Subtitles,
  Layers,
  Sparkles,
} from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import stageLandscapeImg from '@/src/assets/images/music_studio_stage_landscape_1794862911026.jpg';
import nightPortraitImg from '@/src/assets/images/acoustic_night_portrait_1794862911151.jpg';
import {
  AspectRatio,
  EnabledTracks,
  LyricCue,
  LyricSourceType,
  LyricStyleConfig,
  LyricTrackType,
  MediaFitMode,
  PlainImportMode,
  SrtValidationWarning,
  createSampleCues,
  duplicateCue,
  exportToSrt,
  mergeTrackSrtIntoCues,
  parsePlainLyrics,
  parseTrackSrt,
  splitCueAtTime,
  stampCueSync,
  updateCueTiming,
  validateLyricCues,
} from '@/lib/lyrics-parser';
import {
  SnapGuideState,
  StackedMediaLayer,
  detectImageElementBackgroundType,
  getResolutionForRatio,
  renderFrameToCanvas,
} from '@/lib/canvas-renderer';
import {
  DEFAULT_LAYER_KEYING_CONFIG,
  LayerKeyingConfig,
} from '@/lib/image-blending';
import { createDemoTrackWavUrl, extractWaveformPeaks } from '@/lib/audio-engine';
import {
  DEFAULT_FOCUSED_SCROLLING_CONFIG,
  FocusedScrollingConfig,
} from '@/lib/scrolling-lyrics';
import {
  AudioBeatAnalysis,
  BeatEffectsConfig,
  BeatSyncTarget,
  BeatVisualEffectType,
  DEFAULT_BEAT_EFFECTS_CONFIG,
} from '@/lib/beat-effects';
import {
  CanvasLayer,
  KeyframeEasing,
  ShapeKind,
  TimerCounterFormat,
  TimerCounterMode,
  TimerCounterStyle,
  adaptLayersToRatio,
  areClipLayersInSync,
  bringLayerForward,
  clearLayerAnimation,
  createDefaultLayers,
  duplicateCanvasLayer,
  getCanvasDimensions,
  getClipLayerId,
  hasLayerAnimation,
  sendLayerBackward,
  syncVisualClipsToLayers,
} from '@/lib/canvas-layers';
import {
  AudioTimelineClip,
  TimedEffectClip,
  VisualTimelineClip,
  closeGapsAfterTrackMove,
  closeTrackGaps,
  extendFullTimelineImageClips,
  getActiveAudioClipsAtTime,
  getActiveVisualClipsAtTime,
  getAudioTrackCount,
  getVisualTrackCount,
  pasteCuesAtTime,
  pasteTimedClipsAtTime,
  removeLayerKeyframe,
  splitAudioClipAtTime,
  splitEffectClipAtTime,
  splitVisualClipAtTime,
  upsertLayerKeyframe,
} from '@/lib/timeline-engine';
import MediaBin, { MediaKind, UploadedMediaItem } from './MediaBin';
import PreviewStage from './PreviewStage';
import LyricsInspector, { EffectsSubTab, InspectorTab } from './LyricsInspector';
import ExportModal from './ExportModal';
import {
  TimelineMarker,
  TimelineSelectionItem,
  TimelineSelectionTrack,
} from './TimelineEditor';
import { IconTooltip } from './TooltipButton';

const INITIAL_STYLE: LyricStyleConfig = {
  position: 'bottom',
  verticalOffsetPct: 0,
  fontScale: 1,
  alignment: 'center',
  backdrop: 'scrim',
  primaryColor: '#FFFFFF',
  secondaryColor: '#FCD34D',
  showSafeZones: false,
  farsiFont: 'Noto Nastaliq Urdu',
  latinFont: 'Plus Jakarta Sans',
};

interface ProjectSnapshot {
  cues: LyricCue[];
  layers: CanvasLayer[];
  markers: TimelineMarker[];
  visualClips: VisualTimelineClip[];
  audioClips: AudioTimelineClip[];
  effectClips: TimedEffectClip[];
  visualTrackCount?: number;
  audioTrackCount?: number;
}

interface TimelineClipboard {
  track: TimelineSelectionTrack;
  items: unknown[];
}

const MAX_HISTORY = 40;

const INITIAL_VISUAL_CLIPS: VisualTimelineClip[] = [
  {
    id: 'vclip-initial',
    mediaId: 'sample-stage-16-9',
    name: 'Stage Haze Backdrop (16:9)',
    kind: 'image',
    url: stageLandscapeImg.src,
    startTime: 0,
    endTime: 24,
    sourceStart: 0,
    sourceDuration: 0,
    fadeIn: 0,
    fadeOut: 0,
    trackIndex: 0,
    opacity: 1,
  },
];

export default function StudioWorkspace() {
  const [ratio, setRatio] = useState<AspectRatio>('16:9');
  const [mediaFit, setMediaFit] = useState<MediaFitMode>('cover');
  const [items, setItems] = useState<UploadedMediaItem[]>(() => [
    {
      id: 'sample-stage-16-9',
      name: 'Stage Haze Backdrop (16:9)',
      kind: 'image',
      url: stageLandscapeImg.src,
      width: stageLandscapeImg.width,
      height: stageLandscapeImg.height,
      isSample: true,
    },
    {
      id: 'sample-rain-9-16',
      name: 'Night Street Portrait (9:16)',
      kind: 'image',
      url: nightPortraitImg.src,
      width: nightPortraitImg.width,
      height: nightPortraitImg.height,
      isSample: true,
    },
  ]);
  const [activeVisualId, setActiveVisualId] = useState<string | null>('sample-stage-16-9');
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);

  const [duration, setDuration] = useState<number>(24);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioBeatAnalysis | null>(null);

  const [cues, setCues] = useState<LyricCue[]>(() => createSampleCues(24));
  const [globalOffset, setGlobalOffset] = useState<number>(0);
  const [lyricSource, setLyricSource] = useState<LyricSourceType>('sample');
  const [uploadedSrtTracks, setUploadedSrtTracks] = useState<LyricTrackType[]>([]);
  const [parseWarnings, setParseWarnings] = useState<SrtValidationWarning[]>([]);

  const [enabledTracks, setEnabledTracks] = useState<EnabledTracks>({
    primary: true,
    roman: true,
    english: true,
  });
  const [style, setStyle] = useState<LyricStyleConfig>(INITIAL_STYLE);
  const [scrollingConfig, setScrollingConfig] = useState<FocusedScrollingConfig>(
    DEFAULT_FOCUSED_SCROLLING_CONFIG
  );
  const [beatEffects, setBeatEffects] = useState<BeatEffectsConfig>(
    DEFAULT_BEAT_EFFECTS_CONFIG
  );

  const [layers, setLayers] = useState<CanvasLayer[]>(() =>
    syncVisualClipsToLayers(
      createDefaultLayers('16:9'),
      INITIAL_VISUAL_CLIPS,
      '16:9',
      new Map([
        [
          stageLandscapeImg.src,
          { width: stageLandscapeImg.width, height: stageLandscapeImg.height },
        ],
      ])
    )
  );
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    'layer-scrolling-lyrics'
  );
  const [snapGuides, setSnapGuides] = useState<SnapGuideState | null>(null);

  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [syncTargetIndex, setSyncTargetIndex] = useState<number>(0);

  // Multi-clip NLE timelines (Stacked Video/Image V1..Vn, Stacked Audio A1..An, Timed FX)
  const [visualTrackCount, setVisualTrackCount] = useState<number>(1);
  const [audioTrackCount, setAudioTrackCount] = useState<number>(1);
  const [hiddenVisualTracks, setHiddenVisualTracks] = useState<number[]>([]);
  const [lockedVisualTracks, setLockedVisualTracks] = useState<number[]>([]);
  const [mutedAudioTracks, setMutedAudioTracks] = useState<number[]>([]);
  const [lockedAudioTracks, setLockedAudioTracks] = useState<number[]>([]);

  const [visualClips, setVisualClips] = useState<VisualTimelineClip[]>(() =>
    INITIAL_VISUAL_CLIPS.map((c) => ({ ...c }))
  );
  const [audioClips, setAudioClips] = useState<AudioTimelineClip[]>([]);
  const [effectClips, setEffectClips] = useState<TimedEffectClip[]>([]);
  const [selectedItems, setSelectedItems] = useState<TimelineSelectionItem[]>([]);
  const [clipboard, setClipboard] = useState<TimelineClipboard | null>(null);

  const [historyPast, setHistoryPast] = useState<ProjectSnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<ProjectSnapshot[]>([]);

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('lyrics');
  const [effectsSubTab, setEffectsSubTab] = useState<EffectsSubTab>('beat');
  const [isLeftCollapsed, setIsLeftCollapsed] = useState<boolean>(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState<boolean>(false);
  const [isPlayerFocusMode, setIsPlayerFocusMode] = useState<boolean>(false);
  const [mobilePanel, setMobilePanel] = useState<
    'preview' | 'media' | 'lyrics' | 'style' | 'effects'
  >('preview');
  const [autoRipple, setAutoRipple] = useState<boolean>(true);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenAudioRef = useRef<HTMLAudioElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const visualImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videoPoolRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioPoolRef = useRef<
    Map<number, { el: HTMLAudioElement; url: string | null; clipId: string | null }>
  >(new Map());
  const activeVideoUrlRef = useRef<string | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const activePrimaryClipIdRef = useRef<string | null>(null);
  const activeVisualIdRef = useRef<string | null>(activeVisualId);
  const primaryPlayPendingRef = useRef<boolean>(false);
  const poolPlayPendingRef = useRef<Map<number, boolean>>(new Map());
  const playbackStartedAtRef = useRef<number>(0);
  const pendingAutoKeyingRef = useRef<Map<string, LayerKeyingConfig>>(new Map());
  const resolvedFontsRef = useRef({
    latin: '"Plus Jakarta Sans", system-ui, sans-serif',
    farsi: '"Vazirmatn", "Plus Jakarta Sans", system-ui, sans-serif',
    nastaliq: '"Noto Nastaliq Urdu", "Vazirmatn", serif',
  });
  const [layerImages, setLayerImages] = useState<Map<string, HTMLImageElement>>(
    () => new Map()
  );
  const layerImagesRef = useRef<Map<string, HTMLImageElement>>(layerImages);
  const layerObjectUrlsRef = useRef<string[]>([]);

  // Refs synced for 60fps loop without tearing down RAF
  const isPlayingRef = useRef(isPlaying);
  const isLoopingRef = useRef(isLooping);
  const isMutedRef = useRef(isMuted);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const globalOffsetRef = useRef(globalOffset);
  const ratioRef = useRef(ratio);
  const mediaFitRef = useRef(mediaFit);
  const cuesRef = useRef(cues);
  const enabledTracksRef = useRef(enabledTracks);
  const styleRef = useRef(style);
  const scrollingConfigRef = useRef(scrollingConfig);
  const beatEffectsRef = useRef(beatEffects);
  const audioAnalysisRef = useRef<AudioBeatAnalysis | null>(audioAnalysis);
  const layersRef = useRef(layers);
  const selectedLayerIdRef = useRef(selectedLayerId);
  const snapGuidesRef = useRef(snapGuides);
  const markersRef = useRef(markers);
  const visualClipsRef = useRef(visualClips);
  const audioClipsRef = useRef(audioClips);
  const effectClipsRef = useRef(effectClips);
  const visualTrackCountRef = useRef(visualTrackCount);
  const audioTrackCountRef = useRef(audioTrackCount);
  const hiddenVisualTracksRef = useRef(hiddenVisualTracks);
  const mutedAudioTracksRef = useRef(mutedAudioTracks);
  const selectedItemsRef = useRef(selectedItems);
  const activeVisualKindRef = useRef<MediaKind | null>('image');
  const autoRippleRef = useRef<boolean>(autoRipple);

  useEffect(() => {
    autoRippleRef.current = autoRipple;
  }, [autoRipple]);
  useEffect(() => {
    activeVisualIdRef.current = activeVisualId;
  }, [activeVisualId]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  useEffect(() => {
    // Only sync state -> ref when paused so throttled UI ticks during playback never rewind the clock
    if (!isPlayingRef.current) {
      currentTimeRef.current = currentTime;
    }
  }, [currentTime]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  useEffect(() => {
    globalOffsetRef.current = globalOffset;
  }, [globalOffset]);
  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);
  useEffect(() => {
    mediaFitRef.current = mediaFit;
  }, [mediaFit]);
  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);
  useEffect(() => {
    enabledTracksRef.current = enabledTracks;
  }, [enabledTracks]);
  useEffect(() => {
    styleRef.current = style;
  }, [style]);
  useEffect(() => {
    scrollingConfigRef.current = scrollingConfig;
  }, [scrollingConfig]);
  useEffect(() => {
    beatEffectsRef.current = beatEffects;
  }, [beatEffects]);
  useEffect(() => {
    audioAnalysisRef.current = audioAnalysis;
  }, [audioAnalysis]);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId;
  }, [selectedLayerId]);
  useEffect(() => {
    snapGuidesRef.current = snapGuides;
  }, [snapGuides]);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);
  useEffect(() => {
    visualClipsRef.current = visualClips;
  }, [visualClips]);
  useEffect(() => {
    audioClipsRef.current = audioClips;
  }, [audioClips]);
  useEffect(() => {
    effectClipsRef.current = effectClips;
  }, [effectClips]);
  useEffect(() => {
    visualTrackCountRef.current = visualTrackCount;
  }, [visualTrackCount]);
  useEffect(() => {
    audioTrackCountRef.current = audioTrackCount;
  }, [audioTrackCount]);
  useEffect(() => {
    hiddenVisualTracksRef.current = hiddenVisualTracks;
  }, [hiddenVisualTracks]);
  useEffect(() => {
    mutedAudioTracksRef.current = mutedAudioTracks;
  }, [mutedAudioTracks]);
  useEffect(() => {
    selectedItemsRef.current = selectedItems;
  }, [selectedItems]);

  // Revoke object URLs and tear down multi-track playback pools on unmount
  useEffect(() => {
    const urls = layerObjectUrlsRef.current;
    const vPool = videoPoolRef.current;
    const aPool = audioPoolRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      vPool.forEach((v) => {
        v.pause();
        v.removeAttribute('src');
      });
      vPool.clear();
      aPool.forEach(({ el }) => {
        el.pause();
        el.removeAttribute('src');
      });
      aPool.clear();
    };
  }, []);

  const activeVisualItem = useMemo(
    () => items.find((i) => i.id === activeVisualId) ?? null,
    [items, activeVisualId]
  );
  const activeAudioItem = useMemo(
    () => items.find((i) => i.id === activeAudioId) ?? null,
    [items, activeAudioId]
  );

  useEffect(() => {
    activeVisualKindRef.current = activeVisualItem?.kind ?? null;
  }, [activeVisualItem]);

  // Build natural dimensions map for tight initial bounding boxes on V2+ independent clip layers
  const buildMediaDimensionsMap = useCallback(() => {
    const dims = new Map<string, { width: number; height: number }>();
    items.forEach((it) => {
      if (it.width && it.height) {
        dims.set(it.url, { width: it.width, height: it.height });
      }
    });
    visualImageCacheRef.current.forEach((img, url) => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        dims.set(url, { width: img.naturalWidth, height: img.naturalHeight });
      }
    });
    videoPoolRef.current.forEach((vid, url) => {
      if (vid.videoWidth > 0 && vid.videoHeight > 0) {
        dims.set(url, { width: vid.videoWidth, height: vid.videoHeight });
      }
    });
    return dims;
  }, [items]);

  // Keep every visual timeline clip 1:1 synced with its own independent CanvasLayer
  useEffect(() => {
    const dims = buildMediaDimensionsMap();
    setLayers((prev) => {
      let next = areClipLayersInSync(prev, visualClips)
        ? prev
        : syncVisualClipsToLayers(prev, visualClips, ratioRef.current, dims);
      if (pendingAutoKeyingRef.current.size > 0) {
        let applied = false;
        next = next.map((layer) => {
          const pending = pendingAutoKeyingRef.current.get(layer.id);
          if (pending) {
            pendingAutoKeyingRef.current.delete(layer.id);
            applied = true;
            return { ...layer, keying: pending };
          }
          return layer;
        });
        if (!applied && next === prev) return prev;
      }
      return next;
    });
  }, [visualClips, buildMediaDimensionsMap]);

  const validationWarnings = useMemo(
    () => validateLyricCues(cues, duration, parseWarnings),
    [cues, duration, parseWarnings]
  );

  // Undo / Redo snapshot helpers
  const cloneSnapshot = useCallback(
    (
      srcCues: LyricCue[] = cuesRef.current,
      srcLayers: CanvasLayer[] = layersRef.current,
      srcMarkers: TimelineMarker[] = markersRef.current,
      srcVisualClips: VisualTimelineClip[] = visualClipsRef.current,
      srcAudioClips: AudioTimelineClip[] = audioClipsRef.current,
      srcEffectClips: TimedEffectClip[] = effectClipsRef.current
    ): ProjectSnapshot => ({
      cues: srcCues.map((c) => ({ ...c })),
      layers: srcLayers.map((l) => ({
        ...l,
        animation: l.animation ? { ...l.animation } : undefined,
        keyframes: l.keyframes ? l.keyframes.map((k) => ({ ...k })) : undefined,
      })),
      markers: srcMarkers.map((m) => ({ ...m })),
      visualClips: srcVisualClips.map((c) => ({ ...c })),
      audioClips: srcAudioClips.map((c) => ({ ...c })),
      effectClips: srcEffectClips.map((c) => ({ ...c })),
      visualTrackCount: visualTrackCountRef.current,
      audioTrackCount: audioTrackCountRef.current,
    }),
    []
  );

  const pushHistory = useCallback((snapshot: ProjectSnapshot) => {
    setHistoryPast((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snapshot]);
    setHistoryFuture([]);
  }, []);

  const handleUndo = useCallback(() => {
    setHistoryPast((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      const currentSnap = cloneSnapshot();
      setHistoryFuture((f) => [currentSnap, ...f.slice(0, MAX_HISTORY - 1)]);
      setCues(target.cues);
      setLayers(target.layers);
      setMarkers(target.markers);
      setVisualClips(target.visualClips);
      setAudioClips(target.audioClips);
      setEffectClips(target.effectClips);
      if (target.visualTrackCount) setVisualTrackCount(target.visualTrackCount);
      if (target.audioTrackCount) setAudioTrackCount(target.audioTrackCount);
      setSelectedItems([]);
      return prev.slice(0, -1);
    });
  }, [cloneSnapshot]);

  const handleRedo = useCallback(() => {
    setHistoryFuture((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[0];
      const currentSnap = cloneSnapshot();
      setHistoryPast((p) => [...p.slice(-(MAX_HISTORY - 1)), currentSnap]);
      setCues(target.cues);
      setLayers(target.layers);
      setMarkers(target.markers);
      setVisualClips(target.visualClips);
      setAudioClips(target.audioClips);
      setEffectClips(target.effectClips);
      if (target.visualTrackCount) setVisualTrackCount(target.visualTrackCount);
      if (target.audioTrackCount) setAudioTrackCount(target.audioTrackCount);
      setSelectedItems([]);
      return prev.slice(1);
    });
  }, [cloneSnapshot]);

  // Create built-in demo backing track on mount so waveform & preview work immediately
  useEffect(() => {
    let revoked = false;
    const demoUrl = createDemoTrackWavUrl(24);
    const demoId = 'sample-ambient-track';
    queueMicrotask(() => {
      if (revoked) return;
      setItems((prev) => {
        if (prev.some((i) => i.id === demoId)) return prev;
        return [
          ...prev,
          {
            id: demoId,
            name: 'Demo Song Track (24s)',
            kind: 'audio',
            url: demoUrl,
            duration: 24,
            isSample: true,
          },
        ];
      });
      setActiveAudioId((prev) => prev ?? demoId);
      setAudioClips((prev) => {
        if (prev.length > 0) return prev;
        return [
          {
            id: 'aclip-initial',
            mediaId: demoId,
            name: 'Demo Song Track (24s)',
            url: demoUrl,
            startTime: 0,
            endTime: 24,
            sourceStart: 0,
            sourceDuration: 24,
            fadeIn: 0,
            fadeOut: 0,
            volume: 1,
          },
        ];
      });
    });

    return () => {
      revoked = true;
      URL.revokeObjectURL(demoUrl);
    };
  }, []);

  // Draw current frame helper (supports stacked multi-track visual compositing, timed FX & layer keyframes)
  const drawCanvasFrame = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const res = getResolutionForRatio(ratioRef.current);
    const previewScale = 0.5;
    const targetW = Math.round(res.width * previewScale);
    const targetH = Math.round(res.height * previewScale);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let mediaSource: CanvasImageSource | null = null;
    let mediaOpacity = 1;
    let mediaLayers: StackedMediaLayer[] | undefined = undefined;
    const hiddenVisualSet = new Set<number>(hiddenVisualTracksRef.current);
    const clipMediaSources = new Map<string, HTMLImageElement | HTMLVideoElement>();
    const clipEnvelopeOpacities = new Map<string, number>();

    const vClips = visualClipsRef.current;
    if (vClips.length > 0) {
      for (const clip of vClips) {
        let src: HTMLImageElement | HTMLVideoElement | null = null;
        if (clip.kind === 'image') {
          src =
            visualImageCacheRef.current.get(clip.url) ??
            ((clip.trackIndex ?? 0) === 0 ? loadedImageRef.current : null);
        } else {
          src =
            videoPoolRef.current.get(clip.url) ??
            ((clip.trackIndex ?? 0) === 0 ? hiddenVideoRef.current : null);
        }
        if (src) {
          clipMediaSources.set(clip.id, src);
          clipMediaSources.set(clip.url, src);
        }
        let env = 1;
        if (clip.fadeIn > 0 && t - clip.startTime < clip.fadeIn) {
          env = Math.min(env, Math.max(0, (t - clip.startTime) / clip.fadeIn));
        }
        if (clip.fadeOut > 0 && clip.endTime - t < clip.fadeOut) {
          env = Math.min(env, Math.max(0, (clip.endTime - t) / clip.fadeOut));
        }
        clipEnvelopeOpacities.set(clip.id, env);
      }

      const hits = getActiveVisualClipsAtTime(vClips, t, hiddenVisualSet);
      const stacked: StackedMediaLayer[] = [];

      for (const hit of hits) {
        const src =
          clipMediaSources.get(hit.clip.id) ?? clipMediaSources.get(hit.clip.url) ?? null;
        if (src) {
          stacked.push({
            source: src,
            opacity: hit.opacity,
            trackIndex: hit.trackIndex,
            fitMode: hit.clip.fitMode,
          });
        }
      }

      mediaLayers = stacked;
      if (stacked.length > 0) {
        mediaSource = stacked[0].source;
        mediaOpacity = stacked[0].opacity;
      } else {
        mediaSource = null;
        mediaOpacity = 0;
      }
    } else {
      mediaSource =
        activeVisualKindRef.current === 'video'
          ? hiddenVideoRef.current
          : activeVisualKindRef.current === 'image'
          ? loadedImageRef.current
          : null;
    }

    const { latin: latinFont, farsi: farsiFont, nastaliq: nastaliqFont } =
      resolvedFontsRef.current;

    renderFrameToCanvas({
      ctx,
      width: targetW,
      height: targetH,
      ratio: ratioRef.current,
      mediaSource,
      mediaLayers,
      clipMediaSources,
      clipEnvelopeOpacities,
      hiddenVisualTracks: hiddenVisualSet,
      mediaFit: mediaFitRef.current,
      mediaOpacity,
      cues: cuesRef.current,
      currentTime: t,
      projectDuration: durationRef.current,
      globalOffset: globalOffsetRef.current,
      enabledTracks: enabledTracksRef.current,
      style: styleRef.current,
      scrollingConfig: scrollingConfigRef.current,
      beatEffects: beatEffectsRef.current,
      effectClips: effectClipsRef.current,
      audioAnalysis: audioAnalysisRef.current,
      layers: layersRef.current,
      layerImages: layerImagesRef.current,
      selectedLayerId: selectedLayerIdRef.current,
      snapGuides: snapGuidesRef.current,
      farsiFontFamily: farsiFont,
      nastaliqFontFamily: nastaliqFont,
      latinFontFamily: latinFont,
      drawSafeZones: styleRef.current.showSafeZones,
      drawLayerHandles: true,
      disableFade: !isPlayingRef.current,
    });
  }, []);

  // Preload all unique image & video URLs referenced by multi-track Visual Timeline
  useEffect(() => {
    const imgCache = visualImageCacheRef.current;
    const vidPool = videoPoolRef.current;
    visualClips.forEach((clip) => {
      if (clip.kind === 'image') {
        if (imgCache.has(clip.url)) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          imgCache.set(clip.url, img);
          drawCanvasFrame(currentTimeRef.current);
        };
        img.src = clip.url;
      } else if (clip.kind === 'video' && typeof document !== 'undefined') {
        if (vidPool.has(clip.url)) return;
        const el = document.createElement('video');
        el.playsInline = true;
        el.crossOrigin = 'anonymous';
        el.muted = true;
        el.loop = true;
        el.preload = 'auto';
        el.onloadeddata = () => {
          drawCanvasFrame(currentTimeRef.current);
        };
        el.src = clip.url;
        vidPool.set(clip.url, el);
      }
    });
  }, [visualClips, drawCanvasFrame]);

  // Load visual asset whenever activeVisualItem changes
  useEffect(() => {
    if (!activeVisualItem) {
      loadedImageRef.current = null;
      drawCanvasFrame(currentTimeRef.current);
      return;
    }

    if (activeVisualItem.kind === 'image') {
      const existing = visualImageCacheRef.current.get(activeVisualItem.url);
      if (existing) {
        loadedImageRef.current = existing;
        drawCanvasFrame(currentTimeRef.current);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        loadedImageRef.current = img;
        visualImageCacheRef.current.set(activeVisualItem.url, img);
        drawCanvasFrame(currentTimeRef.current);
      };
      img.src = activeVisualItem.url;
    } else if (activeVisualItem.kind === 'video') {
      loadedImageRef.current = null;
      const vid = hiddenVideoRef.current;
      if (vid && activeVideoUrlRef.current !== activeVisualItem.url) {
        activeVideoUrlRef.current = activeVisualItem.url;
        vid.src = activeVisualItem.url;
        vid.load();
      }
    }
  }, [activeVisualItem, drawCanvasFrame]);

  // Extract waveform & sync audio source whenever activeAudioItem changes
  useEffect(() => {
    let cancelled = false;
    const audioEl = hiddenAudioRef.current;

    if (!activeAudioItem) {
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        activeAudioUrlRef.current = null;
      }
      queueMicrotask(() => {
        if (!cancelled) {
          setWaveformPeaks([]);
          setAudioAnalysis(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (
      audioEl &&
      activeAudioItem.id !== activeVisualIdRef.current &&
      activeAudioUrlRef.current !== activeAudioItem.url
    ) {
      activeAudioUrlRef.current = activeAudioItem.url;
      audioEl.src = activeAudioItem.url;
      audioEl.load();
    }

    extractWaveformPeaks(activeAudioItem.url, 120).then((res) => {
      if (cancelled || !res) return;
      setWaveformPeaks(res.peaks);
      setAudioAnalysis(res.beatAnalysis);
      if (res.duration > 1) {
        const roundedDur = Number(res.duration.toFixed(2));
        const prevDur = durationRef.current;
        if (roundedDur > prevDur + 0.05) {
          setDuration(roundedDur);
          setVisualClips((prev) =>
            extendFullTimelineImageClips(prev, prevDur, roundedDur)
          );
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeAudioItem]);

  // Re-draw canvas whenever non-playback visual props change while paused
  // (Skipped during active playback because the RAF loop drives every frame directly — prevents double-draws!)
  useEffect(() => {
    if (isPlayingRef.current) return;
    drawCanvasFrame(currentTime);
  }, [
    ratio,
    mediaFit,
    cues,
    globalOffset,
    enabledTracks,
    style,
    scrollingConfig,
    beatEffects,
    effectClips,
    visualClips,
    hiddenVisualTracks,
    audioAnalysis,
    layers,
    selectedLayerId,
    snapGuides,
    currentTime,
    drawCanvasFrame,
  ]);

  // Cache resolved computed fonts once on mount and again when Google Fonts finish loading
  useEffect(() => {
    const refreshFonts = () => {
      if (typeof window === 'undefined') return;
      const computedStyle = window.getComputedStyle(document.body);
      const latin =
        computedStyle?.fontFamily || '"Plus Jakarta Sans", system-ui, sans-serif';
      const rootStyles = window.getComputedStyle(document.documentElement);
      const farsiVar = rootStyles?.getPropertyValue('--font-farsi').trim() ?? '';
      const nastaliqVar = rootStyles?.getPropertyValue('--font-nastaliq').trim() ?? '';
      const farsi = farsiVar ? `${farsiVar}, ${latin}` : `"Vazirmatn", ${latin}`;
      const nastaliq = nastaliqVar
        ? `${nastaliqVar}, ${farsi}`
        : `"Noto Nastaliq Urdu", ${farsi}`;
      resolvedFontsRef.current = { latin, farsi, nastaliq };
      drawCanvasFrame(currentTimeRef.current);
    };

    refreshFonts();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(refreshFonts);
    }
  }, [drawCanvasFrame]);

  // Sync ALL stacked HTMLVideoElements & multi-track HTMLAudioElements simultaneously.
  // CRITICAL: Only hard-seek playing audio on explicit seek / clip change / playback start
  // (never micro-seek a playing HTMLAudioElement on minor frame jitter — prevents stuttering!).
  const syncMediaToTimelineTime = useCallback(
    (t: number, shouldPlay: boolean, forceAudioSeek = false) => {
      const primaryAud = hiddenAudioRef.current;

      // 1. Stacked Visual Video Clips (all active tracks V1..Vn simultaneously)
      const vClips = visualClipsRef.current;
      const activeVideoUrls = new Set<string>();
      if (vClips.length > 0) {
        const hiddenSet = new Set<number>(hiddenVisualTracksRef.current);
        const vHits = getActiveVisualClipsAtTime(vClips, t, hiddenSet);
        for (const vHit of vHits) {
          if (vHit.clip.kind !== 'video') continue;
          activeVideoUrls.add(vHit.clip.url);
          let vid = videoPoolRef.current.get(vHit.clip.url);
          if (!vid && typeof document !== 'undefined') {
            vid = document.createElement('video');
            vid.playsInline = true;
            vid.crossOrigin = 'anonymous';
            vid.muted = true;
            vid.loop = true;
            vid.preload = 'auto';
            vid.src = vHit.clip.url;
            videoPoolRef.current.set(vHit.clip.url, vid);
          }
          if (!vid) continue;
          vid.muted =
            isMutedRef.current ||
            audioClipsRef.current.length > 0 ||
            vHit.trackIndex > 0;
          const videoDrift = Math.abs((vid.currentTime || 0) - vHit.localMediaTime);
          if (forceAudioSeek || !shouldPlay || videoDrift > 0.45) {
            try {
              vid.currentTime = vHit.localMediaTime;
            } catch {
              // ignore seek before metadata
            }
          }
          if (shouldPlay && vid.paused) {
            vid.play().catch(() => {});
          } else if (!shouldPlay && !vid.paused) {
            vid.pause();
          }
        }
      }
      videoPoolRef.current.forEach((vid, url) => {
        if (!activeVideoUrls.has(url) && !vid.paused) {
          vid.pause();
        }
      });

      // 2. Stacked Audio Clips across A1, A2, A3... playing & mixing simultaneously
      const aClips = audioClipsRef.current;
      const mutedSet = new Set<number>(mutedAudioTracksRef.current);
      const aHits =
        aClips.length > 0 ? getActiveAudioClipsAtTime(aClips, t, mutedSet) : [];
      const activeTrackIndices = new Set<number>();

      for (const aHit of aHits) {
        activeTrackIndices.add(aHit.trackIndex);
        if (aHit.trackIndex === 0 && primaryAud) {
          const urlChanged = activeAudioUrlRef.current !== aHit.clip.url;
          const clipChanged = activePrimaryClipIdRef.current !== aHit.clip.id;
          if (urlChanged) {
            primaryPlayPendingRef.current = false;
            activeAudioUrlRef.current = aHit.clip.url;
            primaryAud.src = aHit.clip.url;
            primaryAud.load();
          }
          activePrimaryClipIdRef.current = aHit.clip.id;
          if (primaryAud.muted !== isMutedRef.current) {
            primaryAud.muted = isMutedRef.current;
          }
          const nextVol = isMutedRef.current
            ? 0
            : Math.max(0, Math.min(1, aHit.gain));
          if (Math.abs(primaryAud.volume - nextVol) > 0.005) {
            primaryAud.volume = nextVol;
          }
          const drift = Math.abs((primaryAud.currentTime || 0) - aHit.localAudioTime);
          // CRITICAL: Never seek an actively playing audio stream for drift, and never seek mid-seek
          // (prevents Chrome HTMLAudioElement buffer stalling/sticking).
          const shouldSeekPrimary =
            forceAudioSeek ||
            urlChanged ||
            clipChanged ||
            (shouldPlay &&
              primaryAud.paused &&
              !primaryPlayPendingRef.current &&
              drift > 0.05) ||
            (!shouldPlay && drift > 0.05);
          if (shouldSeekPrimary && (forceAudioSeek || !primaryAud.seeking)) {
            try {
              primaryAud.currentTime = aHit.localAudioTime;
            } catch {
              // ignore seek before metadata
            }
          }
          if (shouldPlay && primaryAud.paused && !primaryPlayPendingRef.current) {
            primaryPlayPendingRef.current = true;
            const playPromise = primaryAud.play();
            if (playPromise && typeof playPromise.finally === 'function') {
              playPromise
                .catch(() => {})
                .finally(() => {
                  primaryPlayPendingRef.current = false;
                });
            } else {
              primaryPlayPendingRef.current = false;
            }
          } else if (!shouldPlay && !primaryAud.paused) {
            primaryPlayPendingRef.current = false;
            primaryAud.pause();
          }
        } else if (aHit.trackIndex > 0 && typeof Audio !== 'undefined') {
          let entry = audioPoolRef.current.get(aHit.trackIndex);
          if (!entry) {
            const el = new Audio();
            el.crossOrigin = 'anonymous';
            el.preload = 'auto';
            entry = { el, url: null, clipId: null };
            audioPoolRef.current.set(aHit.trackIndex, entry);
          }
          const urlChanged = entry.url !== aHit.clip.url;
          const clipChanged = entry.clipId !== aHit.clip.id;
          if (urlChanged) {
            poolPlayPendingRef.current.set(aHit.trackIndex, false);
            entry.url = aHit.clip.url;
            entry.el.src = aHit.clip.url;
            entry.el.load();
          }
          entry.clipId = aHit.clip.id;
          if (entry.el.muted !== isMutedRef.current) {
            entry.el.muted = isMutedRef.current;
          }
          const nextVol = isMutedRef.current
            ? 0
            : Math.max(0, Math.min(1, aHit.gain));
          if (Math.abs(entry.el.volume - nextVol) > 0.005) {
            entry.el.volume = nextVol;
          }
          const poolPending = Boolean(poolPlayPendingRef.current.get(aHit.trackIndex));
          const drift = Math.abs((entry.el.currentTime || 0) - aHit.localAudioTime);
          const shouldSeekPool =
            forceAudioSeek ||
            urlChanged ||
            clipChanged ||
            (shouldPlay && entry.el.paused && !poolPending && drift > 0.05) ||
            (!shouldPlay && drift > 0.05);
          if (shouldSeekPool && (forceAudioSeek || !entry.el.seeking)) {
            try {
              entry.el.currentTime = aHit.localAudioTime;
            } catch {
              // ignore seek before metadata
            }
          }
          if (shouldPlay && entry.el.paused && !poolPending) {
            poolPlayPendingRef.current.set(aHit.trackIndex, true);
            const p = entry.el.play();
            if (p && typeof p.finally === 'function') {
              p.catch(() => {}).finally(() => {
                poolPlayPendingRef.current.set(aHit.trackIndex, false);
              });
            } else {
              poolPlayPendingRef.current.set(aHit.trackIndex, false);
            }
          } else if (!shouldPlay && !entry.el.paused) {
            poolPlayPendingRef.current.set(aHit.trackIndex, false);
            entry.el.pause();
          }
        }
      }

      if (!activeTrackIndices.has(0) && primaryAud) {
        activePrimaryClipIdRef.current = null;
        primaryPlayPendingRef.current = false;
        primaryAud.volume = 0;
        if (!primaryAud.paused) primaryAud.pause();
      }
      audioPoolRef.current.forEach((entry, trackIdx) => {
        if (!activeTrackIndices.has(trackIdx)) {
          entry.clipId = null;
          poolPlayPendingRef.current.set(trackIdx, false);
          entry.el.volume = 0;
          if (!entry.el.paused) entry.el.pause();
        }
      });
    },
    []
  );

  // Main animation & audio-clock-synced playback loop (active only during playback)
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTs = performance.now();
    let lastUiSyncTs = lastTs;
    playbackStartedAtRef.current = lastTs;

    const loop = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      let nextTime = currentTimeRef.current + dt;
      const aud = hiddenAudioRef.current;
      const mutedSet = new Set<number>(mutedAudioTracksRef.current);
      const isWarmingUp = now - playbackStartedAtRef.current < 160;
      let lockedToAudioClock = false;

      // 1. Lock playback clock directly to the active playing A1 HTMLAudioElement for stutter-free audio!
      if (
        aud &&
        !aud.paused &&
        !aud.seeking &&
        aud.readyState >= 2 &&
        Number.isFinite(aud.currentTime) &&
        !mutedSet.has(0)
      ) {
        const currentA1 = audioClipsRef.current.find(
          (c) =>
            (c.trackIndex ?? 0) === 0 &&
            (c.id === activePrimaryClipIdRef.current ||
              (currentTimeRef.current >= c.startTime - 0.05 &&
                currentTimeRef.current < c.endTime + 0.05))
        );
        if (currentA1 && activeAudioUrlRef.current === currentA1.url) {
          const fromAudio =
            currentA1.startTime + (aud.currentTime - currentA1.sourceStart);
          if (
            Number.isFinite(fromAudio) &&
            fromAudio >= currentA1.startTime - 0.05 &&
            fromAudio <= currentA1.endTime + 0.15 &&
            !(isWarmingUp && fromAudio < currentTimeRef.current - 0.12)
          ) {
            nextTime = Math.max(
              currentA1.startTime,
              Math.min(currentA1.endTime, fromAudio)
            );
            lockedToAudioClock = true;
          }
        }
      }

      // 2. Fallback: if A1 is silent/empty, lock to the first active playing A2/A3 pool track
      if (!lockedToAudioClock) {
        for (const [trackIdx, entry] of audioPoolRef.current.entries()) {
          if (
            mutedSet.has(trackIdx) ||
            entry.el.paused ||
            entry.el.seeking ||
            entry.el.readyState < 2 ||
            !Number.isFinite(entry.el.currentTime)
          ) {
            continue;
          }
          const clip = audioClipsRef.current.find(
            (c) =>
              (c.trackIndex ?? 0) === trackIdx &&
              (c.id === entry.clipId ||
                (currentTimeRef.current >= c.startTime - 0.05 &&
                  currentTimeRef.current < c.endTime + 0.05))
          );
          if (clip && entry.url === clip.url) {
            const fromAudio =
              clip.startTime + (entry.el.currentTime - clip.sourceStart);
            if (
              Number.isFinite(fromAudio) &&
              fromAudio >= clip.startTime - 0.05 &&
              fromAudio <= clip.endTime + 0.15 &&
              !(isWarmingUp && fromAudio < currentTimeRef.current - 0.12)
            ) {
              nextTime = Math.max(clip.startTime, Math.min(clip.endTime, fromAudio));
              break;
            }
          }
        }
      }

      let wrapped = false;
      if (nextTime >= durationRef.current) {
        if (isLoopingRef.current) {
          nextTime = 0;
          wrapped = true;
        } else {
          nextTime = durationRef.current;
          isPlayingRef.current = false;
          setIsPlaying(false);
          syncMediaToTimelineTime(nextTime, false, true);
          currentTimeRef.current = nextTime;
          setCurrentTime(nextTime);
          drawCanvasFrame(nextTime);
          return;
        }
      }

      syncMediaToTimelineTime(nextTime, true, wrapped);
      currentTimeRef.current = nextTime;
      drawCanvasFrame(nextTime);

      // Throttle React state updates to ~12Hz so timeline & playhead stay crisp without bogging down audio decoding
      if (wrapped || now - lastUiSyncTs >= 85) {
        lastUiSyncTs = now;
        setCurrentTime(nextTime);
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, drawCanvasFrame, syncMediaToTimelineTime]);

  const handleTogglePlay = useCallback(() => {
    const next = !isPlayingRef.current;
    isPlayingRef.current = next;
    if (next && currentTimeRef.current >= durationRef.current - 0.05) {
      currentTimeRef.current = 0;
      setCurrentTime(0);
    }
    if (!next) {
      // Flush exact playhead position to UI immediately on pause
      setCurrentTime(currentTimeRef.current);
    }
    setIsPlaying(next);
    // CRITICAL: Keep side effects OUTSIDE setIsPlaying updater so React StrictMode never double-seeks audio!
    syncMediaToTimelineTime(currentTimeRef.current, next, true);
  }, [syncMediaToTimelineTime]);

  const handleSeek = useCallback(
    (time: number, cueId?: string) => {
      const clamped = Math.max(0, Math.min(durationRef.current, time));
      currentTimeRef.current = clamped;
      setCurrentTime(clamped);
      if (cueId) {
        setSelectedCueId(cueId);
        const idx = cuesRef.current.findIndex((c) => c.id === cueId);
        if (idx >= 0) setSyncTargetIndex(idx);
      }
      syncMediaToTimelineTime(clamped, isPlayingRef.current, true);
      drawCanvasFrame(clamped);
    },
    [drawCanvasFrame, syncMediaToTimelineTime]
  );

  const handleRestart = useCallback(() => {
    handleSeek(0);
  }, [handleSeek]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      if (hiddenAudioRef.current) hiddenAudioRef.current.muted = next;
      audioPoolRef.current.forEach(({ el }) => {
        el.muted = next;
      });
      videoPoolRef.current.forEach((v) => {
        v.muted = next || audioClipsRef.current.length > 0;
      });
      if (hiddenVideoRef.current) {
        hiddenVideoRef.current.muted = next || audioClipsRef.current.length > 0;
      }
      return next;
    });
  }, []);

  // Manual Tap-to-Sync Cue Timing
  const handleStampNextLine = useCallback(() => {
    const snap = cloneSnapshot();
    pushHistory(snap);
    setCues((prev) => {
      const { cues: updated, nextIndex } = stampCueSync(
        prev,
        syncTargetIndex,
        currentTimeRef.current + globalOffsetRef.current,
        durationRef.current
      );
      setSyncTargetIndex(nextIndex);
      if (updated[nextIndex]) setSelectedCueId(updated[nextIndex].id);
      return updated;
    });
  }, [cloneSnapshot, pushHistory, syncTargetIndex]);

  const handleStampSpecificCue = useCallback(
    (index: number) => {
      pushHistory(cloneSnapshot());
      setCues((prev) => {
        const { cues: updated, nextIndex } = stampCueSync(
          prev,
          index,
          currentTimeRef.current + globalOffsetRef.current,
          durationRef.current
        );
        setSyncTargetIndex(nextIndex);
        return updated;
      });
    },
    [cloneSnapshot, pushHistory]
  );

  // Multi-select Copy / Cut / Paste / Delete / Split NLE handlers
  const handleSelectAllOnTrack = useCallback((track: TimelineSelectionTrack) => {
    if (track === 'visual') {
      setSelectedItems(
        visualClipsRef.current.map((c) => ({ track: 'visual', id: c.id }))
      );
    } else if (track === 'audio') {
      setSelectedItems(
        audioClipsRef.current.map((c) => ({ track: 'audio', id: c.id }))
      );
    } else if (track === 'fx') {
      setSelectedItems(
        effectClipsRef.current.map((c) => ({ track: 'fx', id: c.id }))
      );
    } else {
      setSelectedItems(cuesRef.current.map((c) => ({ track: 'cue', id: c.id })));
      if (cuesRef.current[0]) setSelectedCueId(cuesRef.current[0].id);
    }
  }, []);

  const handleCopySelected = useCallback(() => {
    const sel = selectedItemsRef.current;
    if (sel.length === 0) return;
    const primaryTrack = sel[0].track;
    const ids = new Set(sel.filter((s) => s.track === primaryTrack).map((s) => s.id));
    if (primaryTrack === 'cue') {
      const itemsToCopy = cuesRef.current
        .filter((c) => ids.has(c.id))
        .map((c) => ({ ...c }));
      if (itemsToCopy.length > 0) setClipboard({ track: 'cue', items: itemsToCopy });
    } else if (primaryTrack === 'visual') {
      const itemsToCopy = visualClipsRef.current
        .filter((c) => ids.has(c.id))
        .map((c) => ({ ...c }));
      if (itemsToCopy.length > 0) setClipboard({ track: 'visual', items: itemsToCopy });
    } else if (primaryTrack === 'audio') {
      const itemsToCopy = audioClipsRef.current
        .filter((c) => ids.has(c.id))
        .map((c) => ({ ...c }));
      if (itemsToCopy.length > 0) setClipboard({ track: 'audio', items: itemsToCopy });
    } else if (primaryTrack === 'fx') {
      const itemsToCopy = effectClipsRef.current
        .filter((c) => ids.has(c.id))
        .map((c) => ({ ...c }));
      if (itemsToCopy.length > 0) setClipboard({ track: 'fx', items: itemsToCopy });
    }
  }, []);

  // Unified Layer & Timeline Clip Selection (timeline clip <-> canvas <-> right inspector)
  const handleSelectLayer = useCallback((id: string | null) => {
    setSelectedLayerId(id);
    if (!id) {
      setSelectedItems((prev) => prev.filter((s) => s.track !== 'visual'));
      return;
    }
    const target = layersRef.current.find((l) => l.id === id);
    if (target?.type === 'media-clip' && target.clipId) {
      setSelectedItems([{ track: 'visual', id: target.clipId }]);
    } else {
      setSelectedItems((prev) => prev.filter((s) => s.track !== 'visual'));
    }
  }, []);

  const handleSetSelectedItems = useCallback((next: TimelineSelectionItem[]) => {
    setSelectedItems(next);
    const firstVisual = next.find((s) => s.track === 'visual');
    if (firstVisual) {
      setSelectedLayerId(getClipLayerId(firstVisual.id));
    }
  }, []);

  const handleClearLayerAnimation = useCallback(
    (id: string) => {
      const target = layersRef.current.find((l) => l.id === id);
      if (!target || !hasLayerAnimation(target)) return;
      pushHistory(cloneSnapshot());
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? clearLayerAnimation(l) : l))
      );
    },
    [cloneSnapshot, pushHistory]
  );

  const handleDeleteLayer = useCallback(
    (id: string) => {
      const target = layersRef.current.find((l) => l.id === id);
      if (!target) return;
      pushHistory(cloneSnapshot());

      const isCoreLyric =
        target.type === 'scrolling-lyrics' ||
        target.type === 'lyric-farsi' ||
        target.type === 'lyric-romanized' ||
        target.type === 'lyric-english';

      if (isCoreLyric) {
        setLayers((prev) =>
          prev.map((l) =>
            l.id === id
              ? hasLayerAnimation(l)
                ? clearLayerAnimation(l)
                : { ...l, visible: false }
              : l
          )
        );
        return;
      }

      if (target.type === 'media-clip' && target.clipId) {
        const clipId = target.clipId;
        const removedTrack = target.trackIndex ?? 0;
        setVisualClips((prev) => {
          const filtered = prev.filter((c) => c.id !== clipId);
          return autoRippleRef.current
            ? closeTrackGaps(filtered, removedTrack)
            : filtered;
        });
        setSelectedItems((prev) =>
          prev.filter((s) => !(s.track === 'visual' && s.id === clipId))
        );
      }

      setLayers((prev) => prev.filter((l) => l.id !== id));
      if (selectedLayerIdRef.current === id) {
        setSelectedLayerId(null);
      }
    },
    [cloneSnapshot, pushHistory]
  );

  const handleDuplicateLayer = useCallback(
    (id: string) => {
      const target = layersRef.current.find((l) => l.id === id);
      if (!target) return;
      pushHistory(cloneSnapshot());

      if (target.type === 'media-clip' && target.clipId) {
        const srcClip = visualClipsRef.current.find((c) => c.id === target.clipId);
        if (srcClip) {
          const newClipId = `vclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          const nextTrackIdx = Math.max(
            (srcClip.trackIndex ?? 0) + 1,
            visualTrackCountRef.current
          );
          const clonedClip: VisualTimelineClip = {
            ...srcClip,
            id: newClipId,
            name: `${srcClip.name} Copy`,
            trackIndex: nextTrackIdx,
            fitMode: srcClip.fitMode ?? 'contain',
          };
          const clonedLayer: CanvasLayer = {
            ...target,
            id: getClipLayerId(newClipId),
            clipId: newClipId,
            name: clonedClip.name,
            trackIndex: nextTrackIdx,
            x: target.x + 24,
            y: target.y + 24,
            animation: target.animation ? { ...target.animation } : undefined,
            keyframes: target.keyframes
              ? target.keyframes.map((k) => ({ ...k }))
              : undefined,
          };
          setVisualTrackCount((cnt) => Math.max(cnt, nextTrackIdx + 1));
          setVisualClips((prev) => [...prev, clonedClip]);
          setLayers((prev) => [...prev, clonedLayer]);
          setSelectedItems([{ track: 'visual', id: newClipId }]);
          setSelectedLayerId(clonedLayer.id);
          return;
        }
      }

      const { layers: next, newLayerId } = duplicateCanvasLayer(
        layersRef.current,
        id
      );
      setLayers(next);
      if (newLayerId) setSelectedLayerId(newLayerId);
    },
    [cloneSnapshot, pushHistory]
  );

  const handleDeleteSelected = useCallback(() => {
    const sel = selectedItemsRef.current;
    if (sel.length === 0) {
      if (selectedCueId) {
        pushHistory(cloneSnapshot());
        setCues((prev) => prev.filter((c) => c.id !== selectedCueId));
        setSelectedCueId(null);
      } else if (selectedLayerIdRef.current) {
        handleDeleteLayer(selectedLayerIdRef.current);
      }
      return;
    }
    pushHistory(cloneSnapshot());
    const vIds = new Set(sel.filter((s) => s.track === 'visual').map((s) => s.id));
    const aIds = new Set(sel.filter((s) => s.track === 'audio').map((s) => s.id));
    const fxIds = new Set(sel.filter((s) => s.track === 'fx').map((s) => s.id));
    const cIds = new Set(sel.filter((s) => s.track === 'cue').map((s) => s.id));

    if (vIds.size > 0) {
      const removedLayerIds = new Set(Array.from(vIds).map((cid) => getClipLayerId(cid)));
      const affectedVTracks = new Set<number>(
        visualClipsRef.current
          .filter((c) => vIds.has(c.id))
          .map((c) => c.trackIndex ?? 0)
      );
      setVisualClips((prev) => {
        let next = prev.filter((c) => !vIds.has(c.id));
        if (autoRippleRef.current) {
          affectedVTracks.forEach((tIdx) => {
            next = closeTrackGaps(next, tIdx);
          });
        }
        return next;
      });
      setLayers((prev) => prev.filter((l) => !removedLayerIds.has(l.id)));
      if (selectedLayerIdRef.current && removedLayerIds.has(selectedLayerIdRef.current)) {
        setSelectedLayerId(null);
      }
    }
    if (aIds.size > 0) {
      const affectedATracks = new Set<number>(
        audioClipsRef.current
          .filter((c) => aIds.has(c.id))
          .map((c) => c.trackIndex ?? 0)
      );
      setAudioClips((prev) => {
        let next = prev.filter((c) => !aIds.has(c.id));
        if (autoRippleRef.current) {
          affectedATracks.forEach((tIdx) => {
            next = closeTrackGaps(next, tIdx);
          });
        }
        return next;
      });
    }
    if (fxIds.size > 0) setEffectClips((prev) => prev.filter((c) => !fxIds.has(c.id)));
    if (cIds.size > 0) {
      setCues((prev) => prev.filter((c) => !cIds.has(c.id)));
      if (selectedCueId && cIds.has(selectedCueId)) setSelectedCueId(null);
    }
    setSelectedItems([]);
  }, [cloneSnapshot, handleDeleteLayer, pushHistory, selectedCueId]);

  const handleCutSelected = useCallback(() => {
    handleCopySelected();
    handleDeleteSelected();
  }, [handleCopySelected, handleDeleteSelected]);

  const handlePasteAtPlayhead = useCallback(() => {
    if (!clipboard || clipboard.items.length === 0) return;
    const t = currentTimeRef.current;
    pushHistory(cloneSnapshot());

    if (clipboard.track === 'cue') {
      const prevIds = new Set(cuesRef.current.map((c) => c.id));
      const nextCues = pasteCuesAtTime(
        cuesRef.current,
        clipboard.items as LyricCue[],
        t + globalOffsetRef.current
      );
      const newIds = nextCues.filter((c) => !prevIds.has(c.id)).map((c) => c.id);
      const maxEnd = nextCues.reduce((m, c) => Math.max(m, c.endTime), durationRef.current);
      if (maxEnd > durationRef.current) setDuration(Number(maxEnd.toFixed(2)));
      setCues(nextCues);
      setSelectedItems(newIds.map((id) => ({ track: 'cue', id })));
      if (newIds[0]) setSelectedCueId(newIds[0]);
    } else if (clipboard.track === 'visual') {
      const prevIds = new Set(visualClipsRef.current.map((c) => c.id));
      const nextClips = pasteTimedClipsAtTime(
        visualClipsRef.current,
        clipboard.items as VisualTimelineClip[],
        t,
        'vclip'
      );
      const newIds = nextClips.filter((c) => !prevIds.has(c.id)).map((c) => c.id);
      const maxEnd = nextClips.reduce((m, c) => Math.max(m, c.endTime), durationRef.current);
      if (maxEnd > durationRef.current) setDuration(Number(maxEnd.toFixed(2)));
      setVisualClips(nextClips);
      setSelectedItems(newIds.map((id) => ({ track: 'visual', id })));
    } else if (clipboard.track === 'audio') {
      const prevIds = new Set(audioClipsRef.current.map((c) => c.id));
      const nextClips = pasteTimedClipsAtTime(
        audioClipsRef.current,
        clipboard.items as AudioTimelineClip[],
        t,
        'aclip'
      );
      const newIds = nextClips.filter((c) => !prevIds.has(c.id)).map((c) => c.id);
      const maxEnd = nextClips.reduce((m, c) => Math.max(m, c.endTime), durationRef.current);
      if (maxEnd > durationRef.current) setDuration(Number(maxEnd.toFixed(2)));
      setAudioClips(nextClips);
      setSelectedItems(newIds.map((id) => ({ track: 'audio', id })));
    } else if (clipboard.track === 'fx') {
      const prevIds = new Set(effectClipsRef.current.map((c) => c.id));
      const nextClips = pasteTimedClipsAtTime(
        effectClipsRef.current,
        clipboard.items as TimedEffectClip[],
        t,
        'fxclip'
      );
      const newIds = nextClips.filter((c) => !prevIds.has(c.id)).map((c) => c.id);
      const maxEnd = nextClips.reduce((m, c) => Math.max(m, c.endTime), durationRef.current);
      if (maxEnd > durationRef.current) setDuration(Number(maxEnd.toFixed(2)));
      setEffectClips(nextClips);
      setSelectedItems(newIds.map((id) => ({ track: 'fx', id })));
    }
  }, [clipboard, cloneSnapshot, pushHistory]);

  const handleSplitAtPlayhead = useCallback(() => {
    const t = currentTimeRef.current;
    const sel = selectedItemsRef.current;

    // 1. Prefer splitting selected item(s) straddling playhead
    const selVisual = sel.find((s) => s.track === 'visual');
    if (selVisual) {
      const target = visualClipsRef.current.find(
        (c) => c.id === selVisual.id && t > c.startTime + 0.12 && t < c.endTime - 0.12
      );
      if (target) {
        pushHistory(cloneSnapshot());
        setVisualClips((prev) => splitVisualClipAtTime(prev, target.id, t));
        return;
      }
    }

    const selAudio = sel.find((s) => s.track === 'audio');
    if (selAudio) {
      const target = audioClipsRef.current.find(
        (c) => c.id === selAudio.id && t > c.startTime + 0.12 && t < c.endTime - 0.12
      );
      if (target) {
        pushHistory(cloneSnapshot());
        setAudioClips((prev) => splitAudioClipAtTime(prev, target.id, t));
        return;
      }
    }

    const selFx = sel.find((s) => s.track === 'fx');
    if (selFx) {
      const target = effectClipsRef.current.find(
        (c) => c.id === selFx.id && t > c.startTime + 0.12 && t < c.endTime - 0.12
      );
      if (target) {
        pushHistory(cloneSnapshot());
        setEffectClips((prev) => splitEffectClipAtTime(prev, target.id, t));
        return;
      }
    }

    const selCue = sel.find((s) => s.track === 'cue') ?? (selectedCueId ? { track: 'cue' as const, id: selectedCueId } : null);
    if (selCue) {
      const lyricTime = t + globalOffsetRef.current;
      const target = cuesRef.current.find(
        (c) => c.id === selCue.id && lyricTime > c.startTime + 0.15 && lyricTime < c.endTime - 0.15
      );
      if (target) {
        pushHistory(cloneSnapshot());
        setCues((prev) => splitCueAtTime(prev, target.id, lyricTime));
        return;
      }
    }

    // 2. Fallback: split whatever clip/cue is directly under the playhead
    const vUnder = visualClipsRef.current.find(
      (c) => t > c.startTime + 0.12 && t < c.endTime - 0.12
    );
    const aUnder = audioClipsRef.current.find(
      (c) => t > c.startTime + 0.12 && t < c.endTime - 0.12
    );
    const fxUnder = effectClipsRef.current.find(
      (c) => t > c.startTime + 0.12 && t < c.endTime - 0.12
    );
    const cueUnder = cuesRef.current.find(
      (c) =>
        t + globalOffsetRef.current > c.startTime + 0.15 &&
        t + globalOffsetRef.current < c.endTime - 0.15
    );

    if (aUnder) {
      pushHistory(cloneSnapshot());
      setAudioClips((prev) => splitAudioClipAtTime(prev, aUnder.id, t));
    } else if (vUnder) {
      pushHistory(cloneSnapshot());
      setVisualClips((prev) => splitVisualClipAtTime(prev, vUnder.id, t));
    } else if (fxUnder) {
      pushHistory(cloneSnapshot());
      setEffectClips((prev) => splitEffectClipAtTime(prev, fxUnder.id, t));
    } else if (cueUnder) {
      pushHistory(cloneSnapshot());
      setCues((prev) =>
        splitCueAtTime(prev, cueUnder.id, t + globalOffsetRef.current)
      );
    }
  }, [cloneSnapshot, pushHistory, selectedCueId]);

  // Keyboard shortcuts: Space, S, M, Ctrl/Cmd+Z/Y, Ctrl/Cmd+C/X/V, Delete, Escape (exit focus mode)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Escape' && isPlayerFocusMode) {
        e.preventDefault();
        setIsPlayerFocusMode(false);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (selectedItemsRef.current.length > 0) {
          e.preventDefault();
          handleCopySelected();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') {
        if (selectedItemsRef.current.length > 0) {
          e.preventDefault();
          handleCutSelected();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        if (clipboard && clipboard.items.length > 0) {
          e.preventDefault();
          handlePasteAtPlayhead();
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleStampNextLine();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        pushHistory(cloneSnapshot());
        setMarkers((prev) => [
          ...prev,
          {
            id: `marker-${Date.now()}`,
            time: Number(currentTimeRef.current.toFixed(2)),
            label: `M${prev.length + 1}`,
          },
        ]);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (
          selectedItemsRef.current.length > 0 ||
          selectedCueId ||
          selectedLayerIdRef.current
        ) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    clipboard,
    cloneSnapshot,
    handleCopySelected,
    handleCutSelected,
    handleDeleteSelected,
    handlePasteAtPlayhead,
    handleRedo,
    handleStampNextLine,
    handleTogglePlay,
    handleUndo,
    isPlayerFocusMode,
    pushHistory,
    selectedCueId,
  ]);

  // Upload Media Files (Videos, Images, Audio — supports multi-file stacked layers V1/V2/V3 & A1/A2/A3)
  const handleUploadFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      let nextVisualTrack =
        visualClipsRef.current.length <= 1 &&
        visualClipsRef.current[0]?.id === 'vclip-initial'
          ? 0
          : Math.max(
              visualTrackCountRef.current,
              getVisualTrackCount(visualClipsRef.current)
            );
      let nextAudioTrack =
        audioClipsRef.current.length <= 1 &&
        audioClipsRef.current[0]?.id === 'aclip-initial'
          ? 0
          : Math.max(
              audioTrackCountRef.current,
              getAudioTrackCount(audioClipsRef.current)
            );

      files.forEach((file) => {
        const mime = file.type.toLowerCase();
        let kind: MediaKind | null = null;
        if (mime.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) {
          kind = 'video';
        } else if (
          mime.startsWith('image/') ||
          /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
        ) {
          kind = 'image';
        } else if (
          mime.startsWith('audio/') ||
          /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)
        ) {
          kind = 'audio';
        }
        if (!kind) return;

        const url = URL.createObjectURL(file);
        const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const newItem: UploadedMediaItem = {
          id,
          name: file.name,
          kind,
          url,
          sizeBytes: file.size,
        };

        if (kind === 'image') {
          const assignedTrack = nextVisualTrack;
          nextVisualTrack += 1;
          const newClipId = `vclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          const img = new Image();
          img.onload = () => {
            visualImageCacheRef.current.set(url, img);
            setItems((prev) =>
              prev.map((it) =>
                it.id === id
                  ? { ...it, width: img.naturalWidth, height: img.naturalHeight }
                  : it
              )
            );
            // Auto-detect & cleanly key Green Screen, Black BG, Checkerboard, or Blue Screen on overlay tracks (V2+)
            if (assignedTrack > 0) {
              const detected = detectImageElementBackgroundType(img);
              if (
                detected === 'chroma-green' ||
                detected === 'chroma-blue' ||
                detected === 'remove-checkerboard' ||
                detected === 'remove-black'
              ) {
                const targetLayerId = getClipLayerId(newClipId);
                const autoKeying: LayerKeyingConfig = {
                  ...DEFAULT_LAYER_KEYING_CONFIG,
                  mode: detected,
                  tolerance:
                    detected === 'remove-black'
                      ? 28
                      : detected === 'remove-checkerboard'
                      ? 32
                      : 42,
                  softness: 28,
                  spillSuppress:
                    detected === 'chroma-green' || detected === 'chroma-blue' ? 75 : 40,
                  edgeFade: 4,
                };
                pendingAutoKeyingRef.current.set(targetLayerId, autoKeying);
                setLayers((prev) => {
                  const found = prev.some((l) => l.id === targetLayerId);
                  if (!found) return prev;
                  pendingAutoKeyingRef.current.delete(targetLayerId);
                  return prev.map((l) =>
                    l.id === targetLayerId ? { ...l, keying: autoKeying } : l
                  );
                });
              }
            }
            drawCanvasFrame(currentTimeRef.current);
          };
          img.src = url;
          setItems((prev) => [newItem, ...prev]);
          setActiveVisualId(id);
          setVisualTrackCount((cnt) => Math.max(cnt, assignedTrack + 1));
          setVisualClips((prev) => {
            if (assignedTrack === 0 && prev.length <= 1 && prev[0]?.id === 'vclip-initial') {
              return [
                {
                  id: newClipId,
                  mediaId: id,
                  name: file.name,
                  kind: 'image',
                  url,
                  startTime: 0,
                  endTime: durationRef.current,
                  sourceStart: 0,
                  sourceDuration: 0,
                  fadeIn: 0,
                  fadeOut: 0,
                  trackIndex: 0,
                  opacity: 1,
                },
              ];
            }
            // Imported images cover the ENTIRE timeline by default (users can trim/move anytime)
            const fullDur = Number(Math.max(4, durationRef.current).toFixed(2));
            return [
              ...prev,
              {
                id: newClipId,
                mediaId: id,
                name: file.name,
                kind: 'image',
                url,
                startTime: 0,
                endTime: fullDur,
                sourceStart: 0,
                sourceDuration: 0,
                fadeIn: 0,
                fadeOut: 0,
                trackIndex: assignedTrack,
                opacity: 1,
                fitMode: assignedTrack > 0 ? 'contain' : undefined,
              },
            ];
          });
        } else if (kind === 'video') {
          const assignedTrack = nextVisualTrack;
          nextVisualTrack += 1;
          const vid = document.createElement('video');
          vid.preload = 'metadata';
          vid.onloadedmetadata = () => {
            const vidDuration = Number.isFinite(vid.duration) ? vid.duration : 12;
            const rounded = Number(vidDuration.toFixed(2));
            setItems((prev) =>
              prev.map((it) =>
                it.id === id
                  ? {
                      ...it,
                      duration: rounded,
                      width: vid.videoWidth,
                      height: vid.videoHeight,
                    }
                  : it
              )
            );
            setVisualClips((prev) => {
              const existing = prev.find((c) => c.mediaId === id);
              if (existing) {
                const updatedEnd = Number((existing.startTime + rounded).toFixed(2));
                if (updatedEnd > durationRef.current) setDuration(updatedEnd);
                return prev.map((c) =>
                  c.mediaId === id
                    ? { ...c, endTime: updatedEnd, sourceDuration: rounded }
                    : c
                );
              }
              return prev;
            });
            setDuration((prev) => Math.max(prev, rounded));
          };
          vid.src = url;
          setItems((prev) => [newItem, ...prev]);
          setActiveVisualId(id);
          if (assignedTrack === 0) setActiveAudioId(id);
          setVisualTrackCount((cnt) => Math.max(cnt, assignedTrack + 1));
          setVisualClips((prev) => {
            if (assignedTrack === 0 && prev.length <= 1 && prev[0]?.id === 'vclip-initial') {
              return [
                {
                  id: `vclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  mediaId: id,
                  name: file.name,
                  kind: 'video',
                  url,
                  startTime: 0,
                  endTime: durationRef.current,
                  sourceStart: 0,
                  sourceDuration: durationRef.current,
                  fadeIn: 0,
                  fadeOut: 0,
                  trackIndex: 0,
                  opacity: 1,
                },
              ];
            }
            const startT = Number(
              Math.max(0, Math.min(durationRef.current - 1, currentTimeRef.current)).toFixed(2)
            );
            const clipEnd = Number((startT + 10).toFixed(2));
            if (clipEnd > durationRef.current) setDuration(clipEnd);
            return [
              ...prev,
              {
                id: `vclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                mediaId: id,
                name: file.name,
                kind: 'video',
                url,
                startTime: startT,
                endTime: clipEnd,
                sourceStart: 0,
                sourceDuration: 10,
                fadeIn: 0,
                fadeOut: 0,
                trackIndex: assignedTrack,
                opacity: 1,
                fitMode: assignedTrack > 0 ? 'contain' : undefined,
              },
            ];
          });
        } else if (kind === 'audio') {
          const assignedAudioTrack = nextAudioTrack;
          nextAudioTrack += 1;
          const aud = new Audio();
          aud.preload = 'metadata';
          aud.onloadedmetadata = () => {
            const audDuration = Number.isFinite(aud.duration) ? aud.duration : 24;
            const rounded = Number(audDuration.toFixed(2));
            setItems((prev) =>
              prev.map((it) => (it.id === id ? { ...it, duration: rounded } : it))
            );
            const prevDur = durationRef.current;
            const nextDur =
              assignedAudioTrack === 0 ? rounded : Math.max(prevDur, rounded);
            setDuration(nextDur);
            if (nextDur > prevDur + 0.05) {
              setVisualClips((prev) =>
                extendFullTimelineImageClips(prev, prevDur, nextDur)
              );
            }
            setAudioTrackCount((cnt) => Math.max(cnt, assignedAudioTrack + 1));
            setAudioClips((prev) => {
              if (
                assignedAudioTrack === 0 &&
                prev.length <= 1 &&
                prev[0]?.id === 'aclip-initial'
              ) {
                return [
                  {
                    id: `aclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    mediaId: id,
                    name: file.name,
                    url,
                    startTime: 0,
                    endTime: rounded,
                    sourceStart: 0,
                    sourceDuration: rounded,
                    fadeIn: 0,
                    fadeOut: 0,
                    volume: 1,
                    trackIndex: 0,
                  },
                ];
              }
              const startT = assignedAudioTrack === 0 ? 0 : Number(currentTimeRef.current.toFixed(2));
              const endT = Number((startT + rounded).toFixed(2));
              if (endT > durationRef.current) setDuration(endT);
              return [
                ...prev,
                {
                  id: `aclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  mediaId: id,
                  name: file.name,
                  url,
                  startTime: startT,
                  endTime: endT,
                  sourceStart: 0,
                  sourceDuration: rounded,
                  fadeIn: 0,
                  fadeOut: 0,
                  volume: 1,
                  trackIndex: assignedAudioTrack,
                },
              ];
            });
          };
          aud.src = url;
          setItems((prev) => [newItem, ...prev]);
          if (assignedAudioTrack === 0) setActiveAudioId(id);
        }
      });
    },
    [drawCanvasFrame]
  );

  const handleRemoveItem = useCallback(
    (id: string) => {
      setItems((prev) => {
        const target = prev.find((i) => i.id === id);
        if (target && !target.isSample) {
          URL.revokeObjectURL(target.url);
        }
        return prev.filter((i) => i.id !== id);
      });
      setVisualClips((prev) => prev.filter((c) => c.mediaId !== id));
      setAudioClips((prev) => prev.filter((c) => c.mediaId !== id));
      if (activeVisualId === id) setActiveVisualId(null);
      if (activeAudioId === id) setActiveAudioId(null);
    },
    [activeAudioId, activeVisualId]
  );

  const handleSelectVisual = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      if (!target || (target.kind !== 'image' && target.kind !== 'video')) return;
      setActiveVisualId(id);
      const nextDur =
        target.kind === 'video' && target.duration
          ? Number(target.duration.toFixed(2))
          : durationRef.current;
      if (target.kind === 'video' && target.duration) {
        setDuration((prev) => Math.max(prev, nextDur));
      }
      pushHistory(cloneSnapshot());
      setVisualClips((prev) => {
        if (prev.length <= 1) {
          return [
            {
              id: prev[0]?.id ?? `vclip-${Date.now()}`,
              mediaId: target.id,
              name: target.name,
              kind: target.kind as 'image' | 'video',
              url: target.url,
              startTime: 0,
              endTime: nextDur,
              sourceStart: 0,
              sourceDuration: target.kind === 'video' ? target.duration ?? nextDur : 0,
              fadeIn: prev[0]?.fadeIn ?? 0,
              fadeOut: prev[0]?.fadeOut ?? 0,
            },
          ];
        }
        // Replace currently selected visual clip if one is selected, else append
        const selVis = selectedItemsRef.current.find((s) => s.track === 'visual');
        if (selVis) {
          return prev.map((c) =>
            c.id === selVis.id
              ? {
                  ...c,
                  mediaId: target.id,
                  name: target.name,
                  kind: target.kind as 'image' | 'video',
                  url: target.url,
                  sourceStart: 0,
                  sourceDuration: target.kind === 'video' ? target.duration ?? (c.endTime - c.startTime) : 0,
                }
              : c
          );
        }
        return prev;
      });
    },
    [cloneSnapshot, items, pushHistory]
  );

  const handleAddVisualToTimeline = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      if (!target || (target.kind !== 'image' && target.kind !== 'video')) return;
      pushHistory(cloneSnapshot());
      const v1Clips = visualClipsRef.current.filter((c) => (c.trackIndex ?? 0) === 0);
      const lastEnd = v1Clips.reduce((m, c) => Math.max(m, c.endTime), 0);
      const clipLen =
        target.kind === 'video' && target.duration
          ? target.duration
          : lastEnd <= 0.05
          ? durationRef.current
          : Math.max(6, durationRef.current - lastEnd);
      const startTime = Number(lastEnd.toFixed(2));
      const endTime = Number((startTime + clipLen).toFixed(2));
      const newClip: VisualTimelineClip = {
        id: `vclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        mediaId: target.id,
        name: target.name,
        kind: target.kind,
        url: target.url,
        startTime,
        endTime,
        sourceStart: 0,
        sourceDuration: target.kind === 'video' ? target.duration ?? clipLen : 0,
        fadeIn: 0,
        fadeOut: 0,
        trackIndex: 0,
        opacity: 1,
      };
      if (endTime > durationRef.current) {
        setDuration(endTime);
      }
      const nextClips = [...visualClipsRef.current, newClip];
      setVisualClips(nextClips);
      setLayers((prev) =>
        syncVisualClipsToLayers(prev, nextClips, ratioRef.current, buildMediaDimensionsMap())
      );
      setSelectedItems([{ track: 'visual', id: newClip.id }]);
      setSelectedLayerId(getClipLayerId(newClip.id));
      setActiveVisualId(id);
    },
    [buildMediaDimensionsMap, cloneSnapshot, items, pushHistory]
  );

  // Stack an image or video ON TOP on a new upper Video track (V2, V3...)
  // Still images cover the ENTIRE timeline [0, duration] by default so users don't have to stretch them manually.
  const handleAddVisualToUpperTrack = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      if (!target || (target.kind !== 'image' && target.kind !== 'video')) return;
      pushHistory(cloneSnapshot());
      const occupiedMax = visualClipsRef.current.reduce(
        (m, c) => Math.max(m, c.trackIndex ?? 0),
        -1
      );
      const nextTrackIdx = Math.max(1, occupiedMax + 1);
      const isImage = target.kind === 'image';
      const clipLen = isImage
        ? Math.max(4, durationRef.current)
        : target.duration ?? Math.max(4, Math.min(durationRef.current, 10));
      const startTime = isImage
        ? 0
        : Number(
            Math.max(0, Math.min(durationRef.current - 1, currentTimeRef.current)).toFixed(2)
          );
      const endTime = Number((startTime + clipLen).toFixed(2));
      const newClip: VisualTimelineClip = {
        id: `vclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        mediaId: target.id,
        name: target.name,
        kind: target.kind,
        url: target.url,
        startTime,
        endTime,
        sourceStart: 0,
        sourceDuration: target.kind === 'video' ? target.duration ?? clipLen : 0,
        fadeIn: 0,
        fadeOut: 0,
        trackIndex: nextTrackIdx,
        opacity: 1,
        fitMode: 'contain',
      };
      if (endTime > durationRef.current) setDuration(endTime);
      const nextClips = [...visualClipsRef.current, newClip];
      setVisualTrackCount((cnt) => Math.max(cnt, nextTrackIdx + 1));
      setVisualClips(nextClips);
      const targetLayerId = getClipLayerId(newClip.id);
      const cachedImg = isImage
        ? visualImageCacheRef.current.get(target.url) ??
          layerImagesRef.current.get(target.url) ??
          null
        : null;
      let autoKeying: LayerKeyingConfig | undefined;
      if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
        const detected = detectImageElementBackgroundType(cachedImg);
        if (
          detected === 'chroma-green' ||
          detected === 'chroma-blue' ||
          detected === 'remove-checkerboard' ||
          detected === 'remove-black'
        ) {
          autoKeying = {
            ...DEFAULT_LAYER_KEYING_CONFIG,
            mode: detected,
            tolerance:
              detected === 'remove-black'
                ? 28
                : detected === 'remove-checkerboard'
                ? 32
                : 42,
            softness: 28,
            spillSuppress:
              detected === 'chroma-green' || detected === 'chroma-blue' ? 75 : 40,
            edgeFade: 4,
          };
        }
      }
      setLayers((prev) => {
        const synced = syncVisualClipsToLayers(
          prev,
          nextClips,
          ratioRef.current,
          buildMediaDimensionsMap()
        );
        if (!autoKeying) return synced;
        return synced.map((l) =>
          l.id === targetLayerId ? { ...l, keying: autoKeying } : l
        );
      });
      setSelectedItems([{ track: 'visual', id: newClip.id }]);
      setSelectedLayerId(targetLayerId);
    },
    [buildMediaDimensionsMap, cloneSnapshot, items, pushHistory]
  );

  const handleSelectAudio = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      if (!target) return;
      setActiveAudioId(id);
      const dur = target.duration ? Number(target.duration.toFixed(2)) : durationRef.current;
      if (target.duration) {
        setDuration((prev) => Math.max(prev, dur));
      }
      pushHistory(cloneSnapshot());
      setAudioClips((prev) => [
        ...prev.filter((c) => (c.trackIndex ?? 0) !== 0),
        {
          id: `aclip-${Date.now()}`,
          mediaId: target.id,
          name: target.name,
          url: target.url,
          startTime: 0,
          endTime: dur,
          sourceStart: 0,
          sourceDuration: dur,
          fadeIn: 0,
          fadeOut: 0,
          volume: 1,
          trackIndex: 0,
        },
      ]);
    },
    [cloneSnapshot, items, pushHistory]
  );

  const handleAddAudioToTimeline = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      if (!target || (target.kind !== 'audio' && target.kind !== 'video')) return;
      pushHistory(cloneSnapshot());
      const a1Clips = audioClipsRef.current.filter((c) => (c.trackIndex ?? 0) === 0);
      const lastEnd = a1Clips.reduce((m, c) => Math.max(m, c.endTime), 0);
      const clipLen = target.duration ? Number(target.duration.toFixed(2)) : 12;
      const startTime = Number(lastEnd.toFixed(2));
      const endTime = Number((startTime + clipLen).toFixed(2));
      const newClip: AudioTimelineClip = {
        id: `aclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        mediaId: target.id,
        name: target.name,
        url: target.url,
        startTime,
        endTime,
        sourceStart: 0,
        sourceDuration: clipLen,
        fadeIn: 0,
        fadeOut: 0,
        volume: 1,
        trackIndex: 0,
      };
      if (endTime > durationRef.current) setDuration(endTime);
      setAudioClips((prev) => [...prev, newClip]);
      setSelectedItems([{ track: 'audio', id: newClip.id }]);
      setActiveAudioId(id);
    },
    [cloneSnapshot, items, pushHistory]
  );

  // Stack an audio clip on a NEW Audio track (A2, A3...) to mix simultaneously
  const handleAddAudioToNewTrack = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      if (!target || (target.kind !== 'audio' && target.kind !== 'video')) return;
      pushHistory(cloneSnapshot());
      const occupiedMax = audioClipsRef.current.reduce(
        (m, c) => Math.max(m, c.trackIndex ?? 0),
        -1
      );
      const nextTrackIdx = Math.max(1, occupiedMax + 1);
      const clipLen = target.duration ? Number(target.duration.toFixed(2)) : 12;
      const startTime = Number(
        Math.max(0, Math.min(durationRef.current - 1, currentTimeRef.current)).toFixed(2)
      );
      const endTime = Number((startTime + clipLen).toFixed(2));
      const newClip: AudioTimelineClip = {
        id: `aclip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        mediaId: target.id,
        name: target.name,
        url: target.url,
        startTime,
        endTime,
        sourceStart: 0,
        sourceDuration: clipLen,
        fadeIn: 0,
        fadeOut: 0,
        volume: 0.85,
        trackIndex: nextTrackIdx,
      };
      if (endTime > durationRef.current) setDuration(endTime);
      setAudioTrackCount((cnt) => Math.max(cnt, nextTrackIdx + 1));
      setAudioClips((prev) => [...prev, newClip]);
      setSelectedItems([{ track: 'audio', id: newClip.id }]);
    },
    [cloneSnapshot, items, pushHistory]
  );

  // Multi-track Add / Remove / Visibility / Mute / Lock / Select-All handlers
  const handleAddVisualTrack = useCallback(() => {
    setVisualTrackCount((cnt) =>
      Math.max(cnt, getVisualTrackCount(visualClipsRef.current)) + 1
    );
  }, []);

  const handleRemoveVisualTrack = useCallback(
    (trackIndex: number) => {
      if (trackIndex <= 0) return;
      pushHistory(cloneSnapshot());
      setVisualClips((prev) =>
        prev
          .filter((c) => (c.trackIndex ?? 0) !== trackIndex)
          .map((c) =>
            (c.trackIndex ?? 0) > trackIndex
              ? { ...c, trackIndex: (c.trackIndex ?? 0) - 1 }
              : c
          )
      );
      setVisualTrackCount((cnt) => Math.max(1, cnt - 1));
      setHiddenVisualTracks((prev) =>
        prev
          .filter((idx) => idx !== trackIndex)
          .map((idx) => (idx > trackIndex ? idx - 1 : idx))
      );
      setLockedVisualTracks((prev) =>
        prev
          .filter((idx) => idx !== trackIndex)
          .map((idx) => (idx > trackIndex ? idx - 1 : idx))
      );
    },
    [cloneSnapshot, pushHistory]
  );

  const handleAddAudioTrack = useCallback(() => {
    setAudioTrackCount((cnt) =>
      Math.max(cnt, getAudioTrackCount(audioClipsRef.current)) + 1
    );
  }, []);

  const handleRemoveAudioTrack = useCallback(
    (trackIndex: number) => {
      if (trackIndex <= 0) return;
      pushHistory(cloneSnapshot());
      setAudioClips((prev) =>
        prev
          .filter((c) => (c.trackIndex ?? 0) !== trackIndex)
          .map((c) =>
            (c.trackIndex ?? 0) > trackIndex
              ? { ...c, trackIndex: (c.trackIndex ?? 0) - 1 }
              : c
          )
      );
      setAudioTrackCount((cnt) => Math.max(1, cnt - 1));
      setMutedAudioTracks((prev) =>
        prev
          .filter((idx) => idx !== trackIndex)
          .map((idx) => (idx > trackIndex ? idx - 1 : idx))
      );
      setLockedAudioTracks((prev) =>
        prev
          .filter((idx) => idx !== trackIndex)
          .map((idx) => (idx > trackIndex ? idx - 1 : idx))
      );
    },
    [cloneSnapshot, pushHistory]
  );

  const handleToggleVisualTrackVisible = useCallback((trackIndex: number) => {
    setHiddenVisualTracks((prev) =>
      prev.includes(trackIndex)
        ? prev.filter((i) => i !== trackIndex)
        : [...prev, trackIndex]
    );
  }, []);

  const handleToggleVisualTrackLocked = useCallback((trackIndex: number) => {
    setLockedVisualTracks((prev) =>
      prev.includes(trackIndex)
        ? prev.filter((i) => i !== trackIndex)
        : [...prev, trackIndex]
    );
  }, []);

  const handleToggleAudioTrackMuted = useCallback((trackIndex: number) => {
    setMutedAudioTracks((prev) =>
      prev.includes(trackIndex)
        ? prev.filter((i) => i !== trackIndex)
        : [...prev, trackIndex]
    );
  }, []);

  const handleToggleAudioTrackLocked = useCallback((trackIndex: number) => {
    setLockedAudioTracks((prev) =>
      prev.includes(trackIndex)
        ? prev.filter((i) => i !== trackIndex)
        : [...prev, trackIndex]
    );
  }, []);

  const handleSelectAllOnVisualTrack = useCallback((trackIndex: number) => {
    setSelectedItems(
      visualClipsRef.current
        .filter((c) => (c.trackIndex ?? 0) === trackIndex)
        .map((c) => ({ track: 'visual', id: c.id }))
    );
  }, []);

  const handleSelectAllOnAudioTrack = useCallback((trackIndex: number) => {
    setSelectedItems(
      audioClipsRef.current
        .filter((c) => (c.trackIndex ?? 0) === trackIndex)
        .map((c) => ({ track: 'audio', id: c.id }))
    );
  }, []);

  // Add an image from Media Bin as an animated movable Canvas Overlay (e.g. character sliding in from right)
  const handleAddImageAsOverlay = useCallback(
    (item: UploadedMediaItem) => {
      if (item.kind !== 'image') return;
      const attachLayer = (img: HTMLImageElement) => {
        const nextMap = new Map(layerImagesRef.current);
        nextMap.set(item.url, img);
        layerImagesRef.current = nextMap;
        setLayerImages(nextMap);

        const dim = getCanvasDimensions(ratioRef.current);
        const aspect = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
        const targetH = Math.round(Math.min(dim.height * 0.72, 760));
        const targetW = Math.round(
          Math.min(dim.width * 0.42, Math.max(120, targetH * aspect))
        );
        const finalH = Math.max(80, Math.round(targetW / Math.max(0.2, aspect)));
        const nowT = currentTimeRef.current;
        const overlayStart = nowT >= 1 ? Number((nowT - 1).toFixed(2)) : 0;
        const id = `layer-img-${Date.now()}`;
        const detectedBg = detectImageElementBackgroundType(img);
        const autoKeying: LayerKeyingConfig | undefined =
          detectedBg === 'chroma-green' ||
          detectedBg === 'chroma-blue' ||
          detectedBg === 'remove-checkerboard' ||
          detectedBg === 'remove-black'
            ? {
                ...DEFAULT_LAYER_KEYING_CONFIG,
                mode: detectedBg,
                tolerance:
                  detectedBg === 'remove-black'
                    ? 28
                    : detectedBg === 'remove-checkerboard'
                    ? 32
                    : 42,
                softness: 28,
                spillSuppress:
                  detectedBg === 'chroma-green' || detectedBg === 'chroma-blue' ? 75 : 40,
                edgeFade: 4,
              }
            : undefined;
        const newLayer: CanvasLayer = {
          id,
          type: 'image',
          name: item.name.replace(/\.[^.]+$/, ''),
          x: Math.round(dim.width - targetW - dim.width * 0.05),
          y: Math.round((dim.height - finalH) / 2),
          width: targetW,
          height: finalH,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          aspectLocked: true,
          mediaUrl: item.url,
          keying: autoKeying,
          startTime: overlayStart,
          endTime: durationRef.current,
          animation: {
            enterPreset: 'slide-right',
            exitPreset: 'none',
            inDuration: 0.9,
            outDuration: 0.6,
            easing: 'ease-out',
          },
        };
        pushHistory(cloneSnapshot());
        setLayers((prev) => [...prev, newLayer]);
        setSelectedLayerId(id);
        setIsPlayerFocusMode(false);
        setIsRightCollapsed(false);
        setInspectorTab('effects');
        setEffectsSubTab('animate');
        setMobilePanel('effects');
        if (nowT < 1 && durationRef.current >= 1.2) {
          currentTimeRef.current = 1;
          setCurrentTime(1);
          drawCanvasFrame(1);
        } else {
          drawCanvasFrame(nowT);
        }
      };

      const cached =
        layerImagesRef.current.get(item.url) ??
        visualImageCacheRef.current.get(item.url);
      if (cached && cached.complete && cached.naturalWidth > 0) {
        attachLayer(cached);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => attachLayer(img);
      img.src = item.url;
    },
    [cloneSnapshot, drawCanvasFrame, pushHistory]
  );

  // Visual / Audio / FX clip timeline drag & trim handlers (mirrored to independent clip layers)
  const mirrorVisualClipPatchToLayer = useCallback(
    (id: string, patch: Partial<VisualTimelineClip>) => {
      const layerPatch: Partial<CanvasLayer> = {};
      if (patch.name !== undefined) layerPatch.name = patch.name;
      if (patch.startTime !== undefined) layerPatch.startTime = patch.startTime;
      if (patch.endTime !== undefined) layerPatch.endTime = patch.endTime;
      if (patch.trackIndex !== undefined) layerPatch.trackIndex = patch.trackIndex;
      if (patch.opacity !== undefined) layerPatch.opacity = patch.opacity;
      if (patch.fitMode !== undefined) layerPatch.fitMode = patch.fitMode;
      if (Object.keys(layerPatch).length === 0) return;
      const targetLayerId = getClipLayerId(id);
      setLayers((prev) =>
        prev.map((l) => (l.id === targetLayerId ? { ...l, ...layerPatch } : l))
      );
    },
    []
  );

  const handlePreviewVisualClip = useCallback(
    (id: string, patch: Partial<VisualTimelineClip>) => {
      setVisualClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      mirrorVisualClipPatchToLayer(id, patch);
    },
    [mirrorVisualClipPatchToLayer]
  );

  const handleCommitVisualClip = useCallback(
    (beforeClips: VisualTimelineClip[], id: string, patch: Partial<VisualTimelineClip>) => {
      pushHistory(
        cloneSnapshot(
          cuesRef.current,
          layersRef.current,
          markersRef.current,
          beforeClips,
          audioClipsRef.current,
          effectClipsRef.current
        )
      );
      const prevClip = beforeClips.find((c) => c.id === id);
      const prevTrack = prevClip?.trackIndex ?? 0;
      const timingChanged =
        patch.startTime !== undefined ||
        patch.endTime !== undefined ||
        patch.trackIndex !== undefined;

      setVisualClips((prev) => {
        let next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
        if (autoRippleRef.current && timingChanged) {
          const updated = next.find((c) => c.id === id);
          const nextTrack = updated?.trackIndex ?? prevTrack;
          next = closeGapsAfterTrackMove(next, id, nextTrack);
          if (nextTrack !== prevTrack) {
            next = closeTrackGaps(next, prevTrack);
          }
        }
        const maxEnd = next.reduce((m, c) => Math.max(m, c.endTime), durationRef.current);
        if (maxEnd > durationRef.current) setDuration(Number(maxEnd.toFixed(2)));
        return next;
      });
      mirrorVisualClipPatchToLayer(id, patch);
    },
    [cloneSnapshot, mirrorVisualClipPatchToLayer, pushHistory]
  );

  const handlePreviewAudioClip = useCallback(
    (id: string, patch: Partial<AudioTimelineClip>) => {
      setAudioClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    []
  );

  const handleCommitAudioClip = useCallback(
    (beforeClips: AudioTimelineClip[], id: string, patch: Partial<AudioTimelineClip>) => {
      pushHistory(
        cloneSnapshot(
          cuesRef.current,
          layersRef.current,
          markersRef.current,
          visualClipsRef.current,
          beforeClips,
          effectClipsRef.current
        )
      );
      const prevClip = beforeClips.find((c) => c.id === id);
      const prevTrack = prevClip?.trackIndex ?? 0;
      const timingChanged =
        patch.startTime !== undefined ||
        patch.endTime !== undefined ||
        patch.trackIndex !== undefined;

      setAudioClips((prev) => {
        let next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
        if (autoRippleRef.current && timingChanged) {
          const updated = next.find((c) => c.id === id);
          const nextTrack = updated?.trackIndex ?? prevTrack;
          next = closeGapsAfterTrackMove(next, id, nextTrack);
          if (nextTrack !== prevTrack) {
            next = closeTrackGaps(next, prevTrack);
          }
        }
        const maxEnd = next.reduce((m, c) => Math.max(m, c.endTime), durationRef.current);
        if (maxEnd > durationRef.current) setDuration(Number(maxEnd.toFixed(2)));
        return next;
      });
    },
    [cloneSnapshot, pushHistory]
  );

  const handlePreviewEffectClip = useCallback(
    (id: string, patch: Partial<TimedEffectClip>) => {
      setEffectClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    []
  );

  const handleCommitEffectClip = useCallback(
    (beforeClips: TimedEffectClip[], id: string, patch: Partial<TimedEffectClip>) => {
      pushHistory(
        cloneSnapshot(
          cuesRef.current,
          layersRef.current,
          markersRef.current,
          visualClipsRef.current,
          audioClipsRef.current,
          beforeClips
        )
      );
      setEffectClips((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
        const maxEnd = next.reduce((m, c) => Math.max(m, c.endTime), durationRef.current);
        if (maxEnd > durationRef.current) setDuration(Number(maxEnd.toFixed(2)));
        return next;
      });
    },
    [cloneSnapshot, pushHistory]
  );

  const handleAddTimedEffect = useCallback(
    (
      effectType: Exclude<BeatVisualEffectType, 'none'>,
      startTime: number,
      endTime: number,
      syncTarget: BeatSyncTarget,
      intensity: number
    ) => {
      pushHistory(cloneSnapshot());
      const safeStart = Number(Math.max(0, startTime).toFixed(2));
      const safeEnd = Number(Math.max(safeStart + 0.4, endTime).toFixed(2));
      const newFx: TimedEffectClip = {
        id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: effectType
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        effectType,
        syncTarget,
        intensity,
        sensitivity: beatEffectsRef.current.sensitivity,
        startTime: safeStart,
        endTime: safeEnd,
      };
      if (safeEnd > durationRef.current) setDuration(safeEnd);
      setEffectClips((prev) => [...prev, newFx]);
      setSelectedItems([{ track: 'fx', id: newFx.id }]);
    },
    [cloneSnapshot, pushHistory]
  );

  const handleDeleteTimedEffect = useCallback(
    (id: string) => {
      pushHistory(cloneSnapshot());
      setEffectClips((prev) => prev.filter((c) => c.id !== id));
      setSelectedItems((prev) => prev.filter((s) => !(s.track === 'fx' && s.id === id)));
    },
    [cloneSnapshot, pushHistory]
  );

  // Layer Keyframes & Animate Panel Shortcuts
  const handleUpsertLayerKeyframe = useCallback(
    (layerId: string, time: number, easing: KeyframeEasing = 'ease-out') => {
      pushHistory(cloneSnapshot());
      setLayers((prev) =>
        prev.map((l) => (l.id === layerId ? upsertLayerKeyframe(l, time, easing) : l))
      );
    },
    [cloneSnapshot, pushHistory]
  );

  const handleRemoveLayerKeyframe = useCallback(
    (layerId: string, keyframeId: string) => {
      pushHistory(cloneSnapshot());
      setLayers((prev) =>
        prev.map((l) => (l.id === layerId ? removeLayerKeyframe(l, keyframeId) : l))
      );
    },
    [cloneSnapshot, pushHistory]
  );

  const handleOpenAnimateForLayer = useCallback(
    (id?: string) => {
      setIsPlayerFocusMode(false);
      setIsRightCollapsed(false);
      setInspectorTab('effects');
      setEffectsSubTab('animate');
      setMobilePanel('effects');
      if (id) {
        handleSelectLayer(id);
      } else if (!selectedLayerIdRef.current && layersRef.current.length > 0) {
        const fallback = layersRef.current[layersRef.current.length - 1];
        if (fallback) handleSelectLayer(fallback.id);
      }
    },
    [handleSelectLayer]
  );

  const handleOpenBeatFx = useCallback(() => {
    setIsPlayerFocusMode(false);
    setIsRightCollapsed(false);
    setInspectorTab('effects');
    setEffectsSubTab('beat');
    setMobilePanel('effects');
  }, []);

  // Manual Paste / Edit Import
  const handleImportPlainLyrics = useCallback(
    (text: string, mode: PlainImportMode) => {
      const parsed = parsePlainLyrics(text, {
        mode,
        totalDuration: durationRef.current,
      });
      if (parsed.length === 0) return;

      pushHistory(cloneSnapshot());
      setCues(parsed);
      setUploadedSrtTracks([]);
      setParseWarnings([]);
      setLyricSource('manual');
      setSyncTargetIndex(0);
      setSelectedCueId(parsed[0]?.id ?? null);
    },
    [cloneSnapshot, pushHistory]
  );

  // Track-specific .SRT Upload & Multi-SRT Proximity Merge
  const handleUploadTrackSrt = useCallback(
    (track: LyricTrackType, content: string) => {
      const { cues: parsedTrackItems, warnings } = parseTrackSrt(content, track);
      if (parsedTrackItems.length === 0) {
        setParseWarnings((prev) => [
          ...prev.filter((w) => w.track !== track),
          ...(warnings.length > 0
            ? warnings
            : [
                {
                  id: `empty-${track}-${Date.now()}`,
                  kind: 'empty-cue' as const,
                  track,
                  message: `Uploaded ${track} SRT did not contain valid timed blocks.`,
                },
              ]),
        ]);
        return;
      }

      pushHistory(cloneSnapshot());

      const shouldReplaceAll =
        uploadedSrtTracks.length === 0 &&
        (lyricSource === 'sample' || lyricSource === 'manual' || cuesRef.current.length === 0);

      const baseCues = shouldReplaceAll ? [] : cuesRef.current;
      const { cues: merged } = mergeTrackSrtIntoCues(baseCues, parsedTrackItems, track);

      const nextTracks = Array.from(new Set([...uploadedSrtTracks, track]));
      setUploadedSrtTracks(nextTracks);

      const nextSource: LyricSourceType =
        nextTracks.length > 1
          ? 'multi-srt'
          : track === 'farsi'
          ? 'farsi-srt'
          : track === 'romanized'
          ? 'romanized-srt'
          : 'english-srt';

      setLyricSource(nextSource);
      setCues(merged);
      setParseWarnings((prev) => [
        ...prev.filter((w) => w.track !== track),
        ...warnings,
      ]);

      // Ensure the uploaded track is visible
      setEnabledTracks((prev) => ({
        ...prev,
        ...(track === 'farsi' ? { primary: true } : {}),
        ...(track === 'romanized' ? { roman: true } : {}),
        ...(track === 'english' ? { english: true } : {}),
      }));

      setSyncTargetIndex(0);
      setSelectedCueId(merged[0]?.id ?? null);
    },
    [cloneSnapshot, lyricSource, pushHistory, uploadedSrtTracks]
  );

  const handleClearLyrics = useCallback(() => {
    if (cuesRef.current.length === 0) return;
    pushHistory(cloneSnapshot());
    setCues([]);
    setUploadedSrtTracks([]);
    setParseWarnings([]);
    setGlobalOffset(0);
    setLyricSource('manual');
    setSelectedCueId(null);
    setSelectedItems((prev) => prev.filter((s) => s.track !== 'cue'));
    setSyncTargetIndex(0);
  }, [cloneSnapshot, pushHistory]);

  const handleExportCorrectedSrt = useCallback(() => {
    const srtText = exportToSrt(cuesRef.current, enabledTracksRef.current, globalOffsetRef.current);
    const blob = new Blob([srtText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lyrcut-synced-lyrics.srt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  // Timeline Cue Editing Handlers
  const handlePreviewCueTiming = useCallback(
    (id: string, startTime: number, endTime: number) => {
      setCues((prev) => updateCueTiming(prev, id, startTime, endTime));
    },
    []
  );

  const handleCommitCueTiming = useCallback(
    (beforeCues: LyricCue[], id: string, startTime: number, endTime: number) => {
      pushHistory(cloneSnapshot(beforeCues));
      setCues((prev) => updateCueTiming(prev, id, startTime, endTime));
    },
    [cloneSnapshot, pushHistory]
  );

  const handleDuplicateCue = useCallback(
    (id: string) => {
      pushHistory(cloneSnapshot());
      setCues((prev) => duplicateCue(prev, id));
    },
    [cloneSnapshot, pushHistory]
  );

  const handleDeleteCue = useCallback(
    (id: string) => {
      pushHistory(cloneSnapshot());
      setCues((prev) => prev.filter((c) => c.id !== id));
      if (selectedCueId === id) setSelectedCueId(null);
      setSelectedItems((prev) => prev.filter((s) => !(s.track === 'cue' && s.id === id)));
    },
    [cloneSnapshot, pushHistory, selectedCueId]
  );

  // Canvas Layer Handlers
  const handlePreviewLayerPatch = useCallback(
    (id: string, patch: Partial<CanvasLayer>) => {
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    },
    []
  );

  const handleCommitLayerPatch = useCallback(
    (beforeLayers: CanvasLayer[], id: string, patch: Partial<CanvasLayer>) => {
      pushHistory(cloneSnapshot(cuesRef.current, beforeLayers));
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      if (patch.fitMode !== undefined) {
        const target = layersRef.current.find((l) => l.id === id);
        if (target?.type === 'media-clip' && target.clipId) {
          const clipId = target.clipId;
          setVisualClips((prev) =>
            prev.map((c) => (c.id === clipId ? { ...c, fitMode: patch.fitMode } : c))
          );
        }
      }
    },
    [cloneSnapshot, pushHistory]
  );

  const handleUpdateLayer = useCallback(
    (id: string, patch: Partial<CanvasLayer>) => {
      pushHistory(cloneSnapshot());
      const target = layersRef.current.find((l) => l.id === id);
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      if (target?.type === 'media-clip' && target.clipId) {
        const clipPatch: Partial<VisualTimelineClip> = {};
        if (patch.opacity !== undefined) clipPatch.opacity = patch.opacity;
        if (patch.fitMode !== undefined) clipPatch.fitMode = patch.fitMode;
        if (patch.startTime !== undefined) clipPatch.startTime = patch.startTime;
        if (patch.endTime !== undefined) clipPatch.endTime = patch.endTime;
        if (Object.keys(clipPatch).length > 0) {
          const clipId = target.clipId;
          setVisualClips((prev) =>
            prev.map((c) => (c.id === clipId ? { ...c, ...clipPatch } : c))
          );
        }
      }
    },
    [cloneSnapshot, pushHistory]
  );

  const handleAddTextLayer = useCallback(() => {
    const dim = getCanvasDimensions(ratioRef.current);
    const id = `layer-text-${Date.now()}`;
    const newLayer: CanvasLayer = {
      id,
      type: 'text',
      name: 'Title Overlay',
      x: Math.round(dim.width * 0.25),
      y: Math.round(dim.height * 0.1),
      width: Math.round(dim.width * 0.5),
      height: 110,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      aspectLocked: false,
      text: 'Artist · Song Title',
      fontSize: 48,
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: 700,
      fontStyle: 'normal',
      textAlign: 'center',
      letterSpacing: 0,
      shadowBlur: 14,
      backgroundColor: 'transparent',
      color: '#FCD34D',
    };
    pushHistory(cloneSnapshot());
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(id);
  }, [cloneSnapshot, pushHistory]);

  const handleAddShapeLayer = useCallback(
    (shapeKind: ShapeKind) => {
      const dim = getCanvasDimensions(ratioRef.current);
      const id = `layer-shape-${Date.now()}`;
      const newLayer: CanvasLayer = {
        id,
        type: 'shape',
        name: 'Badge Shape',
        x: Math.round(dim.width * 0.34),
        y: Math.round(dim.height * 0.84),
        width: Math.round(dim.width * 0.32),
        height: 90,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 0.9,
        aspectLocked: false,
        shapeKind,
        fillColor: 'rgba(245, 158, 11, 0.18)',
        strokeColor: 'rgba(245, 158, 11, 0.72)',
      };
      pushHistory(cloneSnapshot());
      setLayers((prev) => [...prev, newLayer]);
      setSelectedLayerId(id);
    },
    [cloneSnapshot, pushHistory]
  );

  const handleAddImageLayer = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      layerObjectUrlsRef.current.push(url);
      const img = new Image();
      img.onload = () => {
        const nextMap = new Map(layerImagesRef.current);
        nextMap.set(url, img);
        layerImagesRef.current = nextMap;
        setLayerImages(nextMap);
        const dim = getCanvasDimensions(ratioRef.current);
        const aspect = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
        const targetW = Math.round(Math.min(dim.width * 0.28, 340));
        const targetH = Math.max(60, Math.round(targetW / Math.max(0.2, aspect)));
        const id = `layer-img-${Date.now()}`;
        const detectedBg = detectImageElementBackgroundType(img);
        const autoKeying: LayerKeyingConfig | undefined =
          detectedBg === 'chroma-green' ||
          detectedBg === 'chroma-blue' ||
          detectedBg === 'remove-checkerboard' ||
          detectedBg === 'remove-black'
            ? {
                ...DEFAULT_LAYER_KEYING_CONFIG,
                mode: detectedBg,
                tolerance:
                  detectedBg === 'remove-black'
                    ? 28
                    : detectedBg === 'remove-checkerboard'
                    ? 32
                    : 42,
                softness: 28,
                spillSuppress:
                  detectedBg === 'chroma-green' || detectedBg === 'chroma-blue' ? 75 : 40,
                edgeFade: 4,
              }
            : undefined;
        const newLayer: CanvasLayer = {
          id,
          type: 'image',
          name: file.name.replace(/\.[^.]+$/, ''),
          x: Math.round((dim.width - targetW) / 2),
          y: Math.round(dim.height * 0.08),
          width: targetW,
          height: targetH,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          aspectLocked: true,
          mediaUrl: url,
          keying: autoKeying,
        };
        pushHistory(cloneSnapshot());
        setLayers((prev) => [...prev, newLayer]);
        setSelectedLayerId(id);
        drawCanvasFrame(currentTimeRef.current);
      };
      img.src = url;
    },
    [cloneSnapshot, drawCanvasFrame, pushHistory]
  );

  // One-click Auto Blend BG for any character/overlay image or V2+ clip
  const handleAutoBlendLayer = useCallback(
    (layerId: string) => {
      const target = layersRef.current.find((l) => l.id === layerId);
      if (!target || (target.type !== 'media-clip' && target.type !== 'image')) return;

      const mediaUrl =
        target.mediaUrl ??
        visualClipsRef.current.find((c) => c.id === target.clipId)?.url ??
        null;

      const applyWithImage = (img: HTMLImageElement | null) => {
        const detected = img ? detectImageElementBackgroundType(img) : 'auto-corner';
        const nextKeying: LayerKeyingConfig =
          detected === 'none'
            ? {
                ...DEFAULT_LAYER_KEYING_CONFIG,
                mode: 'none',
                edgeFade: 14,
              }
            : {
                ...DEFAULT_LAYER_KEYING_CONFIG,
                mode: detected,
                tolerance:
                  detected === 'remove-black'
                    ? 30
                    : detected === 'remove-checkerboard'
                    ? 34
                    : detected === 'auto-corner'
                    ? 36
                    : 44,
                softness: 30,
                spillSuppress:
                  detected === 'chroma-green' || detected === 'chroma-blue' ? 78 : 45,
                edgeFade: 6,
              };
        pushHistory(cloneSnapshot());
        setLayers((prev) =>
          prev.map((l) => (l.id === layerId ? { ...l, keying: nextKeying } : l))
        );
        setIsPlayerFocusMode(false);
        setIsRightCollapsed(false);
        setSelectedLayerId(layerId);
        setInspectorTab('style');
        setMobilePanel('style');
      };

      const cachedImg = mediaUrl
        ? layerImagesRef.current.get(mediaUrl) ??
          visualImageCacheRef.current.get(mediaUrl) ??
          null
        : null;
      if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
        applyWithImage(cachedImg);
        return;
      }
      if (mediaUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          visualImageCacheRef.current.set(mediaUrl, img);
          applyWithImage(img);
        };
        img.onerror = () => applyWithImage(null);
        img.src = mediaUrl;
      } else {
        applyWithImage(null);
      }
    },
    [cloneSnapshot, pushHistory]
  );

  // Add a live Timer / Stopwatch Counter overlay layer (syncs in preview & 1080p HD export)
  const handleAddTimerCounterLayer = useCallback(
    (preset: 'stopwatch' | 'progress' | 'countdown' | 'minimal' = 'stopwatch') => {
      const dim = getCanvasDimensions(ratioRef.current);
      const id = `layer-timer-${Date.now()}`;
      const isPortrait = ratioRef.current === '9:16';

      const presetConfig: {
        name: string;
        timerMode: TimerCounterMode;
        timerFormat: TimerCounterFormat;
        timerStyle: TimerCounterStyle;
        timerPrefix: string;
        timerShowProgress: boolean;
        color: string;
        timerAccentColor: string;
        width: number;
        height: number;
        fontSize: number;
      } =
        preset === 'progress'
          ? {
              name: 'Song Progress Timer',
              timerMode: 'elapsed-total',
              timerFormat: 'mm:ss',
              timerStyle: 'stopwatch-hud',
              timerPrefix: '',
              timerShowProgress: true,
              color: '#FFFFFF',
              timerAccentColor: '#F59E0B',
              width: isPortrait ? 460 : 420,
              height: 98,
              fontSize: 38,
            }
          : preset === 'countdown'
          ? {
              name: 'Countdown Timer',
              timerMode: 'count-down',
              timerFormat: 'mm:ss',
              timerStyle: 'neon-amber',
              timerPrefix: 'LEFT',
              timerShowProgress: true,
              color: '#FDE68A',
              timerAccentColor: '#F59E0B',
              width: isPortrait ? 420 : 380,
              height: 96,
              fontSize: 40,
            }
          : preset === 'minimal'
          ? {
              name: 'Minimal Clock',
              timerMode: 'count-up',
              timerFormat: 'mm:ss.d',
              timerStyle: 'minimal-glass',
              timerPrefix: '',
              timerShowProgress: false,
              color: '#FFFFFF',
              timerAccentColor: '#38BDF8',
              width: isPortrait ? 340 : 300,
              height: 78,
              fontSize: 38,
            }
          : {
              name: 'Stopwatch Counter',
              timerMode: 'count-up',
              timerFormat: 'hh:mm:ss',
              timerStyle: 'stopwatch-hud',
              timerPrefix: '',
              timerShowProgress: false,
              color: '#FFFFFF',
              timerAccentColor: '#F59E0B',
              width: isPortrait ? 380 : 340,
              height: 84,
              fontSize: 40,
            };

      const newLayer: CanvasLayer = {
        id,
        type: 'timer-counter',
        name: presetConfig.name,
        x: isPortrait
          ? Math.round((dim.width - presetConfig.width) / 2)
          : Math.round(dim.width - presetConfig.width - 72),
        y: isPortrait ? 120 : 56,
        width: presetConfig.width,
        height: presetConfig.height,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        aspectLocked: false,
        fontSize: presetConfig.fontSize,
        fontWeight: 700,
        color: presetConfig.color,
        timerMode: presetConfig.timerMode,
        timerFormat: presetConfig.timerFormat,
        timerStyle: presetConfig.timerStyle,
        timerPrefix: presetConfig.timerPrefix,
        timerScope: 'song',
        timerShowProgress: presetConfig.timerShowProgress,
        timerAccentColor: presetConfig.timerAccentColor,
      };

      pushHistory(cloneSnapshot());
      setLayers((prev) => [...prev, newLayer]);
      setSelectedLayerId(id);
      drawCanvasFrame(currentTimeRef.current);
    },
    [cloneSnapshot, drawCanvasFrame, pushHistory]
  );

  const handleChangeRatio = useCallback((nextRatio: AspectRatio) => {
    const prevRatio = ratioRef.current;
    if (prevRatio !== nextRatio) {
      ratioRef.current = nextRatio;
      setRatio(nextRatio);
      setLayers((curr) => adaptLayersToRatio(curr, prevRatio, nextRatio));
    }
    setActiveVisualId((current) => {
      if (nextRatio === '9:16' && current === 'sample-stage-16-9') {
        setVisualClips((prev) =>
          prev.map((c) =>
            c.mediaId === 'sample-stage-16-9'
              ? {
                  ...c,
                  mediaId: 'sample-rain-9-16',
                  name: 'Night Street Portrait (9:16)',
                  url: nightPortraitImg.src,
                }
              : c
          )
        );
        return 'sample-rain-9-16';
      }
      if (nextRatio === '16:9' && current === 'sample-rain-9-16') {
        setVisualClips((prev) =>
          prev.map((c) =>
            c.mediaId === 'sample-rain-9-16'
              ? {
                  ...c,
                  mediaId: 'sample-stage-16-9',
                  name: 'Stage Haze Backdrop (16:9)',
                  url: stageLandscapeImg.src,
                }
              : c
          )
        );
        return 'sample-stage-16-9';
      }
      return current;
    });
  }, []);

  const bgLayer =
    layers.find((l) => l.type === 'media-clip' && (l.trackIndex ?? 0) === 0) ??
    layers.find((l) => l.type === 'background-media') ??
    null;
  const visualVisible = bgLayer ? bgLayer.visible : true;
  const visualLocked = bgLayer ? bgLayer.locked : false;

  const effectiveLeftHidden = isPlayerFocusMode || isLeftCollapsed;
  const effectiveRightHidden = isPlayerFocusMode || isRightCollapsed;

  const desktopGridClass =
    effectiveLeftHidden && effectiveRightHidden
      ? 'lg:grid-cols-[minmax(0,1fr)]'
      : effectiveLeftHidden
      ? 'lg:grid-cols-[minmax(0,1fr)_356px]'
      : effectiveRightHidden
      ? 'lg:grid-cols-[256px_minmax(0,1fr)]'
      : 'lg:grid-cols-[256px_minmax(0,1fr)_356px]';

  const handleTogglePlayerFocusMode = useCallback(() => {
    setIsPlayerFocusMode((prev) => !prev);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen lg:h-screen flex flex-col bg-[#0B0D11] text-zinc-100 overflow-x-hidden lg:overflow-hidden">
        {/* Hidden native media elements driving exact canvas & audio playback */}
        <video
          ref={hiddenVideoRef}
          playsInline
          crossOrigin="anonymous"
          loop
          onLoadedMetadata={(e) => {
            const vid = e.currentTarget;
            if (Number.isFinite(vid.duration) && vid.duration > 0) {
              setDuration(Number(vid.duration.toFixed(2)));
            }
            drawCanvasFrame(currentTimeRef.current);
          }}
          className="hidden"
        />
        <audio ref={hiddenAudioRef} preload="auto" crossOrigin="anonymous" className="hidden" />

        {/* Top Bar Contract: 1-row, 3-zone, icon-first navigation with hover tooltips */}
        <header className="h-12 shrink-0 px-4 sm:px-5 border-b border-white/8 bg-[#0E1117] flex items-center justify-between gap-4 select-none">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#"
            className="text-base font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0"
          >
            LyrCut Studio
          </a>

          {/* Zone 2: Icon-first Workspace Navigation with Hover Tooltips */}
          <nav
            aria-label="Workspace sections"
            className="hidden md:flex items-center gap-2 text-xs font-medium text-zinc-400"
          >
            <IconTooltip tip="Uploaded media bin" position="bottom">
              <button
                type="button"
                aria-label="Uploaded Items"
                onClick={() => {
                  setIsPlayerFocusMode(false);
                  setIsLeftCollapsed(false);
                  setMobilePanel('media');
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  !effectiveLeftHidden
                    ? 'text-zinc-100 bg-white/5'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400/90" aria-hidden="true" />
                <span className="hidden xl:inline">Media</span>
              </button>
            </IconTooltip>

            <IconTooltip tip="Lyrics, SRT & Sync Editor" position="bottom">
              <button
                type="button"
                aria-label="Lyrics & Sync"
                onClick={() => {
                  setIsPlayerFocusMode(false);
                  setIsRightCollapsed(false);
                  setInspectorTab('lyrics');
                  setMobilePanel('lyrics');
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  !effectiveRightHidden && inspectorTab === 'lyrics'
                    ? 'text-zinc-100 bg-white/8'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`}
              >
                <Subtitles className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden xl:inline">Lyrics</span>
              </button>
            </IconTooltip>

            <IconTooltip tip="Overlay Style, Fonts & Layers" position="bottom">
              <button
                type="button"
                aria-label="Overlay Style"
                onClick={() => {
                  setIsPlayerFocusMode(false);
                  setIsRightCollapsed(false);
                  setInspectorTab('style');
                  setMobilePanel('style');
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  !effectiveRightHidden && inspectorTab === 'style'
                    ? 'text-zinc-100 bg-white/8'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`}
              >
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden xl:inline">Style</span>
              </button>
            </IconTooltip>

            <IconTooltip tip="Animate, Keyframes, Beat FX & Scroll Effects" position="bottom">
              <button
                type="button"
                aria-label="Effects"
                onClick={() => {
                  setIsPlayerFocusMode(false);
                  setIsRightCollapsed(false);
                  setInspectorTab('effects');
                  setMobilePanel('effects');
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  !effectiveRightHidden && inspectorTab === 'effects'
                    ? 'text-amber-300 bg-amber-500/15'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden xl:inline">Effects</span>
              </button>
            </IconTooltip>
          </nav>

          {/* Zone 3: Primary Export Action */}
          <div className="flex items-center shrink-0">
            <IconTooltip tip="Export 1080p Full HD video with audio & effects" position="bottom" align="right">
              <button
                type="button"
                onClick={() => {
                  if (isPlaying) handleTogglePlay();
                  setIsExportOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export Full HD</span>
              </button>
            </IconTooltip>
          </div>
        </header>

        {/* Mobile / Tablet Panel Switcher (< lg) */}
        <div className="lg:hidden px-3 py-2 border-b border-white/8 bg-[#12151C]">
          <div className="grid grid-cols-5 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/8">
            {(
              [
                { id: 'preview', label: 'Preview' },
                { id: 'media', label: `Media (${items.length})` },
                { id: 'lyrics', label: `Lyrics (${cues.length})` },
                { id: 'style', label: 'Style' },
                { id: 'effects', label: 'Effects' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMobilePanel(tab.id);
                  if (tab.id === 'lyrics') setInspectorTab('lyrics');
                  if (tab.id === 'style') setInspectorTab('style');
                  if (tab.id === 'effects') setInspectorTab('effects');
                }}
                className={`py-1.5 px-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                  mobilePanel === tab.id
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic 1-to-3 Column Studio Workspace (minimizing both sidebars shows Player + Timeline only) */}
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className={`flex-1 min-h-0 grid grid-cols-1 ${desktopGridClass}`}
        >
          {/* Left: Uploaded Items Bin (hidden in Player-Only Focus Mode or when collapsed) */}
          {!isPlayerFocusMode && (
            <div
              className={`min-h-0 h-full ${
                mobilePanel === 'media'
                  ? isLeftCollapsed
                    ? 'block lg:hidden'
                    : 'block'
                  : isLeftCollapsed
                  ? 'hidden'
                  : 'hidden lg:block'
              }`}
            >
              <MediaBin
                items={items}
                activeVisualId={activeVisualId}
                activeAudioId={activeAudioId}
                mediaFit={mediaFit}
                onUploadFiles={handleUploadFiles}
                onSelectVisual={handleSelectVisual}
                onSelectAudio={handleSelectAudio}
                onAddVisualToTimeline={handleAddVisualToTimeline}
                onAddVisualToUpperTrack={handleAddVisualToUpperTrack}
                onAddAudioToTimeline={handleAddAudioToTimeline}
                onAddAudioToNewTrack={handleAddAudioToNewTrack}
                onAddImageAsOverlay={handleAddImageAsOverlay}
                onRemoveItem={handleRemoveItem}
                onChangeMediaFit={setMediaFit}
                onCollapse={() => setIsLeftCollapsed(true)}
              />
            </div>
          )}

          {/* Center: Interactive Canvas Preview & Pro NLE Timeline */}
          <div
            className={`min-h-[540px] lg:min-h-0 h-full ${
              isPlayerFocusMode || mobilePanel === 'preview' ? 'block' : 'hidden lg:block'
            }`}
          >
            <PreviewStage
              canvasRef={canvasRef}
              ratio={ratio}
              onChangeRatio={handleChangeRatio}
              showSafeZones={style.showSafeZones}
              onToggleSafeZones={() =>
                setStyle((s) => ({ ...s, showSafeZones: !s.showSafeZones }))
              }
              isLeftCollapsed={isLeftCollapsed}
              isRightCollapsed={isRightCollapsed}
              isPlayerFocusMode={isPlayerFocusMode}
              onToggleLeftCollapsed={() => setIsLeftCollapsed((v) => !v)}
              onToggleRightCollapsed={() => setIsRightCollapsed((v) => !v)}
              onTogglePlayerFocusMode={handleTogglePlayerFocusMode}
              layers={layers}
              selectedLayerId={selectedLayerId}
              scrollingEnabled={scrollingConfig.enabled}
              onSelectLayer={handleSelectLayer}
              onOpenAnimateForLayer={handleOpenAnimateForLayer}
              onAutoBlendLayer={handleAutoBlendLayer}
              onOpenBeatFx={handleOpenBeatFx}
              onPreviewLayerPatch={handlePreviewLayerPatch}
              onCommitLayerPatch={handleCommitLayerPatch}
              onSetSnapGuides={setSnapGuides}
              onToggleLayerLock={(id) => {
                const target = layersRef.current.find((l) => l.id === id);
                if (target) handleUpdateLayer(id, { locked: !target.locked });
              }}
              onToggleLayerVisible={(id) => {
                const target = layersRef.current.find((l) => l.id === id);
                if (target) handleUpdateLayer(id, { visible: !target.visible });
              }}
              onToggleLayerAspect={(id) => {
                const target = layersRef.current.find((l) => l.id === id);
                if (target) handleUpdateLayer(id, { aspectLocked: !target.aspectLocked });
              }}
              onBringLayerForward={(id) => {
                pushHistory(cloneSnapshot());
                setLayers((prev) => bringLayerForward(prev, id));
              }}
              onSendLayerBackward={(id) => {
                pushHistory(cloneSnapshot());
                setLayers((prev) => sendLayerBackward(prev, id));
              }}
              onDuplicateLayer={handleDuplicateLayer}
              onDeleteLayer={handleDeleteLayer}
              onClearLayerAnimation={handleClearLayerAnimation}
              isPlaying={isPlaying}
              isLooping={isLooping}
              onToggleLoop={() => setIsLooping((v) => !v)}
              onTogglePlay={handleTogglePlay}
              onRestart={handleRestart}
              isMuted={isMuted}
              onToggleMute={handleToggleMute}
              currentTime={currentTime}
              duration={duration}
              globalOffset={globalOffset}
              onSeek={handleSeek}
              cues={cues}
              enabledTracks={enabledTracks}
              onToggleTrack={(track) =>
                setEnabledTracks((prev) => ({ ...prev, [track]: !prev[track] }))
              }
              visualVisible={visualVisible}
              visualLocked={visualLocked}
              onToggleVisualVisible={() => {
                if (bgLayer) {
                  handleUpdateLayer(bgLayer.id, { visible: !bgLayer.visible });
                }
              }}
              onToggleVisualLocked={() => {
                if (bgLayer) {
                  handleUpdateLayer(bgLayer.id, { locked: !bgLayer.locked });
                }
              }}
              visualTrackCount={visualTrackCount}
              audioTrackCount={audioTrackCount}
              hiddenVisualTracks={hiddenVisualTracks}
              lockedVisualTracks={lockedVisualTracks}
              mutedAudioTracks={mutedAudioTracks}
              lockedAudioTracks={lockedAudioTracks}
              onAddVisualTrack={handleAddVisualTrack}
              onRemoveVisualTrack={handleRemoveVisualTrack}
              onAddAudioTrack={handleAddAudioTrack}
              onRemoveAudioTrack={handleRemoveAudioTrack}
              onToggleVisualTrackVisible={handleToggleVisualTrackVisible}
              onToggleVisualTrackLocked={handleToggleVisualTrackLocked}
              onToggleAudioTrackMuted={handleToggleAudioTrackMuted}
              onToggleAudioTrackLocked={handleToggleAudioTrackLocked}
              onSelectAllOnVisualTrack={handleSelectAllOnVisualTrack}
              onSelectAllOnAudioTrack={handleSelectAllOnAudioTrack}
              visualClips={visualClips}
              audioClips={audioClips}
              effectClips={effectClips}
              onPreviewVisualClip={handlePreviewVisualClip}
              onCommitVisualClip={handleCommitVisualClip}
              onPreviewAudioClip={handlePreviewAudioClip}
              onCommitAudioClip={handleCommitAudioClip}
              onPreviewEffectClip={handlePreviewEffectClip}
              onCommitEffectClip={handleCommitEffectClip}
              selectedItems={selectedItems}
              onSetSelectedItems={handleSetSelectedItems}
              onSelectAllOnTrack={handleSelectAllOnTrack}
              hasClipboard={Boolean(clipboard && clipboard.items.length > 0)}
              onCopySelected={handleCopySelected}
              onCutSelected={handleCutSelected}
              onPasteAtPlayhead={handlePasteAtPlayhead}
              onDeleteSelected={handleDeleteSelected}
              onSplitAtPlayhead={handleSplitAtPlayhead}
              onClearAllLyrics={handleClearLyrics}
              beatTimes={audioAnalysis?.beatTimes ?? []}
              selectedCueId={selectedCueId}
              onSelectCue={(id, idx) => {
                setSelectedCueId(id);
                if (typeof idx === 'number') setSyncTargetIndex(idx);
              }}
              syncTargetIndex={syncTargetIndex}
              onSelectSyncTarget={setSyncTargetIndex}
              onStampNextLine={handleStampNextLine}
              onChangeGlobalOffset={setGlobalOffset}
              onPreviewCueTiming={handlePreviewCueTiming}
              onCommitCueTiming={handleCommitCueTiming}
              waveformPeaks={waveformPeaks}
              activeAudioName={activeAudioItem?.name ?? null}
              markers={markers}
              onAddMarker={(time) => {
                pushHistory(cloneSnapshot());
                setMarkers((prev) => [
                  ...prev,
                  {
                    id: `marker-${Date.now()}`,
                    time: Number(time.toFixed(2)),
                    label: `M${prev.length + 1}`,
                  },
                ]);
              }}
              onRemoveMarker={(id) => {
                pushHistory(cloneSnapshot());
                setMarkers((prev) => prev.filter((m) => m.id !== id));
              }}
              canUndo={historyPast.length > 0}
              canRedo={historyFuture.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
              autoRipple={autoRipple}
              onToggleAutoRipple={() => setAutoRipple((v) => !v)}
            />
          </div>

          {/* Right: Multi-Language Lyrics, Overlay Style & Effects Inspector */}
          {!isPlayerFocusMode && (
            <div
              className={`min-h-0 h-full ${
                mobilePanel === 'lyrics' ||
                mobilePanel === 'style' ||
                mobilePanel === 'effects'
                  ? isRightCollapsed
                    ? 'block lg:hidden'
                    : 'block'
                  : isRightCollapsed
                  ? 'hidden'
                  : 'hidden lg:block'
              }`}
            >
              <LyricsInspector
                cues={cues}
                currentTime={currentTime}
                duration={duration}
                globalOffset={globalOffset}
                lyricSource={lyricSource}
                validationWarnings={validationWarnings}
                enabledTracks={enabledTracks}
                style={style}
                scrollingConfig={scrollingConfig}
                beatEffects={beatEffects}
                hasAudioBeatData={Boolean(audioAnalysis && audioAnalysis.duration > 0)}
                detectedBeatCount={audioAnalysis?.beatTimes.length ?? 0}
                layers={layers}
                selectedLayerId={selectedLayerId}
                selectedCueId={selectedCueId}
                syncTargetIndex={syncTargetIndex}
                activeTab={inspectorTab}
                effectsSubTab={effectsSubTab}
                onChangeTab={setInspectorTab}
                onChangeEffectsSubTab={setEffectsSubTab}
                onCollapse={() => setIsRightCollapsed(true)}
                onToggleTrack={(track) =>
                  setEnabledTracks((prev) => ({ ...prev, [track]: !prev[track] }))
                }
                onChangeGlobalOffset={setGlobalOffset}
                onImportPlainLyrics={handleImportPlainLyrics}
                onUploadTrackSrt={handleUploadTrackSrt}
                onClearLyrics={handleClearLyrics}
                onExportCorrectedSrt={handleExportCorrectedSrt}
                onUpdateCueText={(id, field, value) =>
                  setCues((prev) =>
                    prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
                  )
                }
                onUpdateCueTiming={(id, start, end) => {
                  pushHistory(cloneSnapshot());
                  setCues((prev) => updateCueTiming(prev, id, start, end));
                }}
                onStampCueAtCurrentTime={handleStampSpecificCue}
                onDuplicateCue={handleDuplicateCue}
                onDeleteCue={handleDeleteCue}
                onAddCue={() => {
                  pushHistory(cloneSnapshot());
                  const newId = `cue-${Date.now()}`;
                  setCues((prev) => {
                    const lastEnd = prev.length > 0 ? prev[prev.length - 1].endTime : 0;
                    const start = Number(lastEnd.toFixed(2));
                    const end = Number(Math.min(duration, start + 3).toFixed(2));
                    return [
                      ...prev,
                      {
                        id: newId,
                        startTime: start,
                        endTime: Math.max(start + 0.5, end),
                        primary: 'خط جدید...',
                        roman: '',
                        english: '',
                      },
                    ];
                  });
                  setSelectedCueId(newId);
                }}
                onSeekToCue={handleSeek}
                onChangeStyle={(patch) => setStyle((prev) => ({ ...prev, ...patch }))}
                onChangeScrollingConfig={(patch) =>
                  setScrollingConfig((prev) => ({ ...prev, ...patch }))
                }
                onResetScrollingDefaults={() =>
                  setScrollingConfig(DEFAULT_FOCUSED_SCROLLING_CONFIG)
                }
                onChangeBeatEffects={(patch) =>
                  setBeatEffects((prev) => ({ ...prev, ...patch }))
                }
                onResetBeatEffects={() => setBeatEffects(DEFAULT_BEAT_EFFECTS_CONFIG)}
                effectClips={effectClips}
                onAddTimedEffect={handleAddTimedEffect}
                onDeleteTimedEffect={handleDeleteTimedEffect}
                onSelectLayer={handleSelectLayer}
                onUpdateLayer={handleUpdateLayer}
                onUpsertLayerKeyframe={handleUpsertLayerKeyframe}
                onRemoveLayerKeyframe={handleRemoveLayerKeyframe}
                onAddTextLayer={handleAddTextLayer}
                onAddShapeLayer={handleAddShapeLayer}
                onAddImageLayer={handleAddImageLayer}
                onAddTimerCounterLayer={handleAddTimerCounterLayer}
                onAutoBlendLayer={handleAutoBlendLayer}
                onBringLayerForward={(id) => {
                  pushHistory(cloneSnapshot());
                  setLayers((prev) => bringLayerForward(prev, id));
                }}
                onSendLayerBackward={(id) => {
                  pushHistory(cloneSnapshot());
                  setLayers((prev) => sendLayerBackward(prev, id));
                }}
                onDuplicateLayer={handleDuplicateLayer}
                onDeleteLayer={handleDeleteLayer}
                onClearLayerAnimation={handleClearLayerAnimation}
              />
            </div>
          )}
        </motion.main>

        {/* Full HD Export Modal */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          ratio={ratio}
          duration={duration}
          globalOffset={globalOffset}
          visualItem={activeVisualItem}
          audioItem={activeAudioItem}
          visualClips={visualClips}
          audioClips={audioClips}
          effectClips={effectClips}
          hiddenVisualTracks={hiddenVisualTracks}
          mutedAudioTracks={mutedAudioTracks}
          mediaFit={mediaFit}
          cues={cues}
          enabledTracks={enabledTracks}
          style={style}
          scrollingConfig={scrollingConfig}
          beatEffects={beatEffects}
          layers={layers}
          layerImages={layerImages}
        />
      </div>
    </MotionConfig>
  );
}
