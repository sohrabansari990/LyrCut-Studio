import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAudioBuffer,
  detectVocalRegions,
  findVocalOnsetNear,
  expandChunksToTimedWords,
  alignCuesToVocalRegions,
  alignCuesToWhisperSegments,
  alignCuesWithAudioAndWhisper,
  whisperChunksToCues,
  normalizeForAlignment,
} from './vocal-aligner';
import { parsePlainLyrics } from './lyrics-parser';

test('detectVocalRegions isolates singing spans and ignores silent intros/outros', () => {
  const sampleRate = 8000;
  const totalSec = 10;
  const samples = new Float32Array(sampleRate * totalSec);

  // Silent 0..2s, vocal tone (440Hz + 880Hz) from 2..7s, silent 7..10s
  for (let i = sampleRate * 2; i < sampleRate * 7; i++) {
    const t = i / sampleRate;
    samples[i] =
      0.4 * Math.sin(2 * Math.PI * 440 * t) + 0.2 * Math.sin(2 * Math.PI * 880 * t);
  }

  const regions = detectVocalRegions(samples, sampleRate);
  assert.equal(regions.length, 1);
  assert.ok(regions[0].startTime >= 1.9 && regions[0].startTime <= 2.15);
  assert.ok(regions[0].endTime >= 6.8 && regions[0].endTime <= 7.15);
});

test('analyzeAudioBuffer detects sharp vocal onset within 20ms frame resolution', () => {
  const sampleRate = 16000;
  const samples = new Float32Array(sampleRate * 6);
  // Vocal bursts at t = 1.50s..2.80s and t = 4.00s..5.20s
  for (let i = Math.floor(sampleRate * 1.5); i < Math.floor(sampleRate * 2.8); i++) {
    const t = i / sampleRate;
    samples[i] = 0.5 * Math.sin(2 * Math.PI * 520 * t);
  }
  for (let i = Math.floor(sampleRate * 4.0); i < Math.floor(sampleRate * 5.2); i++) {
    const t = i / sampleRate;
    samples[i] = 0.5 * Math.sin(2 * Math.PI * 520 * t);
  }

  const envelope = analyzeAudioBuffer(samples, sampleRate);
  assert.equal(envelope.regions.length, 2);
  const snapped = findVocalOnsetNear(envelope, 1.62, 0.25);
  assert.ok(Math.abs(snapped - 1.5) <= 0.08, `Expected onset ~1.50s, got ${snapped}`);
});

test('alignCuesToVocalRegions places pasted lyrics inside detected vocal spans with word offsets', () => {
  const cues = parsePlainLyrics('Line one\nLine two\nLine three\nLine four', {
    mode: 'single',
    totalDuration: 20,
  });
  const aligned = alignCuesToVocalRegions(
    cues,
    [{ startTime: 4, endTime: 16, energy: 0.5 }],
    20
  );

  assert.equal(aligned[0].startTime, 4);
  assert.equal(aligned[aligned.length - 1].endTime, 16);
  assert.ok(aligned[0].words && aligned[0].words.length === 2);
  assert.equal(aligned[0].words[0].word, 'Line');
});

test('expandChunksToTimedWords splits multi-word chunks and deduplicates overlap windows', () => {
  const words = expandChunksToTimedWords(
    [
      { text: 'امشب دلم میخواد', timestamp: [2.0, 4.1] },
      { text: 'میخواد برقصم', timestamp: [3.9, 5.2] },
    ],
    10
  );

  const norms = words.map((w) => w.norm);
  // Overlap word "میخواد" near t=3.9..4.1 should appear only once
  assert.deepEqual(norms, ['امشب', 'دلم', 'میخواد', 'برقصم']);
});

test('alignCuesToWhisperSegments matches pasted Farsi lyrics onto Whisper timestamps', () => {
  const cues = parsePlainLyrics(
    `امشب دلم می‌خواد برقصم
با نورِ شب، از غصه رد شم
موسیقی می‌پیچه توی قلبم`,
    { mode: 'single', totalDuration: 30 }
  );

  const segments = [
    { startTime: 5.2, endTime: 8.4, text: 'امشب دلم میخواد برقصم' },
    { startTime: 8.6, endTime: 11.8, text: 'با نور شب از غصه رد شم' },
    { startTime: 12.1, endTime: 16.0, text: 'موسیقی می پیچه توی قلبم' },
  ];

  const aligned = alignCuesToWhisperSegments(cues, segments, 30);
  assert.ok(aligned[0].startTime >= 5.0 && aligned[0].startTime <= 5.4);
  assert.ok(aligned[1].startTime >= 8.4 && aligned[1].startTime <= 8.8);
  assert.ok(aligned[2].startTime >= 11.9 && aligned[2].startTime <= 12.3);
  // Preserves user's exact spelling and ZWNJ
  assert.equal(aligned[2].primary, 'موسیقی می‌پیچه توی قلبم');
  assert.ok(aligned[0].words && aligned[0].words.length === 4);
});

test('alignCuesWithAudioAndWhisper skips silent instrumental gap using PCM buffer & aligns repeated choruses', () => {
  const sampleRate = 16000;
  const totalDuration = 20;
  const samples = new Float32Array(sampleRate * totalDuration);

  // Verse 1 vocal energy: 2.0s..6.0s; Instrumental silence: 6.0s..11.0s; Chorus vocal energy: 11.0s..17.0s
  for (let i = sampleRate * 2; i < sampleRate * 6; i++) {
    samples[i] = 0.45 * Math.sin(2 * Math.PI * 500 * (i / sampleRate));
  }
  for (let i = sampleRate * 11; i < sampleRate * 17; i++) {
    samples[i] = 0.45 * Math.sin(2 * Math.PI * 620 * (i / sampleRate));
  }

  const cues = parsePlainLyrics(
    `بیا بیا
دلم می‌خواد برقصم
بیا بیا
با تو جدا شم`,
    { mode: 'single', totalDuration }
  );

  // Suppose Whisper heard Verse 1 start (2.0s) and Chorus 2nd repeat ("بیا بیا" at 11.1s & "با تو جدا شم" at 13.5s)
  // Notice line 2 ("دلم می‌خواد برقصم") is unmatched, so audio buffer should keep it in 2..6s rather than 6..11s silence!
  const chunks = [
    { text: 'بیا', timestamp: [2.0, 2.7] as [number, number] },
    { text: 'بیا', timestamp: [2.7, 3.4] as [number, number] },
    { text: 'بیا', timestamp: [11.1, 11.8] as [number, number] },
    { text: 'بیا', timestamp: [11.8, 12.6] as [number, number] },
    { text: 'با تو جدا شم', timestamp: [13.5, 16.5] as [number, number] },
  ];

  const aligned = alignCuesWithAudioAndWhisper({
    cues,
    chunks,
    samples,
    sampleRate,
    totalDuration,
  });

  // First chorus line snapped to ~2.0s
  assert.ok(aligned[0].startTime >= 1.9 && aligned[0].startTime <= 2.2);
  // Unmatched line 2 stays inside 2..6s active vocal energy rather than creeping past 7s into silence
  assert.ok(aligned[1].endTime <= 7.0, `Expected line 2 inside vocal burst, got ${aligned[1].endTime}`);
  // Second repeat of "بیا بیا" lands cleanly at ~11.0s vocal onset
  assert.ok(
    aligned[2].startTime >= 10.8 && aligned[2].startTime <= 11.4,
    `Expected chorus repeat ~11.1s, got ${aligned[2].startTime}`
  );
  // Word offsets present on every cue
  assert.equal(aligned[3].words?.length, 4);
});

test('whisperChunksToCues groups sub-phrases into readable timed lines', () => {
  const cues = whisperChunksToCues(
    [
      { text: 'Hello', timestamp: [1.0, 1.5] },
      { text: 'world tonight', timestamp: [1.6, 3.0] },
      { text: 'New line starts here', timestamp: [6.0, 9.2] },
    ],
    12
  );
  assert.equal(cues.length, 2);
  assert.equal(cues[0].primary, 'Hello world tonight');
  assert.equal(cues[0].startTime, 1);
  assert.equal(cues[0].endTime, 3);
  assert.equal(cues[1].startTime, 6);
});

test('normalizeForAlignment normalizes Arabic/Persian variants, ZWNJ, and diacritics', () => {
  assert.equal(
    normalizeForAlignment('با نورِ شب، می‌خوام ي ك!'),
    'با نور شب میخوام ی ک'
  );
});

test('analyzeAudioBuffer rejects unvoiced white-noise/percussion bursts while keeping voiced singing tones', () => {
  const sampleRate = 16000;
  const totalSec = 8;
  const samples = new Float32Array(sampleRate * totalSec);

  // 1.0..2.5s: deterministic pseudo-random unvoiced noise burst (simulating cymbals/snare solo)
  let seed = 1337;
  for (let i = Math.floor(sampleRate * 1.0); i < Math.floor(sampleRate * 2.5); i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    samples[i] = ((seed / 0xffffffff) * 2 - 1) * 0.35;
  }

  // 4.0..6.5s: pitched harmonic vocal tone (330 Hz + 660 Hz)
  for (let i = Math.floor(sampleRate * 4.0); i < Math.floor(sampleRate * 6.5); i++) {
    const t = i / sampleRate;
    samples[i] =
      0.4 * Math.sin(2 * Math.PI * 330 * t) + 0.18 * Math.sin(2 * Math.PI * 660 * t);
  }

  const envelope = analyzeAudioBuffer(samples, sampleRate);
  assert.equal(envelope.regions.length, 1);
  assert.ok(envelope.regions[0].startTime >= 3.85 && envelope.regions[0].startTime <= 4.15);
  assert.ok(envelope.regions[0].endTime >= 6.35 && envelope.regions[0].endTime <= 6.65);
});

test('alignCuesToVocalRegions preserves idle silence gaps between sung lines and stanza clusters', () => {
  const sampleRate = 16000;
  const totalSec = 16;
  const samples = new Float32Array(sampleRate * totalSec);

  // Two distinct stanzas separated by a 2.5s instrumental gap, with 0.8s pauses inside phrases:
  // Stanza 1: line1 at 1.0..2.5s, line2 at 3.3..4.8s
  // Idle instrumental gap: 4.8..7.5s
  // Stanza 2: line3 at 7.5..9.0s, line4 at 10.0..11.8s
  const intervals: Array<[number, number, number]> = [
    [1.0, 2.5, 420],
    [3.3, 4.8, 460],
    [7.5, 9.0, 500],
    [10.0, 11.8, 540],
  ];
  for (const [s, e, freq] of intervals) {
    for (let i = Math.floor(sampleRate * s); i < Math.floor(sampleRate * e); i++) {
      samples[i] = 0.45 * Math.sin(2 * Math.PI * freq * (i / sampleRate));
    }
  }

  const envelope = analyzeAudioBuffer(samples, sampleRate);
  const cues = parsePlainLyrics(
    `امشب دلم می‌خواد برقصم
با نورِ شب، از غصه رد شم

بیا بیا، بیا بیا
با تو از این دنیا جدا شم`,
    { mode: 'single', totalDuration: totalSec }
  );

  const aligned = alignCuesToVocalRegions(cues, envelope.regions, totalSec, envelope);
  // Cue 0 stays within 1.0..2.5s and stays idle before cue 1 starts near 3.3s
  assert.ok(aligned[0].startTime >= 0.9 && aligned[0].startTime <= 1.2);
  assert.ok(aligned[0].endTime <= 2.65, `Expected cue 0 end <= 2.65, got ${aligned[0].endTime}`);
  assert.ok(aligned[1].startTime >= 3.15, `Expected idle gap before cue 1, got ${aligned[1].startTime}`);
  // Cue 1 ends before 4.8s; screen stays blank during 4.8..7.5s instrumental solo
  assert.ok(aligned[1].endTime <= 4.95, `Expected cue 1 end <= 4.95, got ${aligned[1].endTime}`);
  assert.ok(aligned[2].startTime >= 7.35, `Expected idle break before stanza 2, got ${aligned[2].startTime}`);
  assert.ok(aligned[2].endTime <= 9.2, `Expected cue 2 end <= 9.2, got ${aligned[2].endTime}`);
  assert.ok(aligned[3].startTime >= 9.8, `Expected idle pause before cue 3, got ${aligned[3].startTime}`);
});

test('segment-level Whisper timestamps compute exact word-level offsets without word DTW chunks', () => {
  const cues = parsePlainLyrics(
    `بیا بیا بیا بیا
دلم می‌خواد امشب برقصم`,
    { mode: 'single', totalDuration: 15 }
  );

  // Simulates Whisper return_timestamps: true (segment-level output, no slow DTW word chunks)
  const chunks = [
    { text: 'بیا بیا بیا بیا', timestamp: [1.5, 4.1] as [number, number] },
    { text: 'دلم میخواد امشب برقصم', timestamp: [5.4, 8.6] as [number, number] },
  ];

  const aligned = alignCuesWithAudioAndWhisper({
    cues,
    chunks,
    totalDuration: 15,
  });

  assert.equal(aligned.length, 2);
  assert.ok(aligned[0].endTime <= 4.3);
  assert.ok(aligned[1].startTime >= 5.2, `Expected idle gap 4.1..5.4 preserved, got ${aligned[1].startTime}`);
  assert.equal(aligned[0].words?.length, 4);
  assert.equal(aligned[1].words?.length, 4);
  assert.ok((aligned[1].words?.[0].startTime ?? 0) >= 5.2);
});

