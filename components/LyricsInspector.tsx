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
  AudioLines,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  EnabledTracks,
  LyricCue,
  LyricStyleConfig,
  PlainImportMode,
  SAMPLE_MULTI_LYRICS,
  detectScriptDirection,
  formatTimecode,
  parseTimecodeInput,
} from '@/lib/lyrics-parser';

export type WhisperLanguage = 'auto' | 'persian' | 'english';
export type WhisperModelSize = 'tiny' | 'base' | 'small';

interface LyricsInspectorProps {
  cues: LyricCue[];
  currentTime: number;
  duration: number;
  enabledTracks: EnabledTracks;
  style: LyricStyleConfig;
  syncTargetIndex: number;
  activeTab: 'lyrics' | 'style';
  hasAudioSource: boolean;
  isTranscribing: boolean;
  transcribeStatus: string | null;
  transcribeNotice: string | null;
  transcribeError: string | null;
  onChangeTab: (tab: 'lyrics' | 'style') => void;
  onToggleTrack: (track: keyof EnabledTracks) => void;
  onImportLyricsText: (
    text: string,
    mode: PlainImportMode,
    options?: {
      autoSyncVocals: boolean;
      language: WhisperLanguage;
      modelSize: WhisperModelSize;
    }
  ) => void;
  onTranscribeAudio: (options: {
    mode: 'generate' | 'align-existing';
    language: WhisperLanguage;
    modelSize: WhisperModelSize;
  }) => void;
  onDismissTranscribeError: () => void;
  onDismissTranscribeNotice: () => void;
  onCancelTranscribe: () => void;
  onUpdateCueText: (
    id: string,
    field: 'primary' | 'roman' | 'english',
    value: string
  ) => void;
  onUpdateCueTiming: (id: string, start: number, end: number) => void;
  onStampCueAtCurrentTime: (index: number) => void;
  onDeleteCue: (id: string) => void;
  onAddCue: () => void;
  onSeekToCue: (time: number) => void;
  onChangeStyle: (patch: Partial<LyricStyleConfig>) => void;
}

export default function LyricsInspector({
  cues,
  currentTime,
  enabledTracks,
  style,
  syncTargetIndex,
  activeTab,
  hasAudioSource,
  isTranscribing,
  transcribeStatus,
  transcribeNotice,
  transcribeError,
  onChangeTab,
  onToggleTrack,
  onImportLyricsText,
  onTranscribeAudio,
  onDismissTranscribeError,
  onDismissTranscribeNotice,
  onCancelTranscribe,
  onUpdateCueText,
  onUpdateCueTiming,
  onStampCueAtCurrentTime,
  onDeleteCue,
  onAddCue,
  onSeekToCue,
  onChangeStyle,
}: LyricsInspectorProps) {
  const [showImporter, setShowImporter] = useState(false);
  const [rawLyrics, setRawLyrics] = useState(SAMPLE_MULTI_LYRICS);
  const [importMode, setImportMode] = useState<PlainImportMode>('auto');
  const [importError, setImportError] = useState<string | null>(null);
  const [languageHint, setLanguageHint] = useState<WhisperLanguage>('auto');
  const [modelSize, setModelSize] = useState<WhisperModelSize>('tiny');
  const [autoSyncOnImport, setAutoSyncOnImport] = useState(true);
  const srtInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = async (file: File) => {
    try {
      const text = await file.text();
      if (!text.trim()) {
        setImportError('The selected file is empty.');
        return;
      }
      setImportError(null);
      setRawLyrics(text);
      onImportLyricsText(text, importMode, {
        autoSyncVocals: autoSyncOnImport,
        language: languageHint,
        modelSize,
      });
      setShowImporter(false);
    } catch {
      setImportError('Could not read the lyrics file.');
    }
  };

  const handleApplyRaw = () => {
    if (!rawLyrics.trim()) {
      setImportError('Paste lyrics or upload an .srt / .txt file first.');
      return;
    }
    setImportError(null);
    onImportLyricsText(rawLyrics, importMode, {
      autoSyncVocals: autoSyncOnImport,
      language: languageHint,
      modelSize,
    });
    setShowImporter(false);
  };

  return (
    <aside
      aria-label="Lyrics and Overlay Inspector"
      className="flex flex-col h-full bg-[#12151C] border-l border-white/8 overflow-hidden"
    >
      {/* Inspector Tab Switcher */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Inspector sections"
          className="grid grid-cols-2 w-full gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/8"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'lyrics'}
            onClick={() => onChangeTab('lyrics')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'lyrics'
                ? 'bg-[#1D222D] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Lyrics & Sync ({cues.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'style'}
            onClick={() => onChangeTab('style')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'style'
                ? 'bg-[#1D222D] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Overlay Style
          </button>
        </div>
      </div>

      {activeTab === 'lyrics' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Import, Auto-Transcribe & Track Toggles */}
          <div className="p-3 border-b border-white/8 space-y-2.5">
            {/* Local Whisper Auto-Transcribe & Vocal Alignment */}
            <div className="p-2.5 rounded-lg bg-[#0E1117] border border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-zinc-300">
                  Local Whisper Auto-Sync
                </span>
                <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                  Runs in browser · No limits
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <select
                  aria-label="Transcription language hint"
                  value={languageHint}
                  onChange={(e) => setLanguageHint(e.target.value as WhisperLanguage)}
                  disabled={isTranscribing}
                  className="bg-[#161A22] text-zinc-200 text-[11px] rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500"
                >
                  <option value="auto">Auto Language</option>
                  <option value="persian">Persian (Farsi)</option>
                  <option value="english">English</option>
                </select>
                <select
                  aria-label="Local Whisper model size"
                  value={modelSize}
                  onChange={(e) => setModelSize(e.target.value as WhisperModelSize)}
                  disabled={isTranscribing}
                  className="bg-[#161A22] text-zinc-200 text-[11px] rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500"
                >
                  <option value="tiny">Tiny (40MB · Fast)</option>
                  <option value="base">Base (75MB · Balanced)</option>
                  <option value="small">Small (190MB · Farsi)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                {isTranscribing ? (
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Loader2
                        className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-[11px] font-medium text-amber-200 truncate">
                        {transcribeStatus || 'Processing audio...'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onCancelTranscribe}
                      className="px-2 py-1 text-[11px] font-medium text-zinc-200 hover:text-white bg-[#191D26] hover:bg-[#252B37] rounded border border-white/10 shrink-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!hasAudioSource}
                    onClick={() =>
                      onTranscribeAudio({
                        mode: 'generate',
                        language: languageHint,
                        modelSize,
                      })
                    }
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <AudioLines className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Transcribe & Generate Lyrics</span>
                  </button>
                )}

                {cues.length > 0 && (
                  <button
                    type="button"
                    disabled={!hasAudioSource || isTranscribing}
                    onClick={() =>
                      onTranscribeAudio({
                        mode: 'align-existing',
                        language: languageHint,
                        modelSize,
                      })
                    }
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-[#191D26] hover:bg-[#222834] disabled:opacity-50 text-zinc-100 rounded-lg border border-white/10 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Crosshair className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>Sync Pasted Lyrics to Vocals</span>
                  </button>
                )}
              </div>

              {!hasAudioSource && (
                <p className="text-[11px] text-zinc-500">
                  Select an audio or video clip in Uploaded Items to transcribe or auto-sync.
                </p>
              )}

              {transcribeNotice && !transcribeError && (
                <div
                  role="status"
                  className="p-2 rounded bg-emerald-500/10 border border-emerald-500/25 flex items-start justify-between gap-2 text-[11px] text-emerald-200"
                >
                  <div className="flex items-start gap-1.5">
                    <Check
                      className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>{transcribeNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onDismissTranscribeNotice}
                    aria-label="Dismiss sync notice"
                    className="text-emerald-300 hover:text-white shrink-0 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              )}

              {transcribeError && (
                <div
                  role="alert"
                  className="p-2 rounded bg-red-500/10 border border-red-500/30 flex items-start justify-between gap-2 text-[11px] text-red-200"
                >
                  <div className="flex items-start gap-1.5">
                    <AlertCircle
                      className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>{transcribeError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onDismissTranscribeError}
                    aria-label="Dismiss transcription error"
                    className="text-red-300 hover:text-white shrink-0 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImporter((v) => !v)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#191D26] hover:bg-[#222834] text-zinc-100 rounded-lg border border-white/10 transition-colors whitespace-nowrap cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>{showImporter ? 'Close Lyrics Importer' : 'Paste / Edit Lyrics'}</span>
              </button>
              <button
                type="button"
                onClick={() => srtInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#191D26] hover:bg-[#222834] text-zinc-100 rounded-lg border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>.SRT / .TXT</span>
              </button>
              <input
                ref={srtInputRef}
                type="file"
                accept=".srt,.txt,.lrc"
                aria-label="Upload SRT or TXT lyrics file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileImport(file);
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {/* Expandable Paste Multi-Language Lyrics Drawer */}
            {showImporter && (
              <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/10 space-y-2.5">
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
                    <option value="paired-2">2-Line Blocks (e.g. Farsi + Eng)</option>
                    <option value="single">Single Language (1 line / cue)</option>
                  </select>
                </div>

                <textarea
                  value={rawLyrics}
                  onChange={(e) => setRawLyrics(e.target.value)}
                  rows={6}
                  aria-label="Paste lyrics in Farsi, Roman, English, or SRT format"
                  placeholder="Paste .SRT timestamps, Farsi verse stanzas, or multi-language lines like:&#10;شب یلدا | Shab-e yalda | Solstice night"
                  className="w-full rounded-lg bg-[#12151C] border border-white/10 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 font-sans leading-relaxed"
                />

                <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoSyncOnImport}
                    onChange={(e) => setAutoSyncOnImport(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span>Auto-sync plain lyrics to song vocal timestamps</span>
                </label>

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
                    Reset Sample Farsi/Roman/Eng
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyRaw}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-zinc-950 rounded-md hover:bg-amber-400 transition-colors cursor-pointer"
                  >
                    Apply to Timeline
                  </button>
                </div>
              </div>
            )}

            {/* Track Visibility Toggles (1, 2, or 3 languages on video) */}
            <div>
              <span className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Visible Lyric Tracks
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { key: 'primary', label: 'Farsi / Main' },
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
                      className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-[#0B0D11] border-white/8 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {active && <Check className="w-3 h-3" aria-hidden="true" />}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cue List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5" data-testid="cue-list">
            {cues.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <p className="text-sm font-medium text-zinc-300">No lyric cues yet</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Paste Farsi, Roman, or English lyrics above or upload an .srt file.
                </p>
              </div>
            ) : (
              cues.map((cue, index) => {
                const isActive =
                  currentTime >= cue.startTime && currentTime < cue.endTime;
                const isSyncTarget = index === syncTargetIndex;
                const primaryDir = detectScriptDirection(cue.primary);
                const durationSec = Math.max(0.1, cue.endTime - cue.startTime);

                return (
                  <div
                    key={cue.id}
                    className={`rounded-lg border p-2.5 space-y-2 transition-colors ${
                      isActive
                        ? 'bg-[#1B202C] border-amber-500/60'
                        : isSyncTarget
                        ? 'bg-[#161A23] border-white/25'
                        : 'bg-[#0E1117] border-white/8'
                    }`}
                  >
                    {/* Cue header: index, timestamps, duration, stamp button */}
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSeekToCue(cue.startTime)}
                        className="text-[11px] font-mono tabular-nums text-zinc-400 hover:text-amber-400 cursor-pointer"
                        title={
                          cue.words && cue.words.length > 0
                            ? `Jump playhead (${cue.words.length} word offsets aligned)`
                            : 'Jump playhead to this lyric'
                        }
                      >
                        {String(index + 1).padStart(2, '0')} · {durationSec.toFixed(1)}s
                        {cue.words && cue.words.length > 0 ? ` · ${cue.words.length}w` : ''}
                      </button>

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
                          title="Match this line start to current playhead"
                          className="p-1 text-amber-400 hover:bg-amber-500/15 rounded transition-colors cursor-pointer"
                        >
                          <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCue(cue.id)}
                          aria-label={`Delete lyric line ${index + 1}`}
                          className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Editable Multi-language text inputs */}
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        dir={primaryDir}
                        value={cue.primary}
                        onChange={(e) =>
                          onUpdateCueText(cue.id, 'primary', e.target.value)
                        }
                        aria-label={`Line ${index + 1} primary lyric`}
                        placeholder="Primary / Farsi line..."
                        className={`w-full rounded bg-[#090B0F] border border-white/8 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 ${
                          primaryDir === 'rtl' ? 'font-[family-name:var(--font-farsi)] text-sm' : ''
                        }`}
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={cue.roman}
                        onChange={(e) =>
                          onUpdateCueText(cue.id, 'roman', e.target.value)
                        }
                        aria-label={`Line ${index + 1} romanized lyric`}
                        placeholder="Romanized / Finglish (optional)..."
                        className="w-full rounded bg-[#090B0F] border border-white/8 px-2.5 py-1 text-xs text-amber-200/90 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
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
                        className="w-full rounded bg-[#090B0F] border border-white/8 px-2.5 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                );
              })
            )}

            <button
              type="button"
              onClick={onAddCue}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-[#0E1117] hover:bg-[#191D26] border border-dashed border-white/15 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Lyric Line</span>
            </button>
          </div>
        </div>
      ) : (
        /* Style Tab */
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Position */}
          <div>
            <span className="block text-xs font-medium text-zinc-300 mb-2">
              Vertical Position
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/8">
              {(['top', 'center', 'bottom'] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => onChangeStyle({ position: pos })}
                  className={`py-1.5 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                    style.position === pos
                      ? 'bg-[#1D222D] text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          {/* Fine Vertical Offset */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-300 font-medium">Fine Vertical Offset</span>
              <span className="font-mono tabular-nums text-zinc-400">
                {style.verticalOffsetPct > 0 ? '+' : ''}
                {style.verticalOffsetPct}%
              </span>
            </div>
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              aria-label="Fine vertical offset"
              value={style.verticalOffsetPct}
              onChange={(e) =>
                onChangeStyle({ verticalOffsetPct: Number(e.target.value) })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Font Scale */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-300 font-medium">Text Size</span>
              <span className="font-mono tabular-nums text-zinc-400">
                {Math.round(style.fontScale * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.7}
              max={1.5}
              step={0.05}
              aria-label="Lyric text size scale"
              value={style.fontScale}
              onChange={(e) => onChangeStyle({ fontScale: Number(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          {/* Alignment */}
          <div>
            <span className="block text-xs font-medium text-zinc-300 mb-2">
              Alignment
            </span>
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
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
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
          </div>

          {/* Backdrop Style */}
          <div>
            <span className="block text-xs font-medium text-zinc-300 mb-2">
              Readability Backdrop
            </span>
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
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    style.backdrop === b.id
                      ? 'bg-[#1D222D] text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palette */}
          <div>
            <span className="block text-xs font-medium text-zinc-300 mb-2">
              Lyric Color Pairings
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  name: 'White & Gold',
                  primary: '#FFFFFF',
                  secondary: '#FCD34D',
                },
                {
                  name: 'Warm Ivory',
                  primary: '#FEF3C7',
                  secondary: '#F59E0B',
                },
                {
                  name: 'Crisp Ice',
                  primary: '#FFFFFF',
                  secondary: '#BAE6FD',
                },
                {
                  name: 'Pure Minimal',
                  primary: '#FFFFFF',
                  secondary: '#D4D4D8',
                },
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
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#1D222D] border-amber-500/50 text-zinc-100'
                        : 'bg-[#0E1117] border-white/8 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <span className="flex items-center -space-x-1 shrink-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/40"
                        style={{ backgroundColor: preset.primary }}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/40"
                        style={{ backgroundColor: preset.secondary }}
                      />
                    </span>
                    <span className="truncate">{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
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
        className="px-1.5 py-0.5 text-[11px] font-mono tabular-nums bg-[#090B0F] hover:bg-[#191D26] text-zinc-300 rounded border border-white/8 cursor-pointer"
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
      className="w-16 px-1 py-0.5 text-[11px] font-mono tabular-nums bg-[#090B0F] text-amber-300 rounded border border-amber-500 focus:outline-none"
    />
  );
}
