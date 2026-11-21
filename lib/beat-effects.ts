export type BeatVisualEffectType =
  | 'none'
  | 'beat-bounce'
  | 'zoom-pulse'
  | 'beat-shake'
  | 'ring-ripple'
  | 'flash-lamp'
  | 'rgb-glitch';

export type AudioVisualizerType =
  | 'none'
  | 'spectrum-bars'
  | 'mirror-wave'
  | 'circular-halo'
  | 'pulse-line';

export type BeatSyncTarget = 'background' | 'lyrics' | 'both';

export interface BeatEffectsConfig {
  effectType: BeatVisualEffectType;
  syncTarget: BeatSyncTarget;
  intensity: number; // 0..1
  sensitivity: number; // 0.3..1.8
  visualizerType: AudioVisualizerType;
  visualizerPosition: 'bottom' | 'top' | 'center';
  visualizerColor: string;
  visualizerOpacity: number; // 0.15..1
  visualizerHeight: number; // 0.5..1.8 multiplier
}

export const DEFAULT_BEAT_EFFECTS_CONFIG: BeatEffectsConfig = {
  effectType: 'none',
  syncTarget: 'both',
  intensity: 0.65,
  sensitivity: 1.0,
  visualizerType: 'none',
  visualizerPosition: 'bottom',
  visualizerColor: '#F59E0B',
  visualizerOpacity: 0.85,
  visualizerHeight: 1.0,
};

export interface BeatEffectPresetMeta {
  id: BeatVisualEffectType;
  label: string;
  description: string;
}

export const BEAT_VISUAL_EFFECT_PRESETS: BeatEffectPresetMeta[] = [
  { id: 'none', label: 'Clean', description: 'No beat motion effect' },
  { id: 'beat-bounce', label: 'Beat Bounce', description: 'Springy rhythmic pulse on kicks' },
  { id: 'zoom-pulse', label: 'Fast Zoom', description: 'Punchy camera zoom on drops' },
  { id: 'beat-shake', label: 'Bass Shake', description: 'Subtle energy shake on bass hits' },
  { id: 'ring-ripple', label: 'Ring Ripple', description: 'Luminous expanding rings on beats' },
  { id: 'flash-lamp', label: 'Flash Lamp', description: 'Warm stage glow flash on beats' },
  { id: 'rgb-glitch', label: 'Glitch Pulse', description: 'Chromatic beat dispersion accent' },
];

export interface AudioVisualizerPresetMeta {
  id: AudioVisualizerType;
  label: string;
  description: string;
}

export const AUDIO_VISUALIZER_PRESETS: AudioVisualizerPresetMeta[] = [
  { id: 'none', label: 'Off', description: 'Hide audio visualizer' },
  { id: 'spectrum-bars', label: 'EQ Bars', description: 'Mirrored 16-band studio equalizer bars' },
  { id: 'mirror-wave', label: 'Glow Wave', description: 'Smooth rhythmic ribbon waveform' },
  { id: 'circular-halo', label: 'Beat Halo', description: 'Radial circular frequency halo' },
  { id: 'pulse-line', label: 'Pulse Line', description: 'Minimal reactive bass ribbon' },
];

export interface AudioBeatAnalysis {
  fps: number;
  duration: number;
  energy: Float32Array;
  bass: Float32Array;
  beat: Float32Array;
  /** Flattened [frame * bandCount + band] normalized 0..1 */
  bands: Float32Array;
  bandCount: number;
  beatTimes: number[];
}

export interface SampledBeatFrame {
  energy: number;
  bass: number;
  beat: number;
  bands: number[];
}

export interface BeatVisualTransform {
  bgScale: number;
  bgOffsetX: number;
  bgOffsetY: number;
  lyricScale: number;
  lyricOffsetY: number;
  flashAlpha: number;
  rippleProgress: number;
  rippleAlpha: number;
  glitchOffsetPx: number;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Pure PCM beat & multi-band audio analyzer.
 * Produces deterministic 30Hz envelopes for both live canvas preview and Full HD WebCodecs export.
 */
export function computeAudioAnalysisFromPcm(
  pcm: Float32Array,
  sampleRate: number,
  analysisFps = 30,
  bandCount = 16
): AudioBeatAnalysis {
  const safeRate = Math.max(8000, sampleRate);
  const safeFps = Math.max(10, Math.round(analysisFps));
  const safeBands = Math.max(8, Math.min(32, Math.round(bandCount)));
  const duration = pcm.length > 0 ? pcm.length / safeRate : 0;
  const frameCount = Math.max(1, Math.ceil(duration * safeFps));

  const energy = new Float32Array(frameCount);
  const bass = new Float32Array(frameCount);
  const beat = new Float32Array(frameCount);
  const bands = new Float32Array(frameCount * safeBands);

  if (pcm.length === 0) {
    return {
      fps: safeFps,
      duration: 0,
      energy,
      bass,
      beat,
      bands,
      bandCount: safeBands,
      beatTimes: [],
    };
  }

  // First pass: extract frame RMS energy, low-pass bass energy, and mid/high flux
  const samplesPerFrame = Math.max(1, Math.floor(safeRate / safeFps));
  const rawBass = new Float32Array(frameCount);
  const rawMid = new Float32Array(frameCount);
  const rawHigh = new Float32Array(frameCount);

  // Simple 1-pole filters (~160Hz low-pass for bass, ~1400Hz mid-pass)
  const dt = 1 / safeRate;
  const bassAlpha = dt / (1 / (2 * Math.PI * 165) + dt);
  const midAlpha = dt / (1 / (2 * Math.PI * 1450) + dt);

  let lpBass = 0;
  let lpMid = 0;
  let maxEnergy = 0.0001;
  let maxBass = 0.0001;
  let maxMid = 0.0001;
  let maxHigh = 0.0001;

  for (let f = 0; f < frameCount; f++) {
    const start = f * samplesPerFrame;
    const end = Math.min(pcm.length, start + samplesPerFrame);
    const stride = Math.max(1, Math.floor((end - start) / 220));

    let sumSq = 0;
    let bassSq = 0;
    let midSq = 0;
    let highSq = 0;
    let count = 0;

    for (let i = start; i < end; i += stride) {
      const s = pcm[i];
      lpBass += bassAlpha * (s - lpBass);
      lpMid += midAlpha * (s - lpMid);
      const midVal = lpMid - lpBass;
      const highVal = s - lpMid;

      sumSq += s * s;
      bassSq += lpBass * lpBass;
      midSq += midVal * midVal;
      highSq += highVal * highVal;
      count++;
    }

    const inv = count > 0 ? 1 / count : 1;
    const eVal = Math.sqrt(sumSq * inv);
    const bVal = Math.sqrt(bassSq * inv);
    const mVal = Math.sqrt(midSq * inv);
    const hVal = Math.sqrt(highSq * inv);

    energy[f] = eVal;
    rawBass[f] = bVal;
    rawMid[f] = mVal;
    rawHigh[f] = hVal;

    if (eVal > maxEnergy) maxEnergy = eVal;
    if (bVal > maxBass) maxBass = bVal;
    if (mVal > maxMid) maxMid = mVal;
    if (hVal > maxHigh) maxHigh = hVal;
  }

  // Normalize energy & bass
  for (let f = 0; f < frameCount; f++) {
    energy[f] = clamp01(energy[f] / maxEnergy);
    bass[f] = clamp01(rawBass[f] / maxBass);
  }

  // Beat onset detection: compare bass+energy against short local moving average
  const windowHalf = Math.max(4, Math.round(safeFps * 0.35));
  const beatTimes: number[] = [];
  let decayedBeat = 0;
  let lastPeakFrame = -999;
  const minPeakGapFrames = Math.max(3, Math.round(safeFps * 0.22));

  for (let f = 0; f < frameCount; f++) {
    const wStart = Math.max(0, f - windowHalf);
    const wEnd = Math.min(frameCount - 1, f + Math.floor(windowHalf * 0.5));
    let avg = 0;
    let cnt = 0;
    for (let k = wStart; k <= wEnd; k++) {
      avg += bass[k] * 0.68 + energy[k] * 0.32;
      cnt++;
    }
    avg = cnt > 0 ? avg / cnt : 0;

    const current = bass[f] * 0.68 + energy[f] * 0.32;
    const prev = f > 0 ? bass[f - 1] * 0.68 + energy[f - 1] * 0.32 : 0;
    const flux = Math.max(0, current - prev);
    const excess = Math.max(0, current - avg * 1.12);

    const impulse = clamp01(excess * 3.4 + flux * 2.2);
    if (impulse > 0.34 && current > 0.18 && f - lastPeakFrame >= minPeakGapFrames) {
      decayedBeat = Math.min(1, Math.max(decayedBeat, 0.55 + impulse * 0.45));
      lastPeakFrame = f;
      beatTimes.push(Number((f / safeFps).toFixed(2)));
    } else {
      decayedBeat = Math.max(impulse * 0.72, decayedBeat * 0.8);
    }

    beat[f] = clamp01(decayedBeat);

    // Build smooth 16-band spectrum shaped by real bass / mid / high energy + musical bin resonance
    const normB = bass[f];
    const normM = clamp01(rawMid[f] / maxMid);
    const normH = clamp01(rawHigh[f] / maxHigh);
    const tSec = f / safeFps;

    for (let b = 0; b < safeBands; b++) {
      const frac = b / Math.max(1, safeBands - 1);
      // Blend bass -> mid -> high across frequency bins
      let baseVal: number;
      if (frac < 0.35) {
        const w = frac / 0.35;
        baseVal = normB * (1 - w * 0.35) + normM * (w * 0.35);
      } else if (frac < 0.72) {
        const w = (frac - 0.35) / 0.37;
        baseVal = normM * (1 - w * 0.4) + normB * 0.15 * (1 - w) + normH * (w * 0.45);
      } else {
        const w = (frac - 0.72) / 0.28;
        baseVal = normH * (0.75 + w * 0.25) + normM * (0.25 * (1 - w));
      }

      // Deterministic harmonic shimmer scaled strictly by real band energy (0 when silent)
      const shimmer =
        0.78 +
        0.22 *
          Math.sin(tSec * (5.2 + b * 1.17) + b * 0.9) *
          Math.cos(tSec * (2.3 + b * 0.41));
      const beatLift = frac < 0.45 ? beat[f] * 0.24 * (1 - frac) : beat[f] * 0.1;
      const val = clamp01(baseVal * shimmer + beatLift * (energy[f] > 0.04 ? 1 : 0));

      // Light temporal smoothing with previous frame
      const prevVal = f > 0 ? bands[(f - 1) * safeBands + b] : 0;
      bands[f * safeBands + b] = val > prevVal ? prevVal * 0.3 + val * 0.7 : prevVal * 0.68 + val * 0.32;
    }
  }

  return {
    fps: safeFps,
    duration,
    energy,
    bass,
    beat,
    bands,
    bandCount: safeBands,
    beatTimes,
  };
}

/**
 * Samples interpolated audio beat & spectrum values at any exact timestamp t.
 */
export function sampleBeatFrameAtTime(
  analysis: AudioBeatAnalysis | null | undefined,
  timeSeconds: number,
  sensitivity = 1.0
): SampledBeatFrame {
  const bandCount = analysis?.bandCount ?? 16;
  if (!analysis || analysis.energy.length === 0 || timeSeconds < 0) {
    return {
      energy: 0,
      bass: 0,
      beat: 0,
      bands: new Array(bandCount).fill(0),
    };
  }

  const exactFrame = timeSeconds * analysis.fps;
  const maxIdx = analysis.energy.length - 1;
  const i0 = Math.max(0, Math.min(maxIdx, Math.floor(exactFrame)));
  const i1 = Math.max(0, Math.min(maxIdx, i0 + 1));
  const frac = Math.max(0, Math.min(1, exactFrame - i0));
  const sens = Math.max(0.25, Math.min(2.0, sensitivity));

  const lerp = (a: number, b: number) => a + (b - a) * frac;

  const energy = clamp01(lerp(analysis.energy[i0], analysis.energy[i1]) * sens);
  const bass = clamp01(lerp(analysis.bass[i0], analysis.bass[i1]) * sens);
  const beat = clamp01(lerp(analysis.beat[i0], analysis.beat[i1]) * sens);

  const bands = new Array<number>(bandCount);
  const base0 = i0 * bandCount;
  const base1 = i1 * bandCount;
  for (let b = 0; b < bandCount; b++) {
    bands[b] = clamp01(lerp(analysis.bands[base0 + b], analysis.bands[base1 + b]) * sens);
  }

  return { energy, bass, beat, bands };
}

/**
 * Computes deterministic canvas transform / overlay parameters for the active beat effect.
 */
export function computeBeatVisualTransform(
  config: BeatEffectsConfig,
  sample: SampledBeatFrame,
  timeSeconds: number
): BeatVisualTransform {
  const neutral: BeatVisualTransform = {
    bgScale: 1,
    bgOffsetX: 0,
    bgOffsetY: 0,
    lyricScale: 1,
    lyricOffsetY: 0,
    flashAlpha: 0,
    rippleProgress: 0,
    rippleAlpha: 0,
    glitchOffsetPx: 0,
  };

  const intensity = clamp01(config.intensity);
  if (config.effectType === 'none' || intensity <= 0.01) {
    return neutral;
  }

  const pulse = clamp01(sample.beat * 0.78 + sample.bass * 0.22);
  const applyBg = config.syncTarget === 'background' || config.syncTarget === 'both';
  const applyLyrics = config.syncTarget === 'lyrics' || config.syncTarget === 'both';

  switch (config.effectType) {
    case 'beat-bounce': {
      const bgScale = applyBg ? 1 + pulse * 0.055 * intensity : 1;
      const lyricScale = applyLyrics ? 1 + pulse * 0.075 * intensity : 1;
      const lyricOffsetY = applyLyrics ? -pulse * 12 * intensity : 0;
      return {
        ...neutral,
        bgScale,
        lyricScale,
        lyricOffsetY,
      };
    }
    case 'zoom-pulse': {
      const punch = Math.pow(pulse, 1.35);
      return {
        ...neutral,
        bgScale: applyBg ? 1 + punch * 0.11 * intensity : 1,
        lyricScale: applyLyrics ? 1 + punch * 0.06 * intensity : 1,
      };
    }
    case 'beat-shake': {
      const amp = Math.pow(pulse, 1.4) * 18 * intensity;
      const ox = Math.sin(timeSeconds * 47.0) * amp;
      const oy = Math.cos(timeSeconds * 39.0) * amp * 0.7;
      return {
        ...neutral,
        bgScale: applyBg ? 1 + 0.03 * intensity : 1, // slight overscan so edges stay covered
        bgOffsetX: applyBg ? ox : 0,
        bgOffsetY: applyBg ? oy : 0,
        lyricOffsetY: applyLyrics ? oy * 0.55 : 0,
      };
    }
    case 'ring-ripple': {
      return {
        ...neutral,
        bgScale: applyBg ? 1 + pulse * 0.03 * intensity : 1,
        lyricScale: applyLyrics ? 1 + pulse * 0.035 * intensity : 1,
        rippleProgress: (timeSeconds * 1.15) % 1,
        rippleAlpha: clamp01((0.2 + pulse * 0.8) * intensity),
      };
    }
    case 'flash-lamp': {
      return {
        ...neutral,
        bgScale: applyBg ? 1 + pulse * 0.025 * intensity : 1,
        flashAlpha: clamp01(Math.pow(pulse, 1.25) * 0.36 * intensity),
      };
    }
    case 'rgb-glitch': {
      const trig = pulse > 0.32 ? (pulse - 0.32) / 0.68 : 0;
      return {
        ...neutral,
        bgScale: applyBg ? 1 + trig * 0.04 * intensity : 1,
        lyricScale: applyLyrics ? 1 + trig * 0.045 * intensity : 1,
        glitchOffsetPx: trig * 14 * intensity,
      };
    }
    default:
      return neutral;
  }
}
