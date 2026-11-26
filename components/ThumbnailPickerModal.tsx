'use client';

import React, { useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  Image as ImageIcon,
  Monitor,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AspectRatio, formatTimecode } from '@/lib/lyrics-parser';
import { sanitizeProjectFilename } from '@/lib/timeline-engine';

export interface ThumbnailAsset {
  dataUrl: string;
  source: 'frame' | 'upload';
  timestamp?: number;
  fileName?: string;
}

export type ProjectThumbnails = {
  '16:9': ThumbnailAsset | null;
  '9:16': ThumbnailAsset | null;
};

interface ThumbnailPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRatio: AspectRatio;
  projectName: string;
  currentTime: number;
  duration: number;
  thumbnails: ProjectThumbnails;
  onCaptureFrame: (targetRatio: AspectRatio, timestamp: number) => Promise<string | null>;
  onSetThumbnail: (targetRatio: AspectRatio, asset: ThumbnailAsset | null) => void;
}

export default function ThumbnailPickerModal(props: ThumbnailPickerModalProps) {
  if (!props.isOpen) return null;
  return <ThumbnailPickerDialog {...props} />;
}

function ThumbnailPickerDialog({
  onClose,
  initialRatio,
  projectName,
  currentTime,
  duration,
  thumbnails,
  onCaptureFrame,
  onSetThumbnail,
}: ThumbnailPickerModalProps) {
  const safeDuration = Math.max(1, duration);
  const [activeRatio, setActiveRatio] = useState<AspectRatio>(initialRatio);
  const [captureTime, setCaptureTime] = useState<number>(() =>
    Math.max(0, Math.min(safeDuration, currentTime))
  );
  const [uploadFitMode, setUploadFitMode] = useState<'cover' | 'contain'>('cover');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeThumb = thumbnails[activeRatio];
  const dims =
    activeRatio === '16:9'
      ? { width: 1920, height: 1080, label: 'Landscape · 1920×1080' }
      : { width: 1080, height: 1920, label: 'Portrait · 1080×1920' };

  const handleCaptureAt = async (timeSec: number) => {
    const clamped = Math.max(0, Math.min(safeDuration, Number(timeSec.toFixed(2))));
    setCaptureTime(clamped);
    setIsCapturing(true);
    setErrorMsg(null);
    try {
      const dataUrl = await onCaptureFrame(activeRatio, clamped);
      if (dataUrl) {
        onSetThumbnail(activeRatio, {
          dataUrl,
          source: 'frame',
          timestamp: clamped,
        });
      } else {
        setErrorMsg('Could not capture frame from canvas.');
      }
    } catch {
      setErrorMsg('Failed to capture video frame.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleUploadCustomImage = (file: File) => {
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        setErrorMsg('Could not read uploaded image.');
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = dims.width;
        canvas.height = dims.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          onSetThumbnail(activeRatio, {
            dataUrl: rawUrl,
            source: 'upload',
            fileName: file.name,
          });
          return;
        }
        ctx.fillStyle = '#090B0F';
        ctx.fillRect(0, 0, dims.width, dims.height);

        const imgAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
        const targetAspect = dims.width / dims.height;
        let dw = dims.width;
        let dh = dims.height;
        let dx = 0;
        let dy = 0;

        if (uploadFitMode === 'cover') {
          if (imgAspect > targetAspect) {
            dh = dims.height;
            dw = dh * imgAspect;
            dx = (dims.width - dw) / 2;
          } else {
            dw = dims.width;
            dh = dw / imgAspect;
            dy = (dims.height - dh) / 2;
          }
        } else {
          if (imgAspect > targetAspect) {
            dw = dims.width;
            dh = dw / imgAspect;
            dy = (dims.height - dh) / 2;
          } else {
            dh = dims.height;
            dw = dh * imgAspect;
            dx = (dims.width - dw) / 2;
          }
        }
        ctx.drawImage(img, dx, dy, dw, dh);
        const normalizedUrl = canvas.toDataURL('image/png');
        onSetThumbnail(activeRatio, {
          dataUrl: normalizedUrl,
          source: 'upload',
          fileName: file.name,
        });
      };
      img.onerror = () => {
        setErrorMsg('Unsupported image format.');
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadThumbnail = () => {
    if (!activeThumb) return;
    const base = sanitizeProjectFilename(projectName, 'lyrcut-video');
    const tag = activeRatio === '16:9' ? '16x9-landscape' : '9x16-portrait';
    const a = document.createElement('a');
    a.href = activeThumb.dataUrl;
    a.download = `${base}-thumbnail-${tag}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const quickStops = [
    { label: 'Start', t: 0 },
    { label: '25%', t: safeDuration * 0.25 },
    { label: '50%', t: safeDuration * 0.5 },
    { label: '75%', t: safeDuration * 0.75 },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="thumbnail-modal-title"
      data-testid="thumbnail-picker-modal"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-2xl rounded-xl bg-[#12151C] border border-white/12 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <h2 id="thumbnail-modal-title" className="text-sm font-semibold text-zinc-100">
              Video Thumbnail Studio (Landscape & Portrait)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close thumbnail picker"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Dual-Ratio Slot Switcher (16:9 Landscape & 9:16 Portrait) */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  ratio: '16:9' as AspectRatio,
                  title: 'Landscape Thumbnail (16:9)',
                  sub: '1920×1080 · YouTube / Widescreen',
                  Icon: Monitor,
                },
                {
                  ratio: '9:16' as AspectRatio,
                  title: 'Portrait Thumbnail (9:16)',
                  sub: '1080×1920 · Shorts / Reels / TikTok',
                  Icon: Smartphone,
                },
              ] as const
            ).map(({ ratio, title, sub, Icon }) => {
              const selected = activeRatio === ratio;
              const hasAsset = Boolean(thumbnails[ratio]);
              return (
                <button
                  key={ratio}
                  type="button"
                  data-testid={`thumbnail-tab-${ratio === '16:9' ? 'landscape' : 'portrait'}`}
                  onClick={() => setActiveRatio(ratio)}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                    selected
                      ? 'bg-amber-500/15 border-amber-500/55 text-zinc-100'
                      : 'bg-[#0B0D11] border-white/8 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        selected ? 'text-amber-400' : 'text-zinc-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <span className="block text-xs font-semibold truncate">{title}</span>
                      <span className="block text-[10px] text-zinc-400 truncate">{sub}</span>
                    </div>
                  </div>
                  {hasAsset && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 text-[9px] font-semibold">
                      <Check className="w-2.5 h-2.5" aria-hidden="true" />
                      Set
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Preview + Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Live Aspect-Accurate Preview */}
            <div className="rounded-lg bg-[#080A0E] border border-white/10 p-3 flex flex-col items-center justify-center min-h-[220px]">
              <div
                data-testid="thumbnail-preview-box"
                className="relative rounded-md overflow-hidden border border-white/15 bg-[#0E1117] flex items-center justify-center shadow-lg"
                style={
                  activeRatio === '16:9'
                    ? { width: '100%', aspectRatio: '16 / 9' }
                    : { height: '250px', aspectRatio: '9 / 16' }
                }
              >
                {activeThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeThumb.dataUrl}
                    alt={`${dims.label} thumbnail preview`}
                    data-testid="thumbnail-preview-img"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center px-3 space-y-1.5">
                    <Camera className="w-6 h-6 text-zinc-600 mx-auto" aria-hidden="true" />
                    <p className="text-[11px] text-zinc-400 font-medium">
                      No {activeRatio} thumbnail yet
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Capture any frame from your video or upload a custom image
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-2 w-full flex items-center justify-between text-[10px] text-zinc-400">
                <span className="font-mono">{dims.label}</span>
                {activeThumb && (
                  <span className="text-emerald-300 truncate max-w-[150px]">
                    {activeThumb.source === 'frame'
                      ? `Frame @ ${formatTimecode(activeThumb.timestamp ?? 0).slice(0, 8)}`
                      : activeThumb.fileName || 'Custom Upload'}
                  </span>
                )}
              </div>
            </div>

            {/* Right Controls: Capture from Any Frame + Custom Upload */}
            <div className="space-y-3">
              {/* Section 1: Capture from any part of the video */}
              <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/8 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100">
                    Capture From Video
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-amber-300">
                    {formatTimecode(captureTime)}
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={safeDuration}
                  step={0.1}
                  aria-label="Select video timestamp for thumbnail capture"
                  data-testid="thumbnail-time-slider"
                  value={Math.min(safeDuration, captureTime)}
                  onChange={(e) => setCaptureTime(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />

                <div className="grid grid-cols-4 gap-1">
                  {quickStops.map((stop) => (
                    <button
                      key={stop.label}
                      type="button"
                      disabled={isCapturing}
                      onClick={() => handleCaptureAt(stop.t)}
                      className="py-1 text-[10px] font-mono bg-[#161A22] hover:bg-[#222834] text-zinc-300 rounded border border-white/8 cursor-pointer disabled:opacity-50"
                    >
                      {stop.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={isCapturing}
                    data-testid="capture-thumbnail-btn"
                    onClick={() => handleCaptureAt(captureTime)}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-md cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isCapturing ? 'Capturing...' : 'Capture Frame'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isCapturing}
                    data-testid="capture-playhead-thumbnail-btn"
                    onClick={() => handleCaptureAt(currentTime)}
                    className="inline-flex items-center justify-center gap-1 px-2.5 py-2 text-[11px] font-medium bg-[#191D26] hover:bg-[#232936] text-zinc-200 border border-white/10 rounded-md cursor-pointer disabled:opacity-50"
                  >
                    <span>Use Playhead</span>
                  </button>
                </div>
              </div>

              {/* Section 2: Upload Custom Thumbnail Image */}
              <div className="p-3 rounded-lg bg-[#0B0D11] border border-white/8 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-100">
                    Upload Custom Thumbnail
                  </span>
                  <div className="inline-flex items-center gap-0.5 p-0.5 rounded bg-[#161A22] border border-white/8 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setUploadFitMode('cover')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        uploadFitMode === 'cover'
                          ? 'bg-amber-500/25 text-amber-300 font-semibold'
                          : 'text-zinc-400'
                      }`}
                    >
                      Fill
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadFitMode('contain')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        uploadFitMode === 'contain'
                          ? 'bg-amber-500/25 text-amber-300 font-semibold'
                          : 'text-zinc-400'
                      }`}
                    >
                      Fit
                    </button>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  data-testid="upload-thumbnail-input"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      handleUploadCustomImage(f);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-[#191D26] hover:bg-[#232936] text-zinc-100 border border-white/12 rounded-md cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>Choose Image for {activeRatio}</span>
                </button>
              </div>

              {errorMsg && (
                <p className="text-xs text-rose-400" role="alert">
                  {errorMsg}
                </p>
              )}

              {/* Actions Row */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!activeThumb}
                  onClick={handleDownloadThumbnail}
                  data-testid="download-thumbnail-btn"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-500/18 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/35 rounded-md disabled:opacity-40 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download .PNG</span>
                </button>
                <button
                  type="button"
                  disabled={!activeThumb}
                  onClick={() => onSetThumbnail(activeRatio, null)}
                  aria-label={`Clear ${activeRatio} thumbnail`}
                  className="p-2 text-zinc-400 hover:text-rose-400 bg-[#191D26] border border-white/10 rounded-md disabled:opacity-35 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-md cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
