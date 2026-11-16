import { LyricCue, WordTiming } from './lyrics-parser';

export interface VocalRegion {
  startTime: number;
  endTime: number;
  energy: number;
}

export interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

export interface WhisperSegment {
  startTime: number;
  endTime: number;
  text: string;
}

export interface TimedWord {
  word: string;
  norm: string;
  startTime: number;
  endTime: number;
}

export interface AudioBufferEnvelope {
  frameDuration: number;
  rms: Float32Array;
  flux: Float32Array;
  voiced: Float32Array;
  zcr: Float32Array;
  vocalMask: Uint8Array;
  threshold: number;
  duration: number;
  regions: VocalRegion[];
}

/**
 * Estimates normalized pitch periodicity (0..1) via fast lag-domain autocorrelation
 * over human vocal frequencies (85 Hz .. 900 Hz) so pitched singing stays active
 * while unvoiced drum hits, hi-hats, and broadband noise are rejected.
 */
function estimateFrameVoicing(
  samples: Float32Array,
  start: number,
  frameSize: number,
  sampleRate: number
): { voiced: number; zcr: number } {
  const end = Math.min(samples.length, start + frameSize);
  const len = end - start;
  if (len < 16) return { voiced: 0, zcr: 0 };

  let zeroCrossings = 0;
  let energy0 = 0;
  let mean = 0;
  for (let i = start; i < end; i++) {
    mean += samples[i];
  }
  mean /= len;

  for (let i = start; i < end; i++) {
    const v = samples[i] - mean;
    energy0 += v * v;
    if (i > start) {
      const prev = samples[i - 1] - mean;
      if ((v >= 0 && prev < 0) || (v < 0 && prev >= 0)) {
        zeroCrossings++;
      }
    }
  }

  const zcr = zeroCrossings / Math.max(1, len - 1);
  if (energy0 <= 1e-9) return { voiced: 0, zcr };

  // High zero-crossing rate (> 0.44) indicates unvoiced hiss / hi-hat cymbals
  if (zcr > 0.44) return { voiced: 0.05, zcr };

  const minLag = Math.max(4, Math.floor(sampleRate / 900));
  const maxLag = Math.min(Math.floor(len * 0.72), Math.floor(sampleRate / 85));
  if (maxLag <= minLag) return { voiced: 0.5, zcr };

  const step = sampleRate >= 12000 ? 2 : 1;
  let maxNormCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let cross = 0;
    let eA = 0;
    let eB = 0;
    const limit = len - lag;
    for (let j = 0; j < limit; j += step) {
      const a = samples[start + j] - mean;
      const b = samples[start + j + lag] - mean;
      cross += a * b;
      eA += a * a;
      eB += b * b;
    }
    const denom = Math.sqrt(eA * eB);
    if (denom > 1e-9) {
      const corr = cross / denom;
      if (corr > maxNormCorr) maxNormCorr = corr;
    }
  }

  return {
    voiced: Math.max(0, Math.min(1, maxNormCorr)),
    zcr,
  };
}

/**
 * Analyzes vocal-band PCM samples (e.g. 16 kHz Float32Array) at 20 ms resolution:
 * - Pre-emphasis filter (x[n] - 0.85 * x[n-1]) suppresses sub-bass kick/rumble
 * - Computes frame RMS, positive onset flux (dE/dt), ZCR, and harmonic voicing periodicity
 * - Produces `vocalMask` and distinct sung phrase regions without blurring instrumental breaks
 */
export function analyzeAudioBuffer(
  samples: Float32Array,
  sampleRate: number
): AudioBufferEnvelope {
  const frameDuration = 0.02; // 20ms precision
  if (samples.length === 0 || sampleRate <= 0) {
    return {
      frameDuration,
      rms: new Float32Array(0),
      flux: new Float32Array(0),
      voiced: new Float32Array(0),
      zcr: new Float32Array(0),
      vocalMask: new Uint8Array(0),
      threshold: 0,
      duration: 0,
      regions: [],
    };
  }

  const totalDuration = samples.length / sampleRate;
  const frameSize = Math.max(1, Math.floor(sampleRate * frameDuration));
  const numFrames = Math.floor(samples.length / frameSize);
  if (numFrames === 0) {
    return {
      frameDuration,
      rms: new Float32Array(0),
      flux: new Float32Array(0),
      voiced: new Float32Array(0),
      zcr: new Float32Array(0),
      vocalMask: new Uint8Array(0),
      threshold: 0,
      duration: totalDuration,
      regions: [],
    };
  }

  const rms = new Float32Array(numFrames);
  const flux = new Float32Array(numFrames);
  const voiced = new Float32Array(numFrames);
  const zcr = new Float32Array(numFrames);
  const vocalMask = new Uint8Array(numFrames);
  let maxRms = 0;

  for (let f = 0; f < numFrames; f++) {
    const start = f * frameSize;
    let sumSq = 0;
    let prev = start > 0 ? samples[start - 1] : samples[start];
    for (let i = start; i < start + frameSize; i++) {
      const hp = samples[i] - 0.85 * prev;
      prev = samples[i];
      sumSq += hp * hp;
    }
    const val = Math.sqrt(sumSq / frameSize);
    rms[f] = val;
    if (val > maxRms) maxRms = val;
    flux[f] = f > 0 ? Math.max(0, val - rms[f - 1]) : val;
  }

  if (maxRms < 0.002) {
    return {
      frameDuration,
      rms,
      flux,
      voiced,
      zcr,
      vocalMask,
      threshold: 0,
      duration: totalDuration,
      regions: [],
    };
  }

  const sorted = Array.from(rms).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.22)] ?? 0;
  const threshold = Math.max(floor * 1.9, maxRms * 0.14);

  // Evaluate pitch periodicity & ZCR only on frames above 65% of energy threshold
  for (let f = 0; f < numFrames; f++) {
    if (rms[f] >= threshold * 0.65) {
      const stats = estimateFrameVoicing(samples, f * frameSize, frameSize, sampleRate);
      voiced[f] = stats.voiced;
      zcr[f] = stats.zcr;
      if (rms[f] >= threshold && stats.voiced >= 0.3 && stats.zcr <= 0.42) {
        vocalMask[f] = 1;
      }
    }
  }

  // Smooth single-frame (20ms) isolated consonant dips inside active voiced syllables
  for (let f = 1; f < numFrames - 1; f++) {
    if (vocalMask[f] === 0 && vocalMask[f - 1] === 1 && vocalMask[f + 1] === 1 && rms[f] >= threshold * 0.65) {
      vocalMask[f] = 1;
    }
  }

  // Fallback for edge cases where energy exceeds threshold cleanly with sparse periodicity
  let totalMasked = 0;
  for (let f = 0; f < numFrames; f++) totalMasked += vocalMask[f];
  if (totalMasked === 0) {
    for (let f = 0; f < numFrames; f++) {
      if (rms[f] >= threshold && zcr[f] <= 0.42) {
        vocalMask[f] = 1;
      }
    }
  }

  const rawRegions: VocalRegion[] = [];
  let inRegion = false;
  let regionStartFrame = 0;
  let energySum = 0;

  for (let f = 0; f < numFrames; f++) {
    const active = vocalMask[f] === 1;
    if (active && !inRegion) {
      inRegion = true;
      regionStartFrame = f;
      energySum = rms[f];
    } else if (active && inRegion) {
      energySum += rms[f];
    } else if (!active && inRegion) {
      inRegion = false;
      const count = Math.max(1, f - regionStartFrame);
      rawRegions.push({
        startTime: Number((regionStartFrame * frameDuration).toFixed(2)),
        endTime: Number((f * frameDuration).toFixed(2)),
        energy: energySum / count,
      });
    }
  }

  if (inRegion) {
    const count = Math.max(1, numFrames - regionStartFrame);
    rawRegions.push({
      startTime: Number((regionStartFrame * frameDuration).toFixed(2)),
      endTime: Number((numFrames * frameDuration).toFixed(2)),
      energy: energySum / count,
    });
  }

  // Bridge only short <= 0.24s intra-phrase consonant pauses; leave true pauses >= 0.25s idle
  const merged: VocalRegion[] = [];
  for (const reg of rawRegions) {
    const last = merged[merged.length - 1];
    if (last && reg.startTime - last.endTime <= 0.24) {
      last.endTime = reg.endTime;
      last.energy = (last.energy + reg.energy) / 2;
    } else {
      merged.push({ ...reg });
    }
  }

  return {
    frameDuration,
    rms,
    flux,
    voiced,
    zcr,
    vocalMask,
    threshold,
    duration: totalDuration,
    regions: merged.filter((r) => r.endTime - r.startTime >= 0.22),
  };
}

export function detectVocalRegions(
  samples: Float32Array,
  sampleRate: number
): VocalRegion[] {
  return analyzeAudioBuffer(samples, sampleRate).regions;
}

/**
 * Finds the sharpest vocal-band energy onset peak near `targetTime` in the audio buffer,
 * snapping cue start times onto actual consonant/vowel attacks instead of silence.
 */
export function findVocalOnsetNear(
  envelope: AudioBufferEnvelope | null | undefined,
  targetTime: number,
  radiusSeconds = 0.28
): number {
  if (!envelope || envelope.flux.length === 0) return targetTime;

  const minFrame = Math.max(
    0,
    Math.floor((targetTime - radiusSeconds) / envelope.frameDuration)
  );
  const maxFrame = Math.min(
    envelope.flux.length - 1,
    Math.ceil((targetTime + radiusSeconds) / envelope.frameDuration)
  );
  if (minFrame > maxFrame) return targetTime;

  let bestFrame = -1;
  let bestScore = 0;
  const minSignificantFlux = envelope.threshold * 0.35;

  for (let f = minFrame; f <= maxFrame; f++) {
    const t = f * envelope.frameDuration;
    const proximity = 1 - Math.min(0.45, Math.abs(t - targetTime) / Math.max(0.05, radiusSeconds) * 0.45);
    const activeBoost =
      envelope.vocalMask[f] === 1 ? 1.4 : envelope.rms[f] >= envelope.threshold ? 1.1 : 0.55;
    const score = envelope.flux[f] * proximity * activeBoost;
    if (envelope.flux[f] >= minSignificantFlux && score > bestScore) {
      bestScore = score;
      bestFrame = f;
    }
  }

  if (bestFrame === -1) return targetTime;
  return Number((bestFrame * envelope.frameDuration).toFixed(2));
}

/**
 * Finds where vocal energy drops into breath/silence near `targetEndTime`.
 */
export function findVocalDecayNear(
  envelope: AudioBufferEnvelope | null | undefined,
  minStartTime: number,
  targetEndTime: number,
  radiusSeconds = 0.28
): number {
  if (!envelope || envelope.rms.length === 0) return targetEndTime;

  const minFrame = Math.max(
    Math.ceil((minStartTime + 0.2) / envelope.frameDuration),
    Math.floor((targetEndTime - radiusSeconds) / envelope.frameDuration)
  );
  const maxFrame = Math.min(
    envelope.rms.length - 1,
    Math.ceil((targetEndTime + radiusSeconds) / envelope.frameDuration)
  );
  if (minFrame > maxFrame) return targetEndTime;

  for (let f = maxFrame; f >= minFrame; f--) {
    if (envelope.vocalMask[f] === 1 || envelope.rms[f] >= envelope.threshold * 0.85) {
      const candidate = Number(((f + 1) * envelope.frameDuration).toFixed(2));
      if (Math.abs(candidate - targetEndTime) <= radiusSeconds) {
        return Math.max(minStartTime + 0.25, candidate);
      }
      break;
    }
  }
  return targetEndTime;
}

/**
 * Clamps `[startTime, endTime]` strictly onto active voiced singing inside the span so
 * subtitles close when vocals drop into idle pauses/instrumental breaks rather than lingering.
 */
function clampRangeToActiveVocals(
  envelope: AudioBufferEnvelope | null | undefined,
  startTime: number,
  endTime: number,
  safeTotal: number
): { startTime: number; endTime: number } {
  const minDur = 0.28;
  let s = Math.max(0, startTime);
  let e = Math.min(safeTotal, Math.max(s + minDur, endTime));
  if (!envelope || envelope.rms.length === 0) {
    return { startTime: s, endTime: e };
  }

  const fStart = Math.max(0, Math.floor(s / envelope.frameDuration));
  const fEnd = Math.min(envelope.rms.length - 1, Math.floor(e / envelope.frameDuration));
  if (fEnd <= fStart + 2) {
    return { startTime: s, endTime: e };
  }

  let firstActive = -1;
  let lastActive = -1;
  for (let f = fStart; f <= fEnd; f++) {
    if (envelope.vocalMask[f] === 1 || envelope.rms[f] >= envelope.threshold * 0.85) {
      if (firstActive === -1) firstActive = f;
      lastActive = f;
    }
  }

  if (firstActive !== -1 && lastActive > firstActive) {
    // Check if an internal silence break >= 0.30s splits this range (boundary bleed)
    const minSilentFrames = Math.max(8, Math.round(0.3 / envelope.frameDuration));
    let bestSilentLen = 0;
    let bestSilentStart = -1;
    let bestSilentEnd = -1;
    let runStart = -1;

    for (let f = firstActive; f <= lastActive; f++) {
      const inactive =
        envelope.vocalMask[f] === 0 && envelope.rms[f] < envelope.threshold * 0.85;
      if (inactive) {
        if (runStart === -1) runStart = f;
      } else if (runStart !== -1) {
        const len = f - runStart;
        if (len > bestSilentLen) {
          bestSilentLen = len;
          bestSilentStart = runStart;
          bestSilentEnd = f;
        }
        runStart = -1;
      }
    }

    let trimmedStart = firstActive * envelope.frameDuration;
    let trimmedEnd = Math.min(safeTotal, (lastActive + 1) * envelope.frameDuration + 0.06);

    if (bestSilentLen >= minSilentFrames && bestSilentStart > firstActive && bestSilentEnd <= lastActive) {
      const beforeFrames = bestSilentStart - firstActive;
      const afterFrames = lastActive - bestSilentEnd + 1;
      if (afterFrames <= Math.max(8, beforeFrames * 0.45) && beforeFrames * envelope.frameDuration >= minDur) {
        trimmedEnd = Math.min(safeTotal, bestSilentStart * envelope.frameDuration + 0.04);
      } else if (beforeFrames <= Math.max(8, afterFrames * 0.45) && afterFrames * envelope.frameDuration >= minDur) {
        trimmedStart = bestSilentEnd * envelope.frameDuration;
      }
    }

    if (trimmedEnd - trimmedStart >= minDur) {
      if (trimmedStart - s >= 0.14) s = trimmedStart;
      if (e - trimmedEnd >= 0.14) e = trimmedEnd;
    }
  }

  return {
    startTime: Number(Math.max(0, Math.min(safeTotal - minDur, s)).toFixed(2)),
    endTime: Number(Math.min(safeTotal, Math.max(s + minDur, e)).toFixed(2)),
  };
}

/**
 * Maps a sequence of item weights across `[spanStart, spanEnd]` proportionally to
 * active vocal energy in the audio buffer, naturally skipping instrumental breaks.
 */
function distributeSpanByVocalEnergy(
  envelope: AudioBufferEnvelope | null | undefined,
  spanStart: number,
  spanEnd: number,
  weights: number[]
): Array<{ startTime: number; endTime: number }> {
  const count = weights.length;
  if (count === 0) return [];
  const safeStart = Math.max(0, spanStart);
  const safeEnd = Math.max(safeStart + count * 0.15, spanEnd);
  const totalWeight = weights.reduce((a, b) => a + Math.max(1, b), 0);

  if (!envelope || envelope.rms.length === 0) {
    let cursor = 0;
    return weights.map((w) => {
      const f0 = cursor / totalWeight;
      cursor += Math.max(1, w);
      const f1 = cursor / totalWeight;
      return {
        startTime: safeStart + f0 * (safeEnd - safeStart),
        endTime: safeStart + f1 * (safeEnd - safeStart),
      };
    });
  }

  const startFrame = Math.max(0, Math.floor(safeStart / envelope.frameDuration));
  const endFrame = Math.min(
    envelope.rms.length,
    Math.max(startFrame + 1, Math.ceil(safeEnd / envelope.frameDuration))
  );

  // Build cumulative vocal activity density across frames; inactive/unvoiced gaps get ~0 weight
  const nFrames = endFrame - startFrame;
  const cumDensity = new Float64Array(nFrames + 1);
  for (let i = 0; i < nFrames; i++) {
    const idx = startFrame + i;
    const isVocal = envelope.vocalMask[idx] === 1 || envelope.rms[idx] >= envelope.threshold;
    const density = isVocal
      ? Math.max(0.25, envelope.rms[idx] / Math.max(0.001, envelope.threshold))
      : 0.01;
    cumDensity[i + 1] = cumDensity[i] + density;
  }

  const totalDensity = cumDensity[nFrames];
  if (totalDensity <= 0) {
    return distributeSpanByVocalEnergy(null, safeStart, safeEnd, weights);
  }

  const mapFractionToTime = (frac: number): number => {
    const target = Math.max(0, Math.min(totalDensity, frac * totalDensity));
    let lo = 0;
    let hi = nFrames;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumDensity[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const idx = Math.max(1, lo);
    const d0 = cumDensity[idx - 1];
    const d1 = cumDensity[idx];
    const sub = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    const framePos = startFrame + (idx - 1) + sub;
    return Math.min(safeEnd, Math.max(safeStart, framePos * envelope.frameDuration));
  };

  let cursor = 0;
  return weights.map((w) => {
    const f0 = cursor / totalWeight;
    cursor += Math.max(1, w);
    const f1 = cursor / totalWeight;
    return {
      startTime: mapFractionToTime(f0),
      endTime: mapFractionToTime(f1),
    };
  });
}

/**
 * Aligns a group of cues onto a contiguous slice of `VocalRegion[]`, preserving idle silence gaps.
 */
function alignGroupToRegions(
  cues: LyricCue[],
  regions: VocalRegion[],
  safeTotal: number,
  envelope?: AudioBufferEnvelope | null
): LyricCue[] {
  if (cues.length === 0) return [];
  const totalVocalDuration = regions.reduce(
    (acc, r) => acc + Math.max(0.2, r.endTime - r.startTime),
    0
  );

  // When every sung phrase is its own vocal region (M >= K), assign lines 1-to-1 / contiguous groups
  // onto regions so every pause >= 0.25s between regions keeps subtitles cleanly idle!
  const weights = cues.map((c) => {
    const txt = (c.primary || c.roman || c.english || '').replace(/\s+/g, '');
    return Math.max(6, txt.length);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Track cumulative vocal offsets of each region so we know which region each cue starts/ends in
  const mapVocalOffsetToRealTime = (vOffset: number, isEnd: boolean): number => {
    let remaining = Math.max(0, Math.min(totalVocalDuration, vOffset));
    for (let i = 0; i < regions.length; i++) {
      const reg = regions[i];
      const len = Math.max(0.2, reg.endTime - reg.startTime);
      // At exact region boundary: if mapping startTime of a line, jump forward into next region's startTime!
      if (isEnd ? remaining <= len + 1e-4 : remaining < len - 1e-4) {
        return Math.min(safeTotal, reg.startTime + remaining);
      }
      if (i === regions.length - 1) {
        return Math.min(safeTotal, reg.endTime);
      }
      remaining -= len;
    }
    return safeTotal;
  };

  let cursorWeight = 0;
  return cues.map((cue, idx) => {
    const startVocal = (cursorWeight / totalWeight) * totalVocalDuration;
    cursorWeight += weights[idx];
    const endVocal = (cursorWeight / totalWeight) * totalVocalDuration;

    let startTime = mapVocalOffsetToRealTime(startVocal, false);
    let endTime = Math.max(startTime + 0.3, mapVocalOffsetToRealTime(endVocal, true));

    if (envelope) {
      const clamped = clampRangeToActiveVocals(envelope, startTime, endTime, safeTotal);
      startTime = findVocalOnsetNear(envelope, clamped.startTime, 0.24);
      endTime = Math.max(
        startTime + 0.3,
        findVocalDecayNear(envelope, startTime, clamped.endTime, 0.24)
      );
    }

    // Never let a single cue stretch over a huge dead silence gap (> 0.5s) at either edge
    // Keep words proportionally distributed over active vocal energy
    const rawWords = (cue.primary || cue.roman || cue.english || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const wordWeights = rawWords.map((w) => Math.max(2, normalizeForAlignment(w).length || w.length));
    const wordSpans = distributeSpanByVocalEnergy(
      envelope,
      startTime,
      Math.min(safeTotal, endTime),
      wordWeights
    );
    const words: WordTiming[] = rawWords.map((word, wIdx) => ({
      word,
      startTime: Number(wordSpans[wIdx].startTime.toFixed(2)),
      endTime: Number(
        Math.max(wordSpans[wIdx].startTime + 0.08, wordSpans[wIdx].endTime).toFixed(2)
      ),
    }));

    return {
      ...cue,
      startTime: Number(startTime.toFixed(2)),
      endTime: Number(Math.min(safeTotal, endTime).toFixed(2)),
      words: words.length > 0 ? words : undefined,
    };
  });
}

/**
 * Distributes pasted lyric cues onto active vocal regions, matching blank-line stanza
 * groups to vocal phrase clusters and strictly preserving idle pauses between sung lines.
 */
export function alignCuesToVocalRegions(
  cues: LyricCue[],
  regions: VocalRegion[],
  totalDuration: number,
  envelope?: AudioBufferEnvelope | null
): LyricCue[] {
  if (cues.length === 0) return cues;
  const safeTotal = Math.max(1, totalDuration);

  const usableRegions =
    regions.length > 0 &&
    regions.reduce((acc, r) => acc + (r.endTime - r.startTime), 0) >= 0.8
      ? regions
      : [{ startTime: 0, endTime: safeTotal, energy: 1 }];

  // Group regions into verse/chorus clusters separated by larger instrumental breaks (>= 1.1s)
  const regionClusters: VocalRegion[][] = [];
  for (const reg of usableRegions) {
    const prevCluster = regionClusters[regionClusters.length - 1];
    if (
      prevCluster &&
      reg.startTime - prevCluster[prevCluster.length - 1].endTime <= 1.1
    ) {
      prevCluster.push(reg);
    } else {
      regionClusters.push([reg]);
    }
  }

  // Group cues by stanzaIndex if stanzas are present
  const stanzaGroups: LyricCue[][] = [];
  for (const cue of cues) {
    const sIdx = cue.stanzaIndex ?? 0;
    const prevGroup = stanzaGroups[stanzaGroups.length - 1];
    if (prevGroup && (prevGroup[0].stanzaIndex ?? 0) === sIdx) {
      prevGroup.push(cue);
    } else {
      stanzaGroups.push([cue]);
    }
  }

  let mapped: LyricCue[];
  if (stanzaGroups.length >= 2 && regionClusters.length === stanzaGroups.length) {
    // 1-to-1 stanza-to-verse cluster match (e.g. 4 stanzas mapped to 4 sung verses)
    mapped = stanzaGroups.flatMap((group, idx) =>
      alignGroupToRegions(group, regionClusters[idx], safeTotal, envelope)
    );
  } else {
    mapped = alignGroupToRegions(cues, usableRegions, safeTotal, envelope);
  }

  // Enforce strict monotonic non-overlapping order without bridging idle pauses
  for (let i = 1; i < mapped.length; i++) {
    if (mapped[i].startTime < mapped[i - 1].startTime + 0.2) {
      mapped[i].startTime = Number(
        Math.min(safeTotal - 0.3, mapped[i - 1].startTime + 0.25).toFixed(2)
      );
    }
    if (mapped[i - 1].endTime > mapped[i].startTime) {
      mapped[i - 1].endTime = mapped[i].startTime;
    }
    if (mapped[i].endTime <= mapped[i].startTime) {
      mapped[i].endTime = Number(
        Math.min(safeTotal, mapped[i].startTime + 0.3).toFixed(2)
      );
    }
  }

  return mapped;
}

/**
 * Normalizes Persian/Arabic and Latin text for fuzzy cross-script word alignment
 * between user-pasted lyrics and Whisper's recognized tokens.
 */
export function normalizeForAlignment(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u200c/g, '') // Strip Persian ZWNJ so می‌خواد & میخواد match identically
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Strip Arabic/Persian diacritics & tatweel
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) ?? 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = bigramsA.get(bg) ?? 0;
    if (count > 0) {
      bigramsA.set(bg, count - 1);
      matches++;
    }
  }

  return (2 * matches) / (a.length - 1 + (b.length - 1));
}

function scoreWordSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Prefix / morphological stem match (e.g. "برقصم" vs "برقصیم")
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 3 && (a.startsWith(b) || b.startsWith(a))) {
    return 0.78 + 0.15 * (minLen / Math.max(a.length, b.length));
  }
  return diceSimilarity(a, b);
}

export function normalizeWhisperChunks(
  chunks: WhisperChunk[],
  totalDuration: number
): WhisperSegment[] {
  const safeTotal = Math.max(1, totalDuration);
  const segments: WhisperSegment[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const text = (chunk.text ?? '').trim();
    if (!text) continue;

    const rawStart = Number.isFinite(chunk.timestamp?.[0])
      ? (chunk.timestamp[0] as number)
      : 0;
    const nextStart =
      i + 1 < chunks.length && Number.isFinite(chunks[i + 1].timestamp?.[0])
        ? (chunks[i + 1].timestamp[0] as number)
        : safeTotal;
    const rawEnd =
      chunk.timestamp?.[1] !== null && Number.isFinite(chunk.timestamp?.[1])
        ? (chunk.timestamp[1] as number)
        : Math.min(safeTotal, Math.max(rawStart + 1.8, nextStart));

    const startTime = Number(Math.max(0, Math.min(safeTotal - 0.15, rawStart)).toFixed(2));
    const endTime = Number(
      Math.min(safeTotal, Math.max(startTime + 0.12, rawEnd)).toFixed(2)
    );

    segments.push({ startTime, endTime, text });
  }

  return segments.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Expands Whisper phrase- or word-level chunks into sorted, deduplicated TimedWord[] tokens.
 * Multi-word chunks are subdivided across individual words using acoustic vocal energy
 * and character weights so word-level DP alignment always operates on clean words.
 */
export function expandChunksToTimedWords(
  chunks: WhisperChunk[],
  totalDuration: number,
  envelope?: AudioBufferEnvelope | null
): TimedWord[] {
  const segments = normalizeWhisperChunks(chunks, totalDuration);
  const words: Array<TimedWord & { segIdx: number }> = [];

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    const rawTokens = seg.text.trim().split(/\s+/).filter(Boolean);
    if (rawTokens.length === 0) continue;

    if (rawTokens.length === 1) {
      const norm = normalizeForAlignment(rawTokens[0]);
      if (!norm) continue;
      const prev = words[words.length - 1];
      if (
        prev &&
        prev.segIdx !== segIdx &&
        prev.norm === norm &&
        seg.startTime < prev.endTime - 0.08
      ) {
        prev.endTime = Math.max(prev.endTime, seg.endTime);
        continue;
      }
      words.push({
        word: rawTokens[0],
        norm,
        startTime: seg.startTime,
        endTime: seg.endTime,
        segIdx,
      });
      continue;
    }

    const tokenWeights = rawTokens.map((t) => Math.max(2, normalizeForAlignment(t).length || t.length));
    const spans = distributeSpanByVocalEnergy(
      envelope,
      seg.startTime,
      seg.endTime,
      tokenWeights
    );

    for (let i = 0; i < rawTokens.length; i++) {
      const norm = normalizeForAlignment(rawTokens[i]);
      if (!norm) continue;
      const wStart = Number(spans[i].startTime.toFixed(2));
      const wEnd = Number(Math.max(wStart + 0.08, spans[i].endTime).toFixed(2));
      const prev = words[words.length - 1];
      if (
        prev &&
        prev.segIdx !== segIdx &&
        prev.norm === norm &&
        wStart < prev.endTime - 0.08
      ) {
        prev.endTime = Math.max(prev.endTime, wEnd);
        continue;
      }
      words.push({
        word: rawTokens[i],
        norm,
        startTime: wStart,
        endTime: wEnd,
        segIdx,
      });
    }
  }

  return words.map(({ word, norm, startTime, endTime }) => ({
    word,
    norm,
    startTime,
    endTime,
  }));
}

/**
 * Converts raw Whisper output directly into clean LyricCues when user
 * generates lyrics automatically without pasting text first, preserving idle pauses.
 */
export function whisperChunksToCues(
  chunks: WhisperChunk[],
  totalDuration: number,
  envelope?: AudioBufferEnvelope | null
): LyricCue[] {
  const segments = normalizeWhisperChunks(chunks, totalDuration);
  if (segments.length === 0) return [];

  const grouped: Array<{ startTime: number; endTime: number; words: WordTiming[]; text: string }> = [];
  for (const seg of segments) {
    const prev = grouped[grouped.length - 1];
    const prevWords = prev ? prev.text.split(/\s+/).length : 0;
    const segWords = seg.text.split(/\s+/).length;
    const combinedDuration = prev ? seg.endTime - prev.startTime : 0;

    if (
      prev &&
      seg.startTime - prev.endTime <= 0.35 &&
      prevWords + segWords <= 8 &&
      combinedDuration <= 4.5
    ) {
      prev.text = `${prev.text} ${seg.text}`.trim();
      prev.endTime = seg.endTime;
      prev.words.push({
        word: seg.text.trim(),
        startTime: seg.startTime,
        endTime: seg.endTime,
      });
    } else {
      grouped.push({
        startTime: seg.startTime,
        endTime: seg.endTime,
        text: seg.text,
        words: [{ word: seg.text.trim(), startTime: seg.startTime, endTime: seg.endTime }],
      });
    }
  }

  return grouped.map((seg, idx) => {
    const clamped = envelope
      ? clampRangeToActiveVocals(envelope, seg.startTime, seg.endTime, totalDuration)
      : { startTime: seg.startTime, endTime: seg.endTime };
    return {
      id: `whisper-cue-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
      startTime: clamped.startTime,
      endTime: clamped.endTime,
      primary: seg.text,
      roman: '',
      english: '',
      words: seg.words,
    };
  });
}

interface PastedWordRef {
  word: string;
  norm: string;
  cueIndex: number;
  wordIndex: number;
  weight: number;
}

/**
 * Banded Needleman-Wunsch dynamic programming word-to-word aligner.
 * Returns matched Whisper word index `match[m] = n` (or -1 if unmatched) monotonically.
 */
function dpAlignWordSequences(
  pasted: PastedWordRef[],
  transcribed: TimedWord[]
): number[] {
  const M = pasted.length;
  const N = transcribed.length;
  const result = new Array<number>(M).fill(-1);
  if (M === 0 || N === 0) return result;

  // Monotonic DP grid; for typical songs (< 800 words) full/banded DP takes < 12 ms
  const stride = N + 1;
  const dp = new Float32Array((M + 1) * stride);
  // trace: 1 = diag (match/sub), 2 = up (skip pasted word), 3 = left (skip transcribed word)
  const trace = new Uint8Array((M + 1) * stride);

  const gapPasted = -0.35;
  const gapTranscribed = -0.25;

  for (let i = 1; i <= M; i++) {
    dp[i * stride] = dp[(i - 1) * stride] + gapPasted;
    trace[i * stride] = 2;
  }
  for (let j = 1; j <= N; j++) {
    dp[j] = dp[j - 1] + gapTranscribed;
    trace[j] = 3;
  }

  for (let i = 1; i <= M; i++) {
    const pNorm = pasted[i - 1].norm;
    const rowOff = i * stride;
    const prevRowOff = (i - 1) * stride;

    for (let j = 1; j <= N; j++) {
      const wNorm = transcribed[j - 1].norm;
      const sim = scoreWordSimilarity(pNorm, wNorm);
      // Slight positional tie-breaker keeps repeated choruses aligned to the right verse
      const relDist = Math.abs(i / M - j / N);
      const posBonus = Math.max(0, 0.15 * (1 - relDist * 2));
      const matchReward = sim >= 0.56 ? 2.4 * sim + posBonus : -0.9;

      const diagScore = dp[prevRowOff + j - 1] + matchReward;
      const upScore = dp[prevRowOff + j] + gapPasted;
      const leftScore = dp[rowOff + j - 1] + gapTranscribed;

      if (diagScore >= upScore && diagScore >= leftScore) {
        dp[rowOff + j] = diagScore;
        trace[rowOff + j] = 1;
      } else if (upScore >= leftScore) {
        dp[rowOff + j] = upScore;
        trace[rowOff + j] = 2;
      } else {
        dp[rowOff + j] = leftScore;
        trace[rowOff + j] = 3;
      }
    }
  }

  let i = M;
  let j = N;
  while (i > 0 && j > 0) {
    const move = trace[i * stride + j];
    if (move === 1) {
      const sim = scoreWordSimilarity(pasted[i - 1].norm, transcribed[j - 1].norm);
      if (sim >= 0.56) {
        result[i - 1] = j - 1;
      }
      i--;
      j--;
    } else if (move === 2) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * High-precision forced alignment algorithm:
 * 1. Analyzes raw PCM audio buffer (20 ms pre-emphasized vocal RMS + onset flux)
 * 2. Expands Whisper chunks into deduplicated word-level tokens
 * 3. Aligns every pasted word against transcribed words via monotonic Needleman-Wunsch DP
 * 4. Fills unmatched spans between matched word anchors using cumulative audio-buffer vocal energy
 *    (so silent/instrumental breaks between verses are naturally skipped)
 * 5. Snaps cue boundaries onto audio vocal onsets & decays and writes `cue.words` offsets
 */
export function alignCuesWithAudioAndWhisper(params: {
  cues: LyricCue[];
  chunks: WhisperChunk[];
  samples?: Float32Array;
  sampleRate?: number;
  totalDuration: number;
  fallbackRegions?: VocalRegion[];
}): LyricCue[] {
  const { cues, chunks, samples, sampleRate, totalDuration, fallbackRegions = [] } = params;
  if (cues.length === 0) return cues;
  const safeTotal = Math.max(1, totalDuration);

  const envelope =
    samples && sampleRate && samples.length > 0
      ? analyzeAudioBuffer(samples, sampleRate)
      : null;
  const regions = envelope && envelope.regions.length > 0 ? envelope.regions : fallbackRegions;

  const timedWords = expandChunksToTimedWords(chunks, safeTotal, envelope);
  if (timedWords.length === 0) {
    return alignCuesToVocalRegions(cues, regions, safeTotal, envelope);
  }

  // Flatten all pasted lyrics into word-level references while preserving line mapping
  const pastedWords: PastedWordRef[] = [];
  const cueWordIndices: number[][] = cues.map(() => []);

  for (let cIdx = 0; cIdx < cues.length; cIdx++) {
    const rawLine = (cues[cIdx].primary || cues[cIdx].roman || cues[cIdx].english || '').trim();
    const tokens = rawLine.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      const flatIdx = pastedWords.length;
      pastedWords.push({
        word: '',
        norm: '',
        cueIndex: cIdx,
        wordIndex: 0,
        weight: 6,
      });
      cueWordIndices[cIdx].push(flatIdx);
      continue;
    }

    tokens.forEach((tok, wIdx) => {
      const norm = normalizeForAlignment(tok);
      const flatIdx = pastedWords.length;
      pastedWords.push({
        word: tok,
        norm: norm || tok.toLowerCase(),
        cueIndex: cIdx,
        wordIndex: wIdx,
        weight: Math.max(2, (norm || tok).length),
      });
      cueWordIndices[cIdx].push(flatIdx);
    });
  }

  if (pastedWords.length === 0) return cues;

  const matches = dpAlignWordSequences(pastedWords, timedWords);

  // Span boundaries informed by both Whisper speech bounds & DSP vocal regions
  const regionStart = regions.length > 0 ? regions[0].startTime : timedWords[0].startTime;
  const regionEnd =
    regions.length > 0
      ? regions[regions.length - 1].endTime
      : timedWords[timedWords.length - 1].endTime;
  const songVoiceStart = Math.max(
    0,
    Math.min(timedWords[0].startTime, regionStart)
  );
  const songVoiceEnd = Math.min(
    safeTotal,
    Math.max(timedWords[timedWords.length - 1].endTime, regionEnd)
  );

  // Resolve startTime/endTime for every single pasted word using matched anchors + audio buffer density
  const resolvedWords: Array<{ startTime: number; endTime: number; matched: boolean }> =
    new Array(pastedWords.length);

  let prevAnchorIdx = -1;
  let prevAnchorEnd = songVoiceStart;

  for (let m = 0; m <= pastedWords.length; m++) {
    const isMatched = m < pastedWords.length && matches[m] !== -1;
    if (!isMatched && m < pastedWords.length) continue;

    const nextAnchorStart = isMatched
      ? Math.max(prevAnchorEnd, timedWords[matches[m]].startTime)
      : Math.max(prevAnchorEnd + 0.25, songVoiceEnd);

    // Fill unmatched gap [prevAnchorIdx + 1 .. m - 1]
    const gapStartIdx = prevAnchorIdx + 1;
    if (m > gapStartIdx) {
      let gapStart = prevAnchorEnd;
      let gapEnd = nextAnchorStart;

      // Trim leading/trailing instrumental silence from the gap using the audio buffer envelope
      if (envelope && envelope.rms.length > 0 && gapEnd - gapStart >= 0.8) {
        // Guard margin avoids mistaking next anchor's vocal onset ramp (<= 0.3s) for gap vocals
        const safeRightBound = Math.max(gapStart + 0.4, gapEnd - 0.3);
        const fStart = Math.max(0, Math.floor(gapStart / envelope.frameDuration));
        const fEnd = Math.min(
          envelope.rms.length - 1,
          Math.floor(safeRightBound / envelope.frameDuration)
        );
        let firstActive = -1;
        let lastActive = -1;
        for (let f = fStart; f <= fEnd; f++) {
          if (envelope.rms[f] >= envelope.threshold) {
            if (firstActive === -1) firstActive = f;
            lastActive = f;
          }
        }
        if (firstActive !== -1 && lastActive > firstActive + 10) {
          const activeStartSec = firstActive * envelope.frameDuration;
          const activeEndSec = (lastActive + 1) * envelope.frameDuration;
          if (activeStartSec - gapStart >= 0.45 && activeEndSec - activeStartSec >= 0.5) {
            gapStart = activeStartSec;
          }
          if (gapEnd - activeEndSec >= 0.45 && activeEndSec - gapStart >= 0.5) {
            gapEnd = activeEndSec;
          }
        }
      }

      const gapWeights = pastedWords.slice(gapStartIdx, m).map((pw) => pw.weight);
      const spans = distributeSpanByVocalEnergy(
        envelope,
        gapStart,
        gapEnd,
        gapWeights
      );
      for (let k = 0; k < spans.length; k++) {
        resolvedWords[gapStartIdx + k] = {
          startTime: spans[k].startTime,
          endTime: spans[k].endTime,
          matched: false,
        };
      }
    }

    if (isMatched) {
      const tw = timedWords[matches[m]];
      const wStart = Math.max(prevAnchorEnd, tw.startTime);
      const wEnd = Math.min(safeTotal, Math.max(wStart + 0.12, tw.endTime));
      resolvedWords[m] = {
        startTime: wStart,
        endTime: wEnd,
        matched: true,
      };
      prevAnchorIdx = m;
      prevAnchorEnd = wEnd;
    }
  }

  // Reassemble cues with snapped vocal-onset boundaries and word-level offsets
  const alignedCues = cues.map((cue, cIdx) => {
    const idxs = cueWordIndices[cIdx];
    const firstWord = resolvedWords[idxs[0]];
    const lastWord = resolvedWords[idxs[idxs.length - 1]];

    let lineStart = firstWord.startTime;
    let lineEnd = Math.max(lineStart + 0.35, lastWord.endTime);

    if (envelope) {
      const clamped = clampRangeToActiveVocals(envelope, lineStart, lineEnd, safeTotal);
      lineStart = findVocalOnsetNear(
        envelope,
        clamped.startTime,
        firstWord.matched ? 0.18 : 0.28
      );
      lineEnd = Math.max(
        lineStart + 0.35,
        findVocalDecayNear(
          envelope,
          lineStart,
          clamped.endTime,
          lastWord.matched ? 0.18 : 0.28
        )
      );
    }

    const words: WordTiming[] = idxs
      .map((flatIdx) => {
        const pw = pastedWords[flatIdx];
        const rw = resolvedWords[flatIdx];
        if (!pw.word) return null;
        return {
          word: pw.word,
          startTime: Number(Math.max(0, Math.min(safeTotal - 0.08, rw.startTime)).toFixed(2)),
          endTime: Number(Math.min(safeTotal, Math.max(rw.startTime + 0.08, rw.endTime)).toFixed(2)),
          confidence: rw.matched ? 1 : 0.5,
        };
      })
      .filter(Boolean) as WordTiming[];

    return {
      ...cue,
      startTime: Number(Math.max(0, Math.min(safeTotal - 0.35, lineStart)).toFixed(2)),
      endTime: Number(Math.min(safeTotal, lineEnd).toFixed(2)),
      words: words.length > 0 ? words : undefined,
    };
  });

  // Final monotonic non-overlap pass
  for (let i = 1; i < alignedCues.length; i++) {
    if (alignedCues[i].startTime < alignedCues[i - 1].startTime + 0.25) {
      alignedCues[i].startTime = Number(
        Math.min(safeTotal - 0.35, alignedCues[i - 1].startTime + 0.3).toFixed(2)
      );
    }
    if (alignedCues[i - 1].endTime > alignedCues[i].startTime) {
      alignedCues[i - 1].endTime = alignedCues[i].startTime;
    }
    if (alignedCues[i].endTime <= alignedCues[i].startTime) {
      alignedCues[i].endTime = Number(
        Math.min(safeTotal, alignedCues[i].startTime + 0.35).toFixed(2)
      );
    }
  }

  return alignedCues;
}

/**
 * Convenience wrapper for pre-normalized Whisper segments (no raw PCM buffer required).
 */
export function alignCuesToWhisperSegments(
  cues: LyricCue[],
  segments: WhisperSegment[],
  totalDuration: number,
  fallbackRegions: VocalRegion[] = []
): LyricCue[] {
  const chunks: WhisperChunk[] = segments.map((s) => ({
    text: s.text,
    timestamp: [s.startTime, s.endTime],
  }));
  return alignCuesWithAudioAndWhisper({
    cues,
    chunks,
    totalDuration,
    fallbackRegions,
  });
}
