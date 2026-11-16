/**
 * Decodes an audio or video file's audio track into normalized waveform peaks (0..1)
 * for visual singer-timing synchronization on the timeline.
 */
export async function extractWaveformPeaks(
  url: string,
  bucketCount = 96
): Promise<{ peaks: number[]; duration: number } | null> {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext | null = null;
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(channel.length / bucketCount));
    const peaks: number[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const start = i * step;
      const end = Math.min(channel.length, start + step);
      let maxAmp = 0;
      for (let j = start; j < end; j += Math.max(1, Math.floor(step / 24))) {
        const abs = Math.abs(channel[j]);
        if (abs > maxAmp) maxAmp = abs;
      }
      peaks.push(Number(maxAmp.toFixed(3)));
    }

    const peakMax = Math.max(...peaks, 0.01);
    const normalized = peaks.map((p) => Number((p / peakMax).toFixed(3)));

    return {
      peaks: normalized,
      duration: audioBuffer.duration,
    };
  } catch {
    return null;
  } finally {
    if (ctx) {
      ctx.close().catch(() => {});
    }
  }
}

/**
 * Generates an optional synthesized gentle chord progression WAV blob URL
 * so users can immediately test live Tap-to-Sync & Full HD video+audio export
 * even before uploading their own song file.
 */
export function createDemoTrackWavUrl(durationSeconds = 24): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Warm minor ambient progression (Am - F - C - G) with gentle rhythmic pulse
  const chords = [
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [261.63, 329.63, 392.0],
    [196.0, 246.94, 293.66],
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chordIdx = Math.floor(t / 6) % chords.length;
    const chord = chords[chordIdx];
    const barPos = (t % 6) / 6;
    const swell = Math.sin(barPos * Math.PI);
    const beatPulse = 0.65 + 0.35 * Math.pow(Math.sin(t * Math.PI * 2), 2);

    let sample = 0;
    for (const freq of chord) {
      sample += Math.sin(2 * Math.PI * freq * t) * 0.25;
      sample += Math.sin(2 * Math.PI * (freq * 0.5) * t) * 0.12;
    }

    // Fade in/out at track edges
    const edgeFade =
      t < 0.5 ? t / 0.5 : t > durationSeconds - 0.8 ? (durationSeconds - t) / 0.8 : 1;

    const val = Math.max(
      -1,
      Math.min(1, sample * 0.26 * (0.4 + 0.6 * swell) * beatPulse * edgeFade)
    );
    view.setInt16(44 + i * 2, Math.round(val * 32767), true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function encodeMonoWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export interface AudioTranscriptionChunk {
  blob: Blob;
  mimeType: string;
  offsetSeconds: number;
  chunkDuration: number;
  totalDuration: number;
}

const MAX_DIRECT_FALLBACK_BYTES = 3.5 * 1024 * 1024;

/**
 * Extracts and resamples audio from any audio or video URL into compact
 * 8kHz mono 16-bit WAV chunks (~0.96 MB/min, max 150s / ~2.4 MB per chunk)
 * so even full-length songs or large 1080p Filmora videos stay safely under
 * Vercel / proxy request body limits (4.5 MB) and never trigger HTTP 413 HTML errors.
 */
export async function extractAudioChunksForTranscription(
  url: string,
  chunkSeconds = 150
): Promise<AudioTranscriptionChunk[]> {
  const response = await fetch(url);
  const rawBlob = await response.blob();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioCtx) {
    if (rawBlob.size > MAX_DIRECT_FALLBACK_BYTES) {
      throw new Error(
        'Audio file is too large for direct upload in this browser. Please try a shorter clip or MP3 under 3.5 MB.'
      );
    }
    return [
      {
        blob: rawBlob,
        mimeType: rawBlob.type || 'audio/mp3',
        offsetSeconds: 0,
        chunkDuration: 30,
        totalDuration: 30,
      },
    ];
  }

  let ctx: AudioContext | null = null;
  try {
    const arrayBuffer = await rawBlob.arrayBuffer();
    ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(arrayBuffer);

    const targetRate = 8000;
    const totalDuration = Math.max(1, decoded.duration);
    const totalSamples = Math.max(1, Math.ceil(totalDuration * targetRate));
    const offline = new OfflineAudioContext(1, totalSamples, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    const monoSamples = rendered.getChannelData(0);

    const samplesPerChunk = Math.max(targetRate * 10, chunkSeconds * targetRate);
    const chunks: AudioTranscriptionChunk[] = [];

    for (let startSample = 0; startSample < monoSamples.length; startSample += samplesPerChunk) {
      const endSample = Math.min(monoSamples.length, startSample + samplesPerChunk);
      const slice = monoSamples.subarray(startSample, endSample);
      if (slice.length < targetRate * 0.25) continue;
      const wavBlob = encodeMonoWavBlob(slice, targetRate);
      chunks.push({
        blob: wavBlob,
        mimeType: 'audio/wav',
        offsetSeconds: Number((startSample / targetRate).toFixed(2)),
        chunkDuration: Number((slice.length / targetRate).toFixed(2)),
        totalDuration,
      });
    }

    if (chunks.length === 0) {
      throw new Error('No audio samples could be extracted from this file.');
    }
    return chunks;
  } catch (err) {
    if (rawBlob.size <= MAX_DIRECT_FALLBACK_BYTES && rawBlob.type.startsWith('audio/')) {
      return [
        {
          blob: rawBlob,
          mimeType: rawBlob.type,
          offsetSeconds: 0,
          chunkDuration: 30,
          totalDuration: 30,
        },
      ];
    }
    throw new Error(
      err instanceof Error && err.message.includes('too large')
        ? err.message
        : 'Could not decode audio from this media file. Try uploading an MP3, WAV, or standard MP4 track.'
    );
  } finally {
    if (ctx) {
      ctx.close().catch(() => {});
    }
  }
}

/**
 * Applies smooth 20ms-frame Mid-Side center-vocal isolation on stereo 16 kHz audio
 * to attenuate wide stereo instruments (guitars, pads, reverb, panned drums)
 * while keeping center-panned lead singing crisp.
 */
function isolateCenterVocalsMidSide(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): Float32Array {
  const n = Math.min(left.length, right.length);
  const out = new Float32Array(n);
  const frameLen = Math.max(64, Math.floor(sampleRate * 0.02));
  let smoothedGain = 1;

  for (let start = 0; start < n; start += frameLen) {
    const end = Math.min(n, start + frameLen);
    let midEnergy = 0;
    let sideEnergy = 0;

    for (let i = start; i < end; i++) {
      const mid = 0.5 * (left[i] + right[i]);
      const side = 0.5 * (left[i] - right[i]);
      midEnergy += mid * mid;
      sideEnergy += side * side;
    }

    // Center lead vocals dominate Mid energy while backing tracks carry higher Side energy
    const ratioGain =
      midEnergy > 1e-8
        ? Math.max(0.14, Math.min(1, (midEnergy - 0.85 * sideEnergy) / (midEnergy + 1e-8)))
        : 0.14;
    smoothedGain = smoothedGain * 0.45 + ratioGain * 0.55;

    for (let i = start; i < end; i++) {
      const mid = 0.5 * (left[i] + right[i]);
      out[i] = Math.max(-1, Math.min(1, mid * smoothedGain));
    }
  }

  return out;
}

/**
 * Decodes an audio or video URL in the browser, extracts vocal-band 16 kHz audio
 * (170 Hz highpass + 3400 Hz lowpass + stereo Mid-Side center-vocal isolation),
 * and returns a Float32Array ready for both DSP vocal phrase detection and local Whisper.
 */
export async function decodeAudioTo16kHzMono(url: string): Promise<{
  samples: Float32Array;
  sampleRate: number;
  duration: number;
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not read the selected audio source.');
  }
  const rawBlob = await response.blob();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioCtx) {
    throw new Error('Web Audio decoding is not supported in this browser.');
  }

  let ctx: AudioContext | null = null;
  try {
    const arrayBuffer = await rawBlob.arrayBuffer();
    ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(arrayBuffer);

    const targetRate = 16000;
    const totalDuration = Math.max(0.5, decoded.duration);
    const totalSamples = Math.max(1, Math.ceil(totalDuration * targetRate));
    const channels = decoded.numberOfChannels >= 2 ? 2 : 1;
    const offline = new OfflineAudioContext(channels, totalSamples, targetRate);

    const source = offline.createBufferSource();
    source.buffer = decoded;

    // Telephone/vocal presence band (170 Hz – 3400 Hz) strips sub-bass kick drums & hi-hat hiss
    const hp = offline.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 170;
    hp.Q.value = 0.707;

    const lp = offline.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3400;
    lp.Q.value = 0.707;

    source.connect(hp);
    hp.connect(lp);
    lp.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    const samples =
      rendered.numberOfChannels >= 2
        ? isolateCenterVocalsMidSide(
            rendered.getChannelData(0),
            rendered.getChannelData(1),
            targetRate
          )
        : new Float32Array(rendered.getChannelData(0));

    return {
      samples,
      sampleRate: targetRate,
      duration: totalDuration,
    };
  } catch (err) {
    throw new Error(
      err instanceof Error && err.message
        ? `Could not decode audio for sync: ${err.message}`
        : 'Could not decode audio from this media file. Try uploading an MP3, WAV, or standard MP4 track.'
    );
  } finally {
    if (ctx) {
      ctx.close().catch(() => {});
    }
  }
}

