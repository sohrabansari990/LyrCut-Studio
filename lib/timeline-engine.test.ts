import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioTimelineClip,
  TimedEffectClip,
  VisualTimelineClip,
  closeGapsAfterTrackMove,
  closeTrackGaps,
  collectTimelineSnapTargets,
  computeEnvelopeGain,
  computeTimelineDisplayDuration,
  evaluateLayerAtTime,
  extendFullTimelineImageClips,
  getActiveAudioClipAtTime,
  getActiveAudioClipsAtTime,
  getActiveVisualClipAtTime,
  getActiveVisualClipsAtTime,
  getAudioTrackCount,
  getVisualTrackCount,
  moveClipToTrack,
  pasteCuesAtTime,
  pasteTimedClipsAtTime,
  removeLayerKeyframe,
  resolveBeatEffectsAtTime,
  snapClipEdgeToTargets,
  snapClipMoveToTargets,
  splitAudioClipAtTime,
  splitEffectClipAtTime,
  splitVisualClipAtTime,
  upsertLayerKeyframe,
} from './timeline-engine';
import { DEFAULT_BEAT_EFFECTS_CONFIG } from './beat-effects';
import { CanvasLayer } from './canvas-layers';
import { LyricCue } from './lyrics-parser';

test('splitVisualClipAtTime cuts video clip and advances sourceStart on right segment', () => {
  const clips: VisualTimelineClip[] = [
    {
      id: 'v1',
      mediaId: 'm1',
      name: 'Stage Video',
      kind: 'video',
      url: 'blob:v1',
      startTime: 2,
      endTime: 10,
      sourceStart: 1,
      sourceDuration: 20,
      fadeIn: 0.5,
      fadeOut: 0.5,
    },
  ];

  const split = splitVisualClipAtTime(clips, 'v1', 5.5);
  assert.equal(split.length, 2);
  assert.equal(split[0].startTime, 2);
  assert.equal(split[0].endTime, 5.5);
  assert.equal(split[0].sourceStart, 1);
  assert.equal(split[1].startTime, 5.5);
  assert.equal(split[1].endTime, 10);
  assert.equal(split[1].sourceStart, 4.5);

  const active = getActiveVisualClipAtTime(split, 7);
  assert.ok(active);
  assert.equal(active.clip.id, split[1].id);
  assert.equal(active.localMediaTime, 6);
});

test('splitAudioClipAtTime and computeEnvelopeGain apply accurate fade-in and fade-out', () => {
  const clips: AudioTimelineClip[] = [
    {
      id: 'a1',
      mediaId: 'song1',
      name: 'Demo Song',
      url: 'blob:a1',
      startTime: 0,
      endTime: 20,
      sourceStart: 0,
      sourceDuration: 20,
      fadeIn: 2,
      fadeOut: 4,
      volume: 1,
    },
  ];

  assert.equal(computeEnvelopeGain(0, 20, 2, 4), 0);
  assert.equal(computeEnvelopeGain(1, 20, 2, 4), 0.5);
  assert.equal(computeEnvelopeGain(10, 20, 2, 4), 1);
  assert.equal(computeEnvelopeGain(18, 20, 2, 4), 0.5);

  const activeMidFade = getActiveAudioClipAtTime(clips, 1);
  assert.ok(activeMidFade);
  assert.equal(activeMidFade.gain, 0.5);

  const cut = splitAudioClipAtTime(clips, 'a1', 8);
  assert.equal(cut.length, 2);
  assert.equal(cut[0].endTime, 8);
  assert.equal(cut[1].startTime, 8);
  assert.equal(cut[1].sourceStart, 8);
});

test('computeTimelineDisplayDuration gives ~50% breathing room for long audio tracks', () => {
  const display = computeTimelineDisplayDuration(24);
  assert.ok(display >= 44, `expected >= 44, got ${display}`);
  assert.ok(24 / display <= 0.55);
});

test('evaluateLayerAtTime animates slide-right entrance and holds position afterwards', () => {
  const layer: CanvasLayer = {
    id: 'img-hero',
    type: 'image',
    name: 'Character',
    x: 1100,
    y: 200,
    width: 400,
    height: 500,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    aspectLocked: true,
    startTime: 1,
    endTime: 8,
    animation: {
      enterPreset: 'slide-right',
      exitPreset: 'fade',
      inDuration: 1.0,
      outDuration: 0.5,
      easing: 'ease-out',
    },
  };

  // Before startTime -> hidden
  assert.equal(evaluateLayerAtTime(layer, 0.5, 1920, 1080).visible, false);

  // At t=1.0 (start) -> off-screen right
  const atStart = evaluateLayerAtTime(layer, 1.0, 1920, 1080);
  assert.ok(atStart.layer.x >= 1920);

  // Mid entrance (t=1.5) -> sliding toward 1100
  const atMid = evaluateLayerAtTime(layer, 1.5, 1920, 1080);
  assert.equal(atMid.visible, true);
  assert.ok(atMid.layer.x > 1100 && atMid.layer.x < 1920);

  // After entrance (t=4.0) -> stays at resting x=1100
  const atRest = evaluateLayerAtTime(layer, 4.0, 1920, 1080);
  assert.equal(atRest.visible, true);
  assert.equal(atRest.layer.x, 1100);
  assert.equal(atRest.layer.opacity, 1);

  // After endTime -> hidden
  assert.equal(evaluateLayerAtTime(layer, 8.5, 1920, 1080).visible, false);
});

test('upsertLayerKeyframe & evaluateLayerAtTime interpolate custom keyframes cleanly', () => {
  let layer: CanvasLayer = {
    id: 'txt-1',
    type: 'text',
    name: 'Title',
    x: 100,
    y: 120,
    width: 600,
    height: 100,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 0,
    aspectLocked: false,
  };

  layer = upsertLayerKeyframe(layer, 0, 'linear');
  layer = upsertLayerKeyframe({ ...layer, x: 500, opacity: 1 }, 2, 'linear');
  assert.equal(layer.keyframes?.length, 2);

  const mid = evaluateLayerAtTime(layer, 1, 1920, 1080);
  assert.equal(mid.visible, true);
  assert.equal(mid.layer.x, 300);
  assert.ok(Math.abs(mid.layer.opacity - 0.5) < 0.01);

  const removed = removeLayerKeyframe(layer, layer.keyframes![0].id);
  assert.equal(removed.keyframes?.length, 1);
});

test('resolveBeatEffectsAtTime activates timed FX clips only within their time frame', () => {
  const fxClips: TimedEffectClip[] = [
    {
      id: 'fx-1',
      name: 'Ring Ripple',
      effectType: 'ring-ripple',
      syncTarget: 'both',
      intensity: 0.9,
      sensitivity: 1.2,
      startTime: 4,
      endTime: 10,
    },
  ];

  const before = resolveBeatEffectsAtTime(DEFAULT_BEAT_EFFECTS_CONFIG, fxClips, 2);
  assert.equal(before.effectType, 'none');

  const during = resolveBeatEffectsAtTime(DEFAULT_BEAT_EFFECTS_CONFIG, fxClips, 6.5);
  assert.equal(during.effectType, 'ring-ripple');
  assert.equal(during.intensity, 0.9);

  const split = splitEffectClipAtTime(fxClips, 'fx-1', 7);
  assert.equal(split.length, 2);
  assert.equal(split[0].endTime, 7);
  assert.equal(split[1].startTime, 7);
});

test('pasteCuesAtTime and pasteTimedClipsAtTime preserve relative offsets for multi-selection', () => {
  const cues: LyricCue[] = [
    { id: 'c1', startTime: 1, endTime: 3, primary: 'L1', roman: '', english: '' },
    { id: 'c2', startTime: 4, endTime: 6, primary: 'L2', roman: '', english: '' },
  ];
  const next = pasteCuesAtTime(cues, cues, 10);
  assert.equal(next.length, 4);
  assert.equal(next[2].startTime, 10);
  assert.equal(next[2].endTime, 12);
  assert.equal(next[3].startTime, 13);
  assert.equal(next[3].endTime, 15);

  const fx: TimedEffectClip[] = [
    {
      id: 'fx1',
      name: 'Bounce',
      effectType: 'beat-bounce',
      syncTarget: 'both',
      intensity: 0.7,
      sensitivity: 1,
      startTime: 0,
      endTime: 2,
    },
  ];
  const pastedFx = pasteTimedClipsAtTime(fx, fx, 8, 'fx');
  assert.equal(pastedFx.length, 2);
  assert.equal(pastedFx[1].startTime, 8);
  assert.equal(pastedFx[1].endTime, 10);
});

test('getActiveVisualClipsAtTime returns stacked V1/V2/V3 layers in bottom-to-top order and respects hidden tracks', () => {
  const clips: VisualTimelineClip[] = [
    {
      id: 'v1-bg',
      mediaId: 'm1',
      name: 'Golden Dance',
      kind: 'video',
      url: 'blob:bg',
      trackIndex: 0,
      startTime: 0,
      endTime: 30,
      sourceStart: 0,
      sourceDuration: 30,
      fadeIn: 0,
      fadeOut: 0,
    },
    {
      id: 'v3-shadow',
      mediaId: 'm3',
      name: 'Veiled Shadow',
      kind: 'image',
      url: 'blob:shadow',
      trackIndex: 2,
      startTime: 0,
      endTime: 10,
      sourceStart: 0,
      sourceDuration: 0,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 0.85,
    },
    {
      id: 'v2-portrait',
      mediaId: 'm2',
      name: 'Portrait Cutout',
      kind: 'image',
      url: 'blob:cutout',
      trackIndex: 1,
      startTime: 0,
      endTime: 10,
      sourceStart: 0,
      sourceDuration: 0,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];

  assert.equal(getVisualTrackCount(clips, 1), 3);

  const stack = getActiveVisualClipsAtTime(clips, 5);
  assert.equal(stack.length, 3);
  assert.deepEqual(
    stack.map((h) => h.clip.id),
    ['v1-bg', 'v2-portrait', 'v3-shadow']
  );
  assert.equal(stack[2].opacity, 0.85);

  const hiddenV2 = getActiveVisualClipsAtTime(clips, 5, new Set([1]));
  assert.deepEqual(
    hiddenV2.map((h) => h.clip.id),
    ['v1-bg', 'v3-shadow']
  );

  // Moving clip to another track works and split preserves trackIndex
  const moved = moveClipToTrack(clips, 'v2-portrait', 3);
  assert.equal(getVisualTrackCount(moved, 1), 4);
  const splitV3 = splitVisualClipAtTime(clips, 'v3-shadow', 4);
  const halves = splitV3.filter((c) => c.mediaId === 'm3');
  assert.equal(halves.length, 2);
  assert.equal(halves[0].trackIndex, 2);
  assert.equal(halves[1].trackIndex, 2);
});

test('getActiveAudioClipsAtTime returns all overlapping unmuted audio tracks for simultaneous mixing', () => {
  const audioClips: AudioTimelineClip[] = [
    {
      id: 'a1-song',
      mediaId: 'song',
      name: 'Main Song',
      url: 'blob:song',
      trackIndex: 0,
      startTime: 0,
      endTime: 24,
      sourceStart: 0,
      sourceDuration: 24,
      fadeIn: 0,
      fadeOut: 0,
      volume: 1,
    },
    {
      id: 'a2-sfx',
      mediaId: 'sfx',
      name: 'Rain Ambience',
      url: 'blob:sfx',
      trackIndex: 1,
      startTime: 2,
      endTime: 12,
      sourceStart: 0,
      sourceDuration: 10,
      fadeIn: 2,
      fadeOut: 2,
      volume: 0.6,
    },
  ];

  assert.equal(getAudioTrackCount(audioClips, 1), 2);

  const both = getActiveAudioClipsAtTime(audioClips, 6);
  assert.equal(both.length, 2);
  assert.equal(both[0].clip.id, 'a1-song');
  assert.equal(both[1].clip.id, 'a2-sfx');
  assert.equal(both[1].gain, 0.6);

  const mutedA2 = getActiveAudioClipsAtTime(audioClips, 6, new Set([1]));
  assert.equal(mutedA2.length, 1);
  assert.equal(mutedA2[0].clip.id, 'a1-song');
});

test('magnetic timeline snapping sticks clip edges to neighbor boundaries, playhead & markers', () => {
  const targets = collectTimelineSnapTargets({
    visualClips: [
      { id: 'v1', startTime: 0, endTime: 6 },
      { id: 'v2', startTime: 6, endTime: 14 },
    ],
    audioClips: [],
    effectClips: [],
    cues: [],
    markers: [{ time: 10.5 }],
    currentTime: 3.25,
    excludeId: 'v2',
  });

  // Candidate start 6.12 is within 0.25s threshold of neighbor v1.endTime (6.0)
  const snapStart = snapClipMoveToTargets(6.12, 4, targets, 0.25);
  assert.equal(snapStart.snapped, true);
  assert.equal(snapStart.startTime, 6);
  assert.equal(snapStart.endTime, 10);
  assert.equal(snapStart.guideTime, 6);

  // Candidate end (6.6 + 4 = 10.6) snaps to marker at 10.5
  const snapEnd = snapClipMoveToTargets(6.6, 4, targets, 0.25);
  assert.equal(snapEnd.snapped, true);
  assert.equal(snapEnd.endTime, 10.5);
  assert.equal(snapEnd.startTime, 6.5);
  assert.equal(snapEnd.guideTime, 10.5);

  // Single-edge trim snaps to playhead at 3.25
  const edgeSnap = snapClipEdgeToTargets(3.15, targets, 0.25, 0, 10);
  assert.equal(edgeSnap.snapped, true);
  assert.equal(edgeSnap.time, 3.25);
});

test('closeTrackGaps and closeGapsAfterTrackMove leave zero gaps on target track without affecting other tracks', () => {
  const clips: VisualTimelineClip[] = [
    {
      id: 'v1-a',
      mediaId: 'm1',
      name: 'Clip A',
      kind: 'image',
      url: 'blob:a',
      trackIndex: 0,
      startTime: 2,
      endTime: 6,
      sourceStart: 0,
      sourceDuration: 0,
      fadeIn: 0,
      fadeOut: 0,
    },
    {
      id: 'v1-b',
      mediaId: 'm2',
      name: 'Clip B',
      kind: 'image',
      url: 'blob:b',
      trackIndex: 0,
      startTime: 9,
      endTime: 15,
      sourceStart: 0,
      sourceDuration: 0,
      fadeIn: 0,
      fadeOut: 0,
    },
    {
      id: 'v2-overlay',
      mediaId: 'm3',
      name: 'Overlay',
      kind: 'image',
      url: 'blob:c',
      trackIndex: 1,
      startTime: 5,
      endTime: 12,
      sourceStart: 0,
      sourceDuration: 0,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];

  const closed = closeTrackGaps(clips, 0);
  assert.equal(closed[0].startTime, 0);
  assert.equal(closed[0].endTime, 4);
  assert.equal(closed[1].startTime, 4);
  assert.equal(closed[1].endTime, 10);
  // Track 1 untouched
  assert.equal(closed[2].startTime, 5);
  assert.equal(closed[2].endTime, 12);

  // Dragging Clip B before Clip A reorders them flush with zero gap
  const movedBefore = closed.map((c) =>
    c.id === 'v1-b' ? { ...c, startTime: 0, endTime: 6 } : c
  );
  const reordered = closeGapsAfterTrackMove(movedBefore, 'v1-b', 0);
  const bAfter = reordered.find((c) => c.id === 'v1-b')!;
  const aAfter = reordered.find((c) => c.id === 'v1-a')!;
  assert.equal(bAfter.startTime, 0);
  assert.equal(bAfter.endTime, 6);
  assert.equal(aAfter.startTime, 6);
  assert.equal(aAfter.endTime, 10);
});

test('extendFullTimelineImageClips auto-extends full-length still images when song duration grows', () => {
  const clips: VisualTimelineClip[] = [
    {
      id: 'img-full',
      mediaId: 'm1',
      name: 'BG',
      kind: 'image',
      url: 'blob:1',
      trackIndex: 0,
      startTime: 0,
      endTime: 24,
      sourceStart: 0,
      sourceDuration: 0,
      fadeIn: 0,
      fadeOut: 0,
    },
    {
      id: 'img-trimmed',
      mediaId: 'm2',
      name: 'Short Cut',
      kind: 'image',
      url: 'blob:2',
      trackIndex: 1,
      startTime: 2,
      endTime: 10,
      sourceStart: 0,
      sourceDuration: 0,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];

  const extended = extendFullTimelineImageClips(clips, 24, 185.4);
  assert.equal(extended[0].endTime, 185.4);
  assert.equal(extended[1].endTime, 10);
});


