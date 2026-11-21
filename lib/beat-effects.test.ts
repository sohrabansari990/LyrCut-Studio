import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BEAT_EFFECTS_CONFIG,
  computeAudioAnalysisFromPcm,
  computeBeatVisualTransform,
  sampleBeatFrameAtTime,
} from './beat-effects';

test('computeAudioAnalysisFromPcm returns near-zero values for silent PCM', () => {
  const silent = new Float32Array(22050 * 2);
  const analysis = computeAudioAnalysisFromPcm(silent, 22050, 30, 16);
  assert.equal(analysis.bandCount, 16);
  assert.equal(analysis.beatTimes.length, 0);
  const sample = sampleBeatFrameAtTime(analysis, 1.0, 1.0);
  assert.equal(sample.energy, 0);
  assert.equal(sample.beat, 0);
  assert.equal(sample.bands.length, 16);
});

test('computeAudioAnalysisFromPcm detects rhythmic bass beats and produces bounded spectrum bands', () => {
  const sampleRate = 22050;
  const duration = 4;
  const pcm = new Float32Array(sampleRate * duration);

  // Synthesize kick hits at t=0.5s, 1.5s, 2.5s, 3.5s
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate;
    const mod = (t + 0.5) % 1.0;
    const kickEnv = mod < 0.14 ? Math.exp(-mod * 22) : 0;
    const kick = Math.sin(2 * Math.PI * 75 * t) * kickEnv * 0.9;
    const pad = Math.sin(2 * Math.PI * 440 * t) * 0.08;
    pcm[i] = kick + pad;
  }

  const analysis = computeAudioAnalysisFromPcm(pcm, sampleRate, 30, 16);
  assert.ok(analysis.beatTimes.length >= 2, `Expected >=2 detected beats, got ${analysis.beatTimes.length}`);

  const onBeat = sampleBeatFrameAtTime(analysis, 1.52, 1.0);
  const offBeat = sampleBeatFrameAtTime(analysis, 1.92, 1.0);
  assert.ok(onBeat.beat > offBeat.beat, `Expected beat on kick (${onBeat.beat}) > off-beat (${offBeat.beat})`);
  assert.ok(onBeat.bands.every((b) => b >= 0 && b <= 1), 'All spectrum bands must stay in [0, 1]');
});

test('computeBeatVisualTransform produces deterministic bounded transforms per effect mode', () => {
  const hotSample = {
    energy: 0.9,
    bass: 0.85,
    beat: 0.95,
    bands: new Array(16).fill(0.7),
  };

  const bounce = computeBeatVisualTransform(
    { ...DEFAULT_BEAT_EFFECTS_CONFIG, effectType: 'beat-bounce', intensity: 1.0, syncTarget: 'both' },
    hotSample,
    2.5
  );
  assert.ok(bounce.bgScale > 1.02 && bounce.bgScale <= 1.08);
  assert.ok(bounce.lyricScale > 1.03 && bounce.lyricScale <= 1.1);
  assert.ok(bounce.lyricOffsetY < 0);

  const ripple = computeBeatVisualTransform(
    { ...DEFAULT_BEAT_EFFECTS_CONFIG, effectType: 'ring-ripple', intensity: 0.8 },
    hotSample,
    1.2
  );
  assert.ok(ripple.rippleAlpha > 0.5);

  const glitch = computeBeatVisualTransform(
    { ...DEFAULT_BEAT_EFFECTS_CONFIG, effectType: 'rgb-glitch', intensity: 0.8 },
    hotSample,
    1.2
  );
  assert.ok(glitch.glitchOffsetPx > 3);

  const bgOnly = computeBeatVisualTransform(
    { ...DEFAULT_BEAT_EFFECTS_CONFIG, effectType: 'zoom-pulse', intensity: 1.0, syncTarget: 'background' },
    hotSample,
    1.2
  );
  assert.ok(bgOnly.bgScale > 1.05);
  assert.equal(bgOnly.lyricScale, 1);
});
