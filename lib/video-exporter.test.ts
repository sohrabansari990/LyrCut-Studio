import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_QUALITY_PRESETS,
  computeFrameSchedule,
  ensureEvenDimension,
  estimateExportSizeMb,
  selectWebCodecsTarget,
} from './video-exporter';

test('computeFrameSchedule computes exact 30fps frame counts and microsecond frame durations', () => {
  const schedule = computeFrameSchedule(120, 30);
  assert.equal(schedule.fps, 30);
  assert.equal(schedule.exportDuration, 120);
  assert.equal(schedule.totalFrames, 3600);
  assert.equal(schedule.frameDurationUs, 33333);
});

test('ensureEvenDimension forces even pixel sizes for YUV 4:2:0 encoders', () => {
  assert.equal(ensureEvenDimension(1920), 1920);
  assert.equal(ensureEvenDimension(1081), 1082);
  assert.equal(ensureEvenDimension(1), 2);
});

test('estimateExportSizeMb reflects real high-bitrate Full HD file sizes', () => {
  const highMb = estimateExportSizeMb(180, 'high', true);
  const ultraMb = estimateExportSizeMb(180, 'ultra', true);
  assert.ok(highMb > 200, `expected >200 MB for 3-min 12Mbps video, got ${highMb}`);
  assert.ok(ultraMb > highMb, 'ultra preset must produce larger estimate than high preset');
  assert.equal(EXPORT_QUALITY_PRESETS.ultra.videoBitrate, 20_000_000);
});

test('selectWebCodecsTarget prefers MP4 (H.264 + AAC) when supported', async () => {
  const target = await selectWebCodecsTarget({
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 20_000_000,
    audioBitrate: 256_000,
    hasAudio: true,
    checkVideoSupport: async (cfg) => cfg.codec.startsWith('avc1'),
    checkAudioSupport: async (cfg) => cfg.codec === 'mp4a.40.2',
  });

  assert.ok(target);
  assert.equal(target.container, 'mp4');
  assert.equal(target.ext, 'mp4');
  assert.equal(target.muxerVideoCodec, 'avc');
  assert.equal(target.muxerAudioCodec, 'aac');
});

test('selectWebCodecsTarget falls back cleanly to seekable WebM (VP9 + Opus) when H.264/AAC is unavailable', async () => {
  const target = await selectWebCodecsTarget({
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 12_000_000,
    audioBitrate: 192_000,
    hasAudio: true,
    checkVideoSupport: async (cfg) => cfg.codec.startsWith('vp09'),
    checkAudioSupport: async (cfg) => cfg.codec === 'opus',
  });

  assert.ok(target);
  assert.equal(target.container, 'webm');
  assert.equal(target.ext, 'webm');
  assert.equal(target.muxerVideoCodec, 'V_VP9');
  assert.equal(target.muxerAudioCodec, 'A_OPUS');
});
