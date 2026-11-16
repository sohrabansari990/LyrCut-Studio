import { pipeline, env } from '@huggingface/transformers';

// Persist downloaded ONNX model weights in browser CacheStorage across clicks & sessions
env.allowLocalModels = false;
env.useBrowserCache = true;

// Prevent ONNX Runtime Web from spawning cross-origin proxy subworkers or stalling on
// SharedArrayBuffer when the page does not enforce COOP/COEP headers.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
  (env.backends.onnx.wasm as Record<string, unknown>).numThreads =
    typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated ? 2 : 1;
}

type ProgressEventPayload = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
};

type WhisperOutputChunk = {
  text: string;
  timestamp: [number, number | null];
};

type TranscriberFn = (
  audio: Float32Array,
  options: Record<string, unknown>
) => Promise<{
  text?: string;
  chunks?: WhisperOutputChunk[];
}>;

interface VocalWindow {
  startSec: number;
  endSec: number;
}

const loadedPipelines = new Map<string, Promise<TranscriberFn>>();

async function detectDeviceAndDtype(): Promise<{
  device: 'webgpu' | 'wasm';
  dtype: 'q4' | 'q8';
}> {
  try {
    const nav = self.navigator as unknown as {
      gpu?: { requestAdapter?: () => Promise<unknown> };
    };
    if (nav?.gpu?.requestAdapter) {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        return { device: 'webgpu', dtype: 'q4' };
      }
    }
  } catch {
    // Fallback cleanly to single-thread CPU WASM
  }
  return { device: 'wasm', dtype: 'q8' };
}

async function createPipelineWithFallback(
  modelId: string,
  onProgress: (msg: string, pct?: number) => void
): Promise<TranscriberFn> {
  const fileBytes = new Map<string, { loaded: number; total: number }>();
  let sawNetworkBytes = false;

  const handleProgress = (info: ProgressEventPayload) => {
    const fileKey = info.file || 'model';
    if (
      typeof info.loaded === 'number' &&
      typeof info.total === 'number' &&
      info.total > 0
    ) {
      if (info.loaded < info.total) {
        sawNetworkBytes = true;
      }
      fileBytes.set(fileKey, { loaded: info.loaded, total: info.total });
      let loadedSum = 0;
      let totalSum = 0;
      for (const entry of fileBytes.values()) {
        loadedSum += entry.loaded;
        totalSum += entry.total;
      }
      if (totalSum > 0) {
        const overallPct = Math.min(99, Math.round((loadedSum / totalSum) * 100));
        onProgress(
          sawNetworkBytes
            ? `Downloading Whisper model (${overallPct}% — cached for reuse)...`
            : `Loading cached Whisper model (${overallPct}%)...`,
          overallPct
        );
        return;
      }
    }

    if (info.status === 'progress' && typeof info.progress === 'number') {
      const pct = Math.min(99, Math.round(info.progress));
      onProgress(
        sawNetworkBytes
          ? `Downloading Whisper model (${pct}% — cached for reuse)...`
          : `Loading cached Whisper model (${pct}%)...`,
        pct
      );
    } else if (info.status === 'ready') {
      onProgress('Whisper engine ready. Aligning vocals...', 100);
    }
  };

  const preferred = await detectDeviceAndDtype();
  if (preferred.device === 'webgpu') {
    onProgress('Loading Whisper (WebGPU accelerated)...', 0);
    try {
      const gpuPipe = await pipeline('automatic-speech-recognition', modelId, {
        device: 'webgpu',
        dtype: 'q4',
        progress_callback: handleProgress,
      });
      return gpuPipe as unknown as TranscriberFn;
    } catch {
      fileBytes.clear();
      onProgress('WebGPU unavailable, loading WASM engine...', 0);
    }
  } else {
    onProgress('Loading Whisper engine...', 0);
  }

  const wasmPipe = await pipeline('automatic-speech-recognition', modelId, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: handleProgress,
  });
  return wasmPipe as unknown as TranscriberFn;
}

async function getTranscriber(
  modelId: string,
  onProgress: (msg: string, pct?: number) => void
): Promise<TranscriberFn> {
  let pending = loadedPipelines.get(modelId);
  if (!pending) {
    pending = createPipelineWithFallback(modelId, onProgress);
    loadedPipelines.set(modelId, pending);
  } else {
    onProgress('Loaded cached Whisper model (instant)...', 100);
  }

  try {
    return await pending;
  } catch (err) {
    loadedPipelines.delete(modelId);
    throw err;
  }
}

/**
 * Splits a song buffer into <= 18s vocal-focused windows so Whisper:
 * 1. Emits fast, steady progress instead of blocking long stretches
 * 2. Skips long instrumental intros, breaks, and outros completely
 * 3. Never freezes CPU/WASM memory on dense choruses
 */
function buildProcessingWindows(
  totalDurationSec: number,
  vocalRegions?: Array<{ startTime: number; endTime: number }>
): VocalWindow[] {
  const maxWin = 18;
  const strideOverlap = 1.5;

  if (vocalRegions && vocalRegions.length > 0) {
    const padded = vocalRegions.map((r) => ({
      startSec: Math.max(0, r.startTime - 0.5),
      endSec: Math.min(totalDurationSec, r.endTime + 0.5),
    }));

    const grouped: VocalWindow[] = [];
    for (const r of padded) {
      const prev = grouped[grouped.length - 1];
      if (prev && r.endSec - prev.startSec <= maxWin && r.startSec - prev.endSec <= 2.2) {
        prev.endSec = Math.max(prev.endSec, r.endSec);
      } else if (r.endSec - r.startSec > maxWin) {
        for (let t = r.startSec; t < r.endSec; t += maxWin - strideOverlap) {
          const end = Math.min(r.endSec, t + maxWin);
          grouped.push({ startSec: Number(t.toFixed(2)), endSec: Number(end.toFixed(2)) });
          if (end >= r.endSec) break;
        }
      } else {
        grouped.push({
          startSec: Number(r.startSec.toFixed(2)),
          endSec: Number(r.endSec.toFixed(2)),
        });
      }
    }

    if (grouped.length > 0) return grouped;
  }

  const fallback: VocalWindow[] = [];
  for (let t = 0; t < totalDurationSec; t += maxWin - strideOverlap) {
    const end = Math.min(totalDurationSec, t + maxWin);
    fallback.push({ startSec: Number(t.toFixed(2)), endSec: Number(end.toFixed(2)) });
    if (end >= totalDurationSec) break;
  }
  return fallback;
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { id, audioBuffer, language, modelSize, vocalRegions } = event.data as {
    id: string;
    audioBuffer: ArrayBuffer;
    language: 'auto' | 'persian' | 'english';
    modelSize: 'tiny' | 'base' | 'small';
    vocalRegions?: Array<{ startTime: number; endTime: number }>;
  };

  const modelId =
    modelSize === 'small'
      ? 'onnx-community/whisper-small'
      : modelSize === 'base'
      ? 'onnx-community/whisper-base'
      : 'onnx-community/whisper-tiny';

  try {
    self.postMessage({
      id,
      type: 'progress',
      message: 'Checking cached Whisper model...',
    });

    const transcriber = await getTranscriber(modelId, (message, progress) => {
      self.postMessage({ id, type: 'progress', message, progress });
    });

    const audio = new Float32Array(audioBuffer);
    const sampleRate = 16000;
    const totalDurationSec = audio.length / sampleRate;
    const windows = buildProcessingWindows(totalDurationSec, vocalRegions);

    const allChunks: WhisperOutputChunk[] = [];
    const textParts: string[] = [];

    for (let wIdx = 0; wIdx < windows.length; wIdx++) {
      const win = windows[wIdx];
      const pct = Math.round((wIdx / Math.max(1, windows.length)) * 100);
      self.postMessage({
        id,
        type: 'progress',
        message:
          windows.length > 1
            ? `Analyzing vocals (part ${wIdx + 1}/${windows.length} · ${pct}%)...`
            : 'Analyzing vocals & calculating word offsets...',
        progress: pct,
      });

      const startSample = Math.max(0, Math.floor(win.startSec * sampleRate));
      const endSample = Math.min(audio.length, Math.ceil(win.endSec * sampleRate));
      if (endSample - startSample < sampleRate * 0.25) continue;

      const slice = audio.subarray(startSample, endSample);
      const baseOptions: Record<string, unknown> = {
        task: 'transcribe',
        // Fast segment timestamps (5x-10x faster than WASM DTW word alignment);
        // our vocal-envelope DSP + Needleman-Wunsch DP computes exact word offsets afterward.
        return_timestamps: true,
        chunk_length_s: 18,
      };
      if (language && language !== 'auto') {
        baseOptions.language = language;
      }

      const result = await transcriber(slice, baseOptions);

      const winText = (result?.text ?? '').trim();
      if (winText) textParts.push(winText);

      const rawChunks = Array.isArray(result?.chunks) ? result.chunks : [];
      if (rawChunks.length === 0 && winText) {
        allChunks.push({
          text: winText,
          timestamp: [Number(win.startSec.toFixed(2)), Number(win.endSec.toFixed(2))],
        });
      } else {
        for (const ch of rawChunks) {
          const chunkText = (ch.text ?? '').trim();
          if (!chunkText) continue;
          const relStart = Number.isFinite(ch.timestamp?.[0]) ? (ch.timestamp[0] as number) : 0;
          const relEnd =
            ch.timestamp?.[1] !== null && Number.isFinite(ch.timestamp?.[1])
              ? (ch.timestamp[1] as number)
              : null;
          allChunks.push({
            text: chunkText,
            timestamp: [
              Number((win.startSec + Math.max(0, relStart)).toFixed(2)),
              relEnd !== null
                ? Number((win.startSec + Math.max(relStart + 0.08, relEnd)).toFixed(2))
                : null,
            ],
          });
        }
      }

      // Yield a tick so progress messages flush to the main thread before heavy next window
      await new Promise((r) => setTimeout(r, 0));
    }

    self.postMessage({
      id,
      type: 'complete',
      text: textParts.join(' ').trim(),
      chunks: allChunks,
    });
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      error:
        err instanceof Error
          ? err.message
          : 'Local Whisper transcription failed.',
    });
  }
});
