'use client';

import React, { useState } from 'react';
import {
  Clapperboard,
  Film,
  Layers,
  Monitor,
  Music2,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { AspectRatio } from '@/lib/lyrics-parser';

export interface NewProjectSettings {
  name: string;
  ratio: AspectRatio;
  lyricMode: 'scrolling' | 'classic';
  starterContent: 'demo' | 'blank';
}

interface ProjectSetupModalProps {
  isOpen: boolean;
  canDismiss: boolean;
  initialName: string;
  initialRatio: AspectRatio;
  onCreateProject: (settings: NewProjectSettings) => void;
  onClose: () => void;
}

export default function ProjectSetupModal({
  isOpen,
  canDismiss,
  initialName,
  initialRatio,
  onCreateProject,
  onClose,
}: ProjectSetupModalProps) {
  const [name, setName] = useState(initialName || 'Untitled Lyric Video');
  const [ratio, setRatio] = useState<AspectRatio>(initialRatio);
  const [lyricMode, setLyricMode] = useState<'scrolling' | 'classic'>('scrolling');
  const [starterContent, setStarterContent] = useState<'demo' | 'blank'>('demo');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateProject({
      name: name.trim() || 'Untitled Lyric Video',
      ratio,
      lyricMode,
      starterContent,
    });
  };

  return (
    <div
      data-testid="project-setup-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-setup-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#12151C] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-[#0E1117]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Clapperboard className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="project-setup-heading"
                className="text-sm font-semibold text-zinc-100 tracking-tight"
              >
                Create New Project
              </h2>
              <p className="text-[11px] text-zinc-400">
                Choose your canvas aspect ratio, workspace layout, and lyric style
              </p>
            </div>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close new project dialog"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Aspect Ratio Picker — Portrait vs Landscape with live workspace preview diagrams */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Aspect Ratio &amp; Studio Workspace
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 16:9 Landscape */}
              <button
                type="button"
                data-testid="setup-ratio-16-9"
                aria-pressed={ratio === '16:9'}
                onClick={() => setRatio('16:9')}
                className={`group flex flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
                  ratio === '16:9'
                    ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]'
                    : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor
                      className={`h-4 w-4 ${
                        ratio === '16:9' ? 'text-amber-400' : 'text-zinc-400'
                      }`}
                    />
                    <span className="text-sm font-semibold text-zinc-100">
                      Landscape · 16:9
                    </span>
                  </div>
                  <span className="rounded bg-zinc-800/90 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                    1920×1080
                  </span>
                </div>

                {/* Mini Studio Layout Schematic: Classic 3-Column */}
                <div className="h-20 w-full rounded-lg border border-zinc-800 bg-[#090B0F] p-1.5 flex gap-1.5">
                  <div className="w-1/5 rounded bg-zinc-800/80 border border-zinc-700/60" />
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex-1 rounded bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-[9px] font-medium text-amber-300">
                      Player
                    </div>
                    <div className="h-5 rounded bg-zinc-800/90 border border-zinc-700/60 flex items-center justify-center text-[8px] text-zinc-400">
                      Timeline
                    </div>
                  </div>
                  <div className="w-1/4 rounded bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-[8px] text-zinc-400">
                    Style / FX
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400 leading-snug">
                  YouTube &amp; widescreen music videos. Classic center player with right inspector.
                </p>
              </button>

              {/* 9:16 Portrait */}
              <button
                type="button"
                data-testid="setup-ratio-9-16"
                aria-pressed={ratio === '9:16'}
                onClick={() => setRatio('9:16')}
                className={`group flex flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
                  ratio === '9:16'
                    ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]'
                    : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone
                      className={`h-4 w-4 ${
                        ratio === '9:16' ? 'text-amber-400' : 'text-zinc-400'
                      }`}
                    />
                    <span className="text-sm font-semibold text-zinc-100">
                      Portrait · 9:16
                    </span>
                  </div>
                  <span className="rounded bg-zinc-800/90 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                    1080×1920
                  </span>
                </div>

                {/* Mini Studio Layout Schematic: Full-Height Left Player + Right Inspector & Timeline */}
                <div className="h-20 w-full rounded-lg border border-zinc-800 bg-[#090B0F] p-1.5 flex gap-1.5">
                  <div className="w-[30%] h-full rounded bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-[9px] font-medium text-amber-300 text-center leading-tight">
                    Full
                    <br />
                    Player
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex-1 flex gap-1">
                      <div className="w-1/4 rounded bg-zinc-800/80 border border-zinc-700/60" />
                      <div className="flex-1 rounded bg-sky-500/15 border border-sky-500/35 flex items-center justify-center text-[8px] text-sky-300">
                        Lyrics · Style · FX
                      </div>
                    </div>
                    <div className="h-6 rounded bg-zinc-800/90 border border-zinc-700/60 flex items-center justify-center text-[8px] text-zinc-400">
                      Timeline
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400 leading-snug">
                  Reels, TikTok &amp; Shorts. Full-height portrait player on the left while editing.
                </p>
              </button>
            </div>
          </div>

          {/* Project Title + Lyric Style + Starter Content */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="new-project-name"
                className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
              >
                Project Name
              </label>
              <input
                id="new-project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Farsi & English Lyric Video"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Lyric Presentation
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setLyricMode('scrolling')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors ${
                    lyricMode === 'scrolling'
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                      : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Scrolling</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLyricMode('classic')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors ${
                    lyricMode === 'classic'
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                      : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Single Line</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Starter Media
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setStarterContent('demo')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors ${
                    starterContent === 'demo'
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                      : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Music2 className="h-3.5 w-3.5" />
                  <span>Demo Song</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStarterContent('blank')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors ${
                    starterContent === 'blank'
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                      : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Film className="h-3.5 w-3.5" />
                  <span>Blank Canvas</span>
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800/80">
            {canDismiss && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              data-testid="setup-create-btn"
              className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
            >
              Start Editing ({ratio})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
