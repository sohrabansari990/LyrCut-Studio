'use client';

import React, { useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Crosshair,
  Monitor,
  Smartphone,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  AspectRatio,
  LyricCue,
  formatTimecode,
} from '@/lib/lyrics-parser';

interface PreviewStageProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ratio: AspectRatio;
  onChangeRatio: (ratio: AspectRatio) => void;
  showSafeZones: boolean;
  onToggleSafeZones: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  cues: LyricCue[];
  syncTargetIndex: number;
  onSelectSyncTarget: (idx: number) => void;
  onStampNextLine: () => void;
  onShiftAllCues: (offset: number) => void;
  waveformPeaks: number[];
  activeAudioName: string | null;
}

export default function PreviewStage({
  canvasRef,
  ratio,
  onChangeRatio,
  showSafeZones,
  onToggleSafeZones,
  isPlaying,
  onTogglePlay,
  onRestart,
  isMuted,
  onToggleMute,
  currentTime,
  duration,
  onSeek,
  cues,
  syncTargetIndex,
  onSelectSyncTarget,
  onStampNextLine,
  onShiftAllCues,
  waveformPeaks,
  activeAudioName,
}: PreviewStageProps) {
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleTimelinePointer = (clientX: number) => {
    const el = timelineRef.current;
    if (!el || duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  };

  const progressPct =
    duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  const targetCue = cues[syncTargetIndex] ?? null;

  return (
    <section
      aria-label="Video Preview and Singer Sync Stage"
      className="flex flex-col h-full bg-[#0B0D11] overflow-hidden"
    >
      {/* Ratio & Preview Toolbar */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-white/8 bg-[#0E1117] flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Aspect Ratio"
          className="inline-flex items-center gap-1 p-1 bg-[#161A22] rounded-lg border border-white/8 min-w-0"
        >
          <button
            type="button"
            onClick={() => onChangeRatio('16:9')}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              ratio === '16:9'
                ? 'bg-amber-500 text-zinc-950'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sm:hidden">16:9</span>
            <span className="hidden sm:inline">16:9 Landscape · 1920×1080</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeRatio('9:16')}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              ratio === '9:16'
                ? 'bg-amber-500 text-zinc-950'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sm:hidden">9:16</span>
            <span className="hidden sm:inline">9:16 Portrait · 1080×1920</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleSafeZones}
          aria-pressed={showSafeZones}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showSafeZones
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-[#161A22] border-white/8 text-zinc-300 hover:text-white'
          }`}
        >
          <Shield className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Safe Margins</span>
          <span className="sm:hidden">Safe</span>
        </button>
      </div>

      {/* Live Canvas Viewport */}
      <div className="flex-1 min-h-0 h-[44vh] lg:h-auto flex items-center justify-center p-3 sm:p-6 bg-[#080A0E] overflow-hidden">
        <div
          className="relative flex items-center justify-center rounded-lg overflow-hidden border border-white/10 shadow-2xl bg-black"
          style={{
            aspectRatio: ratio === '16:9' ? '16 / 9' : '9 / 16',
            maxWidth: '100%',
            maxHeight: '100%',
            height: ratio === '9:16' ? '100%' : 'auto',
            width: ratio === '16:9' ? '100%' : 'auto',
          }}
        >
          <canvas
            ref={canvasRef}
            data-testid="studio-canvas"
            data-ratio={ratio}
            className="w-full h-full block object-contain"
          />
        </div>
      </div>

      {/* Singer Tap-to-Sync + Transport Bar */}
      <div className="border-t border-white/8 bg-[#12151C] px-4 py-3 space-y-3">
        {/* Singer Sync Action Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/8">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onStampNextLine}
              disabled={cues.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold bg-amber-500 text-zinc-950 rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {cues.length > 0
                  ? `Mark Line ${syncTargetIndex + 1} Now (S)`
                  : 'Add Lyrics to Sync'}
              </span>
            </button>

            {targetCue && (
              <div className="hidden sm:flex items-center gap-1.5 min-w-0 text-xs text-zinc-400">
                <button
                  type="button"
                  aria-label="Previous sync target line"
                  onClick={() =>
                    onSelectSyncTarget(Math.max(0, syncTargetIndex - 1))
                  }
                  className="p-1 text-zinc-400 hover:text-zinc-100 rounded cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <span className="truncate max-w-[200px] text-zinc-200">
                  {targetCue.primary || targetCue.roman || targetCue.english}
                </span>
                <button
                  type="button"
                  aria-label="Next sync target line"
                  onClick={() =>
                    onSelectSyncTarget(
                      Math.min(cues.length - 1, syncTargetIndex + 1)
                    )
                  }
                  className="p-1 text-zinc-400 hover:text-zinc-100 rounded cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-zinc-400 hidden sm:inline">
              Global Offset:
            </span>
            <button
              type="button"
              onClick={() => onShiftAllCues(-0.25)}
              disabled={cues.length === 0}
              className="px-2 py-1 text-[11px] font-mono tabular-nums bg-[#191D26] hover:bg-[#232936] text-zinc-200 rounded border border-white/8 disabled:opacity-40 cursor-pointer"
            >
              -0.25s
            </button>
            <button
              type="button"
              onClick={() => onShiftAllCues(0.25)}
              disabled={cues.length === 0}
              className="px-2 py-1 text-[11px] font-mono tabular-nums bg-[#191D26] hover:bg-[#232936] text-zinc-200 rounded border border-white/8 disabled:opacity-40 cursor-pointer"
            >
              +0.25s
            </button>
          </div>
        </div>

        {/* Audio Waveform + Lyric Cue Timeline Scrubber */}
        <div
          ref={timelineRef}
          role="slider"
          tabIndex={0}
          aria-label="Timeline scrubber"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          onClick={(e) => handleTimelinePointer(e.clientX)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') onSeek(Math.min(duration, currentTime + 1));
            if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 1));
          }}
          className="relative h-12 rounded-lg bg-[#090B0F] border border-white/8 overflow-hidden cursor-pointer select-none"
        >
          {/* Audio Waveform Bars */}
          {waveformPeaks.length > 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-1 top-4 flex items-end gap-[2px] px-1 opacity-55 pointer-events-none"
            >
              {waveformPeaks.map((peak, idx) => (
                <div
                  key={idx}
                  className="flex-1 bg-zinc-500/60 rounded-t-[1px]"
                  style={{ height: `${Math.max(10, peak * 100)}%` }}
                />
              ))}
            </div>
          )}

          {/* Lyric Cue Blocks */}
          <div className="absolute inset-x-0 top-1 h-4 pointer-events-none">
            {cues.map((cue, idx) => {
              const leftPct = duration > 0 ? (cue.startTime / duration) * 100 : 0;
              const widthPct =
                duration > 0
                  ? Math.max(0.8, ((cue.endTime - cue.startTime) / duration) * 100)
                  : 0;
              const isActive =
                currentTime >= cue.startTime && currentTime < cue.endTime;

              return (
                <div
                  key={cue.id}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  className={`absolute top-0 bottom-0 rounded-[3px] border text-[9px] px-1 truncate leading-4 ${
                    isActive
                      ? 'bg-amber-500/85 border-amber-300 text-zinc-950 font-semibold'
                      : 'bg-zinc-700/60 border-white/15 text-zinc-200'
                  }`}
                >
                  {idx + 1}
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            aria-hidden="true"
            style={{ left: `${progressPct}%` }}
            className="absolute top-0 bottom-0 w-[2px] bg-amber-400 pointer-events-none"
          >
            <div className="w-2.5 h-2.5 -ml-[4px] -mt-[1px] rounded-full bg-amber-400" />
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause playback' : 'Play preview'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white transition-colors cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onRestart}
              aria-label="Restart from beginning"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#191D26] text-zinc-300 hover:text-white border border-white/8 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#191D26] text-zinc-300 hover:text-white border border-white/8 transition-colors cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
            <span className="ml-1 text-xs font-mono tabular-nums text-zinc-200">
              {formatTimecode(currentTime)}{' '}
              <span className="text-zinc-500">/ {formatTimecode(duration)}</span>
            </span>
          </div>

          <p className="text-[11px] text-zinc-400 truncate max-w-[200px]">
            {activeAudioName ? `Audio: ${activeAudioName}` : 'No audio track'}
          </p>
        </div>
      </div>
    </section>
  );
}
