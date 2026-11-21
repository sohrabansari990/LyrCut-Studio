'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Monitor,
  Smartphone,
  Shield,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Link2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Repeat,
  Maximize2,
  Minimize2,
  PanelLeftOpen,
  PanelRightOpen,
  Clapperboard,
  Eraser,
  Magnet,
  Wand2,
} from 'lucide-react';
import { AspectRatio, EnabledTracks, LyricCue, formatTimecode } from '@/lib/lyrics-parser';
import {
  CanvasLayer,
  LayerHandleId,
  formatLayerDisplayLabel,
  getCanvasDimensions,
  getCursorForLayerHandle,
  hasLayerAnimation,
  hitTestCanvasLayer,
  hitTestLayerHandle,
  resizeLayerByHandle,
  snapLayerPosition,
  snapLayerResize,
} from '@/lib/canvas-layers';
import { SnapGuideState } from '@/lib/canvas-renderer';
import {
  AudioTimelineClip,
  TimedEffectClip,
  VisualTimelineClip,
  evaluateLayerAtTime,
} from '@/lib/timeline-engine';
import TimelineEditor, {
  TimelineMarker,
  TimelineSelectionItem,
  TimelineSelectionTrack,
} from './TimelineEditor';
import { IconTooltip } from './TooltipButton';

interface PreviewStageProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ratio: AspectRatio;
  onChangeRatio: (ratio: AspectRatio) => void;
  showSafeZones: boolean;
  onToggleSafeZones: () => void;
  // Collapsible sidebars & Player-Only Focus Mode
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
  isPlayerFocusMode: boolean;
  onToggleLeftCollapsed: () => void;
  onToggleRightCollapsed: () => void;
  onTogglePlayerFocusMode: () => void;
  // Interactive Canvas Layers
  layers: CanvasLayer[];
  selectedLayerId: string | null;
  scrollingEnabled: boolean;
  onSelectLayer: (id: string | null) => void;
  onOpenAnimateForLayer: (id?: string) => void;
  onAutoBlendLayer?: (id: string) => void;
  onOpenBeatFx: () => void;
  onPreviewLayerPatch: (id: string, patch: Partial<CanvasLayer>) => void;
  onCommitLayerPatch: (
    beforeLayers: CanvasLayer[],
    id: string,
    patch: Partial<CanvasLayer>
  ) => void;
  onSetSnapGuides: (guides: SnapGuideState | null) => void;
  onToggleLayerLock: (id: string) => void;
  onToggleLayerVisible: (id: string) => void;
  onToggleLayerAspect: (id: string) => void;
  onBringLayerForward: (id: string) => void;
  onSendLayerBackward: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onClearLayerAnimation: (id: string) => void;
  // Player Review & Multi-Clip Timeline props
  isPlaying: boolean;
  isLooping: boolean;
  onToggleLoop: () => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  currentTime: number;
  duration: number;
  globalOffset: number;
  onSeek: (time: number) => void;
  cues: LyricCue[];
  enabledTracks: EnabledTracks;
  onToggleTrack: (track: keyof EnabledTracks) => void;
  visualVisible: boolean;
  visualLocked: boolean;
  onToggleVisualVisible: () => void;
  onToggleVisualLocked: () => void;
  visualTrackCount: number;
  audioTrackCount: number;
  hiddenVisualTracks: number[];
  lockedVisualTracks: number[];
  mutedAudioTracks: number[];
  lockedAudioTracks: number[];
  onAddVisualTrack: () => void;
  onRemoveVisualTrack: (trackIndex: number) => void;
  onAddAudioTrack: () => void;
  onRemoveAudioTrack: (trackIndex: number) => void;
  onToggleVisualTrackVisible: (trackIndex: number) => void;
  onToggleVisualTrackLocked: (trackIndex: number) => void;
  onToggleAudioTrackMuted: (trackIndex: number) => void;
  onToggleAudioTrackLocked: (trackIndex: number) => void;
  onSelectAllOnVisualTrack: (trackIndex: number) => void;
  onSelectAllOnAudioTrack: (trackIndex: number) => void;
  visualClips: VisualTimelineClip[];
  audioClips: AudioTimelineClip[];
  effectClips: TimedEffectClip[];
  onPreviewVisualClip: (id: string, patch: Partial<VisualTimelineClip>) => void;
  onCommitVisualClip: (
    beforeClips: VisualTimelineClip[],
    id: string,
    patch: Partial<VisualTimelineClip>
  ) => void;
  onPreviewAudioClip: (id: string, patch: Partial<AudioTimelineClip>) => void;
  onCommitAudioClip: (
    beforeClips: AudioTimelineClip[],
    id: string,
    patch: Partial<AudioTimelineClip>
  ) => void;
  onPreviewEffectClip: (id: string, patch: Partial<TimedEffectClip>) => void;
  onCommitEffectClip: (
    beforeClips: TimedEffectClip[],
    id: string,
    patch: Partial<TimedEffectClip>
  ) => void;
  selectedItems: TimelineSelectionItem[];
  onSetSelectedItems: (items: TimelineSelectionItem[]) => void;
  onSelectAllOnTrack: (track: TimelineSelectionTrack) => void;
  hasClipboard: boolean;
  onCopySelected: () => void;
  onCutSelected: () => void;
  onPasteAtPlayhead: () => void;
  onDeleteSelected: () => void;
  onSplitAtPlayhead: () => void;
  onClearAllLyrics: () => void;
  beatTimes: number[];
  selectedCueId: string | null;
  onSelectCue: (id: string | null, index?: number) => void;
  syncTargetIndex: number;
  onSelectSyncTarget: (idx: number) => void;
  onStampNextLine: () => void;
  onChangeGlobalOffset: (offset: number) => void;
  onPreviewCueTiming: (id: string, startTime: number, endTime: number) => void;
  onCommitCueTiming: (
    beforeCues: LyricCue[],
    id: string,
    startTime: number,
    endTime: number
  ) => void;
  waveformPeaks: number[];
  activeAudioName: string | null;
  markers: TimelineMarker[];
  onAddMarker: (time: number) => void;
  onRemoveMarker: (id: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  autoRipple: boolean;
  onToggleAutoRipple: () => void;
}

type CanvasInteraction = {
  mode: 'move' | LayerHandleId;
  layerId: string;
  startCanvasX: number;
  startCanvasY: number;
  initialLayer: CanvasLayer;
  snapshotBeforeDrag: CanvasLayer[];
};

export default function PreviewStage({
  canvasRef,
  ratio,
  onChangeRatio,
  showSafeZones,
  onToggleSafeZones,
  isLeftCollapsed,
  isRightCollapsed,
  isPlayerFocusMode,
  onToggleLeftCollapsed,
  onToggleRightCollapsed,
  onTogglePlayerFocusMode,
  layers,
  selectedLayerId,
  scrollingEnabled,
  onSelectLayer,
  onOpenAnimateForLayer,
  onAutoBlendLayer,
  onOpenBeatFx,
  onPreviewLayerPatch,
  onCommitLayerPatch,
  onSetSnapGuides,
  onToggleLayerLock,
  onToggleLayerVisible,
  onToggleLayerAspect,
  onBringLayerForward,
  onSendLayerBackward,
  onDuplicateLayer,
  onDeleteLayer,
  onClearLayerAnimation,
  isPlaying,
  isLooping,
  onToggleLoop,
  onTogglePlay,
  onRestart,
  isMuted,
  onToggleMute,
  currentTime,
  duration,
  globalOffset,
  onSeek,
  cues,
  enabledTracks,
  onToggleTrack,
  visualVisible,
  visualLocked,
  onToggleVisualVisible,
  onToggleVisualLocked,
  visualTrackCount,
  audioTrackCount,
  hiddenVisualTracks,
  lockedVisualTracks,
  mutedAudioTracks,
  lockedAudioTracks,
  onAddVisualTrack,
  onRemoveVisualTrack,
  onAddAudioTrack,
  onRemoveAudioTrack,
  onToggleVisualTrackVisible,
  onToggleVisualTrackLocked,
  onToggleAudioTrackMuted,
  onToggleAudioTrackLocked,
  onSelectAllOnVisualTrack,
  onSelectAllOnAudioTrack,
  visualClips,
  audioClips,
  effectClips,
  onPreviewVisualClip,
  onCommitVisualClip,
  onPreviewAudioClip,
  onCommitAudioClip,
  onPreviewEffectClip,
  onCommitEffectClip,
  selectedItems,
  onSetSelectedItems,
  onSelectAllOnTrack,
  hasClipboard,
  onCopySelected,
  onCutSelected,
  onPasteAtPlayhead,
  onDeleteSelected,
  onSplitAtPlayhead,
  onClearAllLyrics,
  beatTimes,
  selectedCueId,
  onSelectCue,
  syncTargetIndex,
  onSelectSyncTarget,
  onStampNextLine,
  onChangeGlobalOffset,
  onPreviewCueTiming,
  onCommitCueTiming,
  waveformPeaks,
  activeAudioName,
  markers,
  onAddMarker,
  onRemoveMarker,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  autoRipple,
  onToggleAutoRipple,
}: PreviewStageProps) {
  const [interaction, setInteraction] = useState<CanvasInteraction | null>(null);
  const [canvasSnapEnabled, setCanvasSnapEnabled] = useState<boolean>(true);
  const [canvasCursor, setCanvasCursor] = useState<string>('default');
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const [frameBox, setFrameBox] = useState<{ w: number; h: number } | null>(null);

  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  // Exact aspect-ratio fit observer so 16:9 landscape NEVER shows black sidebars inside the player box
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;

    const computeSize = () => {
      const pad = 16;
      const availW = Math.max(160, el.clientWidth - pad);
      const availH = Math.max(120, el.clientHeight - pad);
      const targetAspect = ratio === '16:9' ? 16 / 9 : 9 / 16;

      let w = availW;
      let h = w / targetAspect;
      if (h > availH) {
        h = availH;
        w = h * targetAspect;
      }
      setFrameBox({ w: Math.floor(w), h: Math.floor(h) });
    };

    computeSize();
    const ro = new ResizeObserver(computeSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, isLeftCollapsed, isRightCollapsed, isPlayerFocusMode]);

  const nativeDim = getCanvasDimensions(ratio);
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) ?? null;

  const clientToCanvasCoords = (
    clientX: number,
    clientY: number
  ): { cx: number; cy: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { cx: 0, cy: 0 };
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { cx: 0, cy: 0 };
    return {
      cx: ((clientX - rect.left) / rect.width) * nativeDim.width,
      cy: ((clientY - rect.top) / rect.height) * nativeDim.height,
    };
  };

  const getActiveEvaluatedLayers = () => {
    const hiddenVisualSet = new Set<number>(hiddenVisualTracks);
    const activeEvaluatedLayers: CanvasLayer[] = [];
    for (const layer of layersRef.current) {
      if (
        layer.type === 'media-clip' &&
        hiddenVisualSet.has(layer.trackIndex ?? 0)
      ) {
        continue;
      }
      const ev = evaluateLayerAtTime(
        layer,
        currentTime,
        nativeDim.width,
        nativeDim.height,
        duration
      );
      if (!ev.visible) continue;
      activeEvaluatedLayers.push(ev.layer);
    }
    return activeEvaluatedLayers;
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (interaction) {
      const nextCur =
        interaction.mode === 'rotate'
          ? 'grabbing'
          : getCursorForLayerHandle(interaction.mode, interaction.initialLayer.rotation);
      if (nextCur !== canvasCursor) setCanvasCursor(nextCur);
      return;
    }

    const { cx, cy } = clientToCanvasCoords(e.clientX, e.clientY);
    const activeEvaluatedLayers = getActiveEvaluatedLayers();
    const evaluatedSelected = selectedLayer
      ? activeEvaluatedLayers.find((l) => l.id === selectedLayer.id) ?? null
      : null;

    if (evaluatedSelected && selectedLayer && selectedLayer.visible && !selectedLayer.locked) {
      const handle = hitTestLayerHandle(evaluatedSelected, cx, cy, 36);
      if (handle) {
        const nextCur = getCursorForLayerHandle(handle, evaluatedSelected.rotation);
        if (nextCur !== canvasCursor) setCanvasCursor(nextCur);
        return;
      }
    }

    const hit = hitTestCanvasLayer(activeEvaluatedLayers, cx, cy, scrollingEnabled);
    const nextCur = hit ? 'move' : 'default';
    if (nextCur !== canvasCursor) setCanvasCursor(nextCur);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { cx, cy } = clientToCanvasCoords(e.clientX, e.clientY);
    const activeEvaluatedLayers = getActiveEvaluatedLayers();

    const evaluatedSelected = selectedLayer
      ? activeEvaluatedLayers.find((l) => l.id === selectedLayer.id) ?? null
      : null;

    if (evaluatedSelected && selectedLayer && selectedLayer.visible && !selectedLayer.locked) {
      const handle = hitTestLayerHandle(evaluatedSelected, cx, cy, 36);
      if (handle) {
        setCanvasCursor(
          handle === 'rotate'
            ? 'grabbing'
            : getCursorForLayerHandle(handle, selectedLayer.rotation)
        );
        setInteraction({
          mode: handle,
          layerId: selectedLayer.id,
          startCanvasX: cx,
          startCanvasY: cy,
          initialLayer: { ...selectedLayer },
          snapshotBeforeDrag: layers.map((l) => ({ ...l })),
        });
        return;
      }
    }

    const hit = hitTestCanvasLayer(activeEvaluatedLayers, cx, cy, scrollingEnabled);
    if (hit) {
      const baseLayer = layers.find((l) => l.id === hit.id) ?? hit;
      onSelectLayer(baseLayer.id);
      setCanvasCursor('move');
      setInteraction({
        mode: 'move',
        layerId: baseLayer.id,
        startCanvasX: cx,
        startCanvasY: cy,
        initialLayer: { ...baseLayer },
        snapshotBeforeDrag: layers.map((l) => ({ ...l })),
      });
    } else {
      onSelectLayer(null);
      setCanvasCursor('default');
    }
  };

  useEffect(() => {
    if (!interaction) return;
    let lastPatch: Partial<CanvasLayer> = {};

    // Snapshot visible sibling layers for magnetic layer-to-layer snapping during this drag/resize
    const hiddenVisualSet = new Set<number>(hiddenVisualTracks);
    const siblingLayers: CanvasLayer[] = [];
    for (const l of layersRef.current) {
      if (l.id === interaction.layerId || !l.visible) continue;
      if (l.type === 'media-clip' && hiddenVisualSet.has(l.trackIndex ?? 0)) continue;
      if (
        scrollingEnabled &&
        (l.type === 'lyric-farsi' || l.type === 'lyric-romanized' || l.type === 'lyric-english')
      ) {
        continue;
      }
      if (!scrollingEnabled && l.type === 'scrolling-lyrics') continue;
      const ev = evaluateLayerAtTime(l, currentTime, nativeDim.width, nativeDim.height, duration);
      if (ev.visible) siblingLayers.push(ev.layer);
    }

    const onMove = (e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const cx = ((e.clientX - rect.left) / rect.width) * nativeDim.width;
      const cy = ((e.clientY - rect.top) / rect.height) * nativeDim.height;
      const dx = cx - interaction.startCanvasX;
      const dy = cy - interaction.startCanvasY;
      const init = interaction.initialLayer;
      const useMagnet = canvasSnapEnabled && !e.altKey;

      if (interaction.mode === 'move') {
        if (useMagnet) {
          const snapped = snapLayerPosition(
            init,
            init.x + dx,
            init.y + dy,
            nativeDim.width,
            nativeDim.height,
            18,
            siblingLayers
          );
          const hasGuides =
            snapped.verticalGuides.length > 0 || snapped.horizontalGuides.length > 0;
          onSetSnapGuides(
            hasGuides
              ? {
                  centerX: snapped.snapCenterX,
                  centerY: snapped.snapCenterY,
                  verticalLines: snapped.verticalGuides,
                  horizontalLines: snapped.horizontalGuides,
                }
              : null
          );
          lastPatch = { x: snapped.x, y: snapped.y };
        } else {
          onSetSnapGuides(null);
          lastPatch = { x: Math.round(init.x + dx), y: Math.round(init.y + dy) };
        }
        onPreviewLayerPatch(interaction.layerId, lastPatch);
      } else if (interaction.mode === 'rotate') {
        const centerX = init.x + init.width / 2;
        const centerY = init.y + init.height / 2;
        const angleRad = Math.atan2(cy - centerY, cx - centerX);
        const deg = Math.round(((angleRad * 180) / Math.PI + 90 + 360) % 360);
        const snappedDeg =
          Math.abs(deg) <= 4 || Math.abs(deg - 360) <= 4
            ? 0
            : Math.abs(deg - 90) <= 4
            ? 90
            : Math.abs(deg - 180) <= 4
            ? 180
            : Math.abs(deg - 270) <= 4
            ? 270
            : deg;
        lastPatch = { rotation: snappedDeg };
        onPreviewLayerPatch(interaction.layerId, lastPatch);
      } else {
        const mode = interaction.mode;
        const isSideHandle = mode === 'n' || mode === 's' || mode === 'e' || mode === 'w';
        const lockAspect = isSideHandle ? false : e.shiftKey || init.aspectLocked;
        const resized = resizeLayerByHandle(init, mode, dx, dy, lockAspect);

        let finalBox = resized;
        if (useMagnet) {
          const snappedResize = snapLayerResize(
            init.id,
            resized,
            mode,
            nativeDim.width,
            nativeDim.height,
            18,
            siblingLayers
          );
          finalBox = {
            x: snappedResize.x,
            y: snappedResize.y,
            width: snappedResize.width,
            height: snappedResize.height,
          };
          const hasGuides =
            snappedResize.verticalGuides.length > 0 ||
            snappedResize.horizontalGuides.length > 0;
          onSetSnapGuides(
            hasGuides
              ? {
                  verticalLines: snappedResize.verticalGuides,
                  horizontalLines: snappedResize.horizontalGuides,
                }
              : null
          );
        } else {
          onSetSnapGuides(null);
        }

        // Stretching from any of the 4 sides stretches ONLY that side visibly on images/videos
        const stretchPatch: Partial<CanvasLayer> =
          isSideHandle && (init.type === 'media-clip' || init.type === 'image')
            ? { fitMode: 'stretch', aspectLocked: false }
            : {};

        lastPatch = { ...finalBox, ...stretchPatch };
        onPreviewLayerPatch(interaction.layerId, lastPatch);
      }
    };

    const onUp = () => {
      onSetSnapGuides(null);
      if (Object.keys(lastPatch).length > 0) {
        onCommitLayerPatch(
          interaction.snapshotBeforeDrag,
          interaction.layerId,
          lastPatch
        );
      }
      setInteraction(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [
    interaction,
    canvasRef,
    canvasSnapEnabled,
    currentTime,
    duration,
    hiddenVisualTracks,
    scrollingEnabled,
    nativeDim.width,
    nativeDim.height,
    onPreviewLayerPatch,
    onCommitLayerPatch,
    onSetSnapGuides,
  ]);

  const isCoreLyricLayer =
    selectedLayer?.type === 'scrolling-lyrics' ||
    selectedLayer?.type === 'lyric-farsi' ||
    selectedLayer?.type === 'lyric-romanized' ||
    selectedLayer?.type === 'lyric-english';
  const selectedHasAnimation = selectedLayer ? hasLayerAnimation(selectedLayer) : false;

  const safeDuration = Math.max(1, duration);

  return (
    <section
      aria-label="Video Preview and Professional Timeline Stage"
      className="flex flex-col h-full bg-[#0B0D11] overflow-hidden"
    >
      {/* Compact Icon-First Stage Top Bar (Panel Restore + Ratio + Animate + Layer Quick HUD + Focus Player) */}
      <div className="px-2.5 py-1.5 border-b border-white/8 bg-[#0E1117] flex items-center justify-between gap-2 select-none">
        {/* Left: Restore Left Panel + Aspect Ratio Switcher */}
        <div className="flex items-center gap-1.5 min-w-0">
          {!isPlayerFocusMode && isLeftCollapsed && (
            <IconTooltip tip="Expand Uploaded Media Panel" position="bottom" align="left">
              <button
                type="button"
                onClick={onToggleLeftCollapsed}
                aria-label="Expand Uploaded Media Panel"
                className="p-1.5 rounded-lg bg-[#161A22] hover:bg-[#1F2530] border border-white/10 text-amber-400 cursor-pointer"
              >
                <PanelLeftOpen className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
          )}

          <div
            role="group"
            aria-label="Aspect Ratio"
            className="inline-flex items-center gap-0.5 p-0.5 bg-[#161A22] rounded-lg border border-white/8"
          >
            <IconTooltip tip="16:9 Landscape (1920×1080 Full HD)" position="bottom" align="left">
              <button
                type="button"
                onClick={() => onChangeRatio('16:9')}
                aria-label="16:9 Landscape · 1920×1080"
                aria-pressed={ratio === '16:9'}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  ratio === '16:9'
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
                <span>16:9</span>
              </button>
            </IconTooltip>
            <IconTooltip tip="9:16 Portrait Shorts/Reels (1080×1920)" position="bottom">
              <button
                type="button"
                onClick={() => onChangeRatio('9:16')}
                aria-label="9:16 Portrait · 1080×1920"
                aria-pressed={ratio === '9:16'}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  ratio === '9:16'
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                <span>9:16</span>
              </button>
            </IconTooltip>
          </div>
        </div>

        {/* Center: Compact Selected Layer Quick Icon Strip + Animate Button */}
        {!isPlayerFocusMode && selectedLayer && (
          <div
            data-testid="canvas-layer-hud"
            className="hidden sm:flex items-center gap-1 text-[11px] min-w-0"
          >
            <span className="font-medium text-amber-300 truncate max-w-[140px] mr-0.5">
              {formatLayerDisplayLabel(selectedLayer)}
            </span>
            <IconTooltip tip="Animate layer & add keyframes" position="bottom">
              <button
                type="button"
                onClick={() => onOpenAnimateForLayer(selectedLayer.id)}
                aria-label="Animate selected layer"
                data-testid="stage-animate-btn"
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-300 text-[10px] font-semibold cursor-pointer"
              >
                <Clapperboard className="w-3 h-3" aria-hidden="true" />
                <span>Animate</span>
              </button>
            </IconTooltip>
            {onAutoBlendLayer &&
              (selectedLayer.type === 'media-clip' || selectedLayer.type === 'image') && (
                <IconTooltip
                  tip="Auto-remove Green / Black / Checkerboard BG & blend smoothly into background"
                  position="bottom"
                >
                  <button
                    type="button"
                    onClick={() => onAutoBlendLayer(selectedLayer.id)}
                    aria-label="Auto blend background for selected layer"
                    data-testid="stage-auto-blend-btn"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/40 text-sky-200 text-[10px] font-semibold cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" aria-hidden="true" />
                    <span>Blend BG</span>
                  </button>
                </IconTooltip>
              )}
            {selectedHasAnimation && (
              <IconTooltip tip="Delete applied animation & keyframes from this layer" position="bottom">
                <button
                  type="button"
                  onClick={() => onClearLayerAnimation(selectedLayer.id)}
                  aria-label="Delete animation from selected layer"
                  data-testid="stage-clear-animation-btn"
                  className="inline-flex items-center gap-1 px-1.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px] font-medium cursor-pointer"
                >
                  <Eraser className="w-3 h-3" aria-hidden="true" />
                  <span>Del Anim</span>
                </button>
              </IconTooltip>
            )}
            <IconTooltip tip="Lock aspect ratio (or hold Shift)" position="bottom">
              <button
                type="button"
                onClick={() => onToggleLayerAspect(selectedLayer.id)}
                aria-label="Lock aspect ratio"
                aria-pressed={selectedLayer.aspectLocked}
                className={`p-1 rounded border cursor-pointer ${
                  selectedLayer.aspectLocked
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-[#1A1F2B] border-white/8 text-zinc-400 hover:text-white'
                }`}
              >
                <Link2 className="w-3 h-3" aria-hidden="true" />
              </button>
            </IconTooltip>
            <IconTooltip tip={selectedLayer.locked ? 'Unlock layer' : 'Lock layer'} position="bottom">
              <button
                type="button"
                onClick={() => onToggleLayerLock(selectedLayer.id)}
                aria-label={selectedLayer.locked ? 'Unlock selected layer' : 'Lock selected layer'}
                className="p-1 rounded bg-[#1A1F2B] border border-white/8 text-zinc-300 hover:text-white cursor-pointer"
              >
                {selectedLayer.locked ? (
                  <Lock className="w-3 h-3 text-amber-400" aria-hidden="true" />
                ) : (
                  <Unlock className="w-3 h-3" aria-hidden="true" />
                )}
              </button>
            </IconTooltip>
            <IconTooltip tip={selectedLayer.visible ? 'Hide layer' : 'Show layer'} position="bottom">
              <button
                type="button"
                onClick={() => onToggleLayerVisible(selectedLayer.id)}
                aria-label={selectedLayer.visible ? 'Hide selected layer' : 'Show selected layer'}
                className="p-1 rounded bg-[#1A1F2B] border border-white/8 text-zinc-300 hover:text-white cursor-pointer"
              >
                {selectedLayer.visible ? (
                  <Eye className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <EyeOff className="w-3 h-3 text-zinc-500" aria-hidden="true" />
                )}
              </button>
            </IconTooltip>
            <IconTooltip tip="Bring layer forward" position="bottom">
              <button
                type="button"
                onClick={() => onBringLayerForward(selectedLayer.id)}
                aria-label="Bring selected layer forward"
                className="p-1 rounded bg-[#1A1F2B] border border-white/8 text-zinc-300 hover:text-white cursor-pointer"
              >
                <ArrowUp className="w-3 h-3" aria-hidden="true" />
              </button>
            </IconTooltip>
            <IconTooltip tip="Send layer backward" position="bottom">
              <button
                type="button"
                onClick={() => onSendLayerBackward(selectedLayer.id)}
                aria-label="Send selected layer backward"
                className="p-1 rounded bg-[#1A1F2B] border border-white/8 text-zinc-300 hover:text-white cursor-pointer"
              >
                <ArrowDown className="w-3 h-3" aria-hidden="true" />
              </button>
            </IconTooltip>
            <IconTooltip tip="Duplicate layer" position="bottom">
              <button
                type="button"
                onClick={() => onDuplicateLayer(selectedLayer.id)}
                aria-label="Duplicate selected layer"
                className="p-1 rounded bg-[#1A1F2B] border border-white/8 text-zinc-300 hover:text-white cursor-pointer"
              >
                <Copy className="w-3 h-3" aria-hidden="true" />
              </button>
            </IconTooltip>
            <IconTooltip
              tip={
                isCoreLyricLayer
                  ? selectedHasAnimation
                    ? 'Delete animation from lyric layer'
                    : 'Hide lyric layer'
                  : 'Delete selected element (Del)'
              }
              position="bottom"
            >
              <button
                type="button"
                onClick={() => onDeleteLayer(selectedLayer.id)}
                aria-label="Delete selected layer"
                data-testid="stage-delete-layer-btn"
                className="p-1 rounded bg-[#1A1F2B] border border-white/8 text-zinc-400 hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
              </button>
            </IconTooltip>
          </div>
        )}

        {/* Right: Canvas Magnet + Safe Margins + Focus Player Only + Restore Right Panel */}
        <div className="flex items-center gap-1.5">
          <IconTooltip
            tip={
              canvasSnapEnabled
                ? 'Canvas Magnetic Snap: ON (layers stick to edges, center & each other · Hold Alt to bypass)'
                : 'Canvas Magnetic Snap: OFF'
            }
            position="bottom"
            align="right"
          >
            <button
              type="button"
              onClick={() => setCanvasSnapEnabled((v) => !v)}
              aria-label="Toggle canvas magnetic snapping"
              aria-pressed={canvasSnapEnabled}
              data-testid="canvas-magnet-btn"
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                canvasSnapEnabled
                  ? 'bg-amber-500/18 border-amber-500/45 text-amber-300'
                  : 'bg-[#161A22] border-white/8 text-zinc-400 hover:text-white'
              }`}
            >
              <Magnet className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip tip="Toggle YouTube/Shorts Safe Margins" position="bottom" align="right">
            <button
              type="button"
              onClick={onToggleSafeZones}
              aria-label="Safe Margins"
              aria-pressed={showSafeZones}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                showSafeZones
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#161A22] border-white/8 text-zinc-300 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip
            tip={isPlayerFocusMode ? 'Exit Focus Player (Restore Editor & Timeline)' : 'Focus Player Only (Hide Panels & Timeline)'}
            position="bottom"
            align="right"
          >
            <button
              type="button"
              onClick={onTogglePlayerFocusMode}
              aria-label={isPlayerFocusMode ? 'Exit focus player mode' : 'Focus player only'}
              aria-pressed={isPlayerFocusMode}
              data-testid="focus-player-btn"
              className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                isPlayerFocusMode
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 font-semibold'
                  : 'bg-[#161A22] border-white/8 text-zinc-300 hover:text-white'
              }`}
            >
              {isPlayerFocusMode ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Exit Focus</span>
                </>
              ) : (
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </IconTooltip>

          {!isPlayerFocusMode && isRightCollapsed && (
            <IconTooltip tip="Expand Lyrics & Effects Panel" position="bottom" align="right">
              <button
                type="button"
                onClick={onToggleRightCollapsed}
                aria-label="Expand Lyrics & Effects Panel"
                className="p-1.5 rounded-lg bg-[#161A22] hover:bg-[#1F2530] border border-white/10 text-amber-400 cursor-pointer"
              >
                <PanelRightOpen className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
          )}
        </div>
      </div>

      {/* Live Interactive Canvas Viewport — Exact 16:9 / 9:16 fit with ZERO black pillarboxes */}
      <div
        ref={stageContainerRef}
        className="flex-1 min-h-0 h-[40vh] lg:h-auto flex items-center justify-center p-2 bg-[#080A0E] overflow-hidden select-none"
      >
        <div
          data-testid="canvas-frame-wrapper"
          className="relative rounded-lg overflow-hidden border border-white/12 shadow-2xl bg-[#090B0F]"
          style={
            frameBox
              ? { width: `${frameBox.w}px`, height: `${frameBox.h}px` }
              : {
                  aspectRatio: ratio === '16:9' ? '16 / 9' : '9 / 16',
                  maxWidth: '100%',
                  maxHeight: '100%',
                }
          }
        >
          <canvas
            ref={canvasRef}
            data-testid="studio-canvas"
            data-ratio={ratio}
            data-cursor={canvasCursor}
            onPointerMove={handleCanvasPointerMove}
            onPointerLeave={() => {
              if (!interaction) setCanvasCursor('default');
            }}
            onPointerDown={handleCanvasPointerDown}
            style={{ cursor: canvasCursor }}
            className="w-full h-full block touch-none"
          />
        </div>
      </div>

      {/* Player Review Transport Bar (Play, Forward/Back 5s, Frame Step, Scrubber, Loop, Mute) */}
      <div
        data-testid="player-review-controls"
        className="px-3 py-1.5 border-t border-white/8 bg-[#0E1117] flex flex-col gap-1.5 select-none"
      >
        {/* Interactive Player Review Scrubber */}
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-mono tabular-nums text-zinc-200 w-14 shrink-0">
            {formatTimecode(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={safeDuration}
            step={0.05}
            aria-label="Player review scrubber"
            value={Math.min(safeDuration, currentTime)}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="flex-1 h-1.5 accent-amber-500 cursor-pointer"
          />
          <span className="text-[11px] font-mono tabular-nums text-zinc-500 w-14 text-right shrink-0">
            {formatTimecode(safeDuration)}
          </span>
        </div>

        {/* Full Player Review Buttons Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Mute & Loop */}
          <div className="flex items-center gap-1">
            <IconTooltip tip={isMuted ? 'Unmute audio' : 'Mute audio'} align="left">
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                aria-pressed={isMuted}
                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                  isMuted
                    ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                    : 'bg-[#161A22] border-white/8 text-zinc-300 hover:text-white'
                }`}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            </IconTooltip>
            <IconTooltip tip={isLooping ? 'Loop preview: On' : 'Loop preview: Off'}>
              <button
                type="button"
                onClick={onToggleLoop}
                aria-label={isLooping ? 'Disable loop preview' : 'Enable loop preview'}
                aria-pressed={isLooping}
                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                  isLooping
                    ? 'bg-amber-500/20 border-amber-500/45 text-amber-300'
                    : 'bg-[#161A22] border-white/8 text-zinc-400 hover:text-white'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
          </div>

          {/* Center: Start, -5s, -0.5s, Play/Pause, +0.5s, +5s, End */}
          <div className="flex items-center gap-1">
            <IconTooltip tip="Jump to start (00:00)">
              <button
                type="button"
                onClick={onRestart}
                aria-label="Restart from beginning"
                className="p-1.5 rounded-md bg-[#161A22] hover:bg-[#212735] text-zinc-300 hover:text-white border border-white/8 cursor-pointer"
              >
                <SkipBack className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
            <IconTooltip tip="Skip backward 5 seconds">
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, currentTime - 5))}
                aria-label="Skip backward 5 seconds"
                className="p-1.5 rounded-md bg-[#161A22] hover:bg-[#212735] text-zinc-300 hover:text-white border border-white/8 cursor-pointer"
              >
                <Rewind className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
            <IconTooltip tip="Step backward 0.5s">
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, currentTime - 0.5))}
                aria-label="Step backward 0.5 seconds"
                className="p-1.5 rounded-md bg-[#161A22] hover:bg-[#212735] text-zinc-300 hover:text-white border border-white/8 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
            <IconTooltip tip={isPlaying ? 'Pause review (Space)' : 'Play review (Space)'}>
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause playback' : 'Play preview'}
                className="inline-flex items-center justify-center w-9 h-8 mx-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer shadow"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" aria-hidden="true" />
                )}
              </button>
            </IconTooltip>
            <IconTooltip tip="Step forward 0.5s">
              <button
                type="button"
                onClick={() => onSeek(Math.min(safeDuration, currentTime + 0.5))}
                aria-label="Step forward 0.5 seconds"
                className="p-1.5 rounded-md bg-[#161A22] hover:bg-[#212735] text-zinc-300 hover:text-white border border-white/8 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
            <IconTooltip tip="Skip forward 5 seconds">
              <button
                type="button"
                onClick={() => onSeek(Math.min(safeDuration, currentTime + 5))}
                aria-label="Skip forward 5 seconds"
                className="p-1.5 rounded-md bg-[#161A22] hover:bg-[#212735] text-zinc-300 hover:text-white border border-white/8 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
            <IconTooltip tip="Jump to end">
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, safeDuration - 0.1))}
                aria-label="Jump to end of video"
                className="p-1.5 rounded-md bg-[#161A22] hover:bg-[#212735] text-zinc-300 hover:text-white border border-white/8 cursor-pointer"
              >
                <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
          </div>

          {/* Right: Live Resolution Indicator (compact monospace) */}
          <span className="hidden sm:inline text-[10px] font-mono tabular-nums text-zinc-500">
            {nativeDim.width}×{nativeDim.height}
          </span>
        </div>
      </div>

      {/* Professional Video-Editing Timeline (HIDDEN in Player-Only Focus Mode!) */}
      {!isPlayerFocusMode && (
        <TimelineEditor
          currentTime={currentTime}
          duration={duration}
          globalOffset={globalOffset}
          isMuted={isMuted}
          cues={cues}
          enabledTracks={enabledTracks}
          onToggleTrack={onToggleTrack}
          visualVisible={visualVisible}
          visualLocked={visualLocked}
          onToggleVisualVisible={onToggleVisualVisible}
          onToggleVisualLocked={onToggleVisualLocked}
          visualTrackCount={visualTrackCount}
          audioTrackCount={audioTrackCount}
          hiddenVisualTracks={hiddenVisualTracks}
          lockedVisualTracks={lockedVisualTracks}
          mutedAudioTracks={mutedAudioTracks}
          lockedAudioTracks={lockedAudioTracks}
          onAddVisualTrack={onAddVisualTrack}
          onRemoveVisualTrack={onRemoveVisualTrack}
          onAddAudioTrack={onAddAudioTrack}
          onRemoveAudioTrack={onRemoveAudioTrack}
          onToggleVisualTrackVisible={onToggleVisualTrackVisible}
          onToggleVisualTrackLocked={onToggleVisualTrackLocked}
          onToggleAudioTrackMuted={onToggleAudioTrackMuted}
          onToggleAudioTrackLocked={onToggleAudioTrackLocked}
          onSelectAllOnVisualTrack={onSelectAllOnVisualTrack}
          onSelectAllOnAudioTrack={onSelectAllOnAudioTrack}
          visualClips={visualClips}
          audioClips={audioClips}
          effectClips={effectClips}
          layers={layers}
          selectedLayerId={selectedLayerId}
          onSelectLayer={onSelectLayer}
          onOpenAnimateForLayer={onOpenAnimateForLayer}
          onOpenBeatFx={onOpenBeatFx}
          onPreviewVisualClip={onPreviewVisualClip}
          onCommitVisualClip={onCommitVisualClip}
          onPreviewAudioClip={onPreviewAudioClip}
          onCommitAudioClip={onCommitAudioClip}
          onPreviewEffectClip={onPreviewEffectClip}
          onCommitEffectClip={onCommitEffectClip}
          selectedItems={selectedItems}
          onSetSelectedItems={onSetSelectedItems}
          onSelectAllOnTrack={onSelectAllOnTrack}
          hasClipboard={hasClipboard}
          onCopySelected={onCopySelected}
          onCutSelected={onCutSelected}
          onPasteAtPlayhead={onPasteAtPlayhead}
          onDeleteSelected={onDeleteSelected}
          onSplitAtPlayhead={onSplitAtPlayhead}
          onClearAllLyrics={onClearAllLyrics}
          beatTimes={beatTimes}
          selectedCueId={selectedCueId}
          syncTargetIndex={syncTargetIndex}
          waveformPeaks={waveformPeaks}
          activeAudioName={activeAudioName}
          markers={markers}
          canUndo={canUndo}
          canRedo={canRedo}
          onToggleMute={onToggleMute}
          onSeek={onSeek}
          onSelectCue={onSelectCue}
          onSelectSyncTarget={onSelectSyncTarget}
          onStampNextLine={onStampNextLine}
          onChangeGlobalOffset={onChangeGlobalOffset}
          onPreviewCueTiming={onPreviewCueTiming}
          onCommitCueTiming={onCommitCueTiming}
          onAddMarker={onAddMarker}
          onRemoveMarker={onRemoveMarker}
          onUndo={onUndo}
          onRedo={onRedo}
          autoRipple={autoRipple}
          onToggleAutoRipple={onToggleAutoRipple}
        />
      )}
    </section>
  );
}
