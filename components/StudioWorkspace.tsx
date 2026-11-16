'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import stageLandscapeImg from '@/src/assets/images/music_studio_stage_landscape_1794862911026.jpg';
import nightPortraitImg from '@/src/assets/images/acoustic_night_portrait_1794862911151.jpg';
import {
  AspectRatio,
  EnabledTracks,
  LyricCue,
  LyricStyleConfig,
  MediaFitMode,
  PlainImportMode,
  createSampleCues,
  detectScriptDirection,
  isSrtContent,
  parsePlainLyrics,
  shiftAllCues,
  stampCueSync,
  updateCueTiming,
} from '@/lib/lyrics-parser';
import { getResolutionForRatio, renderFrameToCanvas } from '@/lib/canvas-renderer';
import {
  createDemoTrackWavUrl,
  decodeAudioTo16kHzMono,
  extractWaveformPeaks,
} from '@/lib/audio-engine';
import {
  VocalRegion,
  WhisperChunk,
  alignCuesToVocalRegions,
  alignCuesWithAudioAndWhisper,
  analyzeAudioBuffer,
  whisperChunksToCues,
} from '@/lib/vocal-aligner';
import MediaBin, { MediaKind, UploadedMediaItem } from './MediaBin';
import PreviewStage from './PreviewStage';
import LyricsInspector, { WhisperLanguage, WhisperModelSize } from './LyricsInspector';
import ExportModal from './ExportModal';

const INITIAL_STYLE: LyricStyleConfig = {
  position: 'bottom',
  verticalOffsetPct: 0,
  fontScale: 1,
  alignment: 'center',
  backdrop: 'scrim',
  primaryColor: '#FFFFFF',
  secondaryColor: '#FCD34D',
  showSafeZones: false,
};

export default function StudioWorkspace() {
  const [ratio, setRatio] = useState<AspectRatio>('16:9');
  const [mediaFit, setMediaFit] = useState<MediaFitMode>('cover');
  const [items, setItems] = useState<UploadedMediaItem[]>(() => [
    {
      id: 'sample-stage-16-9',
      name: 'Stage Haze Backdrop (16:9)',
      kind: 'image',
      url: stageLandscapeImg.src,
      width: stageLandscapeImg.width,
      height: stageLandscapeImg.height,
      isSample: true,
    },
    {
      id: 'sample-rain-9-16',
      name: 'Night Street Portrait (9:16)',
      kind: 'image',
      url: nightPortraitImg.src,
      width: nightPortraitImg.width,
      height: nightPortraitImg.height,
      isSample: true,
    },
  ]);
  const [activeVisualId, setActiveVisualId] = useState<string | null>('sample-stage-16-9');
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);

  const [duration, setDuration] = useState<number>(24);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);

  const [cues, setCues] = useState<LyricCue[]>(() => createSampleCues(24));
  const [enabledTracks, setEnabledTracks] = useState<EnabledTracks>({
    primary: true,
    roman: true,
    english: true,
  });
  const [style, setStyle] = useState<LyricStyleConfig>(INITIAL_STYLE);
  const [syncTargetIndex, setSyncTargetIndex] = useState<number>(0);

  const [inspectorTab, setInspectorTab] = useState<'lyrics' | 'style'>('lyrics');
  const [mobilePanel, setMobilePanel] = useState<'preview' | 'media' | 'lyrics' | 'style'>('preview');
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribeStatus, setTranscribeStatus] = useState<string | null>(null);
  const [transcribeNotice, setTranscribeNotice] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenAudioRef = useRef<HTMLAudioElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const whisperWorkerRef = useRef<Worker | null>(null);
  const cancelActiveWhisperRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cancelActiveWhisperRef.current?.();
      whisperWorkerRef.current?.terminate();
      whisperWorkerRef.current = null;
    };
  }, []);

  // Refs synced for 60fps loop without tearing down RAF
  const isPlayingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const ratioRef = useRef(ratio);
  const mediaFitRef = useRef(mediaFit);
  const cuesRef = useRef(cues);
  const enabledTracksRef = useRef(enabledTracks);
  const styleRef = useRef(style);
  const activeVisualKindRef = useRef<MediaKind | null>('image');

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);
  useEffect(() => {
    mediaFitRef.current = mediaFit;
  }, [mediaFit]);
  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);
  useEffect(() => {
    enabledTracksRef.current = enabledTracks;
  }, [enabledTracks]);
  useEffect(() => {
    styleRef.current = style;
  }, [style]);

  const activeVisualItem = useMemo(
    () => items.find((i) => i.id === activeVisualId) ?? null,
    [items, activeVisualId]
  );
  const activeAudioItem = useMemo(
    () => items.find((i) => i.id === activeAudioId) ?? null,
    [items, activeAudioId]
  );

  useEffect(() => {
    activeVisualKindRef.current = activeVisualItem?.kind ?? null;
  }, [activeVisualItem]);

  // Create built-in demo backing track on mount so Tap-to-Sync & Waveform work immediately
  useEffect(() => {
    let revoked = false;
    const demoUrl = createDemoTrackWavUrl(24);
    const demoId = 'sample-ambient-track';
    queueMicrotask(() => {
      if (revoked) return;
      setItems((prev) => {
        if (prev.some((i) => i.id === demoId)) return prev;
        return [
          ...prev,
          {
            id: demoId,
            name: 'Demo Song Track (24s)',
            kind: 'audio',
            url: demoUrl,
            duration: 24,
            isSample: true,
          },
        ];
      });
      setActiveAudioId((prev) => prev ?? demoId);
    });

    return () => {
      revoked = true;
      URL.revokeObjectURL(demoUrl);
    };
  }, []);

  // Draw current frame helper
  const drawCanvasFrame = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const res = getResolutionForRatio(ratioRef.current);
    // Keep preview canvas sharp (max 1280px preview dimension for responsive speed, native 1080p during export)
    const previewScale = 0.6667;
    const targetW = Math.round(res.width * previewScale);
    const targetH = Math.round(res.height * previewScale);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mediaSource =
      activeVisualKindRef.current === 'video'
        ? hiddenVideoRef.current
        : activeVisualKindRef.current === 'image'
        ? loadedImageRef.current
        : null;

    const computedStyle =
      typeof window !== 'undefined'
        ? window.getComputedStyle(document.body)
        : null;
    const latinFont =
      computedStyle?.fontFamily || '"Plus Jakarta Sans", system-ui, sans-serif';
    const farsiVar =
      typeof window !== 'undefined'
        ? window
            .getComputedStyle(document.documentElement)
            .getPropertyValue('--font-farsi')
            .trim()
        : '';
    const farsiFont = farsiVar
      ? `${farsiVar}, ${latinFont}`
      : `"Vazirmatn", ${latinFont}`;

    renderFrameToCanvas({
      ctx,
      width: targetW,
      height: targetH,
      ratio: ratioRef.current,
      mediaSource,
      mediaFit: mediaFitRef.current,
      cues: cuesRef.current,
      currentTime: t,
      enabledTracks: enabledTracksRef.current,
      style: styleRef.current,
      farsiFontFamily: farsiFont,
      latinFontFamily: latinFont,
      drawSafeZones: styleRef.current.showSafeZones,
      disableFade: !isPlayingRef.current,
    });
  }, []);

  // Load visual asset whenever activeVisualItem changes
  useEffect(() => {
    if (!activeVisualItem) {
      loadedImageRef.current = null;
      drawCanvasFrame(currentTimeRef.current);
      return;
    }

    if (activeVisualItem.kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        loadedImageRef.current = img;
        drawCanvasFrame(currentTimeRef.current);
      };
      img.src = activeVisualItem.url;
    } else if (activeVisualItem.kind === 'video') {
      loadedImageRef.current = null;
      const vid = hiddenVideoRef.current;
      if (vid) {
        vid.src = activeVisualItem.url;
        vid.load();
      }
    }
  }, [activeVisualItem, drawCanvasFrame]);

  // Extract waveform & sync audio source whenever activeAudioItem changes
  useEffect(() => {
    let cancelled = false;
    const audioEl = hiddenAudioRef.current;

    if (!activeAudioItem) {
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
      }
      queueMicrotask(() => {
        if (!cancelled) setWaveformPeaks([]);
      });
      return () => {
        cancelled = true;
      };
    }

    if (audioEl && activeAudioItem.id !== activeVisualItem?.id) {
      audioEl.src = activeAudioItem.url;
      audioEl.load();
    }

    extractWaveformPeaks(activeAudioItem.url, 96).then((res) => {
      if (cancelled || !res) return;
      setWaveformPeaks(res.peaks);
      if (res.duration > 1) {
        setDuration(Number(res.duration.toFixed(2)));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeAudioItem, activeVisualItem?.id]);

  // Re-draw canvas whenever non-playback visual props change while paused
  useEffect(() => {
    drawCanvasFrame(currentTime);
  }, [ratio, mediaFit, cues, enabledTracks, style, currentTime, drawCanvasFrame]);

  // Main animation & time-sync loop
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;

      if (isPlayingRef.current) {
        let nextTime = currentTimeRef.current + dt;
        const vid = hiddenVideoRef.current;
        const aud = hiddenAudioRef.current;

        // Prefer real media clock if playing audio or video
        const usingSeparateAudio =
          activeAudioItem && activeAudioItem.id !== activeVisualItem?.id;

        if (usingSeparateAudio && aud && !aud.paused && Number.isFinite(aud.currentTime)) {
          nextTime = aud.currentTime;
        } else if (
          activeVisualItem?.kind === 'video' &&
          vid &&
          !vid.paused &&
          Number.isFinite(vid.currentTime)
        ) {
          nextTime = vid.currentTime;
        }

        if (nextTime >= durationRef.current) {
          nextTime = 0;
          if (vid && activeVisualItem?.kind === 'video') vid.currentTime = 0;
          if (aud && usingSeparateAudio) aud.currentTime = 0;
          setIsPlaying(false);
          if (vid) vid.pause();
          if (aud) aud.pause();
        }

        currentTimeRef.current = nextTime;
        setCurrentTime(nextTime);
      }

      drawCanvasFrame(currentTimeRef.current);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [activeAudioItem, activeVisualItem, drawCanvasFrame]);

  const handleTogglePlay = useCallback(() => {
    const vid = hiddenVideoRef.current;
    const aud = hiddenAudioRef.current;
    const usingSeparateAudio =
      activeAudioItem && activeAudioItem.id !== activeVisualItem?.id;

    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        if (activeVisualItem?.kind === 'video' && vid) {
          vid.muted = isMuted || Boolean(usingSeparateAudio);
          vid.currentTime =
            vid.duration && currentTimeRef.current < vid.duration
              ? currentTimeRef.current
              : 0;
          vid.play().catch(() => {});
        }
        if (usingSeparateAudio && aud) {
          aud.muted = isMuted;
          aud.currentTime = currentTimeRef.current;
          aud.play().catch(() => {});
        }
      } else {
        if (vid) vid.pause();
        if (aud) aud.pause();
      }
      return next;
    });
  }, [activeAudioItem, activeVisualItem, isMuted]);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(durationRef.current, time));
      currentTimeRef.current = clamped;
      setCurrentTime(clamped);

      const vid = hiddenVideoRef.current;
      const aud = hiddenAudioRef.current;
      if (vid && activeVisualItem?.kind === 'video') {
        vid.currentTime =
          vid.duration && vid.duration > 0 ? clamped % vid.duration : clamped;
      }
      if (aud && activeAudioItem && activeAudioItem.id !== activeVisualItem?.id) {
        aud.currentTime = clamped;
      }
      drawCanvasFrame(clamped);
    },
    [activeAudioItem, activeVisualItem, drawCanvasFrame]
  );

  const handleRestart = useCallback(() => {
    handleSeek(0);
  }, [handleSeek]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (hiddenAudioRef.current) hiddenAudioRef.current.muted = next;
      if (hiddenVideoRef.current) {
        const usingSeparateAudio =
          activeAudioItem && activeAudioItem.id !== activeVisualItem?.id;
        hiddenVideoRef.current.muted = next || Boolean(usingSeparateAudio);
      }
      return next;
    });
  }, [activeAudioItem, activeVisualItem?.id]);

  // Singer Tap-to-Sync handler
  const handleStampNextLine = useCallback(() => {
    setCues((prev) => {
      const { cues: updated, nextIndex } = stampCueSync(
        prev,
        syncTargetIndex,
        currentTimeRef.current,
        durationRef.current
      );
      setSyncTargetIndex(nextIndex);
      return updated;
    });
  }, [syncTargetIndex]);

  const handleStampSpecificCue = useCallback((index: number) => {
    setCues((prev) => {
      const { cues: updated, nextIndex } = stampCueSync(
        prev,
        index,
        currentTimeRef.current,
        durationRef.current
      );
      setSyncTargetIndex(nextIndex);
      return updated;
    });
  }, []);

  // Keyboard shortcuts: Space (Play/Pause), S (Mark/Sync Lyric) when not typing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleStampNextLine();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay, handleStampNextLine]);

  // Upload files handler (Videos, Images, Audio)
  const handleUploadFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      files.forEach((file) => {
        const mime = file.type.toLowerCase();
        let kind: MediaKind | null = null;
        if (mime.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) {
          kind = 'video';
        } else if (
          mime.startsWith('image/') ||
          /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
        ) {
          kind = 'image';
        } else if (
          mime.startsWith('audio/') ||
          /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)
        ) {
          kind = 'audio';
        }
        if (!kind) return;

        const url = URL.createObjectURL(file);
        const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const newItem: UploadedMediaItem = {
          id,
          name: file.name,
          kind,
          url,
          sizeBytes: file.size,
        };

        if (kind === 'image') {
          const img = new Image();
          img.onload = () => {
            setItems((prev) =>
              prev.map((it) =>
                it.id === id
                  ? { ...it, width: img.naturalWidth, height: img.naturalHeight }
                  : it
              )
            );
          };
          img.src = url;
          setItems((prev) => [newItem, ...prev]);
          setActiveVisualId(id);
        } else if (kind === 'video') {
          const vid = document.createElement('video');
          vid.preload = 'metadata';
          vid.onloadedmetadata = () => {
            const vidDuration = Number.isFinite(vid.duration) ? vid.duration : 24;
            setItems((prev) =>
              prev.map((it) =>
                it.id === id
                  ? {
                      ...it,
                      duration: vidDuration,
                      width: vid.videoWidth,
                      height: vid.videoHeight,
                    }
                  : it
              )
            );
            setDuration(Number(vidDuration.toFixed(2)));
          };
          vid.src = url;
          setItems((prev) => [newItem, ...prev]);
          setActiveVisualId(id);
          setActiveAudioId(id);
        } else if (kind === 'audio') {
          const aud = new Audio();
          aud.preload = 'metadata';
          aud.onloadedmetadata = () => {
            const audDuration = Number.isFinite(aud.duration) ? aud.duration : 24;
            setItems((prev) =>
              prev.map((it) =>
                it.id === id ? { ...it, duration: audDuration } : it
              )
            );
            setDuration(Number(audDuration.toFixed(2)));
          };
          aud.src = url;
          setItems((prev) => [newItem, ...prev]);
          setActiveAudioId(id);
        }
      });
    },
    []
  );

  const handleRemoveItem = useCallback(
    (id: string) => {
      setItems((prev) => {
        const target = prev.find((i) => i.id === id);
        if (target && !target.isSample) {
          URL.revokeObjectURL(target.url);
        }
        return prev.filter((i) => i.id !== id);
      });
      if (activeVisualId === id) setActiveVisualId(null);
      if (activeAudioId === id) setActiveAudioId(null);
    },
    [activeAudioId, activeVisualId]
  );

  const handleSelectVisual = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      setActiveVisualId(id);
      if (target?.kind === 'video' && target.duration) {
        setDuration(Number(target.duration.toFixed(2)));
      }
    },
    [items]
  );

  const handleSelectAudio = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      setActiveAudioId(id);
      if (target?.duration) {
        setDuration(Number(target.duration.toFixed(2)));
      }
    },
    [items]
  );

  const handleCancelTranscribe = useCallback(() => {
    cancelActiveWhisperRef.current?.();
    cancelActiveWhisperRef.current = null;
    whisperWorkerRef.current?.terminate();
    whisperWorkerRef.current = null;
    setIsTranscribing(false);
    setTranscribeStatus(null);
    setTranscribeNotice(
      'Stopped Whisper sync. Kept audio-buffer vocal phrase alignment.'
    );
  }, []);

  const runLocalWhisper = useCallback(
    (
      samples: Float32Array,
      language: WhisperLanguage,
      modelSize: WhisperModelSize,
      vocalRegions?: VocalRegion[]
    ): Promise<{ text: string; chunks: WhisperChunk[] }> => {
      return new Promise((resolve, reject) => {
        if (typeof Worker === 'undefined') {
          reject(new Error('Web Workers are not supported in this browser.'));
          return;
        }
        // Cancel any previous in-flight job cleanly so workers never queue up or stall
        cancelActiveWhisperRef.current?.();

        if (!whisperWorkerRef.current) {
          whisperWorkerRef.current = new Worker(
            new URL('../workers/whisper.worker.ts', import.meta.url)
          );
        }
        const worker = whisperWorkerRef.current;
        const jobId = `whisper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        let settled = false;
        let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

        const resetWatchdog = () => {
          if (watchdogTimer) clearTimeout(watchdogTimer);
          watchdogTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(
              new Error(
                'Whisper engine timed out waiting for response. Kept audio-buffer vocal alignment.'
              )
            );
          }, 180000);
        };

        const onMessage = (event: MessageEvent) => {
          const payload = event.data as {
            id?: string;
            type?: string;
            message?: string;
            text?: string;
            chunks?: WhisperChunk[];
            error?: string;
          };
          if (payload.id !== jobId || settled) return;

          resetWatchdog();

          if (payload.type === 'progress' && payload.message) {
            setTranscribeStatus(payload.message);
          } else if (payload.type === 'complete') {
            settled = true;
            cleanup();
            resolve({
              text: payload.text ?? '',
              chunks: Array.isArray(payload.chunks) ? payload.chunks : [],
            });
          } else if (payload.type === 'error') {
            settled = true;
            cleanup();
            reject(
              new Error(payload.error || 'Local Whisper transcription failed.')
            );
          }
        };

        const onError = (err: ErrorEvent) => {
          if (settled) return;
          settled = true;
          cleanup();
          whisperWorkerRef.current?.terminate();
          whisperWorkerRef.current = null;
          reject(
            new Error(err.message || 'Local Whisper worker encountered an error.')
          );
        };

        const cleanup = () => {
          if (watchdogTimer) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
          }
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          if (cancelActiveWhisperRef.current === abortJob) {
            cancelActiveWhisperRef.current = null;
          }
        };

        const abortJob = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('Whisper sync cancelled.'));
        };

        cancelActiveWhisperRef.current = abortJob;
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        resetWatchdog();

        // Copy samples so ownership transfers cleanly without detaching caller buffers
        const workerSamples = new Float32Array(samples);
        worker.postMessage(
          {
            id: jobId,
            audioBuffer: workerSamples.buffer,
            language,
            modelSize,
            vocalRegions: vocalRegions?.map((r) => ({
              startTime: r.startTime,
              endTime: r.endTime,
            })),
          },
          [workerSamples.buffer]
        );
      });
    },
    []
  );

  const inferWhisperLanguage = useCallback(
    (selected: WhisperLanguage, cueList: LyricCue[]): WhisperLanguage => {
      if (selected !== 'auto') return selected;
      const hasRtl = cueList.some((c) => detectScriptDirection(c.primary) === 'rtl');
      return hasRtl ? 'persian' : 'auto';
    },
    []
  );

  const handleImportLyricsText = useCallback(
    async (
      text: string,
      mode: PlainImportMode,
      options?: {
        autoSyncVocals: boolean;
        language: WhisperLanguage;
        modelSize: WhisperModelSize;
      }
    ) => {
      const parsed = parsePlainLyrics(text, {
        mode,
        totalDuration: durationRef.current,
      });
      if (parsed.length === 0) return;

      setCues(parsed);
      setSyncTargetIndex(0);
      setTranscribeError(null);
      setTranscribeNotice(null);

      // Keep explicit SRT timestamps intact
      if (isSrtContent(text) || options?.autoSyncVocals === false) {
        return;
      }

      const sourceItem =
        activeAudioItem ??
        (activeVisualItem?.kind === 'video' ? activeVisualItem : null);
      if (!sourceItem) return;

      try {
        const { samples, sampleRate, duration: audioDuration } =
          await decodeAudioTo16kHzMono(sourceItem.url);
        const envelope = analyzeAudioBuffer(samples, sampleRate);
        const dspAligned = alignCuesToVocalRegions(
          parsed,
          envelope.regions,
          audioDuration,
          envelope
        );
        setCues(dspAligned);
        setSyncTargetIndex(0);

        // On real uploaded songs/videos, refine pasted lyrics with word-level Whisper +
        // audio-buffer forced alignment so exact singing timestamps snap automatically.
        if (!sourceItem.isSample) {
          setIsTranscribing(true);
          setTranscribeStatus('Initializing local Whisper...');
          const effectiveLang = inferWhisperLanguage(
            options?.language ?? 'auto',
            dspAligned
          );
          try {
            const whisperRes = await runLocalWhisper(
              samples,
              effectiveLang,
              options?.modelSize ?? 'tiny',
              envelope.regions
            );
            const whisperAligned = alignCuesWithAudioAndWhisper({
              cues: dspAligned,
              chunks: whisperRes.chunks,
              samples,
              sampleRate,
              totalDuration: audioDuration,
              fallbackRegions: envelope.regions,
            });
            setCues(whisperAligned);
            const totalWords = whisperAligned.reduce(
              (acc, c) => acc + (c.words?.length ?? 0),
              0
            );
            setTranscribeNotice(
              whisperRes.chunks.length > 0
                ? `Synced ${whisperAligned.length} lines (${totalWords} word offsets) to singing vocals.`
                : `Aligned ${dspAligned.length} lines to audio-buffer vocal onsets.`
            );
          } catch (err) {
            if (!(err instanceof Error && err.message === 'Whisper sync cancelled.')) {
              setTranscribeNotice(
                `Aligned ${dspAligned.length} lines to audio-buffer vocal onsets.`
              );
            }
          } finally {
            setIsTranscribing(false);
            setTranscribeStatus(null);
          }
        } else {
          setTranscribeNotice(
            `Aligned ${dspAligned.length} lines to track vocal regions. Upload your song to match exact singer words.`
          );
        }
      } catch {
        // Fallback: evenly distributed cues from parsePlainLyrics remain intact
      }
    },
    [activeAudioItem, activeVisualItem, inferWhisperLanguage, runLocalWhisper]
  );

  const handleTranscribeAudio = useCallback(
    async (options: {
      mode: 'generate' | 'align-existing';
      language: WhisperLanguage;
      modelSize: WhisperModelSize;
    }) => {
      const sourceItem =
        activeAudioItem ??
        (activeVisualItem?.kind === 'video' ? activeVisualItem : null);

      if (!sourceItem) {
        setTranscribeError(
          'Select an audio file or a video clip with audio first.'
        );
        return;
      }

      setTranscribeError(null);
      setTranscribeNotice(null);
      setIsTranscribing(true);
      setTranscribeStatus('Decoding audio buffer (16 kHz)...');

      try {
        const { samples, sampleRate, duration: audioDuration } =
          await decodeAudioTo16kHzMono(sourceItem.url);
        const envelope = analyzeAudioBuffer(samples, sampleRate);

        const effectiveLang =
          options.mode === 'align-existing'
            ? inferWhisperLanguage(options.language, cuesRef.current)
            : options.language;

        const whisperRes = await runLocalWhisper(
          samples,
          effectiveLang,
          options.modelSize,
          envelope.regions
        );

        if (options.mode === 'align-existing') {
          const existing = cuesRef.current;
          if (existing.length === 0) {
            throw new Error('Paste or upload lyrics first before syncing.');
          }
          const aligned = alignCuesWithAudioAndWhisper({
            cues: existing,
            chunks: whisperRes.chunks,
            samples,
            sampleRate,
            totalDuration: audioDuration,
            fallbackRegions: envelope.regions,
          });
          setCues(aligned);
          setSyncTargetIndex(0);
          const totalWords = aligned.reduce(
            (acc, c) => acc + (c.words?.length ?? 0),
            0
          );
          setTranscribeNotice(
            whisperRes.chunks.length > 0
              ? `Synced ${aligned.length} lines (${totalWords} word offsets) to detected vocals.`
              : `No speech words detected; aligned ${aligned.length} lines to vocal-energy peaks.`
          );
          return;
        }

        const generatedCues = whisperChunksToCues(
          whisperRes.chunks,
          audioDuration,
          envelope
        );
        if (generatedCues.length > 0) {
          setCues(generatedCues);
          setSyncTargetIndex(0);
          setEnabledTracks((prev) => ({ ...prev, primary: true }));
          setTranscribeNotice(
            `Generated ${generatedCues.length} synced lyric lines locally with Whisper.`
          );
        } else {
          throw new Error(
            'No singing or spoken vocals were detected in this audio track. Upload a vocal song or try Small (190MB · Farsi).'
          );
        }
      } catch (err) {
        if (!(err instanceof Error && err.message === 'Whisper sync cancelled.')) {
          setTranscribeError(
            err instanceof Error ? err.message : 'Local Whisper transcription failed.'
          );
        }
      } finally {
        setIsTranscribing(false);
        setTranscribeStatus(null);
      }
    },
    [activeAudioItem, activeVisualItem, inferWhisperLanguage, runLocalWhisper]
  );

  const handleChangeRatio = useCallback((nextRatio: AspectRatio) => {
    setRatio(nextRatio);
    // Smartly switch sample backdrop if user hasn't uploaded custom visual yet
    setActiveVisualId((current) => {
      if (nextRatio === '9:16' && current === 'sample-stage-16-9') {
        return 'sample-rain-9-16';
      }
      if (nextRatio === '16:9' && current === 'sample-rain-9-16') {
        return 'sample-stage-16-9';
      }
      return current;
    });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen lg:h-screen flex flex-col bg-[#0B0D11] text-zinc-100 overflow-x-hidden lg:overflow-hidden">
        {/* Hidden native media elements driving exact canvas & audio playback */}
        <video
          ref={hiddenVideoRef}
          playsInline
          crossOrigin="anonymous"
          loop
          onLoadedMetadata={(e) => {
            const vid = e.currentTarget;
            if (Number.isFinite(vid.duration) && vid.duration > 0) {
              setDuration(Number(vid.duration.toFixed(2)));
            }
            drawCanvasFrame(currentTimeRef.current);
          }}
          className="hidden"
        />
        <audio ref={hiddenAudioRef} crossOrigin="anonymous" className="hidden" />

        {/* Top Bar Contract: 1-row, 3-zone */}
        <header className="h-14 shrink-0 px-4 sm:px-6 border-b border-white/8 bg-[#0E1117] flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#"
            className="text-lg font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0"
          >
            LyrCut Studio
          </a>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Workspace sections"
            className="hidden md:flex items-center gap-6 text-xs font-medium text-zinc-400"
          >
            <button
              type="button"
              onClick={() => setMobilePanel('media')}
              className="hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Uploaded Items
            </button>
            <button
              type="button"
              onClick={() => {
                setInspectorTab('lyrics');
                setMobilePanel('lyrics');
              }}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 border-b ${
                inspectorTab === 'lyrics'
                  ? 'text-zinc-100 border-amber-500'
                  : 'border-transparent hover:text-zinc-100'
              }`}
            >
              Lyrics & Sync
            </button>
            <button
              type="button"
              onClick={() => {
                setInspectorTab('style');
                setMobilePanel('style');
              }}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 border-b ${
                inspectorTab === 'style'
                  ? 'text-zinc-100 border-amber-500'
                  : 'border-transparent hover:text-zinc-100'
              }`}
            >
              Overlay Style
            </button>
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isPlaying) handleTogglePlay();
                setIsExportOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Full HD</span>
            </button>
          </div>
        </header>

        {/* Mobile / Tablet Panel Switcher (< lg) */}
        <div className="lg:hidden px-3 py-2 border-b border-white/8 bg-[#12151C]">
          <div className="grid grid-cols-4 gap-1 p-1 bg-[#0B0D11] rounded-lg border border-white/8">
            {(
              [
                { id: 'preview', label: 'Preview' },
                { id: 'media', label: `Media (${items.length})` },
                { id: 'lyrics', label: `Lyrics (${cues.length})` },
                { id: 'style', label: 'Style' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMobilePanel(tab.id);
                  if (tab.id === 'lyrics') setInspectorTab('lyrics');
                  if (tab.id === 'style') setInspectorTab('style');
                }}
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                  mobilePanel === tab.id
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3-Column Studio Workspace */}
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)_370px]"
        >
          {/* Left: Uploaded Items Bin */}
          <div
            className={`min-h-0 h-full ${
              mobilePanel === 'media' ? 'block' : 'hidden lg:block'
            }`}
          >
            <MediaBin
              items={items}
              activeVisualId={activeVisualId}
              activeAudioId={activeAudioId}
              mediaFit={mediaFit}
              onUploadFiles={handleUploadFiles}
              onSelectVisual={handleSelectVisual}
              onSelectAudio={handleSelectAudio}
              onRemoveItem={handleRemoveItem}
              onChangeMediaFit={setMediaFit}
            />
          </div>

          {/* Center: Responsive Canvas Preview & Singer Sync */}
          <div
            className={`min-h-[460px] lg:min-h-0 h-full ${
              mobilePanel === 'preview' ? 'block' : 'hidden lg:block'
            }`}
          >
            <PreviewStage
              canvasRef={canvasRef}
              ratio={ratio}
              onChangeRatio={handleChangeRatio}
              showSafeZones={style.showSafeZones}
              onToggleSafeZones={() =>
                setStyle((s) => ({ ...s, showSafeZones: !s.showSafeZones }))
              }
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onRestart={handleRestart}
              isMuted={isMuted}
              onToggleMute={handleToggleMute}
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              cues={cues}
              syncTargetIndex={syncTargetIndex}
              onSelectSyncTarget={setSyncTargetIndex}
              onStampNextLine={handleStampNextLine}
              onShiftAllCues={(offset) =>
                setCues((prev) => shiftAllCues(prev, offset))
              }
              waveformPeaks={waveformPeaks}
              activeAudioName={activeAudioItem?.name ?? null}
            />
          </div>

          {/* Right: Multi-Language Lyrics & Style Inspector */}
          <div
            className={`min-h-0 h-full ${
              mobilePanel === 'lyrics' || mobilePanel === 'style'
                ? 'block'
                : 'hidden lg:block'
            }`}
          >
            <LyricsInspector
              cues={cues}
              currentTime={currentTime}
              duration={duration}
              enabledTracks={enabledTracks}
              style={style}
              syncTargetIndex={syncTargetIndex}
              activeTab={inspectorTab}
              hasAudioSource={Boolean(
                activeAudioItem || activeVisualItem?.kind === 'video'
              )}
              isTranscribing={isTranscribing}
              transcribeStatus={transcribeStatus}
              transcribeNotice={transcribeNotice}
              transcribeError={transcribeError}
              onChangeTab={setInspectorTab}
              onToggleTrack={(track) =>
                setEnabledTracks((prev) => ({ ...prev, [track]: !prev[track] }))
              }
              onImportLyricsText={handleImportLyricsText}
              onTranscribeAudio={handleTranscribeAudio}
              onDismissTranscribeError={() => setTranscribeError(null)}
              onDismissTranscribeNotice={() => setTranscribeNotice(null)}
              onCancelTranscribe={handleCancelTranscribe}
              onUpdateCueText={(id, field, value) =>
                setCues((prev) =>
                  prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
                )
              }
              onUpdateCueTiming={(id, start, end) =>
                setCues((prev) => updateCueTiming(prev, id, start, end))
              }
              onStampCueAtCurrentTime={handleStampSpecificCue}
              onDeleteCue={(id) =>
                setCues((prev) => prev.filter((c) => c.id !== id))
              }
              onAddCue={() => {
                setCues((prev) => {
                  const lastEnd =
                    prev.length > 0 ? prev[prev.length - 1].endTime : 0;
                  const start = Number(lastEnd.toFixed(2));
                  const end = Number(Math.min(duration, start + 3).toFixed(2));
                  return [
                    ...prev,
                    {
                      id: `cue-${Date.now()}`,
                      startTime: start,
                      endTime: Math.max(start + 0.5, end),
                      primary: 'خط جدید...',
                      roman: '',
                      english: '',
                    },
                  ];
                });
              }}
              onSeekToCue={handleSeek}
              onChangeStyle={(patch) =>
                setStyle((prev) => ({ ...prev, ...patch }))
              }
            />
          </div>
        </motion.main>

        {/* Full HD Export Modal */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          ratio={ratio}
          duration={duration}
          visualItem={activeVisualItem}
          audioItem={activeAudioItem}
          mediaFit={mediaFit}
          cues={cues}
          enabledTracks={enabledTracks}
          style={style}
        />
      </div>
    </MotionConfig>
  );
}
