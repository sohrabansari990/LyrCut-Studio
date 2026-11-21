import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FOCUSED_SCROLLING_CONFIG,
  computeScrollingLyricLayout,
} from './scrolling-lyrics';
import { LyricCue } from './lyrics-parser';

function makeSixCues(): LyricCue[] {
  return [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `c-${i}`,
    startTime: i * 4,
    endTime: (i + 1) * 4,
    primary: `خط ${i + 1}`,
    roman: `Line ${i + 1}`,
    english: `Translation ${i + 1}`,
  }));
}

test('computeScrollingLyricLayout keeps 5 visible positions centered on active cue with exact opacity/blur falloff', () => {
  const cues = makeSixCues();
  // Active cue index 2 is [8s..12s]; at 10.5s transition has completed and cue 2 sits centered
  const layout = computeScrollingLyricLayout(
    cues,
    10.5,
    0,
    DEFAULT_FOCUSED_SCROLLING_CONFIG
  );

  assert.equal(layout.activeCueIndex, 2);
  assert.equal(layout.items.length, 5);

  const byCue = new Map(layout.items.map((item) => [item.cueIndex, item]));
  const center = byCue.get(2)!;
  const upperInner = byCue.get(1)!;
  const upperOuter = byCue.get(0)!;
  const lowerInner = byCue.get(3)!;
  const lowerOuter = byCue.get(4)!;

  assert.equal(center.isActive, true);
  assert.equal(center.yOffset, 0);
  assert.equal(center.opacity, 1);
  assert.equal(center.blur, 0);

  assert.ok(upperInner.yOffset < 0);
  assert.ok(upperOuter.yOffset < upperInner.yOffset);
  assert.ok(lowerInner.yOffset > 0);
  assert.ok(lowerOuter.yOffset > lowerInner.yOffset);

  assert.ok(Math.abs(upperInner.opacity - 0.35) < 0.02);
  assert.ok(Math.abs(lowerInner.opacity - 0.35) < 0.02);
  assert.ok(Math.abs(upperOuter.opacity - 0.18) < 0.02);
  assert.ok(Math.abs(lowerOuter.opacity - 0.18) < 0.02);
  assert.ok(upperOuter.blur > upperInner.blur);
  assert.ok(lowerOuter.blur > lowerInner.blur);
});

test('computeScrollingLyricLayout interpolates continuously during cue transitions and responds to globalOffset', () => {
  const cues = makeSixCues();
  // Just 0.15s after cue 2 starts (8.15s), transition should be mid-scroll between index 1 and 2
  const midScroll = computeScrollingLyricLayout(
    cues,
    8.15,
    0,
    DEFAULT_FOCUSED_SCROLLING_CONFIG
  );
  assert.ok(midScroll.scrollFloatIndex > 1 && midScroll.scrollFloatIndex < 2);

  // Applying globalOffset +4.0s at currentTime 6.5s evaluates adjustedTime = 10.5s (cue 2)
  const shifted = computeScrollingLyricLayout(
    cues,
    6.5,
    4.0,
    DEFAULT_FOCUSED_SCROLLING_CONFIG
  );
  assert.equal(shifted.activeCueIndex, 2);
});

test('computeScrollingLyricLayout supports top-to-bottom scroll direction flip', () => {
  const cues = makeSixCues();
  const layout = computeScrollingLyricLayout(cues, 10.5, 0, {
    ...DEFAULT_FOCUSED_SCROLLING_CONFIG,
    scrollDirection: 'top-to-bottom',
  });
  const byCue = new Map(layout.items.map((item) => [item.cueIndex, item]));
  // In top-to-bottom mode, earlier lines sit below (positive yOffset) and upcoming lines sit above
  assert.ok(byCue.get(1)!.yOffset > 0);
  assert.ok(byCue.get(3)!.yOffset < 0);
});
