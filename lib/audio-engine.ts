import { AudioBeatAnalysis, computeAudioAnalysisFromPcm } from './beat-effects';

/**
 * Decodes an audio or video file's audio track into normalized waveform peaks (0..1)
 * and a 30Hz beat/spectrum envelope for beat-synced visual effects & visualizers.
 */
export async function extractWaveformPeaks(
  url: string,
  bucketCount = 160
): Promise<{
  peaks: number[];
  duration: number;
  beatAnalysis: AudioBeatAnalysis;
} | null> {
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
    const beatAnalysis = computeAudioAnalysisFromPcm(
      channel,
      audioBuffer.sampleRate,
      30,
      24
    );

    return {
      peaks: normalized,
      duration: audioBuffer.duration,
      beatAnalysis,
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
 * Generates an optional synthesized gentle chord progression WAV blob URL with a soft
 * 100 BPM kick pulse so users can immediately test playback, scrolling lyrics,
 * beat-synced visual effects, audio visualizers, and Full HD export.
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

  const chords = [
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [261.63, 329.63, 392.0],
    [196.0, 246.94, 293.66],
  ];

  const beatPeriod = 0.6; // 100 BPM

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chordIdx = Math.floor(t / 6) % chords.length;
    const chord = chords[chordIdx];
    const barPos = (t % 6) / 6;
    const swell = Math.sin(barPos * Math.PI);
    const beatPhase = t % beatPeriod;
    const kickEnv = beatPhase < 0.16 ? Math.exp(-beatPhase * 22) : 0;
    const kickFreq = 115 * Math.exp(-beatPhase * 14) + 48;
    const kick = Math.sin(2 * Math.PI * kickFreq * beatPhase) * kickEnv * 0.42;

    let sample = 0;
    for (const freq of chord) {
      sample += Math.sin(2 * Math.PI * freq * t) * 0.22;
      sample += Math.sin(2 * Math.PI * (freq * 0.5) * t) * 0.11;
    }

    const edgeFade =
      t < 0.3 ? t / 0.3 : t > durationSeconds - 0.6 ? (durationSeconds - t) / 0.6 : 1;

    const val = Math.max(
      -1,
      Math.min(1, (sample * 0.24 * (0.45 + 0.55 * swell) + kick) * edgeFade)
    );
    view.setInt16(44 + i * 2, Math.round(val * 32767), true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
