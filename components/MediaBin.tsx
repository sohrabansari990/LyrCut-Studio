'use client';

import React, { useRef, useState } from 'react';
import {
  Film,
  Image as ImageIcon,
  Music,
  Upload,
  Trash2,
  Check,
  Maximize2,
  Minimize2,
  Square,
} from 'lucide-react';
import { MediaFitMode, formatTimecode } from '@/lib/lyrics-parser';

export type MediaKind = 'video' | 'image' | 'audio';

export interface UploadedMediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  duration?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  isSample?: boolean;
}

interface MediaBinProps {
  items: UploadedMediaItem[];
  activeVisualId: string | null;
  activeAudioId: string | null;
  mediaFit: MediaFitMode;
  onUploadFiles: (files: FileList) => void;
  onSelectVisual: (id: string) => void;
  onSelectAudio: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onChangeMediaFit: (mode: MediaFitMode) => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Sample';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaBin({
  items,
  activeVisualId,
  activeAudioId,
  mediaFit,
  onUploadFiles,
  onSelectVisual,
  onSelectAudio,
  onRemoveItem,
  onChangeMediaFit,
}: MediaBinProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(e.dataTransfer.files);
    }
  };

  return (
    <aside
      aria-label="Uploaded Media Bin"
      className="flex flex-col h-full bg-[#12151C] border-r border-white/8 overflow-hidden"
    >
      <div className="px-4 py-3.5 border-b border-white/8 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Uploaded Items</h2>
          <p className="text-xs text-zinc-400">
            {items.length} {items.length === 1 ? 'asset' : 'assets'} in bin
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500 text-zinc-950 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Upload Media</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,image/*,audio/*"
          aria-label="Upload video, image, or audio files"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUploadFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {/* Drag and drop zone */}
      <div className="p-3 border-b border-white/8">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-white/15 bg-[#0E1117]'
          }`}
        >
          <p className="text-xs text-zinc-300 font-medium">
            Drop videos, images, or songs here
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            MP4, MOV, WebM, PNG, JPG, MP3, WAV · Local 1080p fidelity
          </p>
        </div>
      </div>

      {/* Frame Fit controls for Landscape <-> Portrait adaptation */}
      <div className="px-4 py-3 border-b border-white/8">
        <span className="block text-xs font-medium text-zinc-400 mb-2">
          Frame Adaptation
        </span>
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/8">
          <button
            type="button"
            onClick={() => onChangeMediaFit('cover')}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              mediaFit === 'cover'
                ? 'bg-[#1D222D] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Maximize2 className="w-3 h-3" aria-hidden="true" />
            <span>Fill</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeMediaFit('contain-blur')}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              mediaFit === 'contain-blur'
                ? 'bg-[#1D222D] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Minimize2 className="w-3 h-3" aria-hidden="true" />
            <span>Fit Blur</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeMediaFit('contain-black')}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              mediaFit === 'contain-black'
                ? 'bg-[#1D222D] text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Square className="w-3 h-3" aria-hidden="true" />
            <span>Bars</span>
          </button>
        </div>
      </div>

      {/* Uploaded items list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" data-testid="media-bin-list">
        {items.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <p className="text-sm font-medium text-zinc-300">No media uploaded yet</p>
            <p className="text-xs text-zinc-500 mt-1">
              Upload your Filmora video clip, background image, or song audio to begin.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const isVisual = item.id === activeVisualId;
            const isAudio = item.id === activeAudioId;
            const canVisual = item.kind === 'video' || item.kind === 'image';
            const canAudio = item.kind === 'audio' || item.kind === 'video';

            return (
              <div
                key={item.id}
                className={`group rounded-lg border p-2.5 transition-colors ${
                  isVisual || isAudio
                    ? 'bg-[#191E28] border-amber-500/40'
                    : 'bg-[#0E1117] border-white/8 hover:border-white/15'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Thumbnail */}
                  <div className="w-14 h-10 rounded bg-zinc-900 border border-white/8 overflow-hidden shrink-0 flex items-center justify-center">
                    {item.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : item.kind === 'video' ? (
                      <video
                        src={item.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music className="w-4 h-4 text-amber-400" aria-hidden="true" />
                    )}
                  </div>

                  {/* Metadata (clean unboxed text with middot separators) */}
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-medium text-zinc-100 truncate"
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {item.kind === 'video' && (
                          <Film className="w-3 h-3 text-zinc-400" aria-hidden="true" />
                        )}
                        {item.kind === 'image' && (
                          <ImageIcon className="w-3 h-3 text-zinc-400" aria-hidden="true" />
                        )}
                        {item.kind === 'audio' && (
                          <Music className="w-3 h-3 text-zinc-400" aria-hidden="true" />
                        )}
                        <span className="capitalize">{item.kind}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {item.duration
                          ? formatTimecode(item.duration)
                          : item.width && item.height
                          ? `${item.width}×${item.height}`
                          : formatFileSize(item.sizeBytes)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                {/* Role assignment actions */}
                <div className="flex items-center gap-1.5 mt-2.5">
                  {canVisual && (
                    <button
                      type="button"
                      onClick={() => onSelectVisual(item.id)}
                      className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                        isVisual
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-[#161A22] text-zinc-300 hover:bg-[#1E2430] border border-white/8'
                      }`}
                    >
                      {isVisual && <Check className="w-3 h-3" aria-hidden="true" />}
                      <span>{isVisual ? 'Active Visual' : 'Use as Visual'}</span>
                    </button>
                  )}
                  {canAudio && (
                    <button
                      type="button"
                      onClick={() => onSelectAudio(item.id)}
                      className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                        isAudio
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-[#161A22] text-zinc-300 hover:bg-[#1E2430] border border-white/8'
                      }`}
                    >
                      {isAudio && <Check className="w-3 h-3" aria-hidden="true" />}
                      <span>{isAudio ? 'Active Audio' : 'Use Audio'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
