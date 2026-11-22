export type BeatVisualEffectType =
  | 'none'
  | 'beat-bounce'
  | 'zoom-pulse'
  | 'beat-shake'
  | 'ring-ripple'
  | 'flash-lamp'
  | 'rgb-glitch'
  | 'neon-rush'
  | 'lightning-vortex'
  | 'abstract-glitter'
  | 'ghost-clone'
  | 'neon-outline'
  | 'heart-particles'
  | 'speed-lines';

export type AudioVisualizerType =
  | 'none'
  | 'spectrum-bars'
  | 'iridescent-bars'
  | 'dot-matrix'
  | 'mirror-wave'
  | 'waving-line'
  | 'circular-halo'
  | 'iridescent-circle'
  | 'bass-blob'
  | 'audio-spectrum'
  | 'color-ribbon'
  | 'border-spectrum'
  | 'pulse-particles'
  | 'pulse-line';

export type BeatSyncTarget = 'background' | 'character' | 'lyrics' | 'both';

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
  intensity: 0.72,
  sensitivity: 1.05,
  visualizerType: 'none',
  visualizerPosition: 'bottom',
  visualizerColor: '#F59E0B',
  visualizerOpacity: 0.9,
  visualizerHeight: 1.0,
};

export interface BeatEffectPresetMeta {
  id: BeatVisualEffectType;
  label: string;
  description: string;
  category: 'motion' | 'body';
  accent: string;
}

export const BEAT_VISUAL_EFFECT_PRESETS: BeatEffectPresetMeta[] = [
  {
    id: 'none',
    label: 'Clean',
    description: 'No beat visual effect',
    category: 'motion',
    accent: '#71717A',
  },
  {
    id: 'beat-bounce',
    label: 'Beat Bounce',
    description: 'Springy rhythmic bounce on kicks',
    category: 'motion',
    accent: '#F59E0B',
  },
  {
    id: 'zoom-pulse',
    label: 'Fast Zoom',
    description: 'Punchy camera zoom on drops',
    category: 'motion',
    accent: '#38BDF8',
  },
  {
    id: 'beat-shake',
    label: 'Bass Shake',
    description: 'Dynamic impact shake on bass hits',
    category: 'motion',
    accent: '#FB7185',
  },
  {
    id: 'ring-ripple',
    label: 'Ring Ripple',
    description: 'Luminous expanding rings on beats',
    category: 'motion',
    accent: '#22D3EE',
  },
  {
    id: 'flash-lamp',
    label: 'Flash Lamp',
    description: 'Warm stage strobe glow on drops',
    category: 'motion',
    accent: '#FBBF24',
  },
  {
    id: 'rgb-glitch',
    label: 'Glitch Pulse',
    description: 'Chromatic RGB split & scanlines',
    category: 'motion',
    accent: '#F43F5E',
  },
  {
    id: 'neon-rush',
    label: 'Neon Rush',
    description: 'Radial cyber light beams on beat',
    category: 'body',
    accent: '#E879F9',
  },
  {
    id: 'lightning-vortex',
    label: 'Lightning Vortex',
    description: 'Electric arcs crackling on drops',
    category: 'body',
    accent: '#60A5FA',
  },
  {
    id: 'abstract-glitter',
    label: 'Abstract Glitter',
    description: 'Shimmering stardust synced to highs',
    category: 'body',
    accent: '#FDE68A',
  },
  {
    id: 'ghost-clone',
    label: 'Ghost Clone',
    description: 'Swinging echo clones on character',
    category: 'body',
    accent: '#A78BFA',
  },
  {
    id: 'neon-outline',
    label: 'Neon Outline',
    description: 'Pulsing luminous aura on subject',
    category: 'body',
    accent: '#2DD4BF',
  },
  {
    id: 'heart-particles',
    label: 'Love Hearts',
    description: 'Floating glowing hearts on rhythm',
    category: 'body',
    accent: '#FB7185',
  },
  {
    id: 'speed-lines',
    label: 'Speed Lines',
    description: 'Anime kinetic burst rays on kicks',
    category: 'body',
    accent: '#F8FAFC',
  },
];

export interface AudioVisualizerPresetMeta {
  id: AudioVisualizerType;
  label: string;
  description: string;
  palette: [string, string];
  styleTag: 'bars' | 'wave' | 'circle' | 'edge';
}

export const AUDIO_VISUALIZER_PRESETS: AudioVisualizerPresetMeta[] = [
  {
    id: 'none',
    label: 'Off',
    description: 'Hide audio visualizer',
    palette: ['#52525B', '#3F3F46'],
    styleTag: 'bars',
  },
  {
    id: 'spectrum-bars',
    label: 'Studio EQ Bars',
    description: 'Crisp mirrored white/accent studio equalizer',
    palette: ['#F8FAFC', '#F59E0B'],
    styleTag: 'bars',
  },
  {
    id: 'iridescent-bars',
    label: 'Iridescent Wave',
    description: 'Cyan-violet-magenta glowing digital bars',
    palette: ['#22D3EE', '#EC4899'],
    styleTag: 'bars',
  },
  {
    id: 'dot-matrix',
    label: 'Digital Matrix',
    description: 'LED segmented pixel dots bouncing to beats',
    palette: ['#E2E8F0', '#38BDF8'],
    styleTag: 'bars',
  },
  {
    id: 'mirror-wave',
    label: 'Iridescent Ribbon',
    description: 'Smooth gradient mirrored bass waveform',
    palette: ['#38BDF8', '#F43F5E'],
    styleTag: 'wave',
  },
  {
    id: 'waving-line',
    label: 'Neon Waving Line',
    description: 'Electric glowing silk frequency curve',
    palette: ['#22D3EE', '#F472B6'],
    styleTag: 'wave',
  },
  {
    id: 'circular-halo',
    label: 'Circle Spectrum',
    description: '360° radial white/accent frequency rays',
    palette: ['#F8FAFC', '#F59E0B'],
    styleTag: 'circle',
  },
  {
    id: 'iridescent-circle',
    label: 'Iridescent Circle',
    description: 'Neon magenta-cyan radial beat ring',
    palette: ['#EC4899', '#22D3EE'],
    styleTag: 'circle',
  },
  {
    id: 'bass-blob',
    label: 'Bass Drops',
    description: 'Organic liquid neon ring morphing to bass',
    palette: ['#6366F1', '#EC4899'],
    styleTag: 'circle',
  },
  {
    id: 'audio-spectrum',
    label: 'Audio Spectrum',
    description: 'Fine crisp studio needle oscilloscope spikes',
    palette: ['#E2E8F0', '#94A3B8'],
    styleTag: 'wave',
  },
  {
    id: 'color-ribbon',
    label: 'Color Sine Wave',
    description: 'Layered RGB-CMY interlocking music waves',
    palette: ['#34D399', '#F43F5E'],
    styleTag: 'wave',
  },
  {
    id: 'border-spectrum',
    label: 'Border Spectrum',
    description: 'Frame-hugging top & bottom club equalizer',
    palette: ['#A855F7', '#38BDF8'],
    styleTag: 'edge',
  },
  {
    id: 'pulse-particles',
    label: 'Beat Pulse Halo',
    description: 'Sparkling ring & floating rhythm particles',
    palette: ['#F472B6', '#FBBF24'],
    styleTag: 'edge',
  },
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
  charScale: number;
  charOffsetX: number;
  charOffsetY: number;
  lyricScale: number;
  lyricOffsetY: number;
  flashAlpha: number;
  rippleProgress: number;
  rippleAlpha: number;
  glitchOffsetPx: number;
  fxEnergy: number;
  fxPulse: number;
  cloneSpreadPx: number;
  outlineGlowAlpha: number;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function percentileFromSorted(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

/**
 * Pure PCM beat & 24-band logarithmic frequency analyzer (Goertzel + adaptive dynamic range).
 * Handles both dynamic acoustic tracks AND brickwall-compressed mastered pop/dance MP3s so
 * beat pulses and all 24 spectrum bars dance vigorously in live preview, scrubbing, and HD export.
 */
export function computeAudioAnalysisFromPcm(
  pcm: Float32Array,
  sampleRate: number,
  analysisFps = 30,
  bandCount = 24
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

  // Build logarithmically spaced target center frequencies from 55 Hz up to min(10500 Hz, 0.44 * sr)
  const minFreq = 55;
  const maxFreq = Math.min(10500, safeRate * 0.44);
  const logRatio = Math.pow(maxFreq / minFreq, 1 / Math.max(1, safeBands - 1));

  // Window size for Goertzel spectral estimation: ~256 samples downsampled cleanly to keep low freqs crisp
  const winLen = 256;
  const hann = new Float32Array(winLen);
  for (let n = 0; n < winLen; n++) {
    hann[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (winLen - 1)));
  }

  // Choose stride so effective sampling rate for Goertzel covers maxFreq cleanly (~22kHz effective)
  const sampleStride = safeRate > 32000 ? 2 : 1;
  const effRate = safeRate / sampleStride;

  const goertzelCoeffs = new Float32Array(safeBands);
  for (let b = 0; b < safeBands; b++) {
    const freq = Math.min(effRate * 0.46, minFreq * Math.pow(logRatio, b));
    const omega = (2 * Math.PI * freq) / effRate;
    goertzelCoeffs[b] = 2 * Math.cos(omega);
  }

  const samplesPerFrame = Math.max(1, Math.floor(safeRate / safeFps));
  const rawBands = new Float32Array(frameCount * safeBands);
  const rawEnergy = new Float32Array(frameCount);
  const rawBass = new Float32Array(frameCount);
  const slice = new Float32Array(winLen);

  let globalPeakRms = 0;

  for (let f = 0; f < frameCount; f++) {
    const center = Math.min(pcm.length - 1, f * samplesPerFrame + Math.floor(samplesPerFrame * 0.5));
    const halfSpan = Math.floor((winLen * sampleStride) / 2);
    const startIdx = Math.max(0, center - halfSpan);

    let sumSq = 0;
    for (let n = 0; n < winLen; n++) {
      const idx = startIdx + n * sampleStride;
      const s = idx < pcm.length ? pcm[idx] : 0;
      sumSq += s * s;
      slice[n] = s * hann[n];
    }

    const rms = Math.sqrt(sumSq / winLen);
    rawEnergy[f] = rms;
    if (rms > globalPeakRms) globalPeakRms = rms;

    // Evaluate all frequency bands via Goertzel recurrence
    let bassAccum = 0;
    const bassBandLimit = Math.max(3, Math.floor(safeBands * 0.25));
    const frameOffset = f * safeBands;

    for (let b = 0; b < safeBands; b++) {
      const coeff = goertzelCoeffs[b];
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      for (let n = 0; n < winLen; n++) {
        s0 = slice[n] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      const power = Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2);
      const mag = Math.sqrt(power) / (winLen * 0.5);
      // Slight perceptual tilt so high frequencies are visible alongside heavy sub-bass
      const tilt = 1 + (b / safeBands) * 0.75;
      const weighted = mag * tilt;
      rawBands[frameOffset + b] = weighted;
      if (b < bassBandLimit) {
        bassAccum += mag;
      }
    }
    rawBass[f] = bassAccum / bassBandLimit;
  }

  // Silence guard: completely silent audio produces all-zero envelopes
  if (globalPeakRms < 1e-4) {
    return {
      fps: safeFps,
      duration,
      energy,
      bass,
      beat,
      bands,
      bandCount: safeBands,
      beatTimes: [],
    };
  }

  // Adaptive percentile normalization per band (12th -> 96th percentile)
  // This breaks through brickwall mastering compression so loud pop/dance songs still jump 0..1!
  const scratch = new Float32Array(frameCount);

  const normalizeAdaptive = (
    src: Float32Array,
    dst: Float32Array,
    lowPct: number,
    highPct: number,
    gamma: number
  ) => {
    scratch.set(src);
    scratch.sort();
    const pLow = percentileFromSorted(scratch, lowPct);
    const pHigh = Math.max(percentileFromSorted(scratch, highPct), pLow + 1e-4);
    const peak = Math.max(scratch[frameCount - 1], 1e-4);
    // Keep a gentle floor blend so genuinely quiet frames stay low while loud compressed sections expand
    const floor = pLow * 0.72;
    const span = Math.max(peak * 0.08, pHigh - floor);

    for (let f = 0; f < frameCount; f++) {
      if (rawEnergy[f] < 1e-4) {
        dst[f] = 0;
      } else {
        const norm = clamp01((src[f] - floor) / span);
        dst[f] = Math.pow(norm, gamma);
      }
    }
  };

  normalizeAdaptive(rawEnergy, energy, 0.1, 0.96, 0.85);
  normalizeAdaptive(rawBass, bass, 0.12, 0.95, 0.88);

  const bandColumn = new Float32Array(frameCount);
  for (let b = 0; b < safeBands; b++) {
    for (let f = 0; f < frameCount; f++) {
      bandColumn[f] = rawBands[f * safeBands + b];
    }
    scratch.set(bandColumn);
    scratch.sort();
    const pLow = percentileFromSorted(scratch, 0.14);
    const pHigh = Math.max(percentileFromSorted(scratch, 0.96), pLow + 1e-4);
    const peak = Math.max(scratch[frameCount - 1], 1e-4);
    const floor = pLow * 0.68;
    const span = Math.max(peak * 0.1, pHigh - floor);

    for (let f = 0; f < frameCount; f++) {
      if (rawEnergy[f] < 1e-4) {
        bands[f * safeBands + b] = 0;
        continue;
      }
      const norm = clamp01((bandColumn[f] - floor) / span);
      // Slight punch curve so peaks leap visually without flattening mid-levels
      const shaped = Math.pow(norm, 0.92);
      const prev = f > 0 ? bands[(f - 1) * safeBands + b] : 0;
      // Fast attack (0.82) + smooth musical release (0.58) for snappy real-time motion
      bands[f * safeBands + b] =
        shaped >= prev ? prev * 0.18 + shaped * 0.82 : prev * 0.58 + shaped * 0.42;
    }
  }

  // Spectral flux + low-end onset curve for reliable beat triggers across all genres
  const onset = new Float32Array(frameCount);
  const bassBandCount = Math.max(4, Math.floor(safeBands * 0.35));

  for (let f = 0; f < frameCount; f++) {
    if (rawEnergy[f] < 1e-4) {
      onset[f] = 0;
      continue;
    }
    let bassFlux = 0;
    let fullFlux = 0;
    if (f > 0) {
      for (let b = 0; b < safeBands; b++) {
        const diff = Math.max(0, bands[f * safeBands + b] - bands[(f - 1) * safeBands + b]);
        fullFlux += diff;
        if (b < bassBandCount) bassFlux += diff;
      }
      bassFlux /= bassBandCount;
      fullFlux /= safeBands;
    }
    const bassDiff = f > 0 ? Math.max(0, bass[f] - bass[f - 1]) : bass[f];
    const energyDiff = f > 0 ? Math.max(0, energy[f] - energy[f - 1]) : energy[f];
    onset[f] =
      bassFlux * 1.45 +
      fullFlux * 0.65 +
      bassDiff * 1.15 +
      energyDiff * 0.5 +
      bass[f] * 0.22;
  }

  // Adaptive local threshold (mean + 0.58 * stdDev) over ~0.75s sliding window
  const winHalf = Math.max(5, Math.round(safeFps * 0.38));
  const minPeakGapFrames = Math.max(3, Math.round(safeFps * 0.21));
  const beatTimes: number[] = [];
  let lastPeakFrame = -999;
  let decayedBeat = 0;

  for (let f = 0; f < frameCount; f++) {
    if (rawEnergy[f] < 1e-4) {
      decayedBeat *= 0.6;
      beat[f] = decayedBeat;
      continue;
    }

    const wStart = Math.max(0, f - winHalf);
    const wEnd = Math.min(frameCount - 1, f + Math.floor(winHalf * 0.6));
    let sum = 0;
    let cnt = 0;
    for (let k = wStart; k <= wEnd; k++) {
      sum += onset[k];
      cnt++;
    }
    const mean = cnt > 0 ? sum / cnt : 0;
    let varSum = 0;
    for (let k = wStart; k <= wEnd; k++) {
      const d = onset[k] - mean;
      varSum += d * d;
    }
    const stdDev = cnt > 0 ? Math.sqrt(varSum / cnt) : 0;

    const threshold = mean + Math.max(0.025, stdDev * 0.58);
    const val = onset[f];
    const isLocalMax =
      (f === 0 || val >= onset[f - 1] * 0.96) &&
      (f === frameCount - 1 || val >= onset[f + 1] * 0.96);

    const excess = Math.max(0, val - threshold);
    const impulse = clamp01(excess / Math.max(0.06, stdDev * 1.35 + 0.05));

    if (
      isLocalMax &&
      val > threshold &&
      (bass[f] > 0.14 || energy[f] > 0.16) &&
      f - lastPeakFrame >= minPeakGapFrames
    ) {
      decayedBeat = Math.min(1, Math.max(decayedBeat, 0.68 + impulse * 0.32));
      lastPeakFrame = f;
      beatTimes.push(Number((f / safeFps).toFixed(2)));
    } else {
      // Snappy release + micro groove pulse so beat visuals breathe between kicks
      decayedBeat = Math.max(impulse * 0.55, decayedBeat * 0.78);
    }

    beat[f] = clamp01(decayedBeat);

    // Subtle bass-beat punch into lowest bands so kicks visually slam the visualizer
    if (beat[f] > 0.25) {
      const kickBoost = beat[f] * 0.22;
      for (let b = 0; b < bassBandCount; b++) {
        const w = 1 - b / bassBandCount;
        const idx = f * safeBands + b;
        bands[idx] = clamp01(bands[idx] + kickBoost * w);
      }
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
  const bandCount = analysis?.bandCount ?? 24;
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
  if (exactFrame > maxIdx + 2) {
    return {
      energy: 0,
      bass: 0,
      beat: 0,
      bands: new Array(bandCount).fill(0),
    };
  }
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
 * Computes deterministic canvas transform / overlay parameters for the active beat or body effect.
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
    charScale: 1,
    charOffsetX: 0,
    charOffsetY: 0,
    lyricScale: 1,
    lyricOffsetY: 0,
    flashAlpha: 0,
    rippleProgress: 0,
    rippleAlpha: 0,
    glitchOffsetPx: 0,
    fxEnergy: 0,
    fxPulse: 0,
    cloneSpreadPx: 0,
    outlineGlowAlpha: 0,
  };

  const intensity = clamp01(config.intensity);
  if (config.effectType === 'none' || intensity <= 0.01) {
    return neutral;
  }

  const pulse = clamp01(sample.beat * 0.76 + sample.bass * 0.24);
  const energy = clamp01(sample.energy * 0.65 + sample.bass * 0.35);
  const applyBg = config.syncTarget === 'background' || config.syncTarget === 'both';
  const applyChar = config.syncTarget === 'character' || config.syncTarget === 'both';
  const applyLyrics = config.syncTarget === 'lyrics' || config.syncTarget === 'both';

  switch (config.effectType) {
    case 'beat-bounce': {
      const bgScale = applyBg ? 1 + pulse * 0.065 * intensity : 1;
      const charScale = applyChar ? 1 + pulse * 0.08 * intensity : 1;
      const charOffsetY = applyChar ? -pulse * 16 * intensity : 0;
      const lyricScale = applyLyrics ? 1 + pulse * 0.075 * intensity : 1;
      const lyricOffsetY = applyLyrics ? -pulse * 14 * intensity : 0;
      return {
        ...neutral,
        bgScale,
        charScale,
        charOffsetY,
        lyricScale,
        lyricOffsetY,
        fxEnergy: energy * intensity,
        fxPulse: pulse * intensity,
      };
    }
    case 'zoom-pulse': {
      const punch = Math.pow(pulse, 1.25);
      return {
        ...neutral,
        bgScale: applyBg ? 1 + punch * 0.13 * intensity : 1,
        charScale: applyChar ? 1 + punch * 0.11 * intensity : 1,
        lyricScale: applyLyrics ? 1 + punch * 0.07 * intensity : 1,
        fxEnergy: energy * intensity,
        fxPulse: punch * intensity,
      };
    }
    case 'beat-shake': {
      const amp = Math.pow(pulse, 1.3) * 22 * intensity;
      const ox = Math.sin(timeSeconds * 47.0) * amp;
      const oy = Math.cos(timeSeconds * 39.0) * amp * 0.72;
      return {
        ...neutral,
        bgScale: applyBg ? 1 + 0.035 * intensity : 1,
        bgOffsetX: applyBg ? ox : 0,
        bgOffsetY: applyBg ? oy : 0,
        charOffsetX: applyChar ? ox * 0.85 : 0,
        charOffsetY: applyChar ? oy * 0.85 : 0,
        lyricOffsetY: applyLyrics ? oy * 0.55 : 0,
        fxEnergy: energy * intensity,
        fxPulse: pulse * intensity,
      };
    }
    case 'ring-ripple': {
      return {
        ...neutral,
        bgScale: applyBg ? 1 + pulse * 0.035 * intensity : 1,
        charScale: applyChar ? 1 + pulse * 0.04 * intensity : 1,
        lyricScale: applyLyrics ? 1 + pulse * 0.04 * intensity : 1,
        rippleProgress: (timeSeconds * 1.15) % 1,
        rippleAlpha: clamp01((0.25 + pulse * 0.75) * intensity),
        fxEnergy: energy * intensity,
        fxPulse: pulse * intensity,
      };
    }
    case 'flash-lamp': {
      return {
        ...neutral,
        bgScale: applyBg ? 1 + pulse * 0.03 * intensity : 1,
        charScale: applyChar ? 1 + pulse * 0.025 * intensity : 1,
        flashAlpha: clamp01(Math.pow(pulse, 1.15) * 0.44 * intensity),
        fxEnergy: energy * intensity,
        fxPulse: pulse * intensity,
      };
    }
    case 'rgb-glitch': {
      const trig = pulse > 0.25 ? (pulse - 0.25) / 0.75 : 0;
      return {
        ...neutral,
        bgScale: applyBg ? 1 + trig * 0.045 * intensity : 1,
        charScale: applyChar ? 1 + trig * 0.05 * intensity : 1,
        lyricScale: applyLyrics ? 1 + trig * 0.045 * intensity : 1,
        glitchOffsetPx: trig * 16 * intensity,
        fxEnergy: energy * intensity,
        fxPulse: trig * intensity,
      };
    }
    case 'neon-rush': {
      return {
        ...neutral,
        bgScale: applyBg ? 1 + pulse * 0.05 * intensity : 1,
        charScale: applyChar ? 1 + pulse * 0.055 * intensity : 1,
        lyricScale: applyLyrics ? 1 + pulse * 0.04 * intensity : 1,
        fxEnergy: clamp01((0.3 + energy * 0.7) * intensity),
        fxPulse: clamp01((0.25 + pulse * 0.75) * intensity),
      };
    }
    case 'lightning-vortex': {
      const spark = Math.pow(pulse, 1.1);
      return {
        ...neutral,
        bgScale: applyBg ? 1 + spark * 0.04 * intensity : 1,
        charScale: applyChar ? 1 + spark * 0.045 * intensity : 1,
        flashAlpha: clamp01(spark * 0.22 * intensity),
        fxEnergy: clamp01((0.28 + energy * 0.72) * intensity),
        fxPulse: clamp01(spark * intensity),
      };
    }
    case 'abstract-glitter': {
      return {
        ...neutral,
        bgScale: applyBg ? 1 + pulse * 0.025 * intensity : 1,
        charScale: applyChar ? 1 + pulse * 0.03 * intensity : 1,
        fxEnergy: clamp01((0.35 + energy * 0.65) * intensity),
        fxPulse: clamp01(pulse * intensity),
      };
    }
    case 'ghost-clone': {
      const sway = (0.28 + pulse * 0.72) * intensity;
      return {
        ...neutral,
        charScale: applyChar ? 1 + pulse * 0.045 * intensity : 1,
        bgScale: applyBg ? 1 + pulse * 0.025 * intensity : 1,
        cloneSpreadPx: (24 + pulse * 86) * intensity,
        fxEnergy: clamp01(sway),
        fxPulse: clamp01(pulse * intensity),
      };
    }
    case 'neon-outline': {
      return {
        ...neutral,
        charScale: applyChar ? 1 + pulse * 0.04 * intensity : 1,
        lyricScale: applyLyrics ? 1 + pulse * 0.03 * intensity : 1,
        outlineGlowAlpha: clamp01((0.35 + pulse * 0.65) * intensity),
        fxEnergy: clamp01((0.35 + energy * 0.65) * intensity),
        fxPulse: clamp01(pulse * intensity),
      };
    }
    case 'heart-particles': {
      return {
        ...neutral,
        charScale: applyChar ? 1 + pulse * 0.035 * intensity : 1,
        lyricScale: applyLyrics ? 1 + pulse * 0.03 * intensity : 1,
        fxEnergy: clamp01((0.35 + energy * 0.65) * intensity),
        fxPulse: clamp01(pulse * intensity),
      };
    }
    case 'speed-lines': {
      return {
        ...neutral,
        bgScale: applyBg ? 1 + pulse * 0.06 * intensity : 1,
        charScale: applyChar ? 1 + pulse * 0.05 * intensity : 1,
        fxEnergy: clamp01((0.3 + energy * 0.7) * intensity),
        fxPulse: clamp01(pulse * intensity),
      };
    }
    default:
      return neutral;
  }
}
