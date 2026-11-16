import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getResolutionForRatio,
  computeFitRect,
  computeCueOpacity,
} from './canvas-renderer';
import { LyricCue } from './lyrics-parser';

test('getResolutionForRatio returns native Full HD 1080p dimensions', () => {
  assert.deepEqual(getResolutionForRatio('16:9'), { width: 1920, height: 1080 });
  assert.deepEqual(getResolutionForRatio('9:16'), { width: 1080, height: 1920 });
});

test('computeFitRect covers portrait frame from landscape source without distortion', () => {
  const rect = computeFitRect(1920, 1080, 1080, 1920, 'cover');
  assert.equal(rect.dh, 1920);
  assert.ok(rect.dw > 1080);
  assert.equal(Math.round(rect.dx), Math.round((1080 - rect.dw) / 2));
});

test('computeFitRect contains landscape source inside portrait frame centered', () => {
  const rect = computeFitRect(1920, 1080, 1080, 1920, 'contain');
  assert.equal(rect.dw, 1080);
  assert.equal(Math.round(rect.dh), Math.round(1080 / (16 / 9)));
  assert.ok(rect.dy > 0);
});

test('computeCueOpacity smoothly fades in and out within cue bounds', () => {
  const cue: LyricCue = {
    id: 'c1',
    startTime: 2.0,
    endTime: 6.0,
    primary: 'Test',
    roman: '',
    english: '',
  };
  assert.equal(computeCueOpacity(cue, 1.9), 0);
  assert.ok(Math.abs(computeCueOpacity(cue, 2.08, 0.16) - 0.5) < 0.001);
  assert.equal(computeCueOpacity(cue, 4.0, 0.16), 1);
  assert.ok(Math.abs(computeCueOpacity(cue, 5.92, 0.16) - 0.5) < 0.001);
  assert.equal(computeCueOpacity(cue, 6.0), 0);
  assert.equal(computeCueOpacity(cue, 2.0, 0.16, true), 1);

  const zeroCue: LyricCue = { ...cue, startTime: 0, endTime: 4 };
  assert.equal(computeCueOpacity(zeroCue, 0, 0.16, false), 1);
});
