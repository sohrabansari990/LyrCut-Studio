'use client';

import React, { useRef, useState } from 'react';
import {
  Film,
  Image as ImageIcon,
  Music,
  Upload,
  UploadCloud,
  Trash2,
  Check,
  Maximize2,
  Minimize2,
  Square,
  PanelLeftClose,
  FolderOpen,
  Plus,
  Layers,
  ArrowUpFromLine,
} from 'lucide-react';
import { MediaFitMode, formatTimecode } from '@/lib/lyrics-parser';
import { IconTooltip } from './TooltipButton';

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
  onAddVisualToTimeline?: (id: string) => void;
  onAddVisualToUpperTrack?: (id: string) => void;
  onAddAudioToTimeline?: (id: string) => void;
  onAddAudioToNewTrack?: (id: string) => void;
  onAddImageAsOverlay?: (item: UploadedMediaItem) => void;
  onRemoveItem: (id: string) => void;
  onChangeMediaFit: (mode: MediaFitMode) => void;
  onCollapse?: () => void;
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
  onAddVisualToTimeline,
  onAddVisualToUpperTrack,
  onAddAudioToTimeline,
  onAddAudioToNewTrack,
  onAddImageAsOverlay,
  onRemoveItem,
  onChangeMediaFit,
  onCollapse,
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
      data-testid="media-bin-panel"
      className="flex flex-col h-full bg-[#12151C] border-r border-white/8 overflow-hidden select-none"
    >
      {/* Compact Icon-First Header */}
      <div className="px-3 py-2.5 border-b border-white/8 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-zinc-100 truncate">Media</span>
          <span className="text-[11px] font-mono tabular-nums text-zinc-500">
            · {items.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <IconTooltip tip="Upload videos, images, or songs" position="bottom" align="right">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload Media"
              className="p-1.5 bg-amber-500 text-zinc-950 rounded-md hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>

          {onCollapse && (
            <IconTooltip tip="Minimize media panel" position="bottom" align="right">
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Minimize Media Panel"
                className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/8 rounded-md transition-colors cursor-pointer"
              >
                <PanelLeftClose className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </IconTooltip>
          )}
        </div>

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

      {/* Compact Drag and Drop Zone */}
      <div className="p-2.5 border-b border-white/8">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          aria-label="Drop or click to upload videos, images, or songs"
          className={`w-full rounded-lg border border-dashed px-2.5 py-3 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10 text-amber-200'
              : 'border-white/15 bg-[#0E1117] hover:border-amber-500/40 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <UploadCloud className="w-4 h-4 text-amber-400/90" aria-hidden="true" />
          <span className="text-[11px] font-medium">Drop or click to add media</span>
          <span className="text-[10px] text-zinc-500">MP4 · PNG · JPG · MP3 · WAV</span>
        </button>
      </div>

      {/* Icon-Only Frame Adaptation Controls */}
      <div className="px-2.5 py-2 border-b border-white/8 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Fit
        </span>
        <div className="flex-1 grid grid-cols-3 gap-1 p-0.5 bg-[#0B0D11] rounded-md border border-white/8">
          <IconTooltip tip="Fill entire frame (crop edges)" position="bottom" align="left">
            <button
              type="button"
              onClick={() => onChangeMediaFit('cover')}
              aria-label="Fill frame"
              aria-pressed={mediaFit === 'cover'}
              className={`w-full flex items-center justify-center py-1.5 rounded transition-colors cursor-pointer ${
                mediaFit === 'cover'
                  ? 'bg-[#1D222D] text-amber-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>
          <IconTooltip tip="Fit inside blurred backdrop" position="bottom">
            <button
              type="button"
              onClick={() => onChangeMediaFit('contain-blur')}
              aria-label="Fit with blurred backdrop"
              aria-pressed={mediaFit === 'contain-blur'}
              className={`w-full flex items-center justify-center py-1.5 rounded transition-colors cursor-pointer ${
                mediaFit === 'contain-blur'
                  ? 'bg-[#1D222D] text-amber-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>
          <IconTooltip tip="Fit with black bars" position="bottom" align="right">
            <button
              type="button"
              onClick={() => onChangeMediaFit('contain-black')}
              aria-label="Fit with black bars"
              aria-pressed={mediaFit === 'contain-black'}
              className={`w-full flex items-center justify-center py-1.5 rounded transition-colors cursor-pointer ${
                mediaFit === 'contain-black'
                  ? 'bg-[#1D222D] text-amber-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Square className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </IconTooltip>
        </div>
      </div>

      {/* Uploaded items list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2" data-testid="media-bin-list">
        {items.length === 0 ? (
          <div className="py-10 px-3 text-center">
            <p className="text-xs font-medium text-zinc-300">No media yet</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              Upload a background video, photo, or song.
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
                className={`group rounded-lg border p-2 transition-colors ${
                  isVisual || isAudio
                    ? 'bg-[#191E28] border-amber-500/40'
                    : 'bg-[#0E1117] border-white/8 hover:border-white/15'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Thumbnail */}
                  <div className="w-12 h-9 rounded bg-zinc-900 border border-white/8 overflow-hidden shrink-0 flex items-center justify-center">
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

                  {/* Metadata */}
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[11px] font-medium text-zinc-100 truncate"
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-0.5 tabular-nums">
                      {item.kind === 'video' && (
                        <Film className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden="true" />
                      )}
                      {item.kind === 'image' && (
                        <ImageIcon className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden="true" />
                      )}
                      {item.kind === 'audio' && (
                        <Music className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {item.duration
                          ? formatTimecode(item.duration)
                          : item.width && item.height
                          ? `${item.width}×${item.height}`
                          : formatFileSize(item.sizeBytes)}
                      </span>
                    </div>
                  </div>

                  <IconTooltip tip={`Remove ${item.name}`} position="top" align="right">
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Remove ${item.name}`}
                      className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </IconTooltip>
                </div>

                {/* Compact Icon-First Role Actions */}
                <div className="flex items-center gap-1 mt-2">
                  {canVisual && (
                    <IconTooltip
                      tip={isVisual ? 'Active background visual' : 'Set as background visual'}
                      position="top"
                      align="left"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectVisual(item.id)}
                        aria-label={isVisual ? 'Active Visual' : `Use ${item.name} as Visual`}
                        aria-pressed={isVisual}
                        className={`flex-1 w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                          isVisual
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-[#161A22] text-zinc-300 hover:bg-[#1E2430] border border-white/8'
                        }`}
                      >
                        {isVisual ? (
                          <Check className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Film className="w-3 h-3" aria-hidden="true" />
                        )}
                        <span>{isVisual ? 'Active' : 'Visual'}</span>
                      </button>
                    </IconTooltip>
                  )}
                  {canVisual && onAddVisualToTimeline && (
                    <IconTooltip
                      tip={`Append ${item.name} to V1 Visual Timeline`}
                      position="top"
                      align="center"
                    >
                      <button
                        type="button"
                        onClick={() => onAddVisualToTimeline(item.id)}
                        aria-label={`Add ${item.name} to Visual Timeline`}
                        className="inline-flex items-center justify-center gap-0.5 px-1.5 py-1 text-[10px] font-medium rounded bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </IconTooltip>
                  )}
                  {canVisual && onAddVisualToUpperTrack && (
                    <IconTooltip
                      tip={`Stack ${item.name} on top on a new upper Video/Image track (V2, V3...)`}
                      position="top"
                      align="center"
                    >
                      <button
                        type="button"
                        onClick={() => onAddVisualToUpperTrack(item.id)}
                        aria-label={`Stack ${item.name} on upper Video track`}
                        data-testid={`stack-visual-${item.id}`}
                        className="inline-flex items-center justify-center gap-0.5 px-1.5 py-1 text-[10px] font-medium rounded bg-purple-500/20 hover:bg-purple-500/35 text-purple-200 border border-purple-400/35 transition-colors cursor-pointer shrink-0"
                      >
                        <ArrowUpFromLine className="w-3 h-3" aria-hidden="true" />
                        <span className="hidden xl:inline">Stack</span>
                      </button>
                    </IconTooltip>
                  )}
                  {item.kind === 'image' && onAddImageAsOverlay && (
                    <IconTooltip
                      tip={`Add ${item.name} as movable & keyframe-animated overlay`}
                      position="top"
                      align="right"
                    >
                      <button
                        type="button"
                        onClick={() => onAddImageAsOverlay(item)}
                        aria-label={`Add ${item.name} as animated overlay`}
                        className="inline-flex items-center justify-center p-1 text-[10px] font-medium rounded bg-[#161A22] hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 border border-white/10 transition-colors cursor-pointer shrink-0"
                      >
                        <Layers className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </IconTooltip>
                  )}
                  {canAudio && (
                    <IconTooltip
                      tip={isAudio ? 'Active song audio track' : 'Set as primary song audio (A1)'}
                      position="top"
                      align="right"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectAudio(item.id)}
                        aria-label={isAudio ? 'Active Audio' : `Use ${item.name} as Audio`}
                        aria-pressed={isAudio}
                        className={`flex-1 w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                          isAudio
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-[#161A22] text-zinc-300 hover:bg-[#1E2430] border border-white/8'
                        }`}
                      >
                        {isAudio ? (
                          <Check className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <Music className="w-3 h-3" aria-hidden="true" />
                        )}
                        <span>{isAudio ? 'Active' : 'Audio'}</span>
                      </button>
                    </IconTooltip>
                  )}
                  {canAudio && onAddAudioToTimeline && (
                    <IconTooltip
                      tip={`Append ${item.name} to Audio Track A1`}
                      position="top"
                      align="right"
                    >
                      <button
                        type="button"
                        onClick={() => onAddAudioToTimeline(item.id)}
                        aria-label={`Add ${item.name} to Audio Timeline`}
                        className="inline-flex items-center justify-center p-1 text-[10px] font-medium rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </IconTooltip>
                  )}
                  {canAudio && onAddAudioToNewTrack && (
                    <IconTooltip
                      tip={`Stack ${item.name} on a new Audio track (A2, A3...) to play simultaneously`}
                      position="top"
                      align="right"
                    >
                      <button
                        type="button"
                        onClick={() => onAddAudioToNewTrack(item.id)}
                        aria-label={`Stack ${item.name} on new Audio track`}
                        data-testid={`stack-audio-${item.id}`}
                        className="inline-flex items-center justify-center gap-0.5 px-1.5 py-1 text-[10px] font-medium rounded bg-teal-500/20 hover:bg-teal-500/35 text-teal-200 border border-teal-400/35 transition-colors cursor-pointer shrink-0"
                      >
                        <ArrowUpFromLine className="w-3 h-3" aria-hidden="true" />
                        <span className="hidden xl:inline">Mix</span>
                      </button>
                    </IconTooltip>
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
