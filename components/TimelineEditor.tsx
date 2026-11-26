'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Scissors,
  Copy,
  ClipboardPaste,
  ClipboardX,
  Trash2,
  ListX,
  CheckSquare,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Magnet,
  BookmarkPlus,
  Crosshair,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Film,
  Music,
  Languages,
  Type,
  Subtitles,
  Clock,
  Sparkles,
  Layers,
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  ArrowLeftToLine,
  BoxSelect,
  MoveHorizontal,
} from 'lucide-react';
import {
  EnabledTracks,
  LyricCue,
  formatTimecode,
} from '@/lib/lyrics-parser';
import { CanvasLayer, getClipLayerId, hasLayerAnimation } from '@/lib/canvas-layers';
import {
  AudioTimelineClip,
  PlayheadSnapResult,
  TimedEffectClip,
  VisualTimelineClip,
  collectTimelineSnapTargets,
  computeRulerTickStep,
  computeTimelineDisplayDuration,
  getAudioTrackCount,
  getVisualTrackCount,
  selectCuesInTimeRange,
  sliceWaveformPeaksForClip,
  snapClipEdgeToTargets,
  snapClipMoveToTargets,
  snapPlayheadToElements,
  trimAudioClipLeft,
  trimAudioClipRight,
} from '@/lib/timeline-engine';
import { IconTooltip } from './TooltipButton';

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
}

export type TimelineSelectionTrack = 'visual' | 'audio' | 'fx' | 'cue';

export interface TimelineSelectionItem {
  track: TimelineSelectionTrack;
  id: string;
}

export interface TimelineTrackLocks {
  audio: boolean;
  fx: boolean;
  primary: boolean;
  roman: boolean;
  english: boolean;
}

interface TimelineEditorProps {
  currentTime: number;
  duration: number;
  globalOffset: number;
  isMuted: boolean;
  cues: LyricCue[];
  enabledTracks: EnabledTracks;
  onToggleTrack: (track: keyof EnabledTracks) => void;
  visualVisible: boolean;
  visualLocked: boolean;
  onToggleVisualVisible: () => void;
  onToggleVisualLocked: () => void;
  // Multi-track Video/Image & Audio Layer Controls
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
  // Multi-clip tracks
  visualClips: VisualTimelineClip[];
  audioClips: AudioTimelineClip[];
  effectClips: TimedEffectClip[];
  layers: CanvasLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onOpenAnimateForLayer?: (id: string) => void;
  onOpenBeatFx?: () => void;
  // Clip editing callbacks
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
  // Multi-selection & clipboard
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
  // Legacy / waveform / markers
  beatTimes: number[];
  selectedCueId: string | null;
  syncTargetIndex: number;
  waveformPeaks: number[];
  waveformPeaksByUrl?: Record<string, number[]>;
  activeAudioName: string | null;
  markers: TimelineMarker[];
  canUndo: boolean;
  canRedo: boolean;
  onToggleMute: () => void;
  onSeek: (time: number) => void;
  onSelectCue: (id: string | null, index?: number) => void;
  onSelectSyncTarget: (idx: number) => void;
  onStampNextLine: () => void;
  onChangeGlobalOffset: (nextOffset: number) => void;
  onPreviewCueTiming: (id: string, startTime: number, endTime: number) => void;
  onCommitCueTiming: (
    beforeCues: LyricCue[],
    id: string,
    startTime: number,
    endTime: number
  ) => void;
  onPreviewShiftSelectedCues: (
    beforeCues: LyricCue[],
    selectedIds: string[],
    deltaSec: number
  ) => void;
  onCommitShiftSelectedCues: (
    beforeCues: LyricCue[],
    selectedIds: string[],
    deltaSec: number
  ) => void;
  onAddMarker: (time: number) => void;
  onRemoveMarker: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  autoRipple: boolean;
  onToggleAutoRipple: () => void;
  maxBodyHeightPx?: number;
}

type DragOperation =
  | {
      kind: 'cue';
      mode: 'move' | 'resize-left' | 'resize-right';
      id: string;
      selectedIds: string[];
      groupMinStart: number;
      groupMaxEnd: number;
      startX: number;
      origStart: number;
      origEnd: number;
      snapshot: LyricCue[];
    }
  | {
      kind: 'visual';
      mode: 'move' | 'resize-left' | 'resize-right';
      id: string;
      startX: number;
      startY: number;
      origStart: number;
      origEnd: number;
      origSourceStart: number;
      origTrackIndex: number;
      isVideo: boolean;
      snapshot: VisualTimelineClip[];
    }
  | {
      kind: 'audio';
      mode: 'move' | 'resize-left' | 'resize-right' | 'fade-in' | 'fade-out';
      id: string;
      startX: number;
      startY: number;
      origStart: number;
      origEnd: number;
      origSourceStart: number;
      origSourceDuration: number;
      origTrackIndex: number;
      origFadeIn: number;
      origFadeOut: number;
      snapshot: AudioTimelineClip[];
    }
  | {
      kind: 'fx';
      mode: 'move' | 'resize-left' | 'resize-right';
      id: string;
      startX: number;
      origStart: number;
      origEnd: number;
      snapshot: TimedEffectClip[];
    };

interface MarqueeSelectionState {
  startX: number;
  currentX: number;
  startTime: number;
  currentTime: number;
  active: boolean;
  additive: boolean;
  initialCueIds: string[];
}

const HEADER_WIDTH = 144;
const VISUAL_ROW_HEIGHT = 40;
const AUDIO_ROW_HEIGHT = 40;

function clearDomSelection() {
  if (typeof window !== 'undefined') {
    window.getSelection()?.removeAllRanges();
  }
}

export default function TimelineEditor({
  currentTime,
  duration,
  globalOffset,
  isMuted,
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
  layers,
  selectedLayerId,
  onSelectLayer,
  onOpenAnimateForLayer,
  onOpenBeatFx,
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
  syncTargetIndex,
  waveformPeaks,
  waveformPeaksByUrl,
  activeAudioName,
  markers,
  canUndo,
  canRedo,
  onToggleMute,
  onSeek,
  onSelectCue,
  onSelectSyncTarget,
  onStampNextLine,
  onChangeGlobalOffset,
  onPreviewCueTiming,
  onCommitCueTiming,
  onPreviewShiftSelectedCues,
  onCommitShiftSelectedCues,
  onAddMarker,
  onRemoveMarker,
  onUndo,
  onRedo,
  autoRipple,
  onToggleAutoRipple,
  maxBodyHeightPx,
}: TimelineEditorProps) {
  const effectiveVisualTrackCount = Math.max(
    1,
    visualTrackCount,
    getVisualTrackCount(visualClips)
  );
  const effectiveAudioTrackCount = Math.max(
    1,
    audioTrackCount,
    getAudioTrackCount(audioClips)
  );
  const hiddenVisualSet = useMemo(
    () => new Set<number>(hiddenVisualTracks),
    [hiddenVisualTracks]
  );
  const lockedVisualSet = useMemo(
    () => new Set<number>(lockedVisualTracks),
    [lockedVisualTracks]
  );
  const mutedAudioSet = useMemo(
    () => new Set<number>(mutedAudioTracks),
    [mutedAudioTracks]
  );
  const lockedAudioSet = useMemo(
    () => new Set<number>(lockedAudioTracks),
    [lockedAudioTracks]
  );

  const [zoom, setZoom] = useState<number>(1);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [lyricBoxSelectMode, setLyricBoxSelectMode] = useState<boolean>(false);
  const [activeSnapGuideTime, setActiveSnapGuideTime] = useState<number | null>(null);
  const [playheadSnapInfo, setPlayheadSnapInfo] = useState<PlayheadSnapResult | null>(null);
  const [playheadSnapPulse, setPlayheadSnapPulse] = useState<boolean>(false);
  const [marquee, setMarquee] = useState<MarqueeSelectionState | null>(null);
  const [dragOp, setDragOp] = useState<DragOperation | null>(null);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [trackLocks, setTrackLocks] = useState<TimelineTrackLocks>({
    audio: false,
    fx: false,
    primary: false,
    roman: false,
    english: false,
  });

  const lastPlayheadSnapTimeRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const trackViewportRef = useRef<HTMLDivElement>(null);
  const [availableTrackWidth, setAvailableTrackWidth] = useState<number>(640);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = Math.max(320, Math.floor(el.clientWidth - HEADER_WIDTH));
      setAvailableTrackWidth(next);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute max content time across project & clips, then give ~50% breathing room at 1x zoom
  const contentMaxTime = useMemo(() => {
    let maxT = Math.max(4, duration);
    for (const c of visualClips) maxT = Math.max(maxT, c.endTime);
    for (const c of audioClips) maxT = Math.max(maxT, c.endTime);
    for (const c of effectClips) maxT = Math.max(maxT, c.endTime);
    for (const c of cues) maxT = Math.max(maxT, c.endTime);
    return maxT;
  }, [duration, visualClips, audioClips, effectClips, cues]);

  const displayDuration = useMemo(
    () => computeTimelineDisplayDuration(contentMaxTime),
    [contentMaxTime]
  );

  // At 1x zoom, the entire displayDuration fits availableTrackWidth so the audio file occupies ~50% of the visible timeline width!
  const trackPixelWidth = Math.round(Math.max(460, availableTrackWidth) * zoom);

  const toggleTrackLock = (key: keyof TimelineTrackLocks) => {
    setTrackLocks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const snapTime = useCallback(
    (t: number): number => {
      if (!snapEnabled) return Number(Math.max(0, t).toFixed(2));
      const step = zoom >= 3 ? 0.05 : 0.1;
      return Number((Math.round(Math.max(0, t) / step) * step).toFixed(2));
    },
    [snapEnabled, zoom]
  );

  const clientXToTime = useCallback(
    (clientX: number): number => {
      const container = scrollContainerRef.current;
      if (!container) return 0;
      const rect = container.getBoundingClientRect();
      const xInsideTrack = clientX - rect.left - HEADER_WIDTH + container.scrollLeft;
      const t = (xInsideTrack / trackPixelWidth) * displayDuration;
      return Math.max(0, Math.min(displayDuration, t));
    },
    [displayDuration, trackPixelWidth]
  );

  // Selection helpers
  const isItemSelected = useCallback(
    (track: TimelineSelectionTrack, id: string): boolean => {
      return selectedItems.some((s) => s.track === track && s.id === id);
    },
    [selectedItems]
  );

  const handleSelectItem = useCallback(
    (
      track: TimelineSelectionTrack,
      id: string,
      multiModifier: boolean,
      cueIndex?: number
    ) => {
      if (multiModifier) {
        const exists = selectedItems.some((s) => s.track === track && s.id === id);
        if (exists) {
          onSetSelectedItems(
            selectedItems.filter((s) => !(s.track === track && s.id === id))
          );
        } else {
          // Keep items from same track when multi-selecting for clean copy/cut/paste
          const sameTrack = selectedItems.filter((s) => s.track === track);
          onSetSelectedItems([...sameTrack, { track, id }]);
        }
      } else {
        onSetSelectedItems([{ track, id }]);
      }
      if (track === 'cue') {
        onSelectCue(id, cueIndex);
      }
    },
    [onSelectCue, onSetSelectedItems, selectedItems]
  );

  const triggerPlayheadSnapFeedback = useCallback((snapTimeVal: number) => {
    if (
      lastPlayheadSnapTimeRef.current !== null &&
      Math.abs(lastPlayheadSnapTimeRef.current - snapTimeVal) < 0.04
    ) {
      return;
    }
    lastPlayheadSnapTimeRef.current = snapTimeVal;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignore browser vibration restrictions
      }
    }
    setPlayheadSnapPulse(true);
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current);
    }
    pulseTimerRef.current = window.setTimeout(() => {
      setPlayheadSnapPulse(false);
    }, 190);
  }, []);

  const seekWithPlayheadMagnet = useCallback(
    (clientX: number, bypassMagnet: boolean) => {
      const rawTime = clientXToTime(clientX);
      if (snapEnabled && !bypassMagnet) {
        const thresholdSec = Math.max(
          0.12,
          (11 / Math.max(200, trackPixelWidth)) * displayDuration
        );
        const snap = snapPlayheadToElements({
          candidateTime: rawTime,
          thresholdSec,
          visualClips,
          audioClips,
          effectClips,
          cues,
          markers,
          maxDuration: displayDuration,
        });
        if (snap.snapped) {
          setPlayheadSnapInfo(snap);
          setActiveSnapGuideTime(snap.time);
          triggerPlayheadSnapFeedback(snap.time);
          onSeek(snap.time);
          return;
        }
      }
      lastPlayheadSnapTimeRef.current = null;
      setPlayheadSnapInfo(null);
      setActiveSnapGuideTime(null);
      onSeek(rawTime);
    },
    [
      audioClips,
      clientXToTime,
      cues,
      displayDuration,
      effectClips,
      markers,
      onSeek,
      snapEnabled,
      trackPixelWidth,
      triggerPlayheadSnapFeedback,
      visualClips,
    ]
  );

  // Playhead scrubbing — magnetically grabs element starts/ends with visual pulse & haptic feedback
  useEffect(() => {
    if (!isScrubbing) return;
    clearDomSelection();
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      clearDomSelection();
      seekWithPlayheadMagnet(e.clientX, e.altKey);
    };
    const onUp = () => {
      setIsScrubbing(false);
      setActiveSnapGuideTime(null);
      setPlayheadSnapInfo(null);
      lastPlayheadSnapTimeRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isScrubbing, seekWithPlayheadMagnet]);

  // Left-click drag Marquee Selection across lyric tracks
  useEffect(() => {
    if (!marquee) return;
    clearDomSelection();
    let didActivate = marquee.active;
    let latestTime = marquee.currentTime;

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      clearDomSelection();
      const dx = Math.abs(e.clientX - marquee.startX);
      if (!didActivate && dx >= 5) {
        didActivate = true;
      }
      latestTime = clientXToTime(e.clientX);
      setMarquee((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentTime: latestTime,
              active: didActivate,
            }
          : null
      );
      if (didActivate) {
        const hitIds = selectCuesInTimeRange(cues, marquee.startTime, latestTime);
        const merged = marquee.additive
          ? Array.from(new Set([...marquee.initialCueIds, ...hitIds]))
          : hitIds;
        onSetSelectedItems(merged.map((id) => ({ track: 'cue' as const, id })));
        if (merged.length > 0) {
          const firstIdx = cues.findIndex((c) => c.id === merged[0]);
          onSelectCue(merged[0], firstIdx >= 0 ? firstIdx : undefined);
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!didActivate) {
        // Simple click without dragging -> deselect and seek playhead
        onSelectCue(null);
        onSetSelectedItems([]);
        seekWithPlayheadMagnet(e.clientX, e.altKey);
      }
      setMarquee(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [
    marquee,
    clientXToTime,
    cues,
    onSelectCue,
    onSetSelectedItems,
    seekWithPlayheadMagnet,
  ]);

  const dragContextRef = useRef({
    trackPixelWidth,
    displayDuration,
    effectiveVisualTrackCount,
    effectiveAudioTrackCount,
    snapEnabled,
    snapTime,
    visualClips,
    audioClips,
    effectClips,
    cues,
    markers,
    currentTime,
    onPreviewCueTiming,
    onCommitCueTiming,
    onPreviewShiftSelectedCues,
    onCommitShiftSelectedCues,
    onPreviewVisualClip,
    onCommitVisualClip,
    onPreviewAudioClip,
    onCommitAudioClip,
    onPreviewEffectClip,
    onCommitEffectClip,
  });

  useEffect(() => {
    dragContextRef.current = {
      trackPixelWidth,
      displayDuration,
      effectiveVisualTrackCount,
      effectiveAudioTrackCount,
      snapEnabled,
      snapTime,
      visualClips,
      audioClips,
      effectClips,
      cues,
      markers,
      currentTime,
      onPreviewCueTiming,
      onCommitCueTiming,
      onPreviewShiftSelectedCues,
      onCommitShiftSelectedCues,
      onPreviewVisualClip,
      onCommitVisualClip,
      onPreviewAudioClip,
      onCommitAudioClip,
      onPreviewEffectClip,
      onCommitEffectClip,
    };
  });

  // Unified drag / trim / group-lyric-move / magnetic snap / vertical track-reordering / audio-fade handling
  // Depends ONLY on [dragOp] so live preview updates never reset latestStart/latestEnd/latestSourceStart before pointerup!
  useEffect(() => {
    if (!dragOp) return;
    clearDomSelection();

    const startCtx = dragContextRef.current;

    let latestStart = dragOp.origStart;
    let latestEnd = dragOp.origEnd;
    let latestGroupDelta = 0;
    let latestSourceStart =
      dragOp.kind === 'visual' || dragOp.kind === 'audio' ? dragOp.origSourceStart : 0;
    let latestTrackIndex =
      dragOp.kind === 'visual' || dragOp.kind === 'audio' ? dragOp.origTrackIndex : 0;
    let latestFadeIn = dragOp.kind === 'audio' ? dragOp.origFadeIn : 0;
    let latestFadeOut = dragOp.kind === 'audio' ? dragOp.origFadeOut : 0;

    // Collect magnetic snap anchors once at drag start (all non-moving clip edges, playhead, markers, 0s)
    const excludedCueIds =
      dragOp.kind === 'cue' ? new Set(dragOp.selectedIds) : null;
    const snapTargets = collectTimelineSnapTargets({
      visualClips: dragOp.kind === 'visual' ? dragOp.snapshot : startCtx.visualClips,
      audioClips: dragOp.kind === 'audio' ? dragOp.snapshot : startCtx.audioClips,
      effectClips: dragOp.kind === 'fx' ? dragOp.snapshot : startCtx.effectClips,
      cues:
        dragOp.kind === 'cue'
          ? dragOp.snapshot.filter((c) => !excludedCueIds?.has(c.id))
          : startCtx.cues,
      markers: startCtx.markers,
      currentTime: startCtx.currentTime,
      excludeId: dragOp.kind === 'cue' ? undefined : dragOp.id,
    });

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      clearDomSelection();
      const ctx = dragContextRef.current;
      const magneticThresholdSec = Math.max(
        0.1,
        (10 / Math.max(200, ctx.trackPixelWidth)) * ctx.displayDuration
      );
      const deltaPx = e.clientX - dragOp.startX;
      const deltaSec = (deltaPx / ctx.trackPixelWidth) * ctx.displayDuration;
      const clipDur = Math.max(0.25, dragOp.origEnd - dragOp.origStart);
      const useMagnet = ctx.snapEnabled && !e.altKey;

      if (dragOp.kind === 'audio' && dragOp.mode === 'fade-in') {
        latestFadeIn = Number(
          Math.max(0, Math.min(clipDur * 0.5, dragOp.origFadeIn + deltaSec)).toFixed(2)
        );
        ctx.onPreviewAudioClip(dragOp.id, { fadeIn: latestFadeIn });
        return;
      }

      if (dragOp.kind === 'audio' && dragOp.mode === 'fade-out') {
        latestFadeOut = Number(
          Math.max(0, Math.min(clipDur * 0.5, dragOp.origFadeOut - deltaSec)).toFixed(2)
        );
        ctx.onPreviewAudioClip(dragOp.id, { fadeOut: latestFadeOut });
        return;
      }

      // Multi-selected lyric group drag: slides ALL selected cues forward or backward together!
      if (dragOp.kind === 'cue' && dragOp.mode === 'move' && dragOp.selectedIds.length > 1) {
        const groupDur = Math.max(0.25, dragOp.groupMaxEnd - dragOp.groupMinStart);
        let nextGroupStart: number;
        if (useMagnet) {
          const snapped = snapClipMoveToTargets(
            dragOp.groupMinStart + deltaSec,
            groupDur,
            snapTargets,
            magneticThresholdSec,
            ctx.displayDuration - 0.25
          );
          nextGroupStart = snapped.startTime;
          setActiveSnapGuideTime(snapped.guideTime);
        } else {
          nextGroupStart = Math.max(
            0,
            Math.min(ctx.displayDuration - 0.25, ctx.snapTime(dragOp.groupMinStart + deltaSec))
          );
          setActiveSnapGuideTime(null);
        }
        latestGroupDelta = Number((nextGroupStart - dragOp.groupMinStart).toFixed(2));
        ctx.onPreviewShiftSelectedCues(dragOp.snapshot, dragOp.selectedIds, latestGroupDelta);
        return;
      }

      if (dragOp.mode === 'move') {
        if (useMagnet) {
          const snapped = snapClipMoveToTargets(
            dragOp.origStart + deltaSec,
            clipDur,
            snapTargets,
            magneticThresholdSec,
            ctx.displayDuration - 0.25
          );
          latestStart = snapped.startTime;
          latestEnd = snapped.endTime;
          setActiveSnapGuideTime(snapped.guideTime);
        } else {
          const nextStart = Math.max(
            0,
            Math.min(ctx.displayDuration - 0.25, ctx.snapTime(dragOp.origStart + deltaSec))
          );
          latestStart = nextStart;
          latestEnd = Number((nextStart + clipDur).toFixed(2));
          setActiveSnapGuideTime(null);
        }

        // Vertical drag moves clip between stacked tracks!
        if (dragOp.kind === 'visual') {
          const deltaY = e.clientY - dragOp.startY;
          const deltaTracks = Math.round(-deltaY / VISUAL_ROW_HEIGHT);
          latestTrackIndex = Math.max(
            0,
            Math.min(
              ctx.effectiveVisualTrackCount - 1,
              dragOp.origTrackIndex + deltaTracks
            )
          );
        } else if (dragOp.kind === 'audio') {
          const deltaY = e.clientY - dragOp.startY;
          const deltaTracks = Math.round(deltaY / AUDIO_ROW_HEIGHT);
          latestTrackIndex = Math.max(
            0,
            Math.min(
              ctx.effectiveAudioTrackCount - 1,
              dragOp.origTrackIndex + deltaTracks
            )
          );
        }
      } else if (dragOp.mode === 'resize-left') {
        if (dragOp.kind === 'audio') {
          const origClip = dragOp.snapshot.find((c) => c.id === dragOp.id);
          const minFromSrc = Math.max(0, dragOp.origStart - dragOp.origSourceStart);
          const maxStart = dragOp.origEnd - 0.25;
          let candStart: number;
          if (useMagnet) {
            const snapped = snapClipEdgeToTargets(
              dragOp.origStart + deltaSec,
              snapTargets,
              magneticThresholdSec,
              minFromSrc,
              maxStart
            );
            candStart = snapped.time;
            setActiveSnapGuideTime(snapped.guideTime);
          } else {
            candStart = Math.max(
              minFromSrc,
              Math.min(maxStart, ctx.snapTime(dragOp.origStart + deltaSec))
            );
            setActiveSnapGuideTime(null);
          }
          if (origClip) {
            const trimmed = trimAudioClipLeft(origClip, candStart);
            latestStart = trimmed.startTime;
            latestEnd = trimmed.endTime;
            latestSourceStart = trimmed.sourceStart;
            latestFadeIn = trimmed.fadeIn;
            latestFadeOut = trimmed.fadeOut;
          }
        } else {
          const maxStart = dragOp.origEnd - 0.25;
          if (useMagnet) {
            const snapped = snapClipEdgeToTargets(
              dragOp.origStart + deltaSec,
              snapTargets,
              magneticThresholdSec,
              0,
              maxStart
            );
            latestStart = snapped.time;
            setActiveSnapGuideTime(snapped.guideTime);
          } else {
            latestStart = Math.max(
              0,
              Math.min(maxStart, ctx.snapTime(dragOp.origStart + deltaSec))
            );
            setActiveSnapGuideTime(null);
          }
          latestEnd = dragOp.origEnd;
          const shift = latestStart - dragOp.origStart;
          if (dragOp.kind === 'visual' && dragOp.isVideo) {
            latestSourceStart = Number(
              Math.max(0, dragOp.origSourceStart + shift).toFixed(2)
            );
          }
        }
      } else {
        if (dragOp.kind === 'audio') {
          const origClip = dragOp.snapshot.find((c) => c.id === dragOp.id);
          const minEnd = dragOp.origStart + 0.25;
          const maxEnd =
            dragOp.origSourceDuration > 0.25
              ? Math.max(
                  minEnd,
                  dragOp.origStart +
                    Math.max(0.25, dragOp.origSourceDuration - dragOp.origSourceStart)
                )
              : undefined;
          let candEnd: number;
          if (useMagnet) {
            const snapped = snapClipEdgeToTargets(
              dragOp.origEnd + deltaSec,
              snapTargets,
              magneticThresholdSec,
              minEnd,
              maxEnd
            );
            candEnd = snapped.time;
            setActiveSnapGuideTime(snapped.guideTime);
          } else {
            const raw = Math.max(minEnd, ctx.snapTime(dragOp.origEnd + deltaSec));
            candEnd = maxEnd !== undefined ? Math.min(maxEnd, raw) : raw;
            setActiveSnapGuideTime(null);
          }
          if (origClip) {
            const trimmed = trimAudioClipRight(origClip, candEnd);
            latestStart = trimmed.startTime;
            latestEnd = trimmed.endTime;
            latestSourceStart = trimmed.sourceStart;
            latestFadeIn = trimmed.fadeIn;
            latestFadeOut = trimmed.fadeOut;
          }
        } else {
          const minEnd = dragOp.origStart + 0.25;
          latestStart = dragOp.origStart;
          if (useMagnet) {
            const snapped = snapClipEdgeToTargets(
              dragOp.origEnd + deltaSec,
              snapTargets,
              magneticThresholdSec,
              minEnd
            );
            latestEnd = snapped.time;
            setActiveSnapGuideTime(snapped.guideTime);
          } else {
            latestEnd = Math.max(minEnd, ctx.snapTime(dragOp.origEnd + deltaSec));
            setActiveSnapGuideTime(null);
          }
        }
      }

      if (dragOp.kind === 'cue') {
        ctx.onPreviewCueTiming(dragOp.id, latestStart, latestEnd);
      } else if (dragOp.kind === 'visual') {
        ctx.onPreviewVisualClip(dragOp.id, {
          startTime: latestStart,
          endTime: latestEnd,
          sourceStart: latestSourceStart,
          trackIndex: latestTrackIndex,
        });
      } else if (dragOp.kind === 'audio') {
        ctx.onPreviewAudioClip(dragOp.id, {
          startTime: latestStart,
          endTime: latestEnd,
          sourceStart: latestSourceStart,
          trackIndex: latestTrackIndex,
          fadeIn: latestFadeIn,
          fadeOut: latestFadeOut,
        });
      } else if (dragOp.kind === 'fx') {
        ctx.onPreviewEffectClip(dragOp.id, {
          startTime: latestStart,
          endTime: latestEnd,
        });
      }
    };

    const onUp = () => {
      const ctx = dragContextRef.current;
      setActiveSnapGuideTime(null);
      if (dragOp.kind === 'cue') {
        if (dragOp.mode === 'move' && dragOp.selectedIds.length > 1) {
          ctx.onCommitShiftSelectedCues(
            dragOp.snapshot,
            dragOp.selectedIds,
            latestGroupDelta
          );
        } else {
          ctx.onCommitCueTiming(dragOp.snapshot, dragOp.id, latestStart, latestEnd);
        }
      } else if (dragOp.kind === 'visual') {
        ctx.onCommitVisualClip(dragOp.snapshot, dragOp.id, {
          startTime: latestStart,
          endTime: latestEnd,
          sourceStart: latestSourceStart,
          trackIndex: latestTrackIndex,
        });
      } else if (dragOp.kind === 'audio') {
        if (dragOp.mode === 'fade-in') {
          ctx.onCommitAudioClip(dragOp.snapshot, dragOp.id, { fadeIn: latestFadeIn });
        } else if (dragOp.mode === 'fade-out') {
          ctx.onCommitAudioClip(dragOp.snapshot, dragOp.id, { fadeOut: latestFadeOut });
        } else {
          ctx.onCommitAudioClip(dragOp.snapshot, dragOp.id, {
            startTime: latestStart,
            endTime: latestEnd,
            sourceStart: latestSourceStart,
            trackIndex: latestTrackIndex,
            fadeIn: latestFadeIn,
            fadeOut: latestFadeOut,
          });
        }
      } else if (dragOp.kind === 'fx') {
        ctx.onCommitEffectClip(dragOp.snapshot, dragOp.id, {
          startTime: latestStart,
          endTime: latestEnd,
        });
      }
      setDragOp(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      setActiveSnapGuideTime(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragOp]);

  const rulerTicks = useMemo(() => {
    const step = computeRulerTickStep(displayDuration, trackPixelWidth, 68);
    const ticks: number[] = [];
    for (let t = 0; t <= displayDuration + 0.001; t += step) {
      ticks.push(Number(t.toFixed(1)));
    }
    return ticks;
  }, [displayDuration, trackPixelWidth]);

  const targetCue = cues[syncTargetIndex] ?? null;
  const activeCueId = useMemo(() => {
    const adjusted = currentTime + globalOffset;
    const hit = cues.find((c) => adjusted >= c.startTime && adjusted < c.endTime);
    return hit?.id ?? null;
  }, [cues, currentTime, globalOffset]);

  const selectedVisualClip = useMemo(() => {
    const sel = selectedItems.find((s) => s.track === 'visual');
    if (!sel) return null;
    return visualClips.find((c) => c.id === sel.id) ?? null;
  }, [visualClips, selectedItems]);

  const selectedAudioClip = useMemo(() => {
    const sel = selectedItems.find((s) => s.track === 'audio');
    if (!sel) return null;
    return audioClips.find((c) => c.id === sel.id) ?? null;
  }, [audioClips, selectedItems]);

  const selectedCueIds = useMemo(() => {
    const ids = selectedItems.filter((s) => s.track === 'cue').map((s) => s.id);
    if (ids.length > 0) return ids;
    return selectedCueId ? [selectedCueId] : [];
  }, [selectedItems, selectedCueId]);

  const animatedOverlayLayers = useMemo(
    () =>
      layers.filter(
        (l) =>
          l.type !== 'media-clip' &&
          (l.type === 'text' ||
            l.type === 'image' ||
            l.type === 'shape' ||
            (l.keyframes && l.keyframes.length > 0) ||
            (l.animation &&
              (l.animation.enterPreset !== 'none' || l.animation.exitPreset !== 'none')))
      ),
    [layers]
  );

  const hasSelection = selectedItems.length > 0 || Boolean(selectedCueId);
  const canDelete = hasSelection || Boolean(selectedLayerId);
  const playheadPx = (currentTime / displayDuration) * trackPixelWidth;

  const trackRows: Array<{
    key: 'primary' | 'roman' | 'english';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
    accent: string;
    visible: boolean;
    locked: boolean;
  }> = [
    {
      key: 'primary',
      label: 'Farsi / Main Lyrics',
      icon: Languages,
      iconColor: 'text-amber-400',
      accent: 'bg-amber-500/20 border-amber-400/55 text-amber-100',
      visible: enabledTracks.primary,
      locked: trackLocks.primary,
    },
    {
      key: 'roman',
      label: 'Romanized Lyrics',
      icon: Type,
      iconColor: 'text-sky-400',
      accent: 'bg-sky-500/20 border-sky-400/50 text-sky-100',
      visible: enabledTracks.roman,
      locked: trackLocks.roman,
    },
    {
      key: 'english',
      label: 'English Translation',
      icon: Subtitles,
      iconColor: 'text-emerald-400',
      accent: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100',
      visible: enabledTracks.english,
      locked: trackLocks.english,
    },
  ];

  const startScrub = (e: React.PointerEvent) => {
    e.preventDefault();
    clearDomSelection();
    setIsScrubbing(true);
    seekWithPlayheadMagnet(e.clientX, e.altKey);
  };

  return (
    <div
      data-testid="timeline-section"
      className="border-t border-white/8 bg-[#12151C] flex flex-col select-none"
    >
      {/* Compact Icon-First NLE Timeline Toolbar */}
      <div className="px-2.5 py-1.5 border-b border-white/8 flex flex-wrap items-center justify-between gap-2 bg-[#0E1117]">
        {/* Left: Undo/Redo + Split + Multi-Select Copy / Cut / Paste / Delete + Delete All Lyrics */}
        <div className="flex items-center gap-1 flex-wrap">
          <IconTooltip tip="Undo (Ctrl+Z)" align="left">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo timeline or canvas action"
              className="p-1.5 rounded bg-[#191D26] hover:bg-[#232936] text-zinc-300 disabled:opacity-35 border border-white/8 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>
          <IconTooltip tip="Redo (Ctrl+Shift+Z)">
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo timeline or canvas action"
              className="p-1.5 rounded bg-[#191D26] hover:bg-[#232936] text-zinc-300 disabled:opacity-35 border border-white/8 cursor-pointer"
            >
              <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <span className="w-px h-4 bg-white/10 mx-0.5" aria-hidden="true" />

          <IconTooltip tip="Split selected clip, audio, FX, or lyric at playhead">
            <button
              type="button"
              onClick={onSplitAtPlayhead}
              aria-label="Split at playhead"
              data-testid="timeline-split-btn"
              className="p-1.5 rounded bg-[#191D26] hover:bg-amber-500/20 text-zinc-200 hover:text-amber-300 border border-white/8 cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip tip="Copy selected item(s) (Ctrl+C)">
            <button
              type="button"
              onClick={onCopySelected}
              disabled={!hasSelection}
              aria-label="Copy selected timeline items"
              data-testid="timeline-copy-btn"
              className="p-1.5 rounded bg-[#191D26] hover:bg-[#232936] text-zinc-300 disabled:opacity-35 border border-white/8 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip tip="Cut selected item(s) (Ctrl+X)">
            <button
              type="button"
              onClick={onCutSelected}
              disabled={!hasSelection}
              aria-label="Cut selected timeline items"
              data-testid="timeline-cut-btn"
              className="p-1.5 rounded bg-[#191D26] hover:bg-[#232936] text-zinc-300 disabled:opacity-35 border border-white/8 cursor-pointer"
            >
              <ClipboardX className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip tip="Paste copied item(s) at playhead (Ctrl+V)">
            <button
              type="button"
              onClick={onPasteAtPlayhead}
              disabled={!hasClipboard}
              aria-label="Paste timeline items at playhead"
              data-testid="timeline-paste-btn"
              className="p-1.5 rounded bg-[#191D26] hover:bg-[#232936] text-amber-300 disabled:opacity-35 border border-white/8 cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip tip="Delete selected element, clip, or animation (Del)">
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={!canDelete}
              aria-label="Delete selected timeline items"
              data-testid="timeline-delete-selected-btn"
              className="p-1.5 rounded bg-[#191D26] hover:text-rose-400 text-zinc-300 disabled:opacity-35 border border-white/8 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip tip="Delete all lyrics at once">
            <button
              type="button"
              onClick={onClearAllLyrics}
              disabled={cues.length === 0}
              aria-label="Delete all lyrics"
              data-testid="timeline-delete-all-lyrics-btn"
              className="p-1.5 rounded bg-rose-500/12 hover:bg-rose-500/25 text-rose-300 disabled:opacity-35 border border-rose-500/30 cursor-pointer"
            >
              <ListX className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip tip="Add timeline marker (M)">
            <button
              type="button"
              onClick={() => onAddMarker(currentTime)}
              aria-label="Add timeline marker"
              className="p-1.5 rounded bg-[#191D26] hover:bg-[#232936] text-amber-400 border border-white/8 cursor-pointer"
            >
              <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip
            tip={
              snapEnabled
                ? 'Magnetic Snap: ON (sticks clips to neighbors, playhead & markers · Hold Alt to bypass)'
                : 'Magnetic Snap: OFF'
            }
          >
            <button
              type="button"
              onClick={() => setSnapEnabled((s) => !s)}
              aria-pressed={snapEnabled}
              aria-label="Toggle magnetic timeline snapping"
              data-testid="timeline-magnet-btn"
              className={`p-1.5 rounded border cursor-pointer ${
                snapEnabled
                  ? 'bg-amber-500/20 border-amber-500/45 text-amber-300'
                  : 'bg-[#191D26] border-white/8 text-zinc-400'
              }`}
            >
              <Magnet className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip
            tip={
              autoRipple
                ? 'Auto-Close Gaps (Magnetic Ripple): ON — moving or deleting clips leaves zero gaps'
                : 'Auto-Close Gaps: OFF — clips can leave empty gaps'
            }
          >
            <button
              type="button"
              onClick={onToggleAutoRipple}
              aria-pressed={autoRipple}
              aria-label="Toggle magnetic auto-close gaps"
              data-testid="timeline-ripple-btn"
              className={`p-1.5 rounded border cursor-pointer ${
                autoRipple
                  ? 'bg-amber-500/20 border-amber-500/45 text-amber-300'
                  : 'bg-[#191D26] border-white/8 text-zinc-400'
              }`}
            >
              <ArrowLeftToLine className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip
            tip={
              lyricBoxSelectMode
                ? 'Marquee Box Select Lyrics: ON — drag across any lyrics to multi-select'
                : 'Marquee Box Select Lyrics — hold left click & drag across lyrics to select multiple lines'
            }
          >
            <button
              type="button"
              onClick={() => setLyricBoxSelectMode((v) => !v)}
              aria-pressed={lyricBoxSelectMode}
              aria-label="Toggle marquee box selection for lyrics"
              data-testid="timeline-box-select-btn"
              className={`p-1.5 rounded border cursor-pointer ${
                lyricBoxSelectMode
                  ? 'bg-sky-500/25 border-sky-400/55 text-sky-200'
                  : 'bg-[#191D26] border-white/8 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BoxSelect className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <span className="w-px h-4 bg-white/10 mx-0.5" aria-hidden="true" />

          <IconTooltip tip="Add a new stacked Video/Image layer track (V2, V3...)">
            <button
              type="button"
              onClick={onAddVisualTrack}
              aria-label="Add Video or Image Track"
              data-testid="add-visual-track-btn"
              className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded bg-purple-500/18 hover:bg-purple-500/32 text-purple-200 border border-purple-400/35 text-[10px] font-semibold cursor-pointer"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              <span>V</span>
            </button>
          </IconTooltip>

          <IconTooltip tip="Add a new Audio layer track (A2, A3...) to mix multiple tracks">
            <button
              type="button"
              onClick={onAddAudioTrack}
              aria-label="Add Audio Track"
              data-testid="add-audio-track-btn"
              className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded bg-emerald-500/18 hover:bg-emerald-500/32 text-emerald-200 border border-emerald-400/35 text-[10px] font-semibold cursor-pointer"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              <span>A</span>
            </button>
          </IconTooltip>

          {selectedItems.length > 1 && (
            <span
              data-testid="timeline-selection-count"
              className="ml-1 text-[10px] font-mono tabular-nums text-amber-300"
            >
              {selectedItems.length} sel
            </span>
          )}
        </div>

        {/* Center: Selected Visual Layer Controls OR Audio Fade Controls OR Tap-to-Sync Strip */}
        {selectedVisualClip ? (
          <div
            data-testid="visual-clip-toolbar"
            className="flex items-center gap-2 text-[10px] bg-[#161A22] px-2 py-0.5 rounded-md border border-purple-400/35"
          >
            <span className="font-mono font-semibold text-purple-300">
              V{(selectedVisualClip.trackIndex ?? 0) + 1}
            </span>
            <div className="flex items-center gap-0.5">
              <IconTooltip tip="Move clip up to higher layer track (V+1)">
                <button
                  type="button"
                  aria-label="Move visual clip up one track"
                  onClick={() => {
                    const nextIdx = (selectedVisualClip.trackIndex ?? 0) + 1;
                    if (nextIdx >= effectiveVisualTrackCount) onAddVisualTrack();
                    onCommitVisualClip(visualClips, selectedVisualClip.id, {
                      trackIndex: nextIdx,
                    });
                  }}
                  className="p-0.5 rounded bg-[#0E1117] hover:bg-purple-500/25 text-zinc-200 border border-white/10 cursor-pointer"
                >
                  <ArrowUp className="w-3 h-3" aria-hidden="true" />
                </button>
              </IconTooltip>
              <IconTooltip tip="Move clip down to lower layer track (V-1)">
                <button
                  type="button"
                  disabled={(selectedVisualClip.trackIndex ?? 0) <= 0}
                  aria-label="Move visual clip down one track"
                  onClick={() => {
                    const nextIdx = Math.max(0, (selectedVisualClip.trackIndex ?? 0) - 1);
                    onCommitVisualClip(visualClips, selectedVisualClip.id, {
                      trackIndex: nextIdx,
                    });
                  }}
                  className="p-0.5 rounded bg-[#0E1117] hover:bg-purple-500/25 text-zinc-200 disabled:opacity-35 border border-white/10 cursor-pointer"
                >
                  <ArrowDown className="w-3 h-3" aria-hidden="true" />
                </button>
              </IconTooltip>
            </div>

            <label className="flex items-center gap-1 text-zinc-300">
              <span className="hidden xl:inline">Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Selected visual clip opacity"
                value={Math.round((selectedVisualClip.opacity ?? 1) * 100)}
                onChange={(e) => {
                  const op = Math.max(0, Math.min(1, Number(e.target.value) / 100));
                  onCommitVisualClip(visualClips, selectedVisualClip.id, { opacity: op });
                }}
                className="w-11 accent-purple-400 cursor-pointer"
              />
              <span className="font-mono text-purple-200 w-7 text-right">
                {Math.round((selectedVisualClip.opacity ?? 1) * 100)}%
              </span>
            </label>

            <button
              type="button"
              onClick={() => {
                const currFit =
                  selectedVisualClip.fitMode ??
                  ((selectedVisualClip.trackIndex ?? 0) > 0 ? 'contain' : 'cover');
                const nextFit =
                  currFit === 'cover'
                    ? 'contain'
                    : currFit === 'contain'
                    ? 'stretch'
                    : 'cover';
                onCommitVisualClip(visualClips, selectedVisualClip.id, {
                  fitMode: nextFit,
                });
              }}
              aria-label="Toggle visual clip fit mode"
              className="px-1.5 py-0.5 rounded bg-[#0E1117] hover:bg-white/10 text-zinc-200 border border-white/10 font-medium cursor-pointer"
            >
              {(() => {
                const mode =
                  selectedVisualClip.fitMode ??
                  ((selectedVisualClip.trackIndex ?? 0) > 0 ? 'contain' : 'cover');
                return mode === 'cover' ? 'Fill' : mode === 'stretch' ? 'Stretch' : 'Fit';
              })()}
            </button>
          </div>
        ) : selectedAudioClip ? (
          <div
            data-testid="audio-fade-toolbar"
            className="flex items-center gap-1.5 text-[10px] bg-[#161A22] px-2 py-0.5 rounded-md border border-emerald-500/30 flex-wrap"
          >
            <span className="font-mono font-semibold text-emerald-300">
              A{(selectedAudioClip.trackIndex ?? 0) + 1}
            </span>
            <SlidersHorizontal className="w-3 h-3 text-emerald-400 shrink-0" aria-hidden="true" />
            <label className="flex items-center gap-1 text-zinc-300">
              <span>Start</span>
              <input
                type="number"
                min={0}
                max={Number(Math.max(0, selectedAudioClip.endTime - 0.25).toFixed(2))}
                step={0.5}
                aria-label="Trim audio clip start seconds"
                data-testid="audio-trim-start-input"
                value={Number(selectedAudioClip.startTime.toFixed(2))}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isFinite(val)) return;
                  const trimmed = trimAudioClipLeft(selectedAudioClip, val);
                  onCommitAudioClip(audioClips, selectedAudioClip.id, {
                    startTime: trimmed.startTime,
                    endTime: trimmed.endTime,
                    sourceStart: trimmed.sourceStart,
                    fadeIn: trimmed.fadeIn,
                    fadeOut: trimmed.fadeOut,
                  });
                }}
                className="w-12 bg-[#090B0F] text-amber-300 font-mono px-1 py-0.5 rounded border border-white/10"
              />
            </label>
            <label className="flex items-center gap-1 text-zinc-300">
              <span>End</span>
              <input
                type="number"
                min={Number((selectedAudioClip.startTime + 0.25).toFixed(2))}
                step={0.5}
                aria-label="Trim audio clip end seconds"
                data-testid="audio-trim-end-input"
                value={Number(selectedAudioClip.endTime.toFixed(2))}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!Number.isFinite(val)) return;
                  const trimmed = trimAudioClipRight(selectedAudioClip, val);
                  onCommitAudioClip(audioClips, selectedAudioClip.id, {
                    startTime: trimmed.startTime,
                    endTime: trimmed.endTime,
                    sourceStart: trimmed.sourceStart,
                    fadeIn: trimmed.fadeIn,
                    fadeOut: trimmed.fadeOut,
                  });
                }}
                className="w-12 bg-[#090B0F] text-amber-300 font-mono px-1 py-0.5 rounded border border-white/10"
              />
            </label>
            <label className="flex items-center gap-1 text-zinc-300">
              <span>In</span>
              <input
                type="number"
                min={0}
                max={Number(((selectedAudioClip.endTime - selectedAudioClip.startTime) * 0.5).toFixed(1))}
                step={0.2}
                aria-label="Audio clip fade in seconds"
                value={selectedAudioClip.fadeIn}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  onCommitAudioClip(audioClips, selectedAudioClip.id, { fadeIn: val });
                }}
                className="w-10 bg-[#090B0F] text-emerald-300 font-mono px-1 py-0.5 rounded border border-white/10"
              />
            </label>
            <label className="flex items-center gap-1 text-zinc-300">
              <span>Out</span>
              <input
                type="number"
                min={0}
                max={Number(((selectedAudioClip.endTime - selectedAudioClip.startTime) * 0.5).toFixed(1))}
                step={0.2}
                aria-label="Audio clip fade out seconds"
                value={selectedAudioClip.fadeOut}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  onCommitAudioClip(audioClips, selectedAudioClip.id, { fadeOut: val });
                }}
                className="w-10 bg-[#090B0F] text-emerald-300 font-mono px-1 py-0.5 rounded border border-white/10"
              />
            </label>
            <label className="flex items-center gap-1 text-zinc-300">
              <span>Vol</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Audio clip volume"
                value={Math.round((selectedAudioClip.volume ?? 1) * 100)}
                onChange={(e) => {
                  const vol = Math.max(0, Math.min(1, Number(e.target.value) / 100));
                  onCommitAudioClip(audioClips, selectedAudioClip.id, { volume: vol });
                }}
                className="w-10 accent-emerald-400 cursor-pointer"
              />
            </label>
          </div>
        ) : selectedCueIds.length >= 2 ? (
          <div
            data-testid="lyric-group-toolbar"
            className="flex items-center gap-1.5 text-[10px] bg-[#161A22] px-2 py-0.5 rounded-md border border-sky-400/35"
          >
            <MoveHorizontal className="w-3 h-3 text-sky-300 shrink-0" aria-hidden="true" />
            <span className="font-mono font-semibold text-sky-200">
              {selectedCueIds.length} lyrics
            </span>
            <IconTooltip tip="Move selected lyrics earlier by 0.5s">
              <button
                type="button"
                onClick={() => onCommitShiftSelectedCues(cues, selectedCueIds, -0.5)}
                className="px-1.5 py-0.5 rounded bg-[#0E1117] hover:bg-sky-500/20 text-zinc-200 font-mono border border-white/10 cursor-pointer"
              >
                -0.5s
              </button>
            </IconTooltip>
            <IconTooltip tip="Move selected lyrics later by 0.5s">
              <button
                type="button"
                onClick={() => onCommitShiftSelectedCues(cues, selectedCueIds, 0.5)}
                className="px-1.5 py-0.5 rounded bg-[#0E1117] hover:bg-sky-500/20 text-zinc-200 font-mono border border-white/10 cursor-pointer"
              >
                +0.5s
              </button>
            </IconTooltip>
            <IconTooltip tip="Align first selected lyric to red playhead (moves entire selection together)">
              <button
                type="button"
                data-testid="move-lyrics-to-playhead-btn"
                onClick={() => {
                  const selCues = cues.filter((c) => selectedCueIds.includes(c.id));
                  if (selCues.length === 0) return;
                  const minStart = Math.min(...selCues.map((c) => c.startTime));
                  onCommitShiftSelectedCues(cues, selectedCueIds, currentTime - minStart);
                }}
                className="px-2 py-0.5 rounded bg-sky-500/25 hover:bg-sky-500/40 text-sky-100 font-semibold border border-sky-400/40 cursor-pointer whitespace-nowrap"
              >
                To Playhead
              </button>
            </IconTooltip>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <IconTooltip tip="Stamp selected lyric start time at playhead (Shortcut: S)">
              <button
                type="button"
                onClick={onStampNextLine}
                disabled={cues.length === 0}
                aria-label={`Mark #${syncTargetIndex + 1} (S)`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-amber-500 text-zinc-950 rounded-md hover:bg-amber-400 disabled:opacity-40 whitespace-nowrap cursor-pointer"
              >
                <Crosshair className="w-3 h-3" aria-hidden="true" />
                <span className="font-mono tabular-nums">#{syncTargetIndex + 1}</span>
              </button>
            </IconTooltip>
            {targetCue && (
              <div className="hidden md:flex items-center gap-0.5 text-[11px] text-zinc-400">
                <IconTooltip tip="Previous lyric line">
                  <button
                    type="button"
                    aria-label="Previous sync target line"
                    onClick={() => onSelectSyncTarget(Math.max(0, syncTargetIndex - 1))}
                    className="p-0.5 hover:text-white cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </IconTooltip>
                <span className="truncate max-w-[115px] text-zinc-300 pointer-events-none">
                  {targetCue.primary || targetCue.roman || targetCue.english}
                </span>
                <IconTooltip tip="Next lyric line">
                  <button
                    type="button"
                    aria-label="Next sync target line"
                    onClick={() =>
                      onSelectSyncTarget(Math.min(cues.length - 1, syncTargetIndex + 1))
                    }
                    className="p-0.5 hover:text-white cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </IconTooltip>
              </div>
            )}
          </div>
        )}

        {/* Right: Global Offset Quick Steppers + Zoom Slider */}
        <div className="flex items-center gap-1.5">
          {!selectedVisualClip && !selectedAudioClip && (
            <div className="hidden xl:flex items-center gap-1">
              {Math.abs(globalOffset) > 0.001 && (
                <span className="text-[10px] font-mono tabular-nums text-amber-300 mr-0.5">
                  {globalOffset >= 0 ? '+' : ''}
                  {globalOffset.toFixed(2)}s
                </span>
              )}
              <IconTooltip tip="Shift all lyrics 0.1s earlier">
                <button
                  type="button"
                  onClick={() => onChangeGlobalOffset(Number((globalOffset - 0.1).toFixed(2)))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-[#191D26] hover:bg-[#232936] text-zinc-300 rounded border border-white/8 cursor-pointer"
                >
                  -0.1s
                </button>
              </IconTooltip>
              <IconTooltip tip="Shift all lyrics 0.1s later">
                <button
                  type="button"
                  onClick={() => onChangeGlobalOffset(Number((globalOffset + 0.1).toFixed(2)))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-[#191D26] hover:bg-[#232936] text-zinc-300 rounded border border-white/8 cursor-pointer"
                >
                  +0.1s
                </button>
              </IconTooltip>
            </div>
          )}

          <div className="flex items-center gap-0.5">
            <IconTooltip tip="Zoom out timeline">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                aria-label="Zoom out timeline"
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
            <input
              type="range"
              min={1}
              max={6}
              step={0.5}
              aria-label="Timeline zoom level"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-14 accent-amber-500 cursor-pointer"
            />
            <IconTooltip tip="Zoom in timeline" align="right">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(6, Number((z + 0.5).toFixed(1))))}
                aria-label="Zoom in timeline"
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
          </div>
        </div>
      </div>

      {/* Scrollable Multi-Track NLE Grid (100% unselectable text while dragging playhead) */}
      <div
        ref={scrollContainerRef}
        data-testid="pro-timeline"
        style={maxBodyHeightPx ? { maxHeight: `${maxBodyHeightPx}px` } : undefined}
        className={`overflow-x-auto overflow-y-auto bg-[#090B0F] relative select-none ${
          maxBodyHeightPx ? '' : 'max-h-[245px]'
        }`}
      >
        <div
          className="relative flex flex-col select-none"
          style={{ width: `${HEADER_WIDTH + trackPixelWidth}px` }}
        >
          {/* Ruler Row */}
          <div className="flex h-6 border-b border-white/8 bg-[#0E1117] sticky top-0 z-20">
            <div
              style={{ width: `${HEADER_WIDTH}px` }}
              className="shrink-0 sticky left-0 z-30 bg-[#0E1117] border-r border-white/10 px-2 flex items-center justify-center gap-1.5 text-zinc-500 select-none"
            >
              <Clock className="w-3 h-3 text-zinc-500 pointer-events-none" aria-hidden="true" />
              <span className="text-[10px] font-mono tabular-nums text-zinc-400 pointer-events-none">
                {formatTimecode(currentTime).slice(0, 5)}
              </span>
            </div>
            <div
              ref={trackViewportRef}
              role="slider"
              tabIndex={0}
              aria-label="Timeline ruler scrubber"
              aria-valuemin={0}
              aria-valuemax={Math.round(displayDuration)}
              aria-valuenow={Math.round(currentTime)}
              onPointerDown={startScrub}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') onSeek(Math.min(displayDuration, currentTime + 0.5));
                if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 0.5));
              }}
              className="relative flex-1 cursor-ew-resize select-none"
            >
              {rulerTicks.map((t) => {
                const leftPx = (t / displayDuration) * trackPixelWidth;
                return (
                  <div
                    key={t}
                    style={{ left: `${leftPx}px` }}
                    className="absolute top-0 bottom-0 border-l border-white/15 pl-1 flex items-center pointer-events-none"
                  >
                    <span className="text-[9px] font-mono tabular-nums text-zinc-500 select-none">
                      {formatTimecode(t).slice(0, 5)}
                    </span>
                  </div>
                );
              })}

              {/* Markers */}
              {markers.map((m) => {
                const mPx = (m.time / displayDuration) * trackPixelWidth;
                return (
                  <button
                    key={m.id}
                    type="button"
                    title={`${m.label} (${formatTimecode(m.time)}) — double-click to remove`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(m.time);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onRemoveMarker(m.id);
                    }}
                    style={{ left: `${mPx}px` }}
                    className="absolute top-0.5 w-2.5 h-2.5 -ml-1.5 bg-amber-400 rotate-45 border border-zinc-950 cursor-pointer"
                  />
                );
              })}
            </div>
          </div>

          {/* Stacked Visual Media Tracks (Filmora z-order: V3 above V2 above V1) */}
          {Array.from(
            { length: effectiveVisualTrackCount },
            (_, i) => effectiveVisualTrackCount - 1 - i
          ).map((trackIdx) => {
            const isTrackHidden =
              !visualVisible || hiddenVisualSet.has(trackIdx);
            const isTrackLocked =
              (trackIdx === 0 && visualLocked) || lockedVisualSet.has(trackIdx);
            const clipsOnTrack = visualClips.filter(
              (c) => (c.trackIndex ?? 0) === trackIdx
            );
            const isUpper = trackIdx > 0;

            return (
              <div
                key={`vtrack-${trackIdx}`}
                data-testid={`visual-track-${trackIdx}`}
                className="flex h-10 border-b border-white/6"
              >
                <div
                  data-testid={
                    trackIdx === 0
                      ? 'track-header-visual'
                      : `track-header-visual-${trackIdx}`
                  }
                  style={{ width: `${HEADER_WIDTH}px` }}
                  className="shrink-0 sticky left-0 z-20 bg-[#11141B] border-r border-white/10 px-1.5 flex items-center justify-between gap-0.5 select-none"
                >
                  <IconTooltip
                    tip={
                      isUpper
                        ? `Video / Image Layer V${trackIdx + 1} (Composites ON TOP of V${trackIdx})`
                        : 'Base Video / Image Track V1'
                    }
                    align="left"
                  >
                    <span
                      aria-label={`Video ${trackIdx + 1} Track`}
                      className={`inline-flex items-center gap-0.5 px-1 h-5 rounded text-[9px] font-mono font-semibold ${
                        isUpper
                          ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
                          : 'bg-indigo-500/18 text-indigo-300 border border-indigo-400/25'
                      }`}
                    >
                      <Film className="w-2.5 h-2.5" aria-hidden="true" />
                      <span>V{trackIdx + 1}</span>
                    </span>
                  </IconTooltip>
                  <div className="flex items-center gap-0.5">
                    <IconTooltip tip={`Select all clips on V${trackIdx + 1}`}>
                      <button
                        type="button"
                        aria-label={
                          trackIdx === 0
                            ? 'Select all visual clips'
                            : `Select all clips on Video ${trackIdx + 1}`
                        }
                        onClick={() => onSelectAllOnVisualTrack(trackIdx)}
                        className="p-0.5 rounded text-zinc-500 hover:text-indigo-300 cursor-pointer"
                      >
                        <CheckSquare className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </IconTooltip>
                    <IconTooltip
                      tip={
                        isTrackLocked
                          ? `Unlock Video ${trackIdx + 1}`
                          : `Lock Video ${trackIdx + 1}`
                      }
                    >
                      <button
                        type="button"
                        aria-label={
                          trackIdx === 0
                            ? isTrackLocked
                              ? 'Unlock visual track'
                              : 'Lock visual track'
                            : isTrackLocked
                            ? `Unlock Video ${trackIdx + 1} track`
                            : `Lock Video ${trackIdx + 1} track`
                        }
                        aria-pressed={isTrackLocked}
                        onClick={() => {
                          if (trackIdx === 0) onToggleVisualLocked();
                          else onToggleVisualTrackLocked(trackIdx);
                        }}
                        className={`p-0.5 rounded cursor-pointer transition-colors ${
                          isTrackLocked
                            ? 'text-amber-400 bg-amber-500/15'
                            : 'text-zinc-500 hover:text-zinc-200'
                        }`}
                      >
                        {isTrackLocked ? (
                          <Lock className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Unlock className="w-3 h-3" aria-hidden="true" />
                        )}
                      </button>
                    </IconTooltip>
                    <IconTooltip
                      tip={
                        isTrackHidden
                          ? `Show Video ${trackIdx + 1}`
                          : `Hide Video ${trackIdx + 1}`
                      }
                    >
                      <button
                        type="button"
                        aria-label={
                          trackIdx === 0
                            ? isTrackHidden
                              ? 'Show visual track'
                              : 'Hide visual track'
                            : isTrackHidden
                            ? `Show Video ${trackIdx + 1} track`
                            : `Hide Video ${trackIdx + 1} track`
                        }
                        aria-pressed={isTrackHidden}
                        onClick={() => {
                          if (trackIdx === 0 && !visualVisible) {
                            onToggleVisualVisible();
                          } else {
                            onToggleVisualTrackVisible(trackIdx);
                          }
                        }}
                        className={`p-0.5 rounded cursor-pointer transition-colors ${
                          isTrackHidden
                            ? 'text-rose-400 bg-rose-500/15'
                            : 'text-zinc-400 hover:text-zinc-100'
                        }`}
                      >
                        {isTrackHidden ? (
                          <EyeOff className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Eye className="w-3 h-3" aria-hidden="true" />
                        )}
                      </button>
                    </IconTooltip>
                    {isUpper && (
                      <IconTooltip tip={`Remove Video ${trackIdx + 1} track`}>
                        <button
                          type="button"
                          aria-label={`Remove Video ${trackIdx + 1} track`}
                          onClick={() => onRemoveVisualTrack(trackIdx)}
                          className="p-0.5 rounded text-zinc-600 hover:text-rose-400 cursor-pointer"
                        >
                          <Minus className="w-2.5 h-2.5" aria-hidden="true" />
                        </button>
                      </IconTooltip>
                    )}
                  </div>
                </div>

                <div
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) startScrub(e);
                  }}
                  data-testid={
                    trackIdx === 0
                      ? 'visual-clips-lane'
                      : `visual-clips-lane-${trackIdx}`
                  }
                  className={`relative flex-1 bg-[#080A0E] cursor-ew-resize transition-opacity ${
                    isTrackHidden ? 'opacity-25' : 'opacity-100'
                  }`}
                >
                  {clipsOnTrack.length === 0 && (
                    <span className="absolute left-2.5 top-3 text-[9px] text-zinc-600 pointer-events-none">
                      {isUpper
                        ? `Drag clip up or click Stack in Media Bin to layer on V${trackIdx + 1}`
                        : 'Upload video or image'}
                    </span>
                  )}

                  {clipsOnTrack.map((clip, idx) => {
                    const leftPx = (clip.startTime / displayDuration) * trackPixelWidth;
                    const widthPx = Math.max(
                      26,
                      ((clip.endTime - clip.startTime) / displayDuration) *
                        trackPixelWidth
                    );
                    const clipLayerId = getClipLayerId(clip.id);
                    const clipLayer = layers.find((l) => l.id === clipLayerId) ?? null;
                    const clipAnimated = clipLayer ? hasLayerAnimation(clipLayer) : false;
                    const selected =
                      isItemSelected('visual', clip.id) || selectedLayerId === clipLayerId;
                    return (
                      <div
                        key={clip.id}
                        data-testid={
                          trackIdx === 0
                            ? `timeline-visual-clip-${idx}`
                            : `timeline-visual-clip-v${trackIdx + 1}-${idx}`
                        }
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onSelectLayer(clipLayerId);
                          onOpenAnimateForLayer?.(clipLayerId);
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          clearDomSelection();
                          handleSelectItem(
                            'visual',
                            clip.id,
                            e.shiftKey || e.metaKey || e.ctrlKey
                          );
                          if (isTrackLocked) return;
                          setDragOp({
                            kind: 'visual',
                            mode: 'move',
                            id: clip.id,
                            startX: e.clientX,
                            startY: e.clientY,
                            origStart: clip.startTime,
                            origEnd: clip.endTime,
                            origSourceStart: clip.sourceStart,
                            origTrackIndex: clip.trackIndex ?? 0,
                            isVideo: clip.kind === 'video',
                            snapshot: visualClips.map((c) => ({ ...c })),
                          });
                        }}
                        style={{
                          left: `${leftPx}px`,
                          width: `${widthPx}px`,
                          ...(clip.kind === 'image'
                            ? {
                                backgroundImage: `url(${clip.url})`,
                                backgroundRepeat: 'repeat-x',
                                backgroundSize: 'auto 100%',
                              }
                            : {}),
                        }}
                        title={`${clip.name} (V${trackIdx + 1} · ${formatTimecode(
                          clip.startTime
                        )} → ${formatTimecode(clip.endTime)}) · Drag up/down to move between tracks · Double-click to animate`}
                        className={`absolute top-0.5 bottom-0.5 rounded overflow-hidden border flex flex-col justify-between select-none ${
                          isTrackLocked
                            ? 'cursor-not-allowed'
                            : 'cursor-grab active:cursor-grabbing'
                        } ${
                          selected
                            ? 'border-amber-400 ring-1 ring-amber-400/70 z-10'
                            : isUpper
                            ? 'border-purple-400/55 bg-purple-950/50'
                            : 'border-indigo-400/50 bg-indigo-950/45'
                        }`}
                      >
                        {/* Filmora-style top purple/indigo title strip */}
                        <div
                          className={`relative z-10 h-3.5 px-1.5 flex items-center justify-between gap-1 text-[9px] font-medium truncate pointer-events-none ${
                            isUpper
                              ? 'bg-purple-600/80 text-purple-50'
                              : 'bg-indigo-600/80 text-indigo-50'
                          }`}
                        >
                          <span className="truncate">{clip.name}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            {clipAnimated && (
                              <span className="px-1 rounded bg-amber-400 text-zinc-950 font-bold text-[7px] uppercase tracking-wider">
                                FX
                              </span>
                            )}
                            {(clip.opacity ?? 1) < 0.99 && (
                              <span className="font-mono text-[8px] opacity-85">
                                {Math.round((clip.opacity ?? 1) * 100)}%
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex-1 bg-gradient-to-r from-[#0B0D11]/45 via-transparent to-[#0B0D11]/45 pointer-events-none" />

                        {/* Left & Right Trim Handles */}
                        <div
                          role="separator"
                          aria-label={`Trim start of visual clip ${clip.name}`}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearDomSelection();
                            handleSelectItem('visual', clip.id, false);
                            if (isTrackLocked) return;
                            setDragOp({
                              kind: 'visual',
                              mode: 'resize-left',
                              id: clip.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              origStart: clip.startTime,
                              origEnd: clip.endTime,
                              origSourceStart: clip.sourceStart,
                              origTrackIndex: clip.trackIndex ?? 0,
                              isVideo: clip.kind === 'video',
                              snapshot: visualClips.map((c) => ({ ...c })),
                            });
                          }}
                          className="absolute left-0 top-0 bottom-0 z-20 w-1.5 cursor-ew-resize hover:bg-amber-400/80"
                        />
                        <div
                          role="separator"
                          aria-label={`Trim end of visual clip ${clip.name}`}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearDomSelection();
                            handleSelectItem('visual', clip.id, false);
                            if (isTrackLocked) return;
                            setDragOp({
                              kind: 'visual',
                              mode: 'resize-right',
                              id: clip.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              origStart: clip.startTime,
                              origEnd: clip.endTime,
                              origSourceStart: clip.sourceStart,
                              origTrackIndex: clip.trackIndex ?? 0,
                              isVideo: clip.kind === 'video',
                              snapshot: visualClips.map((c) => ({ ...c })),
                            });
                          }}
                          className="absolute right-0 top-0 bottom-0 z-20 w-1.5 cursor-ew-resize hover:bg-amber-400/80"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Stacked Audio Tracks (A1, A2, A3... play & mix simultaneously with independent Fade In/Out) */}
          {Array.from({ length: effectiveAudioTrackCount }, (_, i) => i).map(
            (trackIdx) => {
              const isTrackMuted = isMuted || mutedAudioSet.has(trackIdx);
              const isTrackLocked =
                (trackIdx === 0 && trackLocks.audio) ||
                lockedAudioSet.has(trackIdx);
              const clipsOnTrack = audioClips.filter(
                (c) => (c.trackIndex ?? 0) === trackIdx
              );
              const isExtra = trackIdx > 0;

              return (
                <div
                  key={`atrack-${trackIdx}`}
                  data-testid={`audio-track-${trackIdx}`}
                  className="flex h-10 border-b border-white/6"
                >
                  <div
                    data-testid={
                      trackIdx === 0
                        ? 'track-header-audio'
                        : `track-header-audio-${trackIdx}`
                    }
                    style={{ width: `${HEADER_WIDTH}px` }}
                    className="shrink-0 sticky left-0 z-20 bg-[#11141B] border-r border-white/10 px-1.5 flex items-center justify-between gap-0.5 select-none"
                  >
                    <IconTooltip
                      tip={`Audio Track A${trackIdx + 1} (Mixes simultaneously · Drag top corners for Fade In / Out)`}
                      align="left"
                    >
                      <span
                        aria-label={`Audio ${trackIdx + 1} Track`}
                        className={`inline-flex items-center gap-0.5 px-1 h-5 rounded text-[9px] font-mono font-semibold ${
                          isExtra
                            ? 'bg-teal-500/20 text-teal-200 border border-teal-400/30'
                            : 'bg-emerald-500/18 text-emerald-300 border border-emerald-400/25'
                        }`}
                      >
                        <Music className="w-2.5 h-2.5" aria-hidden="true" />
                        <span>A{trackIdx + 1}</span>
                      </span>
                    </IconTooltip>
                    <div className="flex items-center gap-0.5">
                      <IconTooltip tip={`Select all clips on A${trackIdx + 1}`}>
                        <button
                          type="button"
                          aria-label={
                            trackIdx === 0
                              ? 'Select all audio clips'
                              : `Select all clips on Audio ${trackIdx + 1}`
                          }
                          onClick={() => onSelectAllOnAudioTrack(trackIdx)}
                          className="p-0.5 rounded text-zinc-500 hover:text-emerald-300 cursor-pointer"
                        >
                          <CheckSquare className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </IconTooltip>
                      <IconTooltip
                        tip={
                          isTrackLocked
                            ? `Unlock Audio ${trackIdx + 1}`
                            : `Lock Audio ${trackIdx + 1}`
                        }
                      >
                        <button
                          type="button"
                          aria-label={
                            trackIdx === 0
                              ? isTrackLocked
                                ? 'Unlock audio track'
                                : 'Lock audio track'
                              : isTrackLocked
                              ? `Unlock Audio ${trackIdx + 1} track`
                              : `Lock Audio ${trackIdx + 1} track`
                          }
                          aria-pressed={isTrackLocked}
                          onClick={() => {
                            if (trackIdx === 0) toggleTrackLock('audio');
                            else onToggleAudioTrackLocked(trackIdx);
                          }}
                          className={`p-0.5 rounded cursor-pointer transition-colors ${
                            isTrackLocked
                              ? 'text-amber-400 bg-amber-500/15'
                              : 'text-zinc-500 hover:text-zinc-200'
                          }`}
                        >
                          {isTrackLocked ? (
                            <Lock className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            <Unlock className="w-3 h-3" aria-hidden="true" />
                          )}
                        </button>
                      </IconTooltip>
                      <IconTooltip
                        tip={
                          isTrackMuted
                            ? `Unmute Audio ${trackIdx + 1}`
                            : `Mute Audio ${trackIdx + 1}`
                        }
                      >
                        <button
                          type="button"
                          aria-label={
                            trackIdx === 0
                              ? isTrackMuted
                                ? 'Unmute audio track'
                                : 'Mute audio track'
                              : isTrackMuted
                              ? `Unmute Audio ${trackIdx + 1} track`
                              : `Mute Audio ${trackIdx + 1} track`
                          }
                          aria-pressed={isTrackMuted}
                          onClick={() => {
                            if (trackIdx === 0 && isMuted) {
                              onToggleMute();
                            } else {
                              onToggleAudioTrackMuted(trackIdx);
                            }
                          }}
                          className={`p-0.5 rounded cursor-pointer transition-colors ${
                            isTrackMuted
                              ? 'text-rose-400 bg-rose-500/15'
                              : 'text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          {isTrackMuted ? (
                            <VolumeX className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            <Volume2 className="w-3 h-3" aria-hidden="true" />
                          )}
                        </button>
                      </IconTooltip>
                      {isExtra && (
                        <IconTooltip tip={`Remove Audio ${trackIdx + 1} track`}>
                          <button
                            type="button"
                            aria-label={`Remove Audio ${trackIdx + 1} track`}
                            onClick={() => onRemoveAudioTrack(trackIdx)}
                            className="p-0.5 rounded text-zinc-600 hover:text-rose-400 cursor-pointer"
                          >
                            <Minus className="w-2.5 h-2.5" aria-hidden="true" />
                          </button>
                        </IconTooltip>
                      )}
                    </div>
                  </div>
                  <div
                    onPointerDown={(e) => {
                      if (e.target === e.currentTarget) startScrub(e);
                    }}
                    data-testid={
                      trackIdx === 0
                        ? 'audio-clips-lane'
                        : `audio-clips-lane-${trackIdx}`
                    }
                    className={`relative flex-1 bg-[#0A0D12] cursor-ew-resize transition-opacity ${
                      isTrackMuted ? 'opacity-30' : 'opacity-100'
                    }`}
                  >
                    {clipsOnTrack.length === 0 && (
                      <span className="absolute left-3 top-2.5 text-[10px] text-zinc-600 pointer-events-none">
                        {isExtra
                          ? `Click Mix in Media Bin or drag audio clip onto A${trackIdx + 1}`
                          : activeAudioName || 'Upload song audio'}
                      </span>
                    )}

                    {clipsOnTrack.map((clip, idx) => {
                      const clipDur = Math.max(0.25, clip.endTime - clip.startTime);
                      const leftPx =
                        (clip.startTime / displayDuration) * trackPixelWidth;
                      const widthPx = Math.max(
                        32,
                        (clipDur / displayDuration) * trackPixelWidth
                      );
                      const fadeInPx = Math.min(
                        widthPx * 0.48,
                        (clip.fadeIn / clipDur) * widthPx
                      );
                      const fadeOutPx = Math.min(
                        widthPx * 0.48,
                        (clip.fadeOut / clipDur) * widthPx
                      );
                      const selected = isItemSelected('audio', clip.id);
                      const rawClipPeaks =
                        waveformPeaksByUrl?.[clip.url] ??
                        (trackIdx === 0 && idx === 0 ? waveformPeaks : []);
                      const desiredBars = Math.max(
                        24,
                        Math.min(180, Math.round(widthPx / 3.5))
                      );
                      const slicedPeaks = sliceWaveformPeaksForClip(
                        rawClipPeaks,
                        clip.sourceStart,
                        clipDur,
                        clip.sourceDuration,
                        desiredBars
                      );

                      return (
                        <div
                          key={clip.id}
                          data-testid={
                            trackIdx === 0
                              ? `timeline-audio-clip-${idx}`
                              : `timeline-audio-clip-a${trackIdx + 1}-${idx}`
                          }
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearDomSelection();
                            handleSelectItem(
                              'audio',
                              clip.id,
                              e.shiftKey || e.metaKey || e.ctrlKey
                            );
                            if (isTrackLocked) return;
                            setDragOp({
                              kind: 'audio',
                              mode: 'move',
                              id: clip.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              origStart: clip.startTime,
                              origEnd: clip.endTime,
                              origSourceStart: clip.sourceStart,
                              origSourceDuration: clip.sourceDuration,
                              origTrackIndex: clip.trackIndex ?? 0,
                              origFadeIn: clip.fadeIn,
                              origFadeOut: clip.fadeOut,
                              snapshot: audioClips.map((c) => ({ ...c })),
                            });
                          }}
                          style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                          title={`${clip.name} (A${trackIdx + 1} · ${formatTimecode(
                            clip.startTime
                          )} → ${formatTimecode(clip.endTime)} · src ${clip.sourceStart.toFixed(
                            1
                          )}s) · Drag left/right edges to shrink · Drag amber dots for Fade In/Out`}
                          className={`group/audio absolute top-0.5 bottom-0.5 rounded overflow-hidden border flex items-end select-none ${
                            isTrackLocked
                              ? 'cursor-not-allowed'
                              : 'cursor-grab active:cursor-grabbing'
                          } ${
                            selected
                              ? 'border-amber-400 ring-1 ring-amber-400/60 z-10 bg-emerald-950/65'
                              : isExtra
                              ? 'border-teal-400/45 bg-teal-950/50'
                              : 'border-emerald-400/45 bg-emerald-950/50'
                          }`}
                        >
                          {/* Detected Beat Ticks inside primary audio clip */}
                          {beatTimes.length > 0 && trackIdx === 0 && idx === 0 && (
                            <div className="absolute inset-x-0 top-0 h-1.5 pointer-events-none z-10">
                              {beatTimes.slice(0, 180).map((bt, bi) => {
                                if (
                                  bt < clip.sourceStart ||
                                  bt > clip.sourceStart + clipDur
                                )
                                  return null;
                                const pct = ((bt - clip.sourceStart) / clipDur) * 100;
                                return (
                                  <span
                                    key={bi}
                                    style={{ left: `${pct}%` }}
                                    className="absolute top-0 w-[1.5px] h-1.5 bg-amber-400/75"
                                  />
                                );
                              })}
                            </div>
                          )}

                          {/* Real Mirrored Audio Waveform Bars sliced to [sourceStart, sourceStart + clipDur] */}
                          <div
                            data-testid={`audio-waveform-${trackIdx}-${idx}`}
                            className="absolute inset-x-2 inset-y-1 flex items-center gap-[1px] pointer-events-none"
                          >
                            {slicedPeaks.map((peak, pi) => {
                              const pct = Math.max(12, Math.min(96, Math.round(peak * 94)));
                              return (
                                <div
                                  key={pi}
                                  className="flex-1 h-full flex flex-col items-center justify-center"
                                >
                                  <div
                                    className={`w-full rounded-full ${
                                      isExtra ? 'bg-teal-300/80' : 'bg-emerald-300/80'
                                    }`}
                                    style={{ height: `${pct}%` }}
                                  />
                                </div>
                              );
                            })}
                            {/* Subtle waveform centerline */}
                            <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
                          </div>

                          {/* Visual Fade-In & Fade-Out Diagonal Curve Shading */}
                          {fadeInPx > 1 && (
                            <div
                              style={{
                                width: `${fadeInPx}px`,
                                clipPath: 'polygon(0 0, 100% 0, 0 100%)',
                              }}
                              className="absolute left-0 top-0 bottom-0 bg-[#090B0F]/75 border-r border-amber-300/60 pointer-events-none z-10"
                            />
                          )}
                          {fadeOutPx > 1 && (
                            <div
                              style={{
                                width: `${fadeOutPx}px`,
                                clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
                              }}
                              className="absolute right-0 top-0 bottom-0 bg-[#090B0F]/75 border-l border-amber-300/60 pointer-events-none z-10"
                            />
                          )}

                          {/* Clip Label */}
                          <span className="relative z-10 px-3 pb-0.5 text-[9px] font-medium text-emerald-50/95 truncate pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                            {clip.name}
                            {(clip.fadeIn > 0 || clip.fadeOut > 0) && (
                              <span className="ml-1.5 text-amber-300 font-mono">
                                (In {clip.fadeIn.toFixed(1)}s · Out{' '}
                                {clip.fadeOut.toFixed(1)}s)
                              </span>
                            )}
                          </span>

                          {/* Interactive Top-Left Fade-In Handle (inset so left trim handle is always easy to grab) */}
                          {!isTrackLocked && (
                            <button
                              type="button"
                              aria-label={`Drag fade in for ${clip.name}`}
                              title="Drag right to add Audio Fade In"
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearDomSelection();
                                handleSelectItem('audio', clip.id, false);
                                setDragOp({
                                  kind: 'audio',
                                  mode: 'fade-in',
                                  id: clip.id,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  origStart: clip.startTime,
                                  origEnd: clip.endTime,
                                  origSourceStart: clip.sourceStart,
                                  origSourceDuration: clip.sourceDuration,
                                  origTrackIndex: clip.trackIndex ?? 0,
                                  origFadeIn: clip.fadeIn,
                                  origFadeOut: clip.fadeOut,
                                  snapshot: audioClips.map((c) => ({ ...c })),
                                });
                              }}
                              style={{ left: `${Math.max(12, fadeInPx)}px` }}
                              className="absolute top-0.5 z-20 w-2.5 h-2.5 rounded-full bg-amber-400 border border-zinc-950 cursor-ew-resize hover:scale-125 transition-transform"
                            />
                          )}

                          {/* Interactive Top-Right Fade-Out Handle (inset so right trim handle is always easy to grab) */}
                          {!isTrackLocked && (
                            <button
                              type="button"
                              aria-label={`Drag fade out for ${clip.name}`}
                              title="Drag left to add Audio Fade Out"
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearDomSelection();
                                handleSelectItem('audio', clip.id, false);
                                setDragOp({
                                  kind: 'audio',
                                  mode: 'fade-out',
                                  id: clip.id,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  origStart: clip.startTime,
                                  origEnd: clip.endTime,
                                  origSourceStart: clip.sourceStart,
                                  origSourceDuration: clip.sourceDuration,
                                  origTrackIndex: clip.trackIndex ?? 0,
                                  origFadeIn: clip.fadeIn,
                                  origFadeOut: clip.fadeOut,
                                  snapshot: audioClips.map((c) => ({ ...c })),
                                });
                              }}
                              style={{ right: `${Math.max(12, fadeOutPx)}px` }}
                              className="absolute top-0.5 z-20 w-2.5 h-2.5 rounded-full bg-amber-400 border border-zinc-950 cursor-ew-resize hover:scale-125 transition-transform"
                            />
                          )}

                          {/* Unobstructed High-Priority Left & Right Audio Shrink/Trim Handles */}
                          <div
                            role="separator"
                            data-testid={`audio-trim-left-${trackIdx}-${idx}`}
                            aria-label={`Trim start of audio clip ${clip.name}`}
                            title="Drag right to shrink/trim audio start"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              clearDomSelection();
                              handleSelectItem('audio', clip.id, false);
                              if (isTrackLocked) return;
                              setDragOp({
                                kind: 'audio',
                                mode: 'resize-left',
                                id: clip.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                origStart: clip.startTime,
                                origEnd: clip.endTime,
                                origSourceStart: clip.sourceStart,
                                origSourceDuration: clip.sourceDuration,
                                origTrackIndex: clip.trackIndex ?? 0,
                                origFadeIn: clip.fadeIn,
                                origFadeOut: clip.fadeOut,
                                snapshot: audioClips.map((c) => ({ ...c })),
                              });
                            }}
                            className="absolute left-0 top-0 bottom-0 z-30 w-2.5 cursor-ew-resize flex items-center justify-center bg-emerald-400/20 hover:bg-amber-400/85 transition-colors"
                          >
                            <span className="w-[2px] h-4 rounded-full bg-white/70 pointer-events-none" />
                          </div>
                          <div
                            role="separator"
                            data-testid={`audio-trim-right-${trackIdx}-${idx}`}
                            aria-label={`Trim end of audio clip ${clip.name}`}
                            title="Drag left to shrink/trim audio end"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              clearDomSelection();
                              handleSelectItem('audio', clip.id, false);
                              if (isTrackLocked) return;
                              setDragOp({
                                kind: 'audio',
                                mode: 'resize-right',
                                id: clip.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                origStart: clip.startTime,
                                origEnd: clip.endTime,
                                origSourceStart: clip.sourceStart,
                                origSourceDuration: clip.sourceDuration,
                                origTrackIndex: clip.trackIndex ?? 0,
                                origFadeIn: clip.fadeIn,
                                origFadeOut: clip.fadeOut,
                                snapshot: audioClips.map((c) => ({ ...c })),
                              });
                            }}
                            className="absolute right-0 top-0 bottom-0 z-30 w-2.5 cursor-ew-resize flex items-center justify-center bg-emerald-400/20 hover:bg-amber-400/85 transition-colors"
                          >
                            <span className="w-[2px] h-4 rounded-full bg-white/70 pointer-events-none" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
          )}

          {/* Track 3: Timed Visual FX Track (Customizable time frames for beat/visual effects) */}
          <div className="flex h-7 border-b border-white/6">
            <div
              data-testid="track-header-fx"
              style={{ width: `${HEADER_WIDTH}px` }}
              className="shrink-0 sticky left-0 z-20 bg-[#11141B] border-r border-white/10 px-1.5 flex items-center justify-between gap-0.5 select-none"
            >
              <IconTooltip tip="Timed Effects Track (FX in custom time frames)" align="left">
                <span
                  aria-label="Timed Effects Track"
                  className="inline-flex items-center justify-center w-5 h-5 rounded bg-fuchsia-500/15 text-fuchsia-300"
                >
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                </span>
              </IconTooltip>
              <div className="flex items-center gap-0.5">
                {onOpenBeatFx && (
                  <IconTooltip tip="Add a timed effect to this track">
                    <button
                      type="button"
                      aria-label="Open Beat FX to add timed effect"
                      onClick={onOpenBeatFx}
                      className="p-1 rounded text-fuchsia-300 hover:bg-fuchsia-500/20 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </IconTooltip>
                )}
                <IconTooltip tip="Select all timed effects">
                  <button
                    type="button"
                    aria-label="Select all timed effects"
                    onClick={() => onSelectAllOnTrack('fx')}
                    className="p-1 rounded text-zinc-500 hover:text-fuchsia-300 cursor-pointer"
                  >
                    <CheckSquare className="w-3 h-3" aria-hidden="true" />
                  </button>
                </IconTooltip>
                <IconTooltip tip={trackLocks.fx ? 'Unlock FX track' : 'Lock FX track'}>
                  <button
                    type="button"
                    aria-label={trackLocks.fx ? 'Unlock FX track' : 'Lock FX track'}
                    aria-pressed={trackLocks.fx}
                    onClick={() => toggleTrackLock('fx')}
                    className={`p-1 rounded cursor-pointer ${
                      trackLocks.fx
                        ? 'text-amber-400 bg-amber-500/15'
                        : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    {trackLocks.fx ? (
                      <Lock className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <Unlock className="w-3 h-3" aria-hidden="true" />
                    )}
                  </button>
                </IconTooltip>
              </div>
            </div>
            <div
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) startScrub(e);
              }}
              data-testid="fx-clips-lane"
              className="relative flex-1 bg-[#080A0E]"
            >
              {effectClips.length === 0 && (
                <span className="absolute left-2 top-1.5 text-[9px] text-zinc-600 pointer-events-none">
                  Add custom-range FX from Effects → Beat FX
                </span>
              )}
              {effectClips.map((fx, idx) => {
                const leftPx = (fx.startTime / displayDuration) * trackPixelWidth;
                const widthPx = Math.max(
                  24,
                  ((fx.endTime - fx.startTime) / displayDuration) * trackPixelWidth
                );
                const selected = isItemSelected('fx', fx.id);
                return (
                  <div
                    key={fx.id}
                    data-testid={`timeline-fx-clip-${idx}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      clearDomSelection();
                      handleSelectItem('fx', fx.id, e.shiftKey || e.metaKey || e.ctrlKey);
                      if (trackLocks.fx) return;
                      setDragOp({
                        kind: 'fx',
                        mode: 'move',
                        id: fx.id,
                        startX: e.clientX,
                        origStart: fx.startTime,
                        origEnd: fx.endTime,
                        snapshot: effectClips.map((c) => ({ ...c })),
                      });
                    }}
                    style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                    title={`${fx.name} (${fx.startTime.toFixed(1)}s → ${fx.endTime.toFixed(1)}s)`}
                    className={`absolute top-0.5 bottom-0.5 rounded border flex items-center overflow-hidden text-[10px] select-none ${
                      trackLocks.fx ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
                    } ${
                      selected
                        ? 'bg-fuchsia-500/45 border-amber-300 text-white z-10'
                        : 'bg-fuchsia-500/22 border-fuchsia-400/55 text-fuchsia-100'
                    }`}
                  >
                    <div
                      role="separator"
                      aria-label={`Trim start of FX ${fx.name}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearDomSelection();
                        handleSelectItem('fx', fx.id, false);
                        if (trackLocks.fx) return;
                        setDragOp({
                          kind: 'fx',
                          mode: 'resize-left',
                          id: fx.id,
                          startX: e.clientX,
                          origStart: fx.startTime,
                          origEnd: fx.endTime,
                          snapshot: effectClips.map((c) => ({ ...c })),
                        });
                      }}
                      className="w-1.5 h-full shrink-0 cursor-ew-resize hover:bg-white/60"
                    />
                    <span className="px-1 truncate flex-1 pointer-events-none">{fx.name}</span>
                    <div
                      role="separator"
                      aria-label={`Trim end of FX ${fx.name}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearDomSelection();
                        handleSelectItem('fx', fx.id, false);
                        if (trackLocks.fx) return;
                        setDragOp({
                          kind: 'fx',
                          mode: 'resize-right',
                          id: fx.id,
                          startX: e.clientX,
                          origStart: fx.startTime,
                          origEnd: fx.endTime,
                          snapshot: effectClips.map((c) => ({ ...c })),
                        });
                      }}
                      className="w-1.5 h-full shrink-0 cursor-ew-resize hover:bg-white/60"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Track 4 (Conditional): Animated Overlays & Keyframe Diamonds */}
          {animatedOverlayLayers.length > 0 && (
            <div className="flex h-7 border-b border-white/6">
              <div
                data-testid="track-header-overlays"
                style={{ width: `${HEADER_WIDTH}px` }}
                className="shrink-0 sticky left-0 z-20 bg-[#11141B] border-r border-white/10 px-1.5 flex items-center justify-between gap-1 select-none"
              >
                <IconTooltip tip="Animated Overlays & Keyframes (Click bar to select, double-click to animate)" align="left">
                  <span
                    aria-label="Animated Overlays Track"
                    className="inline-flex items-center justify-center w-5 h-5 rounded bg-cyan-500/15 text-cyan-300"
                  >
                    <Layers className="w-3 h-3" aria-hidden="true" />
                  </span>
                </IconTooltip>
                <span className="text-[9px] font-mono text-zinc-500 tabular-nums">
                  {animatedOverlayLayers.length}
                </span>
              </div>
              <div
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) startScrub(e);
                }}
                data-testid="overlays-keyframes-lane"
                className="relative flex-1 bg-[#080A0E]"
              >
                {animatedOverlayLayers.map((layer) => {
                  const st = layer.startTime ?? 0;
                  const en = layer.endTime ?? contentMaxTime;
                  const leftPx = (st / displayDuration) * trackPixelWidth;
                  const widthPx = Math.max(
                    26,
                    ((Math.max(st + 0.5, en) - st) / displayDuration) * trackPixelWidth
                  );
                  const isSel = layer.id === selectedLayerId;
                  return (
                    <div
                      key={layer.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLayer(layer.id);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onSelectLayer(layer.id);
                        onOpenAnimateForLayer?.(layer.id);
                      }}
                      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                      title={`${layer.name} (${st.toFixed(1)}s → ${en.toFixed(1)}s) · Double-click to animate`}
                      className={`absolute top-0.5 bottom-0.5 rounded border flex items-center px-1.5 text-[9px] cursor-pointer overflow-visible ${
                        isSel
                          ? 'bg-cyan-500/35 border-amber-300 text-white z-10'
                          : 'bg-cyan-500/18 border-cyan-400/45 text-cyan-100'
                      }`}
                    >
                      <span className="truncate pointer-events-none">
                        {layer.name}
                        {layer.animation && layer.animation.enterPreset !== 'none'
                          ? ` · ${layer.animation.enterPreset}`
                          : ''}
                      </span>
                      {/* Keyframe Diamond Markers */}
                      {layer.keyframes?.map((kf) => {
                        const kfRelPx =
                          ((kf.time - st) / displayDuration) * trackPixelWidth;
                        return (
                          <span
                            key={kf.id}
                            title={`Keyframe @ ${formatTimecode(kf.time)}`}
                            style={{ left: `${Math.max(4, kfRelPx)}px` }}
                            className="absolute top-1/2 -translate-y-1/2 -ml-1 w-2 h-2 bg-amber-400 rotate-45 border border-zinc-950 pointer-events-none"
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tracks 5..7: Multi-Select Draggable & Resizable Lyric Tracks */}
          {trackRows.map((row) => {
            const TrackIcon = row.icon;
            return (
              <div key={row.key} className="flex h-7 border-b border-white/6">
                <div
                  data-testid={`track-header-${row.key}`}
                  style={{ width: `${HEADER_WIDTH}px` }}
                  className="shrink-0 sticky left-0 z-20 bg-[#11141B] border-r border-white/10 px-1.5 flex items-center justify-between gap-0.5 select-none"
                >
                  <IconTooltip tip={row.label} align="left">
                    <span
                      aria-label={row.label}
                      className={`inline-flex items-center justify-center w-5 h-5 rounded bg-white/5 ${row.iconColor}`}
                    >
                      <TrackIcon className="w-3 h-3" aria-hidden="true" />
                    </span>
                  </IconTooltip>
                  <div className="flex items-center gap-0.5">
                    <IconTooltip tip={`Select all cues on ${row.label}`}>
                      <button
                        type="button"
                        aria-label={`Select all ${row.label}`}
                        onClick={() => onSelectAllOnTrack('cue')}
                        className="p-1 rounded text-zinc-500 hover:text-amber-300 cursor-pointer"
                      >
                        <CheckSquare className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </IconTooltip>
                    <IconTooltip
                      tip={row.locked ? `Unlock ${row.label}` : `Lock ${row.label}`}
                    >
                      <button
                        type="button"
                        aria-label={`${row.locked ? 'Unlock' : 'Lock'} ${row.label}`}
                        aria-pressed={row.locked}
                        onClick={() => toggleTrackLock(row.key)}
                        className={`p-1 rounded cursor-pointer transition-colors ${
                          row.locked
                            ? 'text-amber-400 bg-amber-500/15'
                            : 'text-zinc-500 hover:text-zinc-200'
                        }`}
                      >
                        {row.locked ? (
                          <Lock className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Unlock className="w-3 h-3" aria-hidden="true" />
                        )}
                      </button>
                    </IconTooltip>
                    <IconTooltip
                      tip={row.visible ? `Hide ${row.label}` : `Show ${row.label}`}
                    >
                      <button
                        type="button"
                        aria-label={`${row.visible ? 'Hide' : 'Show'} ${row.label}`}
                        aria-pressed={!row.visible}
                        onClick={() => onToggleTrack(row.key)}
                        className={`p-1 rounded cursor-pointer transition-colors ${
                          !row.visible
                            ? 'text-rose-400 bg-rose-500/15'
                            : 'text-zinc-400 hover:text-zinc-100'
                        }`}
                      >
                        {row.visible ? (
                          <Eye className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <EyeOff className="w-3 h-3" aria-hidden="true" />
                        )}
                      </button>
                    </IconTooltip>
                  </div>
                </div>
                <div
                  data-testid={`lyric-lane-${row.key}`}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if (e.target === e.currentTarget || lyricBoxSelectMode) {
                      e.preventDefault();
                      clearDomSelection();
                      const t = clientXToTime(e.clientX);
                      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                      setMarquee({
                        startX: e.clientX,
                        currentX: e.clientX,
                        startTime: t,
                        currentTime: t,
                        active: lyricBoxSelectMode,
                        additive,
                        initialCueIds: additive ? [...selectedCueIds] : [],
                      });
                    }
                  }}
                  className={`relative flex-1 bg-[#080A0E] transition-opacity ${
                    lyricBoxSelectMode ? 'cursor-crosshair' : 'cursor-default'
                  } ${row.visible ? 'opacity-100' : 'opacity-30'}`}
                >
                  {cues.map((cue, idx) => {
                    const text =
                      row.key === 'primary'
                        ? cue.primary
                        : row.key === 'roman'
                        ? cue.roman
                        : cue.english;
                    if (!text.trim()) return null;

                    const leftPx = (cue.startTime / displayDuration) * trackPixelWidth;
                    const widthPx = Math.max(
                      18,
                      ((cue.endTime - cue.startTime) / displayDuration) * trackPixelWidth
                    );
                    const isSelected =
                      isItemSelected('cue', cue.id) || cue.id === selectedCueId;
                    const isActive = cue.id === activeCueId;

                    return (
                      <div
                        key={`${row.key}-${cue.id}`}
                        data-testid={`timeline-cue-${row.key}-${idx}`}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.stopPropagation();
                          clearDomSelection();
                          if (lyricBoxSelectMode) {
                            const t = clientXToTime(e.clientX);
                            const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                            setMarquee({
                              startX: e.clientX,
                              currentX: e.clientX,
                              startTime: t,
                              currentTime: t,
                              active: true,
                              additive,
                              initialCueIds: additive ? [...selectedCueIds] : [],
                            });
                            return;
                          }
                          const multi = e.shiftKey || e.metaKey || e.ctrlKey;
                          const alreadyInGroup =
                            !multi &&
                            selectedCueIds.length > 1 &&
                            selectedCueIds.includes(cue.id);
                          if (!alreadyInGroup) {
                            handleSelectItem('cue', cue.id, multi, idx);
                          }
                          if (row.locked || multi) return;
                          const activeIds = alreadyInGroup ? [...selectedCueIds] : [cue.id];
                          const groupCues = cues.filter((c) => activeIds.includes(c.id));
                          const groupMinStart =
                            groupCues.length > 0
                              ? Math.min(...groupCues.map((c) => c.startTime))
                              : cue.startTime;
                          const groupMaxEnd =
                            groupCues.length > 0
                              ? Math.max(...groupCues.map((c) => c.endTime))
                              : cue.endTime;
                          setDragOp({
                            kind: 'cue',
                            mode: 'move',
                            id: cue.id,
                            startX: e.clientX,
                            origStart: cue.startTime,
                            origEnd: cue.endTime,
                            selectedIds: activeIds,
                            groupMinStart,
                            groupMaxEnd,
                            snapshot: cues.map((c) => ({ ...c })),
                          });
                        }}
                        style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                        title={`${text} (${formatTimecode(cue.startTime)} → ${formatTimecode(
                          cue.endTime
                        )}) · Drag empty lane or Box Select to select multiple · Drag selected group to shift together`}
                        className={`group absolute top-0.5 bottom-0.5 rounded border text-[10px] flex items-center overflow-hidden select-none transition-colors ${
                          lyricBoxSelectMode
                            ? 'cursor-crosshair'
                            : row.locked
                            ? 'cursor-not-allowed'
                            : 'cursor-grab active:cursor-grabbing'
                        } ${
                          isSelected
                            ? 'bg-amber-500/55 border-amber-200 text-white font-semibold z-10'
                            : isActive
                            ? 'bg-amber-500 border-amber-200 text-zinc-950 font-semibold z-10'
                            : row.accent
                        }`}
                      >
                        <div
                          role="separator"
                          aria-label={`Resize start of cue ${idx + 1}`}
                          onPointerDown={(e) => {
                            if (lyricBoxSelectMode) return;
                            e.preventDefault();
                            e.stopPropagation();
                            clearDomSelection();
                            handleSelectItem('cue', cue.id, false, idx);
                            if (row.locked) return;
                            setDragOp({
                              kind: 'cue',
                              mode: 'resize-left',
                              id: cue.id,
                              startX: e.clientX,
                              origStart: cue.startTime,
                              origEnd: cue.endTime,
                              selectedIds: [cue.id],
                              groupMinStart: cue.startTime,
                              groupMaxEnd: cue.endTime,
                              snapshot: cues.map((c) => ({ ...c })),
                            });
                          }}
                          className={`w-1.5 h-full shrink-0 ${
                            row.locked ? 'cursor-not-allowed' : 'cursor-ew-resize hover:bg-white/60'
                          }`}
                        />
                        <span className="px-1 truncate flex-1 pointer-events-none select-none">
                          {idx + 1}. {text}
                        </span>
                        <div
                          role="separator"
                          aria-label={`Resize end of cue ${idx + 1}`}
                          onPointerDown={(e) => {
                            if (lyricBoxSelectMode) return;
                            e.preventDefault();
                            e.stopPropagation();
                            clearDomSelection();
                            handleSelectItem('cue', cue.id, false, idx);
                            if (row.locked) return;
                            setDragOp({
                              kind: 'cue',
                              mode: 'resize-right',
                              id: cue.id,
                              startX: e.clientX,
                              origStart: cue.startTime,
                              origEnd: cue.endTime,
                              selectedIds: [cue.id],
                              groupMinStart: cue.startTime,
                              groupMaxEnd: cue.endTime,
                              snapshot: cues.map((c) => ({ ...c })),
                            });
                          }}
                          className={`w-1.5 h-full shrink-0 ${
                            row.locked ? 'cursor-not-allowed' : 'cursor-ew-resize hover:bg-white/60'
                          }`}
                        />
                      </div>
                    );
                  })}

                  {/* Live Rubber-Band Marquee Box Overlay across Lyric Tracks */}
                  {marquee?.active && (
                    <div
                      data-testid={row.key === 'primary' ? 'lyric-marquee-box' : undefined}
                      style={{
                        left: `${
                          (Math.min(marquee.startTime, marquee.currentTime) / displayDuration) *
                          trackPixelWidth
                        }px`,
                        width: `${Math.max(
                          4,
                          (Math.abs(marquee.currentTime - marquee.startTime) / displayDuration) *
                            trackPixelWidth
                        )}px`,
                      }}
                      className="absolute top-0 bottom-0 bg-sky-400/20 border-x border-sky-300/90 pointer-events-none z-20"
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Magnetic Snap Guide Line (Emerald laser when 2+ elements align at the same timestamp) */}
          {activeSnapGuideTime !== null && (
            <div
              data-testid="timeline-snap-guide"
              style={{
                left: `${
                  HEADER_WIDTH + (activeSnapGuideTime / displayDuration) * trackPixelWidth
                }px`,
              }}
              className={`absolute top-0 bottom-0 w-[2px] z-30 pointer-events-none ${
                playheadSnapInfo?.isMultiAligned
                  ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.95)]'
                  : 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]'
              }`}
            />
          )}

          {/* Global Playhead Line with Magnetic Grab Vibration Pulse, Alignment Badge & Quick Split */}
          <div
            style={{ left: `${HEADER_WIDTH + playheadPx}px` }}
            className={`absolute top-0 bottom-0 w-[2px] z-30 pointer-events-none transition-colors ${
              playheadSnapPulse
                ? 'bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.95)]'
                : 'bg-rose-500'
            }`}
          >
            <div
              data-testid="timeline-playhead-pin"
              onPointerDown={startScrub}
              title="Drag playhead (magnetically grabs element starts & ends · Hold Alt to bypass)"
              className={`pointer-events-auto w-3 h-3 -ml-[5px] rounded-b-sm cursor-ew-resize shadow transition-transform duration-100 ${
                playheadSnapPulse
                  ? 'bg-amber-400 scale-125 ring-2 ring-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.95)]'
                  : 'bg-rose-500'
              }`}
            />

            {playheadSnapInfo?.snapped && (
              <div
                data-testid="playhead-snap-badge"
                className={`absolute top-0.5 left-3 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold whitespace-nowrap shadow-lg border pointer-events-none ${
                  playheadSnapInfo.isMultiAligned
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-200'
                    : 'bg-amber-400 text-zinc-950 border-amber-200'
                }`}
              >
                {playheadSnapInfo.isMultiAligned ? 'ALIGNED: ' : 'SNAP: '}
                {playheadSnapInfo.matchedLabels.slice(0, 3).join(' + ')} ·{' '}
                {formatTimecode(playheadSnapInfo.time).slice(0, 8)}
              </div>
            )}

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSplitAtPlayhead();
              }}
              title="Split active clip, audio, FX, or lyric at playhead"
              aria-label="Split at playhead needle"
              className="pointer-events-auto absolute top-7 -ml-[10px] w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-110"
            >
              <Scissors className="w-2.5 h-2.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
