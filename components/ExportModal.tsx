'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileText, Film, X, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  AspectRatio,
  EnabledTracks,
  LyricCue,
  LyricStyleConfig,
  MediaFitMode,
  exportToSrt,
  formatTimecode,
} from '@/lib/lyrics-parser';
import { getResolutionForRatio } from '@/lib/canvas-renderer';
import { CanvasLayer } from '@/lib/canvas-layers';
import { FocusedScrollingConfig } from '@/lib/scrolling-lyrics';
import { BeatEffectsConfig } from '@/lib/beat-effects';
import {
  AudioTimelineClip,
  TimedEffectClip,
  VisualTimelineClip,
} from '@/lib/timeline-engine';
import {
  EXPORT_QUALITY_PRESETS,
  ExportQualityPreset,
  estimateExportSizeMb,
  exportFullHdVideo,
} from '@/lib/video-exporter';
import { UploadedMediaItem } from './MediaBin';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  ratio: AspectRatio;
  duration: number;
  globalOffset: number;
  visualItem: UploadedMediaItem | null;
  audioItem: UploadedMediaItem | null;
  visualClips?: VisualTimelineClip[];
  audioClips?: AudioTimelineClip[];
  effectClips?: TimedEffectClip[];
  hiddenVisualTracks?: number[];
  mutedAudioTracks?: number[];
  mediaFit: MediaFitMode;
  cues: LyricCue[];
  enabledTracks: EnabledTracks;
  style: LyricStyleConfig;
  scrollingConfig: FocusedScrollingConfig;
  beatEffects?: BeatEffectsConfig;
  layers: CanvasLayer[];
  layerImages: Map<string, HTMLImageElement>;
}

export default function ExportModal({
  isOpen,
  onClose,
  ratio,
  duration,
  globalOffset,
  visualItem,
  audioItem,
  visualClips,
  audioClips,
  effectClips,
  hiddenVisualTracks,
  mutedAudioTracks,
  mediaFit,
  cues,
  enabledTracks,
  style,
  scrollingConfig,
  beatEffects,
  layers,
  layerImages,
}: ExportModalProps) {
  const [status, setStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [quality, setQuality] = useState<ExportQualityPreset>('ultra');
  const [progress, setProgress] = useState(0);
  const [frameStatus, setFrameStatus] = useState<string>('');
  const [formatLabel, setFormatLabel] = useState<string>('MP4 (H.264 + AAC) · Seekable');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastExportSize, setLastExportSize] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('lyrcut-1080p.mp4');

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  if (!isOpen) return null;

  const res = getResolutionForRatio(ratio);
  const qualitySpec = EXPORT_QUALITY_PRESETS[quality];
  const hasAudioTrack = Boolean(audioItem?.url || visualItem?.kind === 'video');
  const estSizeMb = estimateExportSizeMb(Math.max(2, duration), quality, hasAudioTrack);

  const handleDownloadSrt = () => {
    const srtText = exportToSrt(cues, enabledTracks, globalOffset);
    const blob = new Blob([srtText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lyrcut-lyrics-${ratio === '16:9' ? 'landscape' : 'portrait'}.srt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleStartFullHdExport = async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('rendering');
    setProgress(0);
    setFrameStatus('Preparing fonts & audio...');
    setErrorMsg(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    try {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }

      const computedStyle =
        typeof window !== 'undefined' ? window.getComputedStyle(document.body) : null;
      const latinFont =
        computedStyle?.fontFamily || '"Plus Jakarta Sans", system-ui, sans-serif';
      const rootStyles =
        typeof window !== 'undefined'
          ? window.getComputedStyle(document.documentElement)
          : null;
      const farsiVar = rootStyles?.getPropertyValue('--font-farsi').trim() ?? '';
      const nastaliqVar = rootStyles?.getPropertyValue('--font-nastaliq').trim() ?? '';
      const farsiFontFamily = farsiVar ? `${farsiVar}, ${latinFont}` : `"Vazirmatn", ${latinFont}`;
      const nastaliqFontFamily = nastaliqVar
        ? `${nastaliqVar}, ${farsiFontFamily}`
        : `"Noto Nastaliq Urdu", ${farsiFontFamily}`;

      const audioSrcUrl =
        audioItem?.url ?? (visualItem?.kind === 'video' ? visualItem.url : null);

      const result = await exportFullHdVideo({
        width: res.width,
        height: res.height,
        fps: 30,
        duration: Math.max(2, duration),
        ratio,
        quality,
        mediaFit,
        visualItem: visualItem
          ? { kind: visualItem.kind === 'video' ? 'video' : 'image', url: visualItem.url }
          : null,
        audioSrcUrl,
        visualClips,
        audioClips,
        effectClips,
        hiddenVisualTracks,
        mutedAudioTracks,
        cues,
        globalOffset,
        enabledTracks,
        style,
        scrollingConfig,
        beatEffects,
        layers,
        layerImages,
        farsiFontFamily,
        nastaliqFontFamily,
        latinFontFamily: latinFont,
        signal: controller.signal,
        onProgress: (info) => {
          setProgress(info.percent);
          setFormatLabel(info.formatLabel);
          setFrameStatus(
            `Frame ${info.currentFrame.toLocaleString()} / ${info.totalFrames.toLocaleString()} · 30 fps`
          );
        },
      });

      const fileName = `lyrcut-${res.width}x${res.height}-${
        ratio === '16:9' ? 'landscape' : 'portrait'
      }.${result.ext}`;
      const url = URL.createObjectURL(result.blob);
      const sizeMb = (result.blob.size / (1024 * 1024)).toFixed(1);

      setDownloadUrl(url);
      setDownloadName(fileName);
      setFormatLabel(result.formatLabel);
      setLastExportSize(`${sizeMb} MB · ${result.ext.toUpperCase()}`);
      setProgress(100);
      setStatus('done');

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle');
        setProgress(0);
        setFrameStatus('');
        return;
      }
      setStatus('error');
      setErrorMsg(
        err instanceof Error ? err.message : 'Unexpected Full HD export error.'
      );
    } finally {
      abortRef.current = null;
    }
  };

  const handleClose = () => {
    if (status === 'rendering') {
      abortRef.current?.abort();
    }
    setStatus('idle');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-lg rounded-xl bg-[#12151C] border border-white/12 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
          <h2 id="export-modal-title" className="text-base font-semibold text-zinc-100">
            Export Full HD Quality
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close export modal"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Output Specifications */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/8">
              <span className="text-zinc-400 block">Resolution</span>
              <span className="text-zinc-100 font-semibold font-mono tabular-nums mt-0.5 block">
                {res.width} × {res.height} px (1080p)
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/8">
              <span className="text-zinc-400 block">Container & Seek</span>
              <span className="text-zinc-100 font-semibold mt-0.5 block truncate">
                {status === 'idle' ? 'Seekable MP4 / WebM · 30 fps' : formatLabel}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/8">
              <span className="text-zinc-400 block">Duration & Est. Size</span>
              <span className="text-zinc-100 font-semibold font-mono tabular-nums mt-0.5 block">
                {formatTimecode(duration)} · ~{estSizeMb} MB
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/8">
              <span className="text-zinc-400 block">Lyric Tracks</span>
              <span className="text-zinc-100 font-semibold mt-0.5 block truncate">
                {[
                  enabledTracks.primary && 'Primary',
                  enabledTracks.roman && 'Roman',
                  enabledTracks.english && 'English',
                ]
                  .filter(Boolean)
                  .join(' · ') || 'None'}
              </span>
            </div>
          </div>

          {/* Quality Selector */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-400 block">
              Encoding Bitrate Preset
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(['high', 'ultra'] as ExportQualityPreset[]).map((presetKey) => {
                const spec = EXPORT_QUALITY_PRESETS[presetKey];
                const active = quality === presetKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    disabled={status === 'rendering'}
                    onClick={() => setQuality(presetKey)}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-50 ${
                      active
                        ? 'bg-amber-500/12 border-amber-500/50 text-zinc-100'
                        : 'bg-[#0B0D11] border-white/8 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <span className="block text-xs font-semibold">{spec.label}</span>
                    <span className="block text-[10px] text-zinc-400 mt-0.5">
                      {spec.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {status === 'rendering' && (
            <div className="p-3.5 rounded-lg bg-[#0B0D11] border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-zinc-200 font-medium truncate">
                  {frameStatus || 'Encoding deterministic 30 fps frames...'}
                </span>
                <span className="font-mono tabular-nums text-amber-400 font-semibold shrink-0">
                  {progress}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-[width] duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-400">
                Rendering frame-by-frame at {qualitySpec.videoBitrate / 1_000_000} Mbps with 1s keyframes for smooth playback & instant seeking.
              </p>
            </div>
          )}

          {status === 'done' && (
            <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <div>
                  <span className="block font-semibold">
                    Full HD export complete ({lastExportSize ?? 'Ready'})
                  </span>
                  <span className="block text-[10px] text-emerald-300/80">
                    {formatLabel}
                  </span>
                </div>
              </div>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-zinc-950 rounded-md hover:bg-emerald-400 whitespace-nowrap"
                >
                  Save Again
                </a>
              )}
            </div>
          )}

          {status === 'error' && errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Export Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            {status === 'rendering' ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg cursor-pointer"
              >
                Cancel Export
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartFullHdExport}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-colors cursor-pointer"
              >
                <Film className="w-4 h-4" aria-hidden="true" />
                <span>Download Full HD Video ({res.width}×{res.height})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadSrt}
              disabled={cues.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium bg-[#191D26] hover:bg-[#232936] text-zinc-100 border border-white/10 rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileText className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>Export .SRT</span>
            </button>
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Rendered frame-by-frame at exact 30 fps using WebCodecs hardware acceleration with indexed seek tables and embedded duration metadata.
          </p>
        </div>
      </div>
    </div>
  );
}
