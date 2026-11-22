import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_VISUALIZER_PRESETS,
  BEAT_VISUAL_EFFECT_PRESETS,
  DEFAULT_BEAT_EFFECTS_CONFIG,
  computeAudioAnalysisFromPcm,
  computeBeatVisualTransform,
  sampleBeatFrameAtTime,
} from './beat-effects';

test('computeAudioAnalysisFromPcm returns zero values for silent PCM', () => {
  const silent = new Float32Array(22050 * 2);
  const analysis = computeAudioAnalysisFromPcm(silent, 22050, 30, 24);
  assert.equal(analysis.bandCount, 24);
  assert.equal(analysis.beatTimes.length, 0);
  const sample = sampleBeatFrameAtTime(analysis, 1.0, 1.0);
  assert.equal(sample.energy, 0);
  assert.equal(sample.beat, 0);
  assert.equal(sample.bands.length, 24);
});

test('computeAudioAnalysisFromPcm detects beats on dynamic tracks and separates low vs high frequency bands', () => {
  const sampleRate = 22050;
  const duration = 4;
  const pcm = new Float32Array(sampleRate * duration);

  // First 2s: rhythmic 75Hz kicks every 0.6s; Last 2s: bright 4kHz synth pulses
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate;
    const mod = t % 0.6;
    const kickEnv = mod < 0.14 ? Math.exp(-mod * 22) : 0;
    const kick = Math.sin(2 * Math.PI * 75 * t) * kickEnv * 0.9;
    const hihatEnv = t >= 2.0 && (t % 0.3) < 0.08 ? Math.exp(-(t % 0.3) * 30) : 0;
    const hihat = Math.sin(2 * Math.PI * 4200 * t) * hihatEnv * 0.7;
    const pad = Math.sin(2 * Math.PI * 330 * t) * 0.08;
    pcm[i] = kick + hihat + pad;
  }

  const analysis = computeAudioAnalysisFromPcm(pcm, sampleRate, 30, 24);
  assert.ok(analysis.beatTimes.length >= 3, `Expected >=3 beats, got ${analysis.beatTimes.length}`);

  const onBeat = sampleBeatFrameAtTime(analysis, 0.62, 1.0);
  const offBeat = sampleBeatFrameAtTime(analysis, 1.05, 1.0);
  assert.ok(onBeat.beat > offBeat.beat, `Expected beat on kick (${onBeat.beat}) > off-beat (${offBeat.beat})`);
  assert.ok(onBeat.bands.every((b) => b >= 0 && b <= 1), 'All spectrum bands must stay in [0, 1]');

  // Low bands should dominate during pure kick hit vs high bands
  const lowAvg = (onBeat.bands[0] + onBeat.bands[1] + onBeat.bands[2]) / 3;
  const highAvg = (onBeat.bands[20] + onBeat.bands[21] + onBeat.bands[22]) / 3;
  assert.ok(lowAvg > highAvg + 0.15, `Expected bass bands (${lowAvg}) > high bands (${highAvg}) during kick`);
});

test('computeAudioAnalysisFromPcm produces lively beat variance even on loud brickwall-compressed pop MP3s', () => {
  const sampleRate = 22050;
  const duration = 5;
  const pcm = new Float32Array(sampleRate * duration);

  // Simulate a heavily limited pop/dance track: constant loud pad + 120 BPM kick pushed through soft limiter
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate;
    const beatPhase = t % 0.5; // 120 BPM
    const kick = beatPhase < 0.12 ? Math.sin(2 * Math.PI * 82 * t) * Math.exp(-beatPhase * 20) * 1.4 : 0;
    const synth =
      Math.sin(2 * Math.PI * 261.6 * t) * 0.45 +
      Math.sin(2 * Math.PI * 523.2 * t) * 0.35 +
      Math.sin(2 * Math.PI * 1800 * t) * (0.2 + 0.2 * Math.sin(t * 7));
    pcm[i] = Math.tanh((synth + kick) * 1.6); // brickwall-like saturation
  }

  const analysis = computeAudioAnalysisFromPcm(pcm, sampleRate, 30, 24);
  assert.ok(
    analysis.beatTimes.length >= 5,
    `Expected >=5 beats on compressed 120 BPM track, got ${analysis.beatTimes.length}`
  );

  let minBand0 = 1;
  let maxBand0 = 0;
  for (let f = 5; f < analysis.energy.length - 5; f++) {
    const v = analysis.bands[f * 24 + 1];
    if (v < minBand0) minBand0 = v;
    if (v > maxBand0) maxBand0 = v;
  }
  assert.ok(
    maxBand0 - minBand0 > 0.45,
    `Expected dynamic bar range > 0.45 on compressed track, got ${(maxBand0 - minBand0).toFixed(3)}`
  );
});

test('computeBeatVisualTransform supports motion + body FX presets and character target', () => {
  assert.ok(BEAT_VISUAL_EFFECT_PRESETS.length >= 14);
  assert.ok(AUDIO_VISUALIZER_PRESETS.length >= 13);

  const hotSample = {
    energy: 0.9,
    bass: 0.85,
    beat: 0.95,
    bands: new Array(24).fill(0.75),
  };

  const bounce = computeBeatVisualTransform(
    { ...DEFAULT_BEAT_EFFECTS_CONFIG, effectType: 'beat-bounce', intensity: 1.0, syncTarget: 'both' },
    hotSample,
    2.5
  );
  assert.ok(bounce.bgScale > 1.02);
  assert.ok(bounce.charScale > 1.03);
  assert.ok(bounce.lyricScale > 1.03);

  const charOnly = computeBeatVisualTransform(
    { ...DEFAULT_BEAT_EFFECTS_CONFIG, effectType: 'ghost-clone', intensity: 0.9, syncTarget: 'character' },
    hotSample,
    1.2
  );
  assert.equal(charOnly.bgScale, 1);
  assert.ok(charOnly.charScale > 1.02);
  assert.ok(charOnly.cloneSpreadPx > 40);

  const neonOutline = computeBeatVisualTransform(
    { ...DEFAULT_BEAT_EFFECTS_CONFIG, effectType: 'neon-outline', intensity: 0.85, syncTarget: 'both' },
    hotSample,
    1.2
  );
  assert.ok(neonOutline.outlineGlowAlpha > 0.6);

  const neonRush = computeBeatVisualTransform(
    { ...DEFAULT_BEAT_EFFECTS_CONFIG, effectType: 'neon-rush', intensity: 0.8, syncTarget: 'both' },
    hotSample,
    1.2
  );
  assert.ok(neonRush.fxEnergy > 0.6);
  assert.ok(neonRush.fxPulse > 0.6);
});
