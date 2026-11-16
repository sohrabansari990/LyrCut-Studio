'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Film, X, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  AspectRatio,
  EnabledTracks,
  LyricCue,
  LyricStyleConfig,
  MediaFitMode,
  exportToSrt,
  formatTimecode,
} from '@/lib/lyrics-parser';
import { getResolutionForRatio, renderFrameToCanvas } from '@/lib/canvas-renderer';
import { UploadedMediaItem } from './MediaBin';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  ratio: AspectRatio;
  duration: number;
  visualItem: UploadedMediaItem | null;
  audioItem: UploadedMediaItem | null;
  mediaFit: MediaFitMode;
  cues: LyricCue[];
  enabledTracks: EnabledTracks;
  style: LyricStyleConfig;
}

function pickBestMimeType(): { mimeType: string; ext: 'mp4' | 'webm' } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', ext: 'webm' };
  }
  const candidates: Array<{ mimeType: string; ext: 'mp4' | 'webm' }> = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mimeType: 'video/mp4', ext: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: '', ext: 'webm' };
}

export default function ExportModal({
  isOpen,
  onClose,
  ratio,
  duration,
  visualItem,
  audioItem,
  mediaFit,
  cues,
  enabledTracks,
  style,
}: ExportModalProps) {
  const [status, setStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastExportSize, setLastExportSize] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('lyrcut-1080p.webm');

  const cancelRef = useRef(false);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  if (!isOpen) return null;

  const res = getResolutionForRatio(ratio);

  const handleDownloadSrt = () => {
    const srtText = exportToSrt(cues, enabledTracks);
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
    if (typeof MediaRecorder === 'undefined') {
      setStatus('error');
      setErrorMsg(
        'Your browser does not support MediaRecorder video capture. Please use Chrome, Edge, or Firefox.'
      );
      return;
    }

    cancelRef.current = false;
    setStatus('rendering');
    setProgress(0);
    setErrorMsg(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    const canvas = document.createElement('canvas');
    canvas.width = res.width;
    canvas.height = res.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setStatus('error');
      setErrorMsg('Could not initialize Full HD 2D rendering canvas.');
      return;
    }

    let exportVideoEl: HTMLVideoElement | null = null;
    let exportImageEl: HTMLImageElement | null = null;
    let exportAudioEl: HTMLAudioElement | null = null;
    let audioCtx: AudioContext | null = null;
    let rafId = 0;

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      if (exportVideoEl) {
        exportVideoEl.pause();
        exportVideoEl.src = '';
      }
      if (exportAudioEl) {
        exportAudioEl.pause();
        exportAudioEl.src = '';
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };

    try {
      // Load visual element cleanly
      if (visualItem?.kind === 'image') {
        exportImageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load image for export.'));
          img.src = visualItem.url;
        });
      } else if (visualItem?.kind === 'video') {
        exportVideoEl = await new Promise<HTMLVideoElement>((resolve, reject) => {
          const v = document.createElement('video');
          v.crossOrigin = 'anonymous';
          v.playsInline = true;
          v.muted = true; // audio comes from audioEl or separate track
          v.loop = true;
          v.onloadeddata = () => resolve(v);
          v.onerror = () => reject(new Error('Failed to load video for export.'));
          v.src = visualItem.url;
        });
      }

      // Build MediaStream (Full HD Canvas 30fps + Optional Audio)
      const canvasStream = canvas.captureStream(30);
      const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

      const audioSrcUrl =
        audioItem?.url ?? (visualItem?.kind === 'video' ? visualItem.url : null);

      if (audioSrcUrl) {
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          audioCtx = new AudioCtx();
          const dest = audioCtx.createMediaStreamDestination();

          exportAudioEl = new Audio();
          exportAudioEl.crossOrigin = 'anonymous';
          exportAudioEl.src = audioSrcUrl;
          await new Promise<void>((resolve) => {
            if (!exportAudioEl) return resolve();
            exportAudioEl.oncanplaythrough = () => resolve();
            exportAudioEl.onerror = () => resolve();
            setTimeout(resolve, 1500);
          });

          const srcNode = audioCtx.createMediaElementSource(exportAudioEl);
          srcNode.connect(dest);
          const audioTracks = dest.stream.getAudioTracks();
          tracks.push(...audioTracks);
        } catch {
          // Proceed with video-only stream if audio capture fails
        }
      }

      const combinedStream = new MediaStream(tracks);
      const { mimeType, ext } = pickBestMimeType();
      const recorder = new MediaRecorder(combinedStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 20_000_000, // 20 Mbps Full HD high-fidelity bitrate
        audioBitsPerSecond: 256_000,
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data);
        }
      };

      const recordingDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(
            new Blob(chunks, {
              type: mimeType || `video/${ext}`,
            })
          );
        };
      });

      const exportDuration = Math.max(2, duration);
      // Draw frame 0 immediately
      renderFrameToCanvas({
        ctx,
        width: res.width,
        height: res.height,
        ratio,
        mediaSource: exportVideoEl ?? exportImageEl,
        mediaFit,
        cues,
        currentTime: 0,
        enabledTracks,
        style,
        drawSafeZones: false,
      });

      recorder.start(250);
      if (exportVideoEl) {
        exportVideoEl.currentTime = 0;
        await exportVideoEl.play().catch(() => {});
      }
      if (exportAudioEl) {
        exportAudioEl.currentTime = 0;
        await exportAudioEl.play().catch(() => {});
      }

      const startTimeMs = performance.now();

      await new Promise<void>((resolve) => {
        const tick = () => {
          if (cancelRef.current) {
            resolve();
            return;
          }
          const elapsedSec = (performance.now() - startTimeMs) / 1000;
          const t = Math.min(exportDuration, elapsedSec);

          renderFrameToCanvas({
            ctx,
            width: res.width,
            height: res.height,
            ratio,
            mediaSource: exportVideoEl ?? exportImageEl,
            mediaFit,
            cues,
            currentTime: t,
            enabledTracks,
            style,
            drawSafeZones: false,
          });

          setProgress(Math.min(99, Math.round((t / exportDuration) * 100)));

          if (elapsedSec >= exportDuration) {
            resolve();
            return;
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      });

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      const blob = await recordingDone;
      cleanup();

      if (cancelRef.current) {
        setStatus('idle');
        setProgress(0);
        return;
      }

      const fileName = `lyrcut-${res.width}x${res.height}-${
        ratio === '16:9' ? 'landscape' : 'portrait'
      }.${ext}`;
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(fileName);
      setLastExportSize(`${(blob.size / (1024 * 1024)).toFixed(1)} MB`);
      setProgress(100);
      setStatus('done');

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      cleanup();
      setStatus('error');
      setErrorMsg(
        err instanceof Error ? err.message : 'Unexpected Full HD export error.'
      );
    }
  };

  const handleClose = () => {
    if (status === 'rendering') {
      cancelRef.current = true;
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

        <div className="p-5 space-y-5">
          {/* Output Specifications */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/8">
              <span className="text-zinc-400 block">Resolution</span>
              <span className="text-zinc-100 font-semibold font-mono tabular-nums mt-0.5 block">
                {res.width} × {res.height} px (1080p)
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/8">
              <span className="text-zinc-400 block">Video Bitrate</span>
              <span className="text-zinc-100 font-semibold font-mono tabular-nums mt-0.5 block">
                20 Mbps · Uncompressed Feel
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/8">
              <span className="text-zinc-400 block">Duration</span>
              <span className="text-zinc-100 font-semibold font-mono tabular-nums mt-0.5 block">
                {formatTimecode(duration)} · 30 fps
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

          {status === 'rendering' && (
            <div className="p-3.5 rounded-lg bg-[#0B0D11] border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-200 font-medium">
                  Rendering Full HD frames in real time...
                </span>
                <span className="font-mono tabular-nums text-amber-400 font-semibold">
                  {progress}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-[width] duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === 'done' && (
            <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  Full HD export complete ({lastExportSize ?? 'Ready'})
                </span>
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
                onClick={() => {
                  cancelRef.current = true;
                }}
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
            Rendered 100% locally in your browser at native Full HD resolution—your media never leaves your device and never gets compressed by a server.
          </p>
        </div>
      </div>
    </div>
  );
}
