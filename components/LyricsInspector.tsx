'use client';

import React, { useRef, useState } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Crosshair,
  Upload,
  Check,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlertTriangle,
  RotateCcw,
  Download,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  Type,
  Square,
  ImagePlus,
  Italic,
  Subtitles,
  PanelRightClose,
  AudioWaveform,
  Zap,
  Activity,
  ZoomIn,
  Waves,
  CircleDot,
  Ban,
  BarChart3,
  Radio,
  Film,
  SlidersHorizontal,
  Clapperboard,
  Diamond,
  Clock,
  Eraser,
  Timer,
  Wand2,
  Flame,
  Heart,
  Grid,
  Users,
  Wind,
  Disc3,
  Orbit,
  User,
} from 'lucide-react';
import {
  EnabledTracks,
  FARSI_FONT_OPTIONS,
  LATIN_FONT_OPTIONS,
  LyricCue,
  LyricSourceType,
  LyricStyleConfig,
  LyricTrackType,
  PlainImportMode,
  SAMPLE_MULTI_LYRICS,
  SrtValidationWarning,
  detectScriptDirection,
  formatTimecode,
  parseTimecodeInput,
} from '@/lib/lyrics-parser';
import {
  FocusedScrollingConfig,
} from '@/lib/scrolling-lyrics';
import {
  CanvasLayer,
  KeyframeEasing,
  LayerAnimationPreset,
  ShapeKind,
  TimerCounterFormat,
  TimerCounterMode,
  TimerCounterStyle,
  formatLayerDisplayLabel,
  hasLayerAnimation,
} from '@/lib/canvas-layers';
import {
  BLEND_MODE_OPTIONS,
  DEFAULT_LAYER_KEYING_CONFIG,
  KEY_MODE_OPTIONS,
  LayerBlendMode,
  LayerKeyMode,
  LayerKeyingConfig,
} from '@/lib/image-blending';
import {
  AUDIO_VISUALIZER_PRESETS,
  AudioVisualizerType,
  BEAT_VISUAL_EFFECT_PRESETS,
  BeatEffectsConfig,
  BeatSyncTarget,
  BeatVisualEffectType,
} from '@/lib/beat-effects';
import {
  DEFAULT_LAYER_ANIMATION,
  LAYER_ANIMATION_PRESETS,
  TimedEffectClip,
} from '@/lib/timeline-engine';
import { IconTooltip } from './TooltipButton';

export type InspectorTab = 'lyrics' | 'style' | 'effects';
export type EffectsSubTab = 'animate' | 'beat' | 'scroll';

interface LyricsInspectorProps {
  cues: LyricCue[];
  currentTime: number;
  duration: number;
  globalOffset: number;
  lyricSource: LyricSourceType;
  validationWarnings: SrtValidationWarning[];
  enabledTracks: EnabledTracks;
  style: LyricStyleConfig;
  scrollingConfig: FocusedScrollingConfig;
  beatEffects: BeatEffectsConfig;
  hasAudioBeatData: boolean;
  detectedBeatCount: number;
  layers: CanvasLayer[];
  selectedLayerId: string | null;
  selectedCueId: string | null;
  syncTargetIndex: number;
  activeTab: InspectorTab;
  effectsSubTab: EffectsSubTab;
  onChangeTab: (tab: InspectorTab) => void;
  onChangeEffectsSubTab: (subTab: EffectsSubTab) => void;
  onCollapse?: () => void;
  onToggleTrack: (track: keyof EnabledTracks) => void;
  onChangeGlobalOffset: (offsetSeconds: number) => void;
  onImportPlainLyrics: (text: string, mode: PlainImportMode) => void;
  onUploadTrackSrt: (track: LyricTrackType, content: string, fileName: string) => void;
  onClearLyrics: () => void;
  onExportCorrectedSrt: () => void;
  onUpdateCueText: (
    id: string,
    field: 'primary' | 'roman' | 'english',
    value: string
  ) => void;
  onUpdateCueTiming: (id: string, start: number, end: number) => void;
  onStampCueAtCurrentTime: (index: number) => void;
  onDuplicateCue: (id: string) => void;
  onDeleteCue: (id: string) => void;
  onAddCue: () => void;
  onSeekToCue: (time: number, cueId?: string) => void;
  onChangeStyle: (patch: Partial<LyricStyleConfig>) => void;
  onChangeScrollingConfig: (patch: Partial<FocusedScrollingConfig>) => void;
  onResetScrollingDefaults: () => void;
  onChangeBeatEffects: (patch: Partial<BeatEffectsConfig>) => void;
  onResetBeatEffects: () => void;
  // Timed FX clips (customized time frame)
  effectClips: TimedEffectClip[];
  onAddTimedEffect: (
    effectType: Exclude<BeatVisualEffectType, 'none'>,
    startTime: number,
    endTime: number,
    syncTarget: BeatSyncTarget,
    intensity: number
  ) => void;
  onDeleteTimedEffect: (id: string) => void;
  // Layer & Keyframe Animation
  onSelectLayer: (id: string | null) => void;
  onUpdateLayer: (id: string, patch: Partial<CanvasLayer>) => void;
  onUpsertLayerKeyframe: (layerId: string, time: number, easing?: KeyframeEasing) => void;
  onRemoveLayerKeyframe: (layerId: string, keyframeId: string) => void;
  onAddTextLayer: () => void;
  onAddShapeLayer: (shapeKind: ShapeKind) => void;
  onAddImageLayer: (file: File) => void;
  onAddTimerCounterLayer: (
    preset?: 'stopwatch' | 'progress' | 'countdown' | 'minimal'
  ) => void;
  onAutoBlendLayer: (id: string) => void;
  onBringLayerForward: (id: string) => void;
  onSendLayerBackward: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onClearLayerAnimation: (id: string) => void;
}

const SOURCE_LABELS: Record<LyricSourceType, string> = {
  sample: 'Sample Demo',
  manual: 'Manual',
  'farsi-srt': 'Farsi SRT',
  'romanized-srt': 'Romanized SRT',
  'english-srt': 'English SRT',
  'multi-srt': 'Multi-SRT Matched',
};

export default function LyricsInspector({
  cues,
  currentTime,
  duration,
  globalOffset,
  lyricSource,
  validationWarnings,
  enabledTracks,
  style,
  scrollingConfig,
  beatEffects,
  hasAudioBeatData,
  detectedBeatCount,
  layers,
  selectedLayerId,
  selectedCueId,
  syncTargetIndex,
  activeTab,
  effectsSubTab,
  onChangeTab,
  onChangeEffectsSubTab,
  onCollapse,
  onToggleTrack,
  onChangeGlobalOffset,
  onImportPlainLyrics,
  onUploadTrackSrt,
  onClearLyrics,
  onExportCorrectedSrt,
  onUpdateCueText,
  onUpdateCueTiming,
  onStampCueAtCurrentTime,
  onDuplicateCue,
  onDeleteCue,
  onAddCue,
  onSeekToCue,
  onChangeStyle,
  onChangeScrollingConfig,
  onResetScrollingDefaults,
  onChangeBeatEffects,
  onResetBeatEffects,
  effectClips,
  onAddTimedEffect,
  onDeleteTimedEffect,
  onSelectLayer,
  onUpdateLayer,
  onUpsertLayerKeyframe,
  onRemoveLayerKeyframe,
  onAddTextLayer,
  onAddShapeLayer,
  onAddImageLayer,
  onAddTimerCounterLayer,
  onAutoBlendLayer,
  onBringLayerForward,
  onSendLayerBackward,
  onDuplicateLayer,
  onDeleteLayer,
  onClearLayerAnimation,
}: LyricsInspectorProps) {
  const [showImporter, setShowImporter] = useState(false);
  const [rawLyrics, setRawLyrics] = useState(SAMPLE_MULTI_LYRICS);
  const [importMode, setImportMode] = useState<PlainImportMode>('auto');
  const [importError, setImportError] = useState<string | null>(null);
  const [offsetDraft, setOffsetDraft] = useState<string>('');
  const [showWarnings, setShowWarnings] = useState<boolean>(true);
  const [customFarsiFont, setCustomFarsiFont] = useState<string>('');
  const [customLayerFont, setCustomLayerFont] = useState<string>('');
  const [timedFxStart, setTimedFxStart] = useState<number>(2);
  const [timedFxEnd, setTimedFxEnd] = useState<number>(8);
  const [timedFxType, setTimedFxType] =
    useState<Exclude<BeatVisualEffectType, 'none'>>('ring-ripple');
  const [fxCategoryFilter, setFxCategoryFilter] = useState<'all' | 'motion' | 'body'>('all');

  const farsiSrtRef = useRef<HTMLInputElement>(null);
  const romanSrtRef = useRef<HTMLInputElement>(null);
  const englishSrtRef = useRef<HTMLInputElement>(null);
  const layerImageRef = useRef<HTMLInputElement>(null);

  const handleTrackSrtUpload = async (track: LyricTrackType, file: File) => {
    try {
      const content = await file.text();
      onUploadTrackSrt(track, content, file.name);
    } catch {
      setImportError(`Could not read ${file.name}.`);
    }
  };

  const handleApplyRaw = () => {
    if (!rawLyrics.trim()) {
      setImportError('Paste lyrics in Farsi, Romanized, or English first.');
      return;
    }
    setImportError(null);
    onImportPlainLyrics(rawLyrics, importMode);
    setShowImporter(false);
  };

  const adjustedTime = currentTime + globalOffset;
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) ?? null;

  return (
    <aside
      aria-label="Lyrics, Style, and Effects Inspector"
      data-testid="inspector-panel"
      className="flex flex-col h-full bg-[#12151C] border-l border-white/8 overflow-hidden"
    >
      {/* Compact Icon-First 3-Tab Switcher + Collapse Button */}
      <div className="px-2.5 py-2 border-b border-white/8 flex items-center gap-1.5 select-none">
        <div
          role="tablist"
          aria-label="Inspector sections"
          className="flex-1 grid grid-cols-3 gap-1 p-0.5 bg-[#0B0D11] rounded-lg border border-white/8"
        >
          <IconTooltip tip={`Lyrics & Sync (${cues.length} lines)`} position="bottom" align="left">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'lyrics'}
              aria-label={`Lyrics (${cues.length})`}
              onClick={() => onChangeTab('lyrics')}
              className={`w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'lyrics'
                  ? 'bg-[#1D222D] text-amber-300'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Subtitles className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="font-mono tabular-nums text-[10px]">{cues.length}</span>
            </button>
          </IconTooltip>

          <IconTooltip tip="Overlay Style, Fonts & Canvas Layers" position="bottom">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'style'}
              aria-label="Overlay Style"
              onClick={() => onChangeTab('style')}
              className={`w-full inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'style'
                  ? 'bg-[#1D222D] text-amber-300'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          <IconTooltip tip="Beat FX, Audio Visualizers & Scrolling Lyrics" position="bottom" align="right">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'effects'}
              aria-label="Effects"
              onClick={() => onChangeTab('effects')}
              className={`w-full inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'effects'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>
        </div>

        {onCollapse && (
          <IconTooltip tip="Minimize inspector panel" position="bottom" align="right">
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Minimize Inspector Panel"
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/8 rounded-md transition-colors cursor-pointer shrink-0"
            >
              <PanelRightClose className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>
        )}
      </div>

      <input
        ref={layerImageRef}
        type="file"
        accept="image/*"
        aria-label="Upload decorative image or logo layer"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onAddImageLayer(f);
            e.target.value = '';
          }
        }}
      />

      {activeTab === 'lyrics' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Compact Browser-Only Lyric Import, Offset & Track Toggles (keeps Lyrics list prominently visible even in Portrait 9:16 mode) */}
          <div className="px-2.5 py-2 border-b border-white/8 space-y-1.5 shrink-0 bg-[#10131A]">
            {/* Row 1: Source badge + FA / RO / EN quick SRT upload + Paste / Export / Clear All */}
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[10px] font-medium text-zinc-400 truncate max-w-[105px]">
                  {SOURCE_LABELS[lyricSource]}
                </span>
                <div className="flex items-center gap-0.5">
                  <IconTooltip tip="Upload Farsi / Dari .SRT file" position="bottom" align="left">
                    <button
                      type="button"
                      onClick={() => farsiSrtRef.current?.click()}
                      aria-label="Upload Farsi SRT"
                      className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium bg-[#191D26] hover:bg-[#222834] text-zinc-200 rounded border border-white/10 cursor-pointer"
                    >
                      <Upload className="w-2.5 h-2.5 text-amber-400" aria-hidden="true" />
                      <span>FA</span>
                    </button>
                  </IconTooltip>
                  <IconTooltip tip="Upload Romanized .SRT file" position="bottom">
                    <button
                      type="button"
                      onClick={() => romanSrtRef.current?.click()}
                      aria-label="Upload Roman SRT"
                      className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium bg-[#191D26] hover:bg-[#222834] text-zinc-200 rounded border border-white/10 cursor-pointer"
                    >
                      <Upload className="w-2.5 h-2.5 text-sky-400" aria-hidden="true" />
                      <span>RO</span>
                    </button>
                  </IconTooltip>
                  <IconTooltip tip="Upload English .SRT file" position="bottom">
                    <button
                      type="button"
                      onClick={() => englishSrtRef.current?.click()}
                      aria-label="Upload English SRT"
                      className="inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium bg-[#191D26] hover:bg-[#222834] text-zinc-200 rounded border border-white/10 cursor-pointer"
                    >
                      <Upload className="w-2.5 h-2.5 text-emerald-400" aria-hidden="true" />
                      <span>EN</span>
                    </button>
                  </IconTooltip>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <IconTooltip tip="Paste or edit multi-language lyrics" position="bottom">
                  <button
                    type="button"
                    onClick={() => setShowImporter((v) => !v)}
                    aria-label={showImporter ? 'Close Paste / Edit' : 'Paste / Edit Lyrics'}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      showImporter
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </IconTooltip>
                <IconTooltip tip="Download corrected .SRT file" position="bottom">
                  <button
                    type="button"
                    onClick={onExportCorrectedSrt}
                    disabled={cues.length === 0}
                    aria-label="Export SRT"
                    className="p-1 bg-[#191D26] hover:bg-[#232936] disabled:opacity-40 text-amber-400 rounded border border-white/10 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </IconTooltip>
                <IconTooltip tip="Delete all lyrics at once" position="bottom" align="right">
                  <button
                    type="button"
                    onClick={onClearLyrics}
                    disabled={cues.length === 0}
                    aria-label="Delete all lyrics at once"
                    data-testid="delete-all-lyrics-btn"
                    className="inline-flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium bg-rose-500/12 hover:bg-rose-500/25 disabled:opacity-40 text-rose-300 rounded border border-rose-500/30 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    <span>All</span>
                  </button>
                </IconTooltip>
              </div>

              <input
                ref={farsiSrtRef}
                type="file"
                accept=".srt,.txt"
                aria-label="Upload Farsi or Dari SRT file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    handleTrackSrtUpload('farsi', f);
                    e.target.value = '';
                  }
                }}
              />
              <input
                ref={romanSrtRef}
                type="file"
                accept=".srt,.txt"
                aria-label="Upload Romanized SRT file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    handleTrackSrtUpload('romanized', f);
                    e.target.value = '';
                  }
                }}
              />
              <input
                ref={englishSrtRef}
                type="file"
                accept=".srt,.txt"
                aria-label="Upload English SRT file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    handleTrackSrtUpload('english', f);
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {/* Expandable Paste / Manual Text Drawer */}
            {showImporter && (
              <div className="p-2 rounded-lg bg-[#0B0D11] border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="import-mode-select"
                    className="text-[11px] font-medium text-zinc-400"
                  >
                    Script Layout
                  </label>
                  <select
                    id="import-mode-select"
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value as PlainImportMode)}
                    className="bg-[#161A22] text-zinc-100 text-xs rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500"
                  >
                    <option value="auto">Auto-Detect (SRT / | / Stanzas)</option>
                    <option value="pipe-separated">Pipe: Farsi | Roman | Eng</option>
                    <option value="paired-3">3-Line Blocks (Farsi + Roman + Eng)</option>
                    <option value="paired-2">2-Line Blocks (Farsi + Eng)</option>
                    <option value="single">Single Language (1 line / cue)</option>
                  </select>
                </div>

                <textarea
                  value={rawLyrics}
                  onChange={(e) => setRawLyrics(e.target.value)}
                  rows={4}
                  aria-label="Paste lyrics in Farsi, Roman, English, or SRT format"
                  placeholder="Paste Farsi/Dari lyrics, SRT content, or multi-language lines like:&#10;شب یلدا | Shab-e yalda | Solstice night"
                  className="w-full rounded-lg bg-[#12151C] border border-white/10 p-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 leading-relaxed"
                />

                {importError && (
                  <p className="text-xs text-red-400" role="alert">
                    {importError}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRawLyrics(SAMPLE_MULTI_LYRICS);
                      setImportMode('pipe-separated');
                      setImportError(null);
                    }}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
                  >
                    Reset Sample
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyRaw}
                    className="px-3 py-1 text-xs font-semibold bg-amber-500 text-zinc-950 rounded-md hover:bg-amber-400 cursor-pointer"
                  >
                    Apply to Timeline
                  </button>
                </div>
              </div>
            )}

            {/* Row 2: Compact Inline Global Offset + Track Visibility Toggles */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-0.5 bg-[#0B0D11] border border-white/8 rounded px-1.5 py-0.5">
                <span className="text-[10px] text-zinc-400 mr-0.5">Offset</span>
                <span className="text-[10px] font-mono tabular-nums text-amber-300 mr-1">
                  {globalOffset >= 0 ? '+' : ''}
                  {globalOffset.toFixed(2)}s
                </span>
                {[-0.25, 0, 0.25].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      onChangeGlobalOffset(
                        preset === 0 ? 0 : Number((globalOffset + preset).toFixed(2))
                      )
                    }
                    className="px-1.5 py-0.5 text-[9px] font-mono tabular-nums rounded bg-[#191D26] hover:bg-[#232936] text-zinc-200 border border-white/8 cursor-pointer"
                  >
                    {preset === 0 ? '0s' : preset > 0 ? `+${preset}s` : `${preset}s`}
                  </button>
                ))}
                <input
                  type="text"
                  aria-label="Custom global offset in seconds"
                  placeholder="sec"
                  value={offsetDraft}
                  onChange={(e) => setOffsetDraft(e.target.value)}
                  onBlur={() => {
                    if (offsetDraft.trim()) {
                      const val = Number(offsetDraft.trim().replace('s', ''));
                      if (Number.isFinite(val)) {
                        onChangeGlobalOffset(Number(val.toFixed(2)));
                      }
                      setOffsetDraft('');
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = Number(offsetDraft.trim().replace('s', ''));
                      if (Number.isFinite(val)) {
                        onChangeGlobalOffset(Number(val.toFixed(2)));
                      }
                      setOffsetDraft('');
                    }
                  }}
                  className="w-10 px-1 py-0.5 text-[9px] font-mono bg-[#090B0F] text-zinc-200 rounded border border-white/10 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex-1 grid grid-cols-3 gap-1 min-w-[175px]">
                {(
                  [
                    { key: 'primary', label: 'Farsi' },
                    { key: 'roman', label: 'Roman' },
                    { key: 'english', label: 'English' },
                  ] as const
                ).map((t) => {
                  const active = enabledTracks[t.key];
                  return (
                    <button
                      key={t.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onToggleTrack(t.key)}
                      className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-1 text-[10px] font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-[#0B0D11] border-white/8 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {active && <Check className="w-2.5 h-2.5" aria-hidden="true" />}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Validation Warnings (non-blocking) */}
            {validationWarnings.length > 0 && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setShowWarnings((v) => !v)}
                  className="w-full flex items-center justify-between text-amber-200 font-medium cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-400" aria-hidden="true" />
                    <span>
                      {validationWarnings.length}{' '}
                      {validationWarnings.length === 1 ? 'warning' : 'warnings'}
                    </span>
                  </span>
                  <span className="text-[10px] text-amber-300 underline">
                    {showWarnings ? 'Hide' : 'Show'}
                  </span>
                </button>
                {showWarnings && (
                  <ul className="mt-1 space-y-0.5 max-h-20 overflow-y-auto text-[10px] text-amber-100/85">
                    {validationWarnings.slice(0, 6).map((w) => (
                      <li key={w.id} className="leading-snug">
                        • {w.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Cue List — always min-h-0 flex-1 overflow-y-auto so lyric cards stay visible above timeline */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2" data-testid="cue-list">
            {cues.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <p className="text-sm font-medium text-zinc-300">No lyrics loaded</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Paste lyrics or upload a Farsi, Romanized, or English .SRT file above.
                </p>
              </div>
            ) : (
              cues.map((cue, index) => {
                const isActive =
                  adjustedTime >= cue.startTime && adjustedTime < cue.endTime;
                const isSelected = cue.id === selectedCueId || index === syncTargetIndex;
                const primaryDir = detectScriptDirection(cue.primary);
                const durationSec = Math.max(0.1, cue.endTime - cue.startTime);
                const hasUnmatched = Boolean(
                  cue.unmatchedTracks && cue.unmatchedTracks.length > 0
                );

                return (
                  <div
                    key={cue.id}
                    className={`rounded-lg border p-2.5 space-y-1.5 transition-colors ${
                      isActive
                        ? 'bg-[#1B202C] border-amber-500/70'
                        : isSelected
                        ? 'bg-[#161A23] border-white/25'
                        : 'bg-[#0E1117] border-white/8'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            onSeekToCue(
                              Math.max(
                                0,
                                cue.startTime +
                                  Math.min(0.5, durationSec * 0.25) -
                                  globalOffset
                              ),
                              cue.id
                            )
                          }
                          className="text-[11px] font-mono tabular-nums text-zinc-400 hover:text-amber-400 cursor-pointer whitespace-nowrap"
                          title="Jump playhead to this lyric"
                        >
                          {String(index + 1).padStart(2, '0')} · {durationSec.toFixed(1)}s
                        </button>
                        {hasUnmatched && (
                          <span
                            title={`Unmatched track(s): ${cue.unmatchedTracks?.join(', ')}`}
                            aria-label={`Unmatched track warning on cue ${index + 1}`}
                            className="text-amber-400"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <CueTimeInput
                          label={`Line ${index + 1} start time`}
                          value={cue.startTime}
                          onCommit={(val) => onUpdateCueTiming(cue.id, val, cue.endTime)}
                        />
                        <span className="text-[10px] text-zinc-600">→</span>
                        <CueTimeInput
                          label={`Line ${index + 1} end time`}
                          value={cue.endTime}
                          onCommit={(val) => onUpdateCueTiming(cue.id, cue.startTime, val)}
                        />
                        <button
                          type="button"
                          onClick={() => onStampCueAtCurrentTime(index)}
                          aria-label={`Sync line ${index + 1} to current time`}
                          title="Set start time to current playhead"
                          className="p-1 text-amber-400 hover:bg-amber-500/15 rounded cursor-pointer"
                        >
                          <Crosshair className="w-3 h-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateCue(cue.id)}
                          aria-label={`Duplicate lyric line ${index + 1}`}
                          title="Duplicate cue"
                          className="p-1 text-zinc-400 hover:text-white rounded cursor-pointer"
                        >
                          <Copy className="w-3 h-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCue(cue.id)}
                          aria-label={`Delete lyric line ${index + 1}`}
                          className="p-1 text-zinc-500 hover:text-red-400 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <input
                        type="text"
                        dir={primaryDir}
                        value={cue.primary}
                        onChange={(e) =>
                          onUpdateCueText(cue.id, 'primary', e.target.value)
                        }
                        aria-label={`Line ${index + 1} primary lyric`}
                        placeholder="Farsi / Dari lyric..."
                        className={`w-full rounded bg-[#090B0F] border border-white/8 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 ${
                          primaryDir === 'rtl'
                            ? 'font-[family-name:var(--font-farsi)] text-sm'
                            : ''
                        }`}
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={cue.roman}
                        onChange={(e) => onUpdateCueText(cue.id, 'roman', e.target.value)}
                        aria-label={`Line ${index + 1} romanized lyric`}
                        placeholder="Romanized / Finglish (optional)..."
                        className="w-full rounded bg-[#090B0F] border border-white/8 px-2 py-1 text-xs text-amber-200/90 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={cue.english}
                        onChange={(e) =>
                          onUpdateCueText(cue.id, 'english', e.target.value)
                        }
                        aria-label={`Line ${index + 1} English translation`}
                        placeholder="English translation (optional)..."
                        className="w-full rounded bg-[#090B0F] border border-white/8 px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                );
              })
            )}

            <button
              type="button"
              onClick={onAddCue}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-[#0E1117] hover:bg-[#191D26] border border-dashed border-white/15 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Lyric Line</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'style' && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
          {/* Nastaliq & Farsi Font Selector */}
          <div className="space-y-2 p-2.5 rounded-lg bg-[#0E1117] border border-white/8">
            <label
              htmlFor="style-farsi-font"
              className="block text-xs font-medium text-zinc-200"
            >
              Farsi / Dari Font (Nastaliq Supported)
            </label>
            <select
              id="style-farsi-font"
              value={style.farsiFont}
              onChange={(e) => {
                onChangeStyle({ farsiFont: e.target.value });
                onChangeScrollingConfig({ farsiFont: e.target.value });
              }}
              className="w-full bg-[#161A22] text-zinc-100 text-xs rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-amber-500"
            >
              {FARSI_FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customFarsiFont}
                onChange={(e) => setCustomFarsiFont(e.target.value)}
                placeholder="Local Nastaliq font name (e.g. IranNastaliq)..."
                aria-label="Custom local Farsi font name"
                className="flex-1 bg-[#090B0F] text-zinc-200 text-[11px] rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (customFarsiFont.trim()) {
                    onChangeStyle({ farsiFont: customFarsiFont.trim() });
                    onChangeScrollingConfig({ farsiFont: customFarsiFont.trim() });
                  }
                }}
                className="px-2 py-1 text-[11px] bg-[#191D26] hover:bg-[#232936] text-amber-300 rounded border border-white/10 cursor-pointer"
              >
                Use
              </button>
            </div>
          </div>

          {/* Text Scale & Classic Subtitle Appearance */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-300 font-medium">Classic Text Size</span>
                <span className="font-mono tabular-nums text-zinc-400">
                  {Math.round(style.fontScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.6}
                step={0.05}
                aria-label="Lyric text size scale"
                value={style.fontScale}
                onChange={(e) => onChangeStyle({ fontScale: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/8">
              {(
                [
                  { id: 'left', icon: AlignLeft, label: 'Left' },
                  { id: 'center', icon: AlignCenter, label: 'Center' },
                  { id: 'right', icon: AlignRight, label: 'Right' },
                ] as const
              ).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeStyle({ alignment: id })}
                  className={`inline-flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    style.alignment === id
                      ? 'bg-[#1D222D] text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/8">
              {(
                [
                  { id: 'shadow', label: 'Shadow' },
                  { id: 'scrim', label: 'Scrim' },
                  { id: 'box', label: 'Dark Box' },
                ] as const
              ).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onChangeStyle({ backdrop: b.id })}
                  className={`py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    style.backdrop === b.id
                      ? 'bg-[#1D222D] text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'White & Gold', primary: '#FFFFFF', secondary: '#FCD34D' },
                { name: 'Warm Ivory', primary: '#FEF3C7', secondary: '#F59E0B' },
                { name: 'Crisp Ice', primary: '#FFFFFF', secondary: '#BAE6FD' },
                { name: 'Pure Minimal', primary: '#FFFFFF', secondary: '#D4D4D8' },
              ].map((preset) => {
                const selected =
                  style.primaryColor === preset.primary &&
                  style.secondaryColor === preset.secondary;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      onChangeStyle({
                        primaryColor: preset.primary,
                        secondaryColor: preset.secondary,
                      })
                    }
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                      selected
                        ? 'bg-[#1D222D] border-amber-500/50 text-zinc-100'
                        : 'bg-[#0E1117] border-white/8 text-zinc-300'
                    }`}
                  >
                    <span className="flex items-center -space-x-1 shrink-0">
                      <span
                        className="w-3 h-3 rounded-full border border-black/40"
                        style={{ backgroundColor: preset.primary }}
                      />
                      <span
                        className="w-3 h-3 rounded-full border border-black/40"
                        style={{ backgroundColor: preset.secondary }}
                      />
                    </span>
                    <span className="truncate">{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Canvas Elements & Layers Manager */}
          <div className="pt-3 border-t border-white/8 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <Layers className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>Canvas Elements & Layers</span>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={onAddTextLayer}
                className="inline-flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] font-medium bg-[#191D26] hover:bg-[#232936] text-zinc-100 rounded border border-white/10 cursor-pointer"
              >
                <Type className="w-3 h-3 text-amber-400" aria-hidden="true" />
                <span>+ Text</span>
              </button>
              <button
                type="button"
                onClick={() => onAddShapeLayer('pill')}
                className="inline-flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] font-medium bg-[#191D26] hover:bg-[#232936] text-zinc-100 rounded border border-white/10 cursor-pointer"
              >
                <Square className="w-3 h-3 text-amber-400" aria-hidden="true" />
                <span>+ Shape</span>
              </button>
              <button
                type="button"
                onClick={() => layerImageRef.current?.click()}
                className="inline-flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] font-medium bg-[#191D26] hover:bg-[#232936] text-zinc-100 rounded border border-white/10 cursor-pointer"
              >
                <ImagePlus className="w-3 h-3 text-amber-400" aria-hidden="true" />
                <span>+ Logo</span>
              </button>
              <button
                type="button"
                data-testid="add-timer-layer-btn"
                onClick={() => onAddTimerCounterLayer('stopwatch')}
                className="inline-flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] font-medium bg-[#191D26] hover:bg-[#232936] text-zinc-100 rounded border border-white/10 cursor-pointer"
              >
                <Timer className="w-3 h-3 text-sky-400" aria-hidden="true" />
                <span>+ Timer</span>
              </button>
            </div>

            {/* Layer List */}
            <div className="space-y-1.5" data-testid="canvas-layers-list">
              {[...layers].reverse().map((layer) => {
                const isSel = layer.id === selectedLayerId;
                const isCoreLyric =
                  layer.type === 'scrolling-lyrics' ||
                  layer.type === 'lyric-farsi' ||
                  layer.type === 'lyric-romanized' ||
                  layer.type === 'lyric-english';
                const animated = hasLayerAnimation(layer);
                const displayName = formatLayerDisplayLabel(layer);

                return (
                  <div
                    key={layer.id}
                    data-testid={`layer-row-${layer.id}`}
                    className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                      isSel
                        ? 'bg-[#1D222D] border-amber-500/60'
                        : 'bg-[#0E1117] border-white/8'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectLayer(layer.id)}
                      className="flex-1 min-w-0 text-left flex items-center gap-1.5 text-zinc-200 font-medium cursor-pointer"
                    >
                      <span className="truncate">{displayName}</span>
                      {animated && (
                        <span
                          title="Animation applied"
                          className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400"
                        />
                      )}
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {animated && (
                        <IconTooltip tip={`Delete animation from ${displayName}`}>
                          <button
                            type="button"
                            onClick={() => onClearLayerAnimation(layer.id)}
                            aria-label={`Delete animation from ${displayName}`}
                            className="p-1 text-rose-400/85 hover:text-rose-300 cursor-pointer"
                          >
                            <Eraser className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </IconTooltip>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateLayer(layer.id, { locked: !layer.locked })
                        }
                        aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${displayName}`}
                        className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        {layer.locked ? (
                          <Lock className="w-3 h-3 text-amber-400" aria-hidden="true" />
                        ) : (
                          <Unlock className="w-3 h-3" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateLayer(layer.id, { visible: !layer.visible })
                        }
                        aria-label={`${layer.visible ? 'Hide' : 'Show'} ${displayName}`}
                        className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        {layer.visible ? (
                          <Eye className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onBringLayerForward(layer.id)}
                        aria-label={`Bring ${displayName} forward`}
                        className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSendLayerBackward(layer.id)}
                        aria-label={`Send ${displayName} backward`}
                        className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" aria-hidden="true" />
                      </button>
                      {(!isCoreLyric || animated) && (
                        <IconTooltip
                          tip={
                            isCoreLyric
                              ? `Delete animation from ${displayName}`
                              : `Delete ${displayName}`
                          }
                        >
                          <button
                            type="button"
                            onClick={() => onDeleteLayer(layer.id)}
                            aria-label={`Delete ${displayName}`}
                            className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </IconTooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Layer Properties */}
            {selectedLayer && (
              <div className="p-2.5 rounded-lg bg-[#0B0D11] border border-white/10 space-y-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-amber-300 truncate">
                    {formatLayerDisplayLabel(selectedLayer)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onChangeTab('effects');
                        onChangeEffectsSubTab('animate');
                      }}
                      aria-label={`Animate ${selectedLayer.name}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/40 rounded cursor-pointer"
                    >
                      <Clapperboard className="w-3 h-3" aria-hidden="true" />
                      <span>Animate</span>
                    </button>
                    {hasLayerAnimation(selectedLayer) && (
                      <IconTooltip tip="Delete applied animation & keyframes">
                        <button
                          type="button"
                          onClick={() => onClearLayerAnimation(selectedLayer.id)}
                          aria-label={`Delete animation from ${selectedLayer.name}`}
                          className="p-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/35 cursor-pointer"
                        >
                          <Eraser className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </IconTooltip>
                    )}
                    <IconTooltip tip="Duplicate layer">
                      <button
                        type="button"
                        onClick={() => onDuplicateLayer(selectedLayer.id)}
                        aria-label={`Duplicate ${selectedLayer.name}`}
                        className="p-1 rounded bg-[#161A22] hover:bg-[#232936] text-zinc-300 hover:text-white border border-white/10 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </IconTooltip>
                    <IconTooltip tip="Delete selected element">
                      <button
                        type="button"
                        onClick={() => onDeleteLayer(selectedLayer.id)}
                        aria-label={`Delete selected ${selectedLayer.name}`}
                        className="p-1 rounded bg-[#161A22] hover:bg-rose-500/25 text-zinc-400 hover:text-rose-300 border border-white/10 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </IconTooltip>
                  </div>
                </div>

                {selectedLayer.type === 'text' && (
                  <div
                    data-testid="text-layer-font-controls"
                    className="space-y-2.5 pt-1 border-t border-white/8"
                  >
                    <textarea
                      rows={2}
                      dir={detectScriptDirection(selectedLayer.text ?? '')}
                      value={selectedLayer.text ?? ''}
                      onChange={(e) =>
                        onUpdateLayer(selectedLayer.id, { text: e.target.value })
                      }
                      aria-label="Overlay text content"
                      placeholder="Enter title or extra overlay text..."
                      className="w-full rounded bg-[#12151C] border border-white/10 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                    />

                    {/* Font Family */}
                    <div className="space-y-1">
                      <label
                        htmlFor="layer-font-family"
                        className="block text-[10px] text-zinc-400"
                      >
                        Font Family
                      </label>
                      <select
                        id="layer-font-family"
                        aria-label="Text layer font family"
                        value={selectedLayer.fontFamily ?? 'Plus Jakarta Sans'}
                        onChange={(e) =>
                          onUpdateLayer(selectedLayer.id, {
                            fontFamily: e.target.value,
                          })
                        }
                        className="w-full bg-[#161A22] text-zinc-100 text-xs rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500"
                      >
                        <optgroup label="Latin & Display">
                          {LATIN_FONT_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Farsi & Nastaliq">
                          {FARSI_FONT_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>

                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={customLayerFont}
                          onChange={(e) => setCustomLayerFont(e.target.value)}
                          placeholder="Custom local font (e.g. Playfair Display)..."
                          aria-label="Custom text layer font name"
                          className="flex-1 bg-[#12151C] text-zinc-200 text-[10px] rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customLayerFont.trim()) {
                              onUpdateLayer(selectedLayer.id, {
                                fontFamily: customLayerFont.trim(),
                              });
                            }
                          }}
                          className="px-2 py-1 text-[10px] bg-[#191D26] hover:bg-[#232936] text-amber-300 rounded border border-white/10 cursor-pointer"
                        >
                          Use
                        </button>
                      </div>
                    </div>

                    {/* Size, Weight & Italic */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-400">Size</span>
                        <input
                          type="range"
                          min={18}
                          max={120}
                          step={2}
                          aria-label="Text layer font size"
                          value={selectedLayer.fontSize ?? 48}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              fontSize: Number(e.target.value),
                            })
                          }
                          className="flex-1 accent-amber-500 cursor-pointer"
                        />
                        <span className="font-mono text-zinc-300 w-10 text-right">
                          {selectedLayer.fontSize ?? 48}px
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label="Text layer font weight"
                          value={selectedLayer.fontWeight ?? 700}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              fontWeight: Number(e.target.value),
                            })
                          }
                          className="flex-1 bg-[#161A22] text-zinc-100 text-[11px] rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500"
                        >
                          <option value={400}>Regular (400)</option>
                          <option value={500}>Medium (500)</option>
                          <option value={600}>SemiBold (600)</option>
                          <option value={700}>Bold (700)</option>
                          <option value={800}>ExtraBold (800)</option>
                        </select>

                        <button
                          type="button"
                          aria-pressed={(selectedLayer.fontStyle ?? 'normal') === 'italic'}
                          aria-label="Toggle italic text"
                          onClick={() =>
                            onUpdateLayer(selectedLayer.id, {
                              fontStyle:
                                (selectedLayer.fontStyle ?? 'normal') === 'italic'
                                  ? 'normal'
                                  : 'italic',
                            })
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                            (selectedLayer.fontStyle ?? 'normal') === 'italic'
                              ? 'bg-amber-500 text-zinc-950 border-amber-500 font-semibold'
                              : 'bg-[#161A22] text-zinc-300 border-white/10 hover:text-white'
                          }`}
                        >
                          <Italic className="w-3 h-3" aria-hidden="true" />
                          <span>Italic</span>
                        </button>
                      </div>
                    </div>

                    {/* Alignment & Backdrop Pill */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 grid grid-cols-3 gap-0.5 p-0.5 bg-[#12151C] rounded border border-white/10">
                        {(
                          [
                            { id: 'left', icon: AlignLeft, label: 'Align left' },
                            { id: 'center', icon: AlignCenter, label: 'Align center' },
                            { id: 'right', icon: AlignRight, label: 'Align right' },
                          ] as const
                        ).map(({ id, icon: Icon, label }) => (
                          <button
                            key={id}
                            type="button"
                            aria-label={label}
                            onClick={() =>
                              onUpdateLayer(selectedLayer.id, { textAlign: id })
                            }
                            className={`flex items-center justify-center py-1 rounded cursor-pointer ${
                              (selectedLayer.textAlign ?? 'center') === id
                                ? 'bg-[#1D222D] text-amber-300'
                                : 'text-zinc-400 hover:text-zinc-100'
                            }`}
                          >
                            <Icon className="w-3 h-3" aria-hidden="true" />
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        aria-pressed={
                          Boolean(selectedLayer.backgroundColor) &&
                          selectedLayer.backgroundColor !== 'transparent'
                        }
                        onClick={() => {
                          const hasBg =
                            Boolean(selectedLayer.backgroundColor) &&
                            selectedLayer.backgroundColor !== 'transparent';
                          onUpdateLayer(selectedLayer.id, {
                            backgroundColor: hasBg
                              ? 'transparent'
                              : 'rgba(9, 11, 15, 0.72)',
                          });
                        }}
                        className={`px-2 py-1 rounded border text-[10px] font-medium cursor-pointer whitespace-nowrap ${
                          selectedLayer.backgroundColor &&
                          selectedLayer.backgroundColor !== 'transparent'
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                            : 'bg-[#161A22] border-white/10 text-zinc-300 hover:text-white'
                        }`}
                      >
                        Pill Box
                      </button>
                    </div>

                    {/* Text Color Picker + Quick Swatches */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-zinc-400">
                        <span>Color</span>
                        <input
                          type="color"
                          aria-label="Text layer color"
                          value={selectedLayer.color ?? '#FCD34D'}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, { color: e.target.value })
                          }
                          className="w-6 h-5 rounded bg-transparent border border-white/10 cursor-pointer"
                        />
                      </label>
                      <div className="flex items-center gap-1">
                        {[
                          '#FFFFFF',
                          '#FCD34D',
                          '#F59E0B',
                          '#BAE6FD',
                          '#FDA4AF',
                          '#A7F3D0',
                        ].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`Set text color ${hex}`}
                            onClick={() =>
                              onUpdateLayer(selectedLayer.id, { color: hex })
                            }
                            className={`w-4 h-4 rounded-full border cursor-pointer ${
                              (selectedLayer.color ?? '').toUpperCase() === hex
                                ? 'border-white scale-110'
                                : 'border-black/50'
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Letter Spacing & Shadow Blur */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-400">Tracking</span>
                        <input
                          type="range"
                          min={-2}
                          max={16}
                          step={0.5}
                          aria-label="Text layer letter spacing"
                          value={selectedLayer.letterSpacing ?? 0}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              letterSpacing: Number(e.target.value),
                            })
                          }
                          className="flex-1 accent-amber-500 cursor-pointer"
                        />
                        <span className="font-mono text-zinc-300 w-10 text-right">
                          {selectedLayer.letterSpacing ?? 0}px
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-400">Shadow</span>
                        <input
                          type="range"
                          min={0}
                          max={30}
                          step={1}
                          aria-label="Text layer shadow blur"
                          value={selectedLayer.shadowBlur ?? 14}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              shadowBlur: Number(e.target.value),
                            })
                          }
                          className="flex-1 accent-amber-500 cursor-pointer"
                        />
                        <span className="font-mono text-zinc-300 w-10 text-right">
                          {selectedLayer.shadowBlur ?? 14}px
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Blend & Remove Background Controls for Images & Video/Media Clips */}
                {(selectedLayer.type === 'media-clip' ||
                  selectedLayer.type === 'image') && (() => {
                  const keying: LayerKeyingConfig = {
                    ...DEFAULT_LAYER_KEYING_CONFIG,
                    ...(selectedLayer.keying ?? {}),
                  };
                  const updateKeying = (patch: Partial<LayerKeyingConfig>) =>
                    onUpdateLayer(selectedLayer.id, {
                      keying: { ...keying, ...patch },
                    });

                  return (
                    <div
                      data-testid="layer-blend-controls"
                      className="space-y-2.5 pt-2 border-t border-white/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-sky-300">
                          <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Blend & Remove BG</span>
                        </span>
                        <button
                          type="button"
                          data-testid="auto-blend-layer-btn"
                          onClick={() => onAutoBlendLayer(selectedLayer.id)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/40 rounded cursor-pointer"
                        >
                          <Wand2 className="w-3 h-3" aria-hidden="true" />
                          <span>Auto Blend BG</span>
                        </button>
                      </div>

                      {/* Background Keying / Cutout Mode */}
                      <div className="space-y-1">
                        <span className="block text-[10px] text-zinc-400">
                          Remove Backdrop (Green / Black / Checkerboard)
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          {KEY_MODE_OPTIONS.map((opt) => {
                            const active = keying.mode === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                title={opt.hint}
                                aria-pressed={active}
                                data-testid={`key-mode-${opt.id}`}
                                onClick={() =>
                                  updateKeying({
                                    mode: opt.id as LayerKeyMode,
                                    edgeFade:
                                      opt.id === 'none'
                                        ? keying.edgeFade
                                        : Math.max(keying.edgeFade, 4),
                                  })
                                }
                                className={`px-1.5 py-1 rounded text-[10px] font-medium border truncate cursor-pointer ${
                                  active
                                    ? 'bg-sky-500 text-zinc-950 border-sky-400 font-semibold'
                                    : 'bg-[#161A22] text-zinc-300 border-white/10 hover:text-white'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Blend Mode Selector */}
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="layer-blend-mode"
                          className="text-zinc-400 shrink-0"
                        >
                          Blend Mode
                        </label>
                        <select
                          id="layer-blend-mode"
                          aria-label="Layer blend mode"
                          data-testid="layer-blend-mode-select"
                          value={selectedLayer.blendMode ?? 'source-over'}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              blendMode: e.target.value as LayerBlendMode,
                            })
                          }
                          className="flex-1 bg-[#161A22] text-zinc-100 text-[11px] rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-sky-400"
                        >
                          {BLEND_MODE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Keying Fine-Tuning Sliders */}
                      {keying.mode !== 'none' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-zinc-400 w-16">Tolerance</span>
                            <input
                              type="range"
                              min={5}
                              max={95}
                              step={1}
                              aria-label="Background removal tolerance"
                              value={keying.tolerance}
                              onChange={(e) =>
                                updateKeying({ tolerance: Number(e.target.value) })
                              }
                              className="flex-1 accent-sky-400 cursor-pointer"
                            />
                            <span className="font-mono text-zinc-300 w-8 text-right">
                              {keying.tolerance}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-zinc-400 w-16">Softness</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              aria-label="Background edge softness"
                              value={keying.softness}
                              onChange={(e) =>
                                updateKeying({ softness: Number(e.target.value) })
                              }
                              className="flex-1 accent-sky-400 cursor-pointer"
                            />
                            <span className="font-mono text-zinc-300 w-8 text-right">
                              {keying.softness}
                            </span>
                          </div>
                          {(keying.mode === 'chroma-green' ||
                            keying.mode === 'chroma-blue' ||
                            keying.mode === 'remove-checkerboard') && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-zinc-400 w-16">De-Spill</span>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                aria-label="Color spill suppression"
                                value={keying.spillSuppress}
                                onChange={(e) =>
                                  updateKeying({
                                    spillSuppress: Number(e.target.value),
                                  })
                                }
                                className="flex-1 accent-sky-400 cursor-pointer"
                              />
                              <span className="font-mono text-zinc-300 w-8 text-right">
                                {keying.spillSuppress}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Soft Edge Feather Fade (melts rectangular seams cleanly into background) */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-400 w-16">Edge Fade</span>
                        <input
                          type="range"
                          min={0}
                          max={50}
                          step={1}
                          aria-label="Layer edge feather fade"
                          data-testid="layer-edge-fade-slider"
                          value={keying.edgeFade}
                          onChange={(e) =>
                            updateKeying({ edgeFade: Number(e.target.value) })
                          }
                          className="flex-1 accent-sky-400 cursor-pointer"
                        />
                        <span className="font-mono text-zinc-300 w-8 text-right">
                          {keying.edgeFade}%
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Timer / Stopwatch Counter Layer Controls */}
                {selectedLayer.type === 'timer-counter' && (
                  <div
                    data-testid="timer-layer-controls"
                    className="space-y-2.5 pt-2 border-t border-white/10"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-sky-300">
                      <Timer className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Timer Counter Settings</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="block space-y-0.5">
                        <span className="text-[10px] text-zinc-400">Counter Mode</span>
                        <select
                          aria-label="Timer counter mode"
                          value={selectedLayer.timerMode ?? 'count-up'}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              timerMode: e.target.value as TimerCounterMode,
                            })
                          }
                          className="w-full bg-[#161A22] text-zinc-100 text-[11px] rounded px-1.5 py-1 border border-white/10"
                        >
                          <option value="count-up">Count Up (Stopwatch)</option>
                          <option value="count-down">Count Down</option>
                          <option value="elapsed-total">Elapsed / Total</option>
                        </select>
                      </label>

                      <label className="block space-y-0.5">
                        <span className="text-[10px] text-zinc-400">Time Format</span>
                        <select
                          aria-label="Timer counter format"
                          value={selectedLayer.timerFormat ?? 'hh:mm:ss'}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              timerFormat: e.target.value as TimerCounterFormat,
                            })
                          }
                          className="w-full bg-[#161A22] text-zinc-100 text-[11px] rounded px-1.5 py-1 border border-white/10"
                        >
                          <option value="hh:mm:ss">00:00:03 (HH:MM:SS)</option>
                          <option value="mm:ss">00:03 (MM:SS)</option>
                          <option value="mm:ss.d">00:03.4 (Tenths)</option>
                          <option value="ss">03s (Seconds)</option>
                        </select>
                      </label>

                      <label className="block space-y-0.5">
                        <span className="text-[10px] text-zinc-400">Visual Style</span>
                        <select
                          aria-label="Timer visual style"
                          value={selectedLayer.timerStyle ?? 'stopwatch-hud'}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              timerStyle: e.target.value as TimerCounterStyle,
                            })
                          }
                          className="w-full bg-[#161A22] text-zinc-100 text-[11px] rounded px-1.5 py-1 border border-white/10"
                        >
                          <option value="stopwatch-hud">Stopwatch HUD</option>
                          <option value="minimal-glass">Minimal Glass</option>
                          <option value="neon-amber">Neon Amber</option>
                          <option value="clean-plain">Clean Plain</option>
                        </select>
                      </label>

                      <label className="block space-y-0.5">
                        <span className="text-[10px] text-zinc-400">Time Scope</span>
                        <select
                          aria-label="Timer scope"
                          value={selectedLayer.timerScope ?? 'song'}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              timerScope: e.target.value as 'song' | 'layer',
                            })
                          }
                          className="w-full bg-[#161A22] text-zinc-100 text-[11px] rounded px-1.5 py-1 border border-white/10"
                        >
                          <option value="song">Whole Song</option>
                          <option value="layer">Layer Time Range</option>
                        </select>
                      </label>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={selectedLayer.timerPrefix ?? ''}
                        onChange={(e) =>
                          onUpdateLayer(selectedLayer.id, {
                            timerPrefix: e.target.value,
                          })
                        }
                        placeholder="Optional prefix (e.g. REC, LIVE)..."
                        aria-label="Timer prefix label"
                        className="flex-1 bg-[#12151C] text-zinc-100 text-[11px] rounded px-2 py-1 border border-white/10"
                      />
                      <button
                        type="button"
                        aria-pressed={Boolean(selectedLayer.timerShowProgress)}
                        onClick={() =>
                          onUpdateLayer(selectedLayer.id, {
                            timerShowProgress: !selectedLayer.timerShowProgress,
                          })
                        }
                        className={`px-2 py-1 rounded border text-[10px] font-medium cursor-pointer whitespace-nowrap ${
                          selectedLayer.timerShowProgress
                            ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                            : 'bg-[#161A22] border-white/10 text-zinc-300 hover:text-white'
                        }`}
                      >
                        Progress Bar
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-400">Size</span>
                      <input
                        type="range"
                        min={20}
                        max={96}
                        step={2}
                        aria-label="Timer font size"
                        value={selectedLayer.fontSize ?? 40}
                        onChange={(e) =>
                          onUpdateLayer(selectedLayer.id, {
                            fontSize: Number(e.target.value),
                          })
                        }
                        className="flex-1 accent-sky-400 cursor-pointer"
                      />
                      <span className="font-mono text-zinc-300 w-10 text-right">
                        {selectedLayer.fontSize ?? 40}px
                      </span>
                    </div>

                    {/* Transparent & Customizable Timer Background Controls */}
                    <div className="space-y-2 pt-1.5 border-t border-white/8">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-medium text-zinc-300">
                          Background Style
                        </span>
                        <div className="flex items-center gap-1">
                          {(
                            [
                              { id: 'transparent', label: 'Transparent', bgOp: 0, bdOp: 0 },
                              { id: 'glass', label: 'Glass', bgOp: 0.45, bdOp: 0.25 },
                              { id: 'solid', label: 'Solid', bgOp: 0.85, bdOp: 0.35 },
                            ] as const
                          ).map((preset) => {
                            const curOp = selectedLayer.timerBgOpacity ?? 0;
                            const isActive =
                              preset.id === 'transparent'
                                ? curOp <= 0.02
                                : preset.id === 'glass'
                                ? curOp > 0.02 && curOp < 0.7
                                : curOp >= 0.7;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                data-testid={`timer-bg-preset-${preset.id}`}
                                onClick={() =>
                                  onUpdateLayer(selectedLayer.id, {
                                    timerBgOpacity: preset.bgOp,
                                    timerBorderOpacity: preset.bdOp,
                                  })
                                }
                                className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer ${
                                  isActive
                                    ? 'bg-sky-500/20 border-sky-400/50 text-sky-200 font-medium'
                                    : 'bg-[#161A22] border-white/10 text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-400">BG Opacity</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          aria-label="Timer background opacity"
                          data-testid="timer-bg-opacity-slider"
                          value={Math.round((selectedLayer.timerBgOpacity ?? 0) * 100)}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              timerBgOpacity: Number(e.target.value) / 100,
                            })
                          }
                          className="flex-1 accent-sky-400 cursor-pointer"
                        />
                        <span className="font-mono text-zinc-300 w-9 text-right">
                          {Math.round((selectedLayer.timerBgOpacity ?? 0) * 100)}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-400">Border</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          aria-label="Timer border opacity"
                          value={Math.round((selectedLayer.timerBorderOpacity ?? 0) * 100)}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              timerBorderOpacity: Number(e.target.value) / 100,
                            })
                          }
                          className="flex-1 accent-sky-400 cursor-pointer"
                        />
                        <span className="font-mono text-zinc-300 w-9 text-right">
                          {Math.round((selectedLayer.timerBorderOpacity ?? 0) * 100)}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-1.5 text-zinc-400 flex-1">
                          <span>Font</span>
                          <select
                            aria-label="Timer font family"
                            value={selectedLayer.fontFamily ?? ''}
                            onChange={(e) =>
                              onUpdateLayer(selectedLayer.id, {
                                fontFamily: e.target.value || undefined,
                              })
                            }
                            className="flex-1 bg-[#161A22] text-zinc-100 text-[10px] rounded px-1.5 py-1 border border-white/10"
                          >
                            <option value="">JetBrains Mono (Default)</option>
                            {LATIN_FONT_OPTIONS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          aria-pressed={Boolean(selectedLayer.timerShowDot)}
                          onClick={() =>
                            onUpdateLayer(selectedLayer.id, {
                              timerShowDot: !(selectedLayer.timerShowDot ?? false),
                            })
                          }
                          className={`px-2 py-1 rounded border text-[10px] font-medium cursor-pointer whitespace-nowrap ${
                            selectedLayer.timerShowDot
                              ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                              : 'bg-[#161A22] border-white/10 text-zinc-400 hover:text-white'
                          }`}
                        >
                          Live Dot
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <label className="flex items-center gap-1.5 text-zinc-400">
                        <span>Text</span>
                        <input
                          type="color"
                          aria-label="Timer text color"
                          value={selectedLayer.color ?? '#FFFFFF'}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, { color: e.target.value })
                          }
                          className="w-6 h-5 rounded bg-transparent border border-white/10 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-zinc-400">
                        <span>BG</span>
                        <input
                          type="color"
                          aria-label="Timer background color"
                          value={selectedLayer.timerBgColor ?? '#090B0F'}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              timerBgColor: e.target.value,
                              timerBgOpacity:
                                (selectedLayer.timerBgOpacity ?? 0) <= 0.02
                                  ? 0.55
                                  : selectedLayer.timerBgOpacity,
                            })
                          }
                          className="w-6 h-5 rounded bg-transparent border border-white/10 cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-zinc-400">
                        <span>Accent</span>
                        <input
                          type="color"
                          aria-label="Timer accent color"
                          value={selectedLayer.timerAccentColor ?? '#F59E0B'}
                          onChange={(e) =>
                            onUpdateLayer(selectedLayer.id, {
                              timerAccentColor: e.target.value,
                            })
                          }
                          className="w-6 h-5 rounded bg-transparent border border-white/10 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { key: 'x', label: 'X' },
                      { key: 'y', label: 'Y' },
                      { key: 'width', label: 'W' },
                      { key: 'height', label: 'H' },
                    ] as const
                  ).map((field) => (
                    <label key={field.key} className="flex items-center gap-1.5">
                      <span className="text-zinc-500 w-4">{field.label}</span>
                      <input
                        type="number"
                        value={Math.round(selectedLayer[field.key])}
                        onChange={(e) =>
                          onUpdateLayer(selectedLayer.id, {
                            [field.key]: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full rounded bg-[#12151C] border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-400">Opacity</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    aria-label="Layer opacity"
                    value={selectedLayer.opacity}
                    onChange={(e) =>
                      onUpdateLayer(selectedLayer.id, {
                        opacity: Number(e.target.value),
                      })
                    }
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                  <span className="font-mono text-zinc-300 w-10 text-right">
                    {Math.round(selectedLayer.opacity * 100)}%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-400">Rotation</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={selectedLayer.rotation}
                    onChange={(e) =>
                      onUpdateLayer(selectedLayer.id, {
                        rotation: Number(e.target.value),
                      })
                    }
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                  <span className="font-mono text-zinc-300 w-10 text-right">
                    {selectedLayer.rotation}°
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'effects' && (
        <div
          data-testid="effects-panel"
          className="flex-1 overflow-y-auto p-3 space-y-3.5"
        >
          {/* 3-Way Sub-Tab Switcher: Animate & Keyframes | Beat FX & Timed FX | Scrolling Lyrics */}
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#0B0D11] rounded-lg border border-white/8 select-none">
            <IconTooltip tip="Animate images/text with entrance presets & keyframes" position="bottom" align="left">
              <button
                type="button"
                onClick={() => onChangeEffectsSubTab('animate')}
                aria-pressed={effectsSubTab === 'animate'}
                aria-label="Animate and Keyframes"
                className={`w-full inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                  effectsSubTab === 'animate'
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Clapperboard className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Animate</span>
              </button>
            </IconTooltip>
            <IconTooltip tip="Beat-synced FX, timed FX ranges & audio visualizers" position="bottom">
              <button
                type="button"
                onClick={() => onChangeEffectsSubTab('beat')}
                aria-pressed={effectsSubTab === 'beat'}
                aria-label="Beat FX and Visualizer"
                className={`w-full inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                  effectsSubTab === 'beat'
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <AudioWaveform className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Beat FX</span>
              </button>
            </IconTooltip>
            <IconTooltip tip="Focused scrolling lyrics depth & animation" position="bottom" align="right">
              <button
                type="button"
                onClick={() => onChangeEffectsSubTab('scroll')}
                aria-pressed={effectsSubTab === 'scroll'}
                aria-label="Scroll Lyrics"
                className={`w-full inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                  effectsSubTab === 'scroll'
                    ? 'bg-[#1D222D] text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Scroll</span>
              </button>
            </IconTooltip>
          </div>

          {effectsSubTab === 'animate' && (
            <div data-testid="layer-animate-panel" className="space-y-3">
              {/* Target Layer Picker + Quick Add Overlay */}
              <div className="p-2.5 rounded-lg bg-[#0E1117] border border-white/8 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-100">
                    Layer Motion & Keyframes
                  </span>
                  <div className="flex items-center gap-1">
                    <IconTooltip tip="Add movable animated title text" position="bottom">
                      <button
                        type="button"
                        onClick={onAddTextLayer}
                        aria-label="Add animated text overlay"
                        className="px-1.5 py-0.5 text-[10px] font-medium bg-[#191D26] hover:bg-[#232936] text-amber-300 rounded border border-white/10 cursor-pointer"
                      >
                        + Text
                      </button>
                    </IconTooltip>
                    <IconTooltip tip="Add character / logo image overlay" position="bottom" align="right">
                      <button
                        type="button"
                        onClick={() => layerImageRef.current?.click()}
                        aria-label="Add animated character image overlay"
                        className="px-1.5 py-0.5 text-[10px] font-medium bg-[#191D26] hover:bg-[#232936] text-amber-300 rounded border border-white/10 cursor-pointer"
                      >
                        + Image
                      </button>
                    </IconTooltip>
                  </div>
                </div>

                <select
                  aria-label="Select layer to animate"
                  data-testid="animate-layer-select"
                  value={selectedLayer?.id ?? ''}
                  onChange={(e) => onSelectLayer(e.target.value || null)}
                  className="w-full bg-[#161A22] text-zinc-100 text-xs rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-amber-500"
                >
                  {[...layers].reverse().map((l) => (
                    <option key={l.id} value={l.id}>
                      {formatLayerDisplayLabel(l)}
                    </option>
                  ))}
                </select>

                {selectedLayer && (
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <button
                      type="button"
                      data-testid="clear-layer-animation-btn"
                      aria-label="Delete animation from selected layer"
                      disabled={!hasLayerAnimation(selectedLayer)}
                      onClick={() => onClearLayerAnimation(selectedLayer.id)}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-semibold rounded border bg-rose-500/12 hover:bg-rose-500/25 border-rose-500/35 text-rose-300 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Eraser className="w-3 h-3" aria-hidden="true" />
                      <span>Delete Animation</span>
                    </button>
                    <button
                      type="button"
                      data-testid="delete-selected-element-btn"
                      aria-label="Delete selected element"
                      onClick={() => onDeleteLayer(selectedLayer.id)}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-semibold rounded border bg-[#191D26] hover:bg-rose-500/25 border-white/10 hover:border-rose-500/35 text-zinc-200 hover:text-rose-200 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                      <span>Delete Element</span>
                    </button>
                  </div>
                )}
              </div>

              {selectedLayer ? (
                <>
                  {/* Custom Time Frame for Layer Visibility & Entrance/Exit */}
                  <div className="p-2.5 rounded-lg bg-[#0E1117] border border-white/8 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
                        <Clock className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                        <span>Active Time Frame</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateLayer(selectedLayer.id, {
                            startTime: undefined,
                            endTime: undefined,
                          })
                        }
                        className="text-[10px] text-zinc-400 hover:text-amber-300 underline cursor-pointer"
                      >
                        Full Video
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-400 block">Start (s)</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={Math.max(1, duration)}
                            step={0.1}
                            aria-label="Layer animation start time"
                            value={Number((selectedLayer.startTime ?? 0).toFixed(2))}
                            onChange={(e) => {
                              const nextStart = Math.max(0, Number(e.target.value) || 0);
                              const currEnd = selectedLayer.endTime ?? duration;
                              onUpdateLayer(selectedLayer.id, {
                                startTime: nextStart,
                                endTime: Math.max(nextStart + 0.5, currEnd),
                              });
                            }}
                            className="w-full rounded bg-[#090B0F] border border-white/10 px-2 py-1 font-mono text-xs text-zinc-100"
                          />
                          <IconTooltip tip="Set start to current playhead">
                            <button
                              type="button"
                              aria-label="Set layer start to playhead"
                              onClick={() => {
                                const t = Number(currentTime.toFixed(2));
                                const currEnd = selectedLayer.endTime ?? duration;
                                onUpdateLayer(selectedLayer.id, {
                                  startTime: t,
                                  endTime: Math.max(t + 1, currEnd),
                                });
                              }}
                              className="p-1.5 bg-[#191D26] hover:bg-[#232936] text-amber-400 rounded border border-white/10 cursor-pointer"
                            >
                              <Crosshair className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </IconTooltip>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-zinc-400 block">End (s)</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0.5}
                            max={Math.max(1, duration * 2)}
                            step={0.1}
                            aria-label="Layer animation end time"
                            value={Number((selectedLayer.endTime ?? duration).toFixed(2))}
                            onChange={(e) => {
                              const start = selectedLayer.startTime ?? 0;
                              const nextEnd = Math.max(start + 0.5, Number(e.target.value) || duration);
                              onUpdateLayer(selectedLayer.id, {
                                startTime: start,
                                endTime: nextEnd,
                              });
                            }}
                            className="w-full rounded bg-[#090B0F] border border-white/10 px-2 py-1 font-mono text-xs text-zinc-100"
                          />
                          <IconTooltip tip="Set end to current playhead" align="right">
                            <button
                              type="button"
                              aria-label="Set layer end to playhead"
                              onClick={() => {
                                const start = selectedLayer.startTime ?? 0;
                                const t = Math.max(start + 0.5, Number(currentTime.toFixed(2)));
                                onUpdateLayer(selectedLayer.id, {
                                  startTime: start,
                                  endTime: t,
                                });
                              }}
                              className="p-1.5 bg-[#191D26] hover:bg-[#232936] text-amber-400 rounded border border-white/10 cursor-pointer"
                            >
                              <Crosshair className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </IconTooltip>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Entrance & Exit Motion Presets */}
                  {(() => {
                    const anim = selectedLayer.animation ?? DEFAULT_LAYER_ANIMATION;
                    const updateAnim = (patch: Partial<typeof DEFAULT_LAYER_ANIMATION>) => {
                      onUpdateLayer(selectedLayer.id, {
                        animation: { ...anim, ...patch },
                      });
                    };
                    return (
                      <div className="p-2.5 rounded-lg bg-[#0E1117] border border-white/8 space-y-2.5">
                        <span className="block text-[11px] font-semibold text-zinc-200">
                          Entrance Animation (Enters & Stays)
                        </span>
                        <div className="grid grid-cols-4 gap-1">
                          {LAYER_ANIMATION_PRESETS.map((preset) => {
                            const active = anim.enterPreset === preset.id;
                            return (
                              <IconTooltip key={preset.id} tip={preset.description} position="top">
                                <button
                                  type="button"
                                  aria-label={`Enter animation: ${preset.label}`}
                                  aria-pressed={active}
                                  onClick={() => updateAnim({ enterPreset: preset.id })}
                                  className={`w-full py-1.5 px-1 text-[10px] font-medium rounded border transition-colors cursor-pointer truncate ${
                                    active
                                      ? 'bg-amber-500 text-zinc-950 border-amber-400 font-semibold'
                                      : 'bg-[#090B0F] text-zinc-300 border-white/10 hover:border-white/25'
                                  }`}
                                >
                                  {preset.shortLabel}
                                </button>
                              </IconTooltip>
                            );
                          })}
                        </div>

                        <SliderControl
                          label="Enter Duration"
                          value={anim.inDuration}
                          min={0.2}
                          max={3.0}
                          step={0.1}
                          display={`${anim.inDuration.toFixed(1)}s`}
                          onChange={(v) => updateAnim({ inDuration: v })}
                        />

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/8 text-[11px]">
                          <label className="block">
                            <span className="text-[10px] text-zinc-400 block mb-0.5">Exit Motion</span>
                            <select
                              aria-label="Exit animation preset"
                              value={anim.exitPreset}
                              onChange={(e) =>
                                updateAnim({
                                  exitPreset: e.target.value as LayerAnimationPreset,
                                })
                              }
                              className="w-full bg-[#161A22] text-zinc-100 rounded px-2 py-1 border border-white/10"
                            >
                              {LAYER_ANIMATION_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-[10px] text-zinc-400 block mb-0.5">Easing</span>
                            <select
                              aria-label="Animation easing curve"
                              value={anim.easing}
                              onChange={(e) =>
                                updateAnim({
                                  easing: e.target.value as KeyframeEasing,
                                })
                              }
                              className="w-full bg-[#161A22] text-zinc-100 rounded px-2 py-1 border border-white/10"
                            >
                              <option value="ease-out">Ease Out</option>
                              <option value="ease-in-out">Smooth In-Out</option>
                              <option value="linear">Linear</option>
                            </select>
                          </label>
                        </div>

                        {anim.exitPreset !== 'none' && (
                          <SliderControl
                            label="Exit Duration"
                            value={anim.outDuration}
                            min={0.2}
                            max={3.0}
                            step={0.1}
                            display={`${anim.outDuration.toFixed(1)}s`}
                            onChange={(v) => updateAnim({ outDuration: v })}
                          />
                        )}
                      </div>
                    );
                  })()}

                  {/* Custom Keyframes at Playhead */}
                  <div className="p-2.5 rounded-lg bg-[#0E1117] border border-white/8 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
                        <Diamond className="w-3 h-3 text-amber-400" aria-hidden="true" />
                        <span>Keyframes ({selectedLayer.keyframes?.length ?? 0})</span>
                      </span>
                      <button
                        type="button"
                        data-testid="add-keyframe-btn"
                        aria-label="Add keyframe at playhead"
                        onClick={() =>
                          onUpsertLayerKeyframe(
                            selectedLayer.id,
                            currentTime,
                            selectedLayer.animation?.easing ?? 'ease-out'
                          )
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded cursor-pointer"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                        <span>Keyframe @ {formatTimecode(currentTime).slice(0, 5)}</span>
                      </button>
                    </div>

                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      Move playhead, drag or resize this layer on the canvas, then click <strong className="text-zinc-200">+ Keyframe</strong> to animate smoothly between points.
                    </p>

                    {selectedLayer.keyframes && selectedLayer.keyframes.length > 0 && (
                      <div className="space-y-1 max-h-36 overflow-y-auto" data-testid="keyframe-list">
                        {selectedLayer.keyframes.map((kf, idx) => (
                          <div
                            key={kf.id}
                            className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#090B0F] border border-white/8 text-[10px]"
                          >
                            <button
                              type="button"
                              onClick={() => onSeekToCue(kf.time)}
                              className="flex items-center gap-1.5 text-zinc-200 hover:text-amber-300 font-mono tabular-nums cursor-pointer"
                            >
                              <Diamond className="w-2.5 h-2.5 text-amber-400" aria-hidden="true" />
                              <span>#{idx + 1} · {formatTimecode(kf.time)}</span>
                              <span className="text-zinc-500">
                                ({kf.x}, {kf.y})
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove keyframe ${idx + 1}`}
                              onClick={() => onRemoveLayerKeyframe(selectedLayer.id, kf.id)}
                              className="p-0.5 text-zinc-500 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-lg bg-[#0E1117] border border-white/8 text-center text-xs text-zinc-400">
                  Select a text, image, or lyric layer above to animate it.
                </div>
              )}
            </div>
          )}

          {effectsSubTab === 'beat' && (
            <div data-testid="beat-effects-section" className="space-y-3.5">
              {/* Beat-Synced Visual Effects Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-zinc-100">
                    Audio Beat FX
                  </h3>
                  <p className="text-[10px] text-zinc-400 tabular-nums">
                    {hasAudioBeatData
                      ? `${detectedBeatCount} beats synced · Live & 1080p Export`
                      : 'Upload or select a song to sync beats'}
                  </p>
                </div>
                <IconTooltip tip="Reset beat effects & visualizer" position="bottom" align="right">
                  <button
                    type="button"
                    onClick={onResetBeatEffects}
                    aria-label="Reset Beat FX"
                    className="p-1.5 text-zinc-400 hover:text-amber-300 bg-[#191D26] hover:bg-[#232936] rounded-md border border-white/10 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </IconTooltip>
              </div>

              {/* Category Filter for Motion vs Body & Aura FX */}
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#090B0F] rounded-lg border border-white/8">
                {(
                  [
                    { id: 'all', label: `All (${BEAT_VISUAL_EFFECT_PRESETS.length})` },
                    { id: 'motion', label: 'Beat Motion' },
                    { id: 'body', label: 'Body & Aura' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFxCategoryFilter(tab.id)}
                    className={`py-1 px-2 text-[10px] font-medium rounded-md transition-colors cursor-pointer ${
                      fxCategoryFilter === tab.id
                        ? 'bg-[#1D222D] text-amber-300'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Visual Effect Preset Grid (Beat Motion + Body & Aura Effects) */}
              <div
                className="grid grid-cols-[repeat(auto-fill,minmax(135px,1fr))] gap-2 max-h-[250px] overflow-y-auto pr-0.5"
                data-testid="beat-effect-presets"
              >
                {BEAT_VISUAL_EFFECT_PRESETS.filter(
                  (preset) => fxCategoryFilter === 'all' || preset.category === fxCategoryFilter
                ).map((preset, idx) => {
                  const selected = beatEffects.effectType === preset.id;
                  const meta = BEAT_EFFECT_VISUALS[preset.id];
                  const IconComp = meta.icon;
                  return (
                    <IconTooltip
                      key={preset.id}
                      tip={preset.description}
                      position="top"
                      align={idx % 2 === 0 ? 'left' : 'right'}
                    >
                      <button
                        type="button"
                        onClick={() => onChangeBeatEffects({ effectType: preset.id })}
                        aria-label={`Beat effect: ${preset.label}`}
                        aria-pressed={selected}
                        className={`w-full group rounded-lg border overflow-hidden text-left transition-all cursor-pointer ${
                          selected
                            ? 'border-amber-500 ring-1 ring-amber-500/40 bg-[#1B202C]'
                            : 'border-white/10 bg-[#0E1117] hover:border-white/25'
                        }`}
                      >
                        <div
                          className={`h-11 w-full relative flex items-center justify-center overflow-hidden ${meta.previewBg}`}
                        >
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 ${
                              selected
                                ? 'bg-amber-500/25 text-amber-300'
                                : 'bg-black/35 text-zinc-200'
                            }`}
                          >
                            <IconComp className="w-4 h-4" aria-hidden="true" />
                          </div>
                          {preset.category === 'body' && (
                            <span className="absolute top-1 left-1.5 px-1 py-0.2 rounded bg-black/50 text-[8px] font-semibold uppercase tracking-wide text-fuchsia-300">
                              Body
                            </span>
                          )}
                          {selected && (
                            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center">
                              <Check className="w-2.5 h-2.5" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                        <div className="px-2 py-1 flex items-center justify-between gap-1">
                          <span className="text-[11px] font-medium text-zinc-100 truncate">
                            {preset.label}
                          </span>
                        </div>
                      </button>
                    </IconTooltip>
                  );
                })}
              </div>

              {/* Beat Sync Target & Strength */}
              <div className="p-2.5 rounded-lg bg-[#0E1117] border border-white/8 space-y-2.5">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-medium text-zinc-300 shrink-0">Sync To</span>
                  <div className="grid grid-cols-4 gap-0.5 p-0.5 bg-[#090B0F] rounded-md border border-white/8 flex-1">
                    {(
                      [
                        { id: 'background', label: 'BG', tip: 'Animate background media', icon: Film },
                        { id: 'character', label: 'Char', tip: 'Animate V2+ character & images', icon: User },
                        { id: 'lyrics', label: 'Lyrics', tip: 'Bounce lyrics', icon: Subtitles },
                        { id: 'both', label: 'All', tip: 'Sync BG, character & lyrics', icon: Sparkles },
                      ] as const
                    ).map((opt) => {
                      const active = beatEffects.syncTarget === opt.id;
                      const IconComp = opt.icon;
                      return (
                        <IconTooltip key={opt.id} tip={opt.tip} position="top">
                          <button
                            type="button"
                            onClick={() =>
                              onChangeBeatEffects({ syncTarget: opt.id as BeatSyncTarget })
                            }
                            aria-label={`Sync beats to ${opt.id}`}
                            aria-pressed={active}
                            className={`inline-flex items-center justify-center gap-0.5 px-1.5 py-1 text-[10px] font-medium rounded cursor-pointer ${
                              active
                                ? 'bg-[#1D222D] text-amber-300'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <IconComp className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{opt.label}</span>
                          </button>
                        </IconTooltip>
                      );
                    })}
                  </div>
                </div>

                <SliderControl
                  label="Beat Intensity"
                  value={beatEffects.intensity}
                  min={0.1}
                  max={1}
                  step={0.05}
                  display={`${Math.round(beatEffects.intensity * 100)}%`}
                  onChange={(v) => onChangeBeatEffects({ intensity: v })}
                />
                <SliderControl
                  label="Beat Sensitivity"
                  value={beatEffects.sensitivity}
                  min={0.4}
                  max={1.8}
                  step={0.05}
                  display={`${beatEffects.sensitivity.toFixed(2)}×`}
                  onChange={(v) => onChangeBeatEffects({ sensitivity: v })}
                />
              </div>

              {/* Customized Time Frame FX (Add Effect to Timeline FX Track) */}
              <div className="p-2.5 rounded-lg bg-[#0E1117] border border-fuchsia-500/25 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                    <Clock className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                    <span>Timed FX Range</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const s = Number(currentTime.toFixed(1));
                      setTimedFxStart(s);
                      setTimedFxEnd(Number(Math.min(Math.max(s + 1, duration), s + 4).toFixed(1)));
                    }}
                    className="text-[10px] text-fuchsia-300 hover:text-fuchsia-200 underline cursor-pointer"
                  >
                    From Playhead
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <label className="col-span-3 block">
                    <span className="text-[10px] text-zinc-400 block mb-0.5">Effect Style</span>
                    <select
                      aria-label="Timed effect type"
                      value={timedFxType}
                      onChange={(e) =>
                        setTimedFxType(e.target.value as Exclude<BeatVisualEffectType, 'none'>)
                      }
                      className="w-full bg-[#161A22] text-zinc-100 text-xs rounded px-2 py-1 border border-white/10"
                    >
                      {BEAT_VISUAL_EFFECT_PRESETS.filter((p) => p.id !== 'none').map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-zinc-400 block mb-0.5">From (s)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.2}
                      aria-label="Timed FX start seconds"
                      value={timedFxStart}
                      onChange={(e) => setTimedFxStart(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full bg-[#090B0F] text-zinc-100 font-mono text-xs rounded px-2 py-1 border border-white/10"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-zinc-400 block mb-0.5">To (s)</span>
                    <input
                      type="number"
                      min={0.5}
                      step={0.2}
                      aria-label="Timed FX end seconds"
                      value={timedFxEnd}
                      onChange={(e) =>
                        setTimedFxEnd(Math.max(timedFxStart + 0.5, Number(e.target.value) || timedFxStart + 2))
                      }
                      className="w-full bg-[#090B0F] text-zinc-100 font-mono text-xs rounded px-2 py-1 border border-white/10"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      data-testid="add-timed-fx-btn"
                      aria-label="Add timed effect to timeline"
                      onClick={() => {
                        const s = Math.max(0, timedFxStart);
                        const e = Math.max(s + 0.5, timedFxEnd);
                        onAddTimedEffect(
                          timedFxType,
                          s,
                          e,
                          beatEffects.syncTarget,
                          beatEffects.intensity
                        );
                      }}
                      className="w-full inline-flex items-center justify-center gap-1 py-1.5 px-2 text-[10px] font-semibold bg-fuchsia-500 hover:bg-fuchsia-400 text-zinc-950 rounded cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>Add FX</span>
                    </button>
                  </div>
                </div>

                {effectClips.length > 0 && (
                  <div className="space-y-1 max-h-28 overflow-y-auto pt-1 border-t border-white/8">
                    {effectClips.map((fx) => (
                      <div
                        key={fx.id}
                        className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#090B0F] border border-fuchsia-500/20 text-[10px]"
                      >
                        <button
                          type="button"
                          onClick={() => onSeekToCue(fx.startTime)}
                          className="truncate text-fuchsia-200 hover:text-white cursor-pointer"
                        >
                          {fx.name} · {fx.startTime.toFixed(1)}s → {fx.endTime.toFixed(1)}s
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete timed effect ${fx.name}`}
                          onClick={() => onDeleteTimedEffect(fx.id)}
                          className="p-0.5 text-zinc-500 hover:text-rose-400 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timer / Stopwatch Counter Effect Presets */}
              <div
                data-testid="effects-timer-section"
                className="p-2.5 rounded-lg bg-[#0E1117] border border-sky-500/25 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                    <Timer className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                    <span>Timer / Stopwatch Counter</span>
                  </span>
                  <span className="text-[10px] text-zinc-400">Live & 1080p</span>
                </div>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
                  {(
                    [
                      {
                        id: 'stopwatch',
                        label: 'Stopwatch',
                        preview: '00:00:03',
                        testId: 'add-timer-preset-stopwatch',
                      },
                      {
                        id: 'progress',
                        label: 'Song Progress',
                        preview: '00:03 / 00:24',
                        testId: 'add-timer-preset-progress',
                      },
                      {
                        id: 'countdown',
                        label: 'Countdown',
                        preview: 'LEFT 00:21',
                        testId: 'add-timer-preset-countdown',
                      },
                      {
                        id: 'minimal',
                        label: 'Minimal Clock',
                        preview: '00:03.4',
                        testId: 'add-timer-preset-minimal',
                      },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={preset.testId}
                      onClick={() => onAddTimerCounterLayer(preset.id)}
                      className="p-2 rounded-lg bg-[#090B0F] hover:bg-[#161A22] border border-white/10 hover:border-sky-400/50 text-left transition-colors cursor-pointer"
                    >
                      <div className="font-mono text-[11px] font-semibold text-sky-300 tabular-nums">
                        {preset.preview}
                      </div>
                      <div className="text-[10px] text-zinc-300 mt-0.5 flex items-center justify-between">
                        <span>{preset.label}</span>
                        <Plus className="w-3 h-3 text-sky-400" aria-hidden="true" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Visualizer Section (12 Beat-Synced Presets + Off) */}
              <div className="p-2.5 rounded-lg bg-[#0E1117] border border-white/8 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                    <BarChart3 className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>Audio Visualizers</span>
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    24-band live sync
                  </span>
                </div>

                <div
                  className="grid grid-cols-[repeat(auto-fill,minmax(135px,1fr))] gap-1.5 max-h-[260px] overflow-y-auto pr-0.5"
                  data-testid="visualizer-presets"
                >
                  {AUDIO_VISUALIZER_PRESETS.map((viz, idx) => {
                    const active = beatEffects.visualizerType === viz.id;
                    const IconComp = VISUALIZER_ICONS[viz.id];
                    const [c1, c2] = viz.palette;
                    return (
                      <IconTooltip
                        key={viz.id}
                        tip={viz.description}
                        position="top"
                        align={idx % 2 === 0 ? 'left' : 'right'}
                      >
                        <button
                          type="button"
                          onClick={() => onChangeBeatEffects({ visualizerType: viz.id })}
                          aria-label={`Audio visualizer: ${viz.label}`}
                          aria-pressed={active}
                          className={`w-full rounded-lg border overflow-hidden text-left transition-all cursor-pointer ${
                            active
                              ? 'border-amber-500 ring-1 ring-amber-500/40 bg-[#1B202C]'
                              : 'border-white/10 bg-[#090B0F] hover:border-white/25'
                          }`}
                        >
                          <div
                            className="h-9 w-full relative flex items-center justify-center px-2"
                            style={{
                              background:
                                viz.id === 'none'
                                  ? '#111319'
                                  : `linear-gradient(135deg, ${c1}24 0%, #090B0F 55%, ${c2}2B 100%)`,
                            }}
                          >
                            {viz.id === 'none' ? (
                              <Ban className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
                            ) : viz.styleTag === 'bars' ? (
                              <div className="flex items-end gap-[2px] h-5">
                                {[0.35, 0.75, 0.5, 1, 0.65, 0.85, 0.4, 0.9, 0.55].map(
                                  (barH, bIdx) => (
                                    <span
                                      key={bIdx}
                                      className="w-[3px] rounded-full"
                                      style={{
                                        height: `${Math.round(barH * 18)}px`,
                                        background: `linear-gradient(180deg, ${c1}, ${c2})`,
                                      }}
                                    />
                                  )
                                )}
                              </div>
                            ) : viz.styleTag === 'circle' ? (
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center"
                                style={{
                                  border: `2px solid ${c1}`,
                                  boxShadow: `0 0 10px ${c2}88`,
                                }}
                              >
                                <IconComp className="w-3 h-3 text-zinc-100" aria-hidden="true" />
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <IconComp
                                  className="w-4 h-4"
                                  aria-hidden="true"
                                />
                                <span
                                  className="h-1 w-10 rounded-full"
                                  style={{
                                    background: `linear-gradient(90deg, ${c1}, ${c2})`,
                                  }}
                                />
                              </div>
                            )}
                            {active && (
                              <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center">
                                <Check className="w-2 h-2" aria-hidden="true" />
                              </span>
                            )}
                          </div>
                          <div className="px-2 py-1 flex items-center justify-between gap-1">
                            <span className="text-[10px] font-medium text-zinc-100 truncate">
                              {viz.label}
                            </span>
                          </div>
                        </button>
                      </IconTooltip>
                    );
                  })}
                </div>

                {beatEffects.visualizerType !== 'none' && (
                  <div className="space-y-2.5 pt-1 border-t border-white/8">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-400">Placement</span>
                      <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#090B0F] rounded-md border border-white/8">
                        {(['top', 'center', 'bottom'] as const).map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => onChangeBeatEffects({ visualizerPosition: pos })}
                            aria-pressed={beatEffects.visualizerPosition === pos}
                            className={`px-2 py-0.5 text-[10px] capitalize rounded cursor-pointer ${
                              beatEffects.visualizerPosition === pos
                                ? 'bg-[#1D222D] text-amber-300 font-medium'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-400">Accent Color</span>
                      <div className="flex items-center gap-1.5">
                        {['#F59E0B', '#38BDF8', '#F43F5E', '#34D399', '#FFFFFF'].map(
                          (hex) => (
                            <button
                              key={hex}
                              type="button"
                              aria-label={`Set visualizer color ${hex}`}
                              onClick={() => onChangeBeatEffects({ visualizerColor: hex })}
                              className={`w-4 h-4 rounded-full border cursor-pointer ${
                                beatEffects.visualizerColor.toLowerCase() === hex.toLowerCase()
                                  ? 'border-white scale-110'
                                  : 'border-white/20'
                              }`}
                              style={{ backgroundColor: hex }}
                            />
                          )
                        )}
                        <input
                          type="color"
                          aria-label="Custom visualizer color"
                          value={beatEffects.visualizerColor}
                          onChange={(e) =>
                            onChangeBeatEffects({ visualizerColor: e.target.value })
                          }
                          className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                        />
                      </div>
                    </div>

                    <SliderControl
                      label="Visualizer Height"
                      value={beatEffects.visualizerHeight}
                      min={0.5}
                      max={1.8}
                      step={0.05}
                      display={`${Math.round(beatEffects.visualizerHeight * 100)}%`}
                      onChange={(v) => onChangeBeatEffects({ visualizerHeight: v })}
                    />

                    <SliderControl
                      label="Visualizer Opacity"
                      value={beatEffects.visualizerOpacity}
                      min={0.2}
                      max={1}
                      step={0.05}
                      display={`${Math.round(beatEffects.visualizerOpacity * 100)}%`}
                      onChange={(v) => onChangeBeatEffects({ visualizerOpacity: v })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {effectsSubTab === 'scroll' && (
            <div className="space-y-3.5">
              {/* Focused Scrolling Lyrics Header & Reset */}
              <div className="p-3 rounded-lg bg-[#0E1117] border border-amber-500/25 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100">
                      Focused Scrolling Lyrics
                    </h3>
                    <p className="text-[10px] text-zinc-400">
                      5-line depth-of-field lyric scroll driven by SRT timing
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={scrollingConfig.enabled}
                    aria-label="Enable Focused Scrolling Lyrics"
                    onClick={() =>
                      onChangeScrollingConfig({ enabled: !scrollingConfig.enabled })
                    }
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${
                      scrollingConfig.enabled
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-[#191D26] text-zinc-400 border border-white/10'
                    }`}
                  >
                    {scrollingConfig.enabled ? 'Active' : 'Off'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onResetScrollingDefaults}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium bg-[#191D26] hover:bg-[#232936] text-zinc-200 rounded border border-white/10 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-amber-400" aria-hidden="true" />
                  <span>Reset to Defaults</span>
                </button>
              </div>

          {/* Layout & Motion */}
          <div className="space-y-2.5 p-2.5 rounded-lg bg-[#0E1117] border border-white/8">
            <span className="block text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              Layout & Scroll Motion
            </span>

            <SliderControl
              label="Visible Lines"
              value={scrollingConfig.visibleLines}
              min={3}
              max={9}
              step={2}
              display={`${scrollingConfig.visibleLines}`}
              onChange={(v) => onChangeScrollingConfig({ visibleLines: v })}
            />

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-zinc-400 block mb-1">Active Position</span>
                <select
                  aria-label="Active line position"
                  value={scrollingConfig.activePosition}
                  onChange={(e) =>
                    onChangeScrollingConfig({
                      activePosition: e.target.value as 'top' | 'center' | 'bottom',
                    })
                  }
                  className="w-full bg-[#161A22] text-zinc-100 rounded px-2 py-1 border border-white/10"
                >
                  <option value="center">Center</option>
                  <option value="top">Upper Third</option>
                  <option value="bottom">Lower Third</option>
                </select>
              </div>
              <div>
                <span className="text-zinc-400 block mb-1">Scroll Direction</span>
                <select
                  aria-label="Scroll direction"
                  value={scrollingConfig.scrollDirection}
                  onChange={(e) =>
                    onChangeScrollingConfig({
                      scrollDirection: e.target.value as
                        | 'bottom-to-top'
                        | 'top-to-bottom',
                    })
                  }
                  className="w-full bg-[#161A22] text-zinc-100 rounded px-2 py-1 border border-white/10"
                >
                  <option value="bottom-to-top">Bottom to Top</option>
                  <option value="top-to-bottom">Top to Bottom</option>
                </select>
              </div>
            </div>

            <SliderControl
              label="Scroll Speed"
              value={scrollingConfig.scrollSpeed}
              min={0.5}
              max={2.0}
              step={0.05}
              display={`${scrollingConfig.scrollSpeed.toFixed(2)}×`}
              onChange={(v) => onChangeScrollingConfig({ scrollSpeed: v })}
            />
            <SliderControl
              label="Transition Duration"
              value={scrollingConfig.transitionDuration}
              min={0.15}
              max={1.2}
              step={0.05}
              display={`${scrollingConfig.transitionDuration.toFixed(2)}s`}
              onChange={(v) => onChangeScrollingConfig({ transitionDuration: v })}
            />
            <SliderControl
              label="Vertical Spacing"
              value={scrollingConfig.verticalSpacing}
              min={64}
              max={180}
              step={4}
              display={`${scrollingConfig.verticalSpacing}px`}
              onChange={(v) => onChangeScrollingConfig({ verticalSpacing: v })}
            />

            <div className="flex items-center justify-between gap-2 text-[11px] pt-1">
              <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scrollingConfig.motionBlur}
                  onChange={(e) =>
                    onChangeScrollingConfig({ motionBlur: e.target.checked })
                  }
                  className="accent-amber-500"
                />
                <span>Motion blur</span>
              </label>
              <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scrollingConfig.easing === 'ease-in-out'}
                  onChange={(e) =>
                    onChangeScrollingConfig({
                      easing: e.target.checked ? 'ease-in-out' : 'linear',
                    })
                  }
                  className="accent-amber-500"
                />
                <span>Auto easing</span>
              </label>
            </div>
          </div>

          {/* Focus Depth, Blur, Opacity & Scale */}
          <div className="space-y-2.5 p-2.5 rounded-lg bg-[#0E1117] border border-white/8">
            <span className="block text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              Blur, Opacity & Scale
            </span>
            <SliderControl
              label="Active Line Opacity"
              value={scrollingConfig.activeOpacity}
              min={0.5}
              max={1}
              step={0.05}
              display={`${Math.round(scrollingConfig.activeOpacity * 100)}%`}
              onChange={(v) => onChangeScrollingConfig({ activeOpacity: v })}
            />
            <SliderControl
              label="Inner Lines Opacity"
              value={scrollingConfig.innerOpacity}
              min={0.1}
              max={0.85}
              step={0.05}
              display={`${Math.round(scrollingConfig.innerOpacity * 100)}%`}
              onChange={(v) => onChangeScrollingConfig({ innerOpacity: v })}
            />
            <SliderControl
              label="Outer Lines Opacity"
              value={scrollingConfig.outerOpacity}
              min={0.05}
              max={0.6}
              step={0.02}
              display={`${Math.round(scrollingConfig.outerOpacity * 100)}%`}
              onChange={(v) => onChangeScrollingConfig({ outerOpacity: v })}
            />
            <SliderControl
              label="Inner Lines Blur"
              value={scrollingConfig.innerBlur}
              min={0}
              max={6}
              step={0.2}
              display={`${scrollingConfig.innerBlur.toFixed(1)}px`}
              onChange={(v) => onChangeScrollingConfig({ innerBlur: v })}
            />
            <SliderControl
              label="Outer Lines Blur"
              value={scrollingConfig.outerBlur}
              min={0}
              max={12}
              step={0.5}
              display={`${scrollingConfig.outerBlur.toFixed(1)}px`}
              onChange={(v) => onChangeScrollingConfig({ outerBlur: v })}
            />
            <SliderControl
              label="Active Line Scale"
              value={scrollingConfig.activeScale}
              min={0.9}
              max={1.45}
              step={0.02}
              display={`${Math.round(scrollingConfig.activeScale * 100)}%`}
              onChange={(v) => onChangeScrollingConfig({ activeScale: v })}
            />
            <SliderControl
              label="Outer Line Scale"
              value={scrollingConfig.outerScale}
              min={0.65}
              max={1.05}
              step={0.02}
              display={`${Math.round(scrollingConfig.outerScale * 100)}%`}
              onChange={(v) => onChangeScrollingConfig({ outerScale: v })}
            />
          </div>

          {/* Typography, Colors & Area */}
          <div className="space-y-2.5 p-2.5 rounded-lg bg-[#0E1117] border border-white/8">
            <span className="block text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              Fonts, Colors & Area
            </span>

            <div className="space-y-1.5 text-[11px]">
              <label className="block">
                <span className="text-zinc-400 block mb-0.5">Farsi / Dari Font</span>
                <select
                  value={scrollingConfig.farsiFont}
                  onChange={(e) =>
                    onChangeScrollingConfig({ farsiFont: e.target.value })
                  }
                  className="w-full bg-[#161A22] text-zinc-100 rounded px-2 py-1 border border-white/10"
                >
                  {FARSI_FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="block">
                  <span className="text-zinc-400 block mb-0.5">Romanized Font</span>
                  <select
                    value={scrollingConfig.romanFont}
                    onChange={(e) =>
                      onChangeScrollingConfig({ romanFont: e.target.value })
                    }
                    className="w-full bg-[#161A22] text-zinc-100 rounded px-2 py-1 border border-white/10"
                  >
                    {LATIN_FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-zinc-400 block mb-0.5">English Font</span>
                  <select
                    value={scrollingConfig.englishFont}
                    onChange={(e) =>
                      onChangeScrollingConfig({ englishFont: e.target.value })
                    }
                    className="w-full bg-[#161A22] text-zinc-100 rounded px-2 py-1 border border-white/10"
                  >
                    {LATIN_FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <SliderControl
              label="Farsi Font Size"
              value={scrollingConfig.farsiFontSize}
              min={26}
              max={82}
              step={2}
              display={`${scrollingConfig.farsiFontSize}px`}
              onChange={(v) => onChangeScrollingConfig({ farsiFontSize: v })}
            />
            <SliderControl
              label="English Font Size"
              value={scrollingConfig.englishFontSize}
              min={16}
              max={48}
              step={1}
              display={`${scrollingConfig.englishFontSize}px`}
              onChange={(v) => onChangeScrollingConfig({ englishFontSize: v })}
            />

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="flex items-center justify-between bg-[#161A22] px-2 py-1 rounded border border-white/10">
                <span className="text-zinc-300">Active Color</span>
                <input
                  type="color"
                  value={scrollingConfig.activeColor}
                  onChange={(e) =>
                    onChangeScrollingConfig({ activeColor: e.target.value })
                  }
                  className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between bg-[#161A22] px-2 py-1 rounded border border-white/10">
                <span className="text-zinc-300">Outer Color</span>
                <input
                  type="color"
                  value={scrollingConfig.textColor}
                  onChange={(e) =>
                    onChangeScrollingConfig({ textColor: e.target.value })
                  }
                  className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                />
              </label>
            </div>

            <SliderControl
              label="Glow Strength"
              value={scrollingConfig.glowStrength}
              min={0}
              max={1}
              step={0.05}
              display={`${Math.round(scrollingConfig.glowStrength * 100)}%`}
              onChange={(v) => onChangeScrollingConfig({ glowStrength: v })}
            />
            <SliderControl
              label="Shadow Strength"
              value={scrollingConfig.shadowStrength}
              min={0}
              max={1}
              step={0.05}
              display={`${Math.round(scrollingConfig.shadowStrength * 100)}%`}
              onChange={(v) => onChangeScrollingConfig({ shadowStrength: v })}
            />

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label>
                <span className="text-zinc-400 block mb-0.5">Alignment</span>
                <select
                  value={scrollingConfig.textAlign}
                  onChange={(e) =>
                    onChangeScrollingConfig({
                      textAlign: e.target.value as 'left' | 'center' | 'right',
                    })
                  }
                  className="w-full bg-[#161A22] text-zinc-100 rounded px-2 py-1 border border-white/10"
                >
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label>
                <span className="text-zinc-400 block mb-0.5">Lyric Area Position</span>
                <select
                  value={scrollingConfig.areaPosition}
                  onChange={(e) =>
                    onChangeScrollingConfig({
                      areaPosition: e.target.value as 'top' | 'center' | 'bottom',
                    })
                  }
                  className="w-full bg-[#161A22] text-zinc-100 rounded px-2 py-1 border border-white/10"
                >
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
            </div>

            <SliderControl
              label="Lyric Area Width"
              value={scrollingConfig.areaWidthPct}
              min={50}
              max={96}
              step={2}
              display={`${scrollingConfig.areaWidthPct}%`}
              onChange={(v) => onChangeScrollingConfig({ areaWidthPct: v })}
            />

            <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={scrollingConfig.backgroundGradient}
                onChange={(e) =>
                  onChangeScrollingConfig({ backgroundGradient: e.target.checked })
                }
                className="accent-amber-500"
              />
              <span>Background gradient behind lyrics</span>
            </label>
          </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

const BEAT_EFFECT_VISUALS: Record<
  BeatVisualEffectType,
  { icon: React.ComponentType<{ className?: string }>; previewBg: string }
> = {
  none: {
    icon: Ban,
    previewBg: 'bg-gradient-to-br from-zinc-900 to-zinc-800',
  },
  'beat-bounce': {
    icon: Activity,
    previewBg: 'bg-gradient-to-br from-amber-950/80 via-[#1b1610] to-orange-900/50',
  },
  'zoom-pulse': {
    icon: ZoomIn,
    previewBg: 'bg-gradient-to-br from-sky-950/80 via-[#101824] to-indigo-900/60',
  },
  'beat-shake': {
    icon: Waves,
    previewBg: 'bg-gradient-to-br from-rose-950/80 via-[#221218] to-amber-900/50',
  },
  'ring-ripple': {
    icon: CircleDot,
    previewBg: 'bg-gradient-to-br from-cyan-950/80 via-[#101d24] to-amber-900/50',
  },
  'flash-lamp': {
    icon: Zap,
    previewBg: 'bg-gradient-to-br from-amber-800/60 via-[#261d12] to-yellow-700/40',
  },
  'rgb-glitch': {
    icon: Sparkles,
    previewBg: 'bg-gradient-to-br from-fuchsia-950/80 via-[#1b1224] to-cyan-900/60',
  },
  'neon-rush': {
    icon: Flame,
    previewBg: 'bg-gradient-to-br from-fuchsia-950/90 via-indigo-950/80 to-cyan-900/60',
  },
  'lightning-vortex': {
    icon: Zap,
    previewBg: 'bg-gradient-to-br from-blue-950/90 via-[#0d192e] to-sky-800/60',
  },
  'abstract-glitter': {
    icon: Sparkles,
    previewBg: 'bg-gradient-to-br from-amber-900/60 via-[#1d1826] to-pink-900/50',
  },
  'ghost-clone': {
    icon: Users,
    previewBg: 'bg-gradient-to-br from-violet-950/90 via-[#181226] to-fuchsia-900/60',
  },
  'neon-outline': {
    icon: Orbit,
    previewBg: 'bg-gradient-to-br from-teal-950/90 via-[#0d2024] to-cyan-900/60',
  },
  'heart-particles': {
    icon: Heart,
    previewBg: 'bg-gradient-to-br from-rose-950/90 via-[#26101c] to-pink-900/60',
  },
  'speed-lines': {
    icon: Wind,
    previewBg: 'bg-gradient-to-br from-slate-800/80 via-[#141923] to-sky-900/50',
  },
};

const VISUALIZER_ICONS: Record<
  AudioVisualizerType,
  React.ComponentType<{ className?: string }>
> = {
  none: Ban,
  'spectrum-bars': BarChart3,
  'iridescent-bars': BarChart3,
  'dot-matrix': Grid,
  'mirror-wave': AudioWaveform,
  'waving-line': Waves,
  'circular-halo': Radio,
  'iridescent-circle': Disc3,
  'bass-blob': Orbit,
  'audio-spectrum': Activity,
  'color-ribbon': Sparkles,
  'border-spectrum': Layers,
  'pulse-particles': CircleDot,
  'pulse-line': Activity,
};

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (val: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono tabular-nums text-zinc-400">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-500 cursor-pointer"
      />
    </div>
  );
}

function CueTimeInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (seconds: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          setDraft(formatTimecode(value));
          setEditing(true);
        }}
        className="px-1.5 py-0.5 text-[10px] font-mono tabular-nums bg-[#090B0F] hover:bg-[#191D26] text-zinc-300 rounded border border-white/8 cursor-pointer"
      >
        {formatTimecode(value)}
      </button>
    );
  }

  const commit = () => {
    const parsed = parseTimecodeInput(draft);
    if (parsed !== null) {
      onCommit(parsed);
    }
    setEditing(false);
  };

  return (
    <input
      type="text"
      autoFocus
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-14 px-1 py-0.5 text-[10px] font-mono tabular-nums bg-[#090B0F] text-amber-300 rounded border border-amber-500 focus:outline-none"
    />
  );
}
