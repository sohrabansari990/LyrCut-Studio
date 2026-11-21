export type AspectRatio = '16:9' | '9:16';

export type MediaFitMode = 'cover' | 'contain-blur' | 'contain-black';

export type LyricTrackType = 'farsi' | 'romanized' | 'english';

export type LyricSourceType =
  | 'sample'
  | 'manual'
  | 'farsi-srt'
  | 'romanized-srt'
  | 'english-srt'
  | 'multi-srt';

export interface SrtValidationWarning {
  id: string;
  kind:
    | 'invalid-timestamp'
    | 'overlap'
    | 'empty-cue'
    | 'out-of-duration'
    | 'unmatched-track';
  message: string;
  cueId?: string;
  track?: LyricTrackType;
}

export interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

export interface LyricCue {
  id: string;
  startTime: number; // seconds
  endTime: number; // seconds
  primary: string; // Farsi / Dari or main lyric line
  roman: string; // Romanized / Finglish
  english: string; // English translation
  sourceStartTime?: number; // original SRT start before manual/global tweaks
  sourceEndTime?: number;
  unmatchedTracks?: LyricTrackType[];
  words?: WordTiming[];
  confidence?: number;
  stanzaIndex?: number;
}

export interface TrackCueItem {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  track: LyricTrackType;
}

export interface EnabledTracks {
  primary: boolean;
  roman: boolean;
  english: boolean;
}

export type PlainImportMode =
  | 'auto'
  | 'single'
  | 'paired-2'
  | 'paired-3'
  | 'pipe-separated';

export interface LyricStyleConfig {
  position: 'top' | 'center' | 'bottom';
  verticalOffsetPct: number; // -20 to +20 fine adjustment
  fontScale: number; // 0.7 to 1.6
  alignment: 'center' | 'left' | 'right';
  backdrop: 'shadow' | 'scrim' | 'box';
  primaryColor: string;
  secondaryColor: string;
  showSafeZones: boolean;
  farsiFont: string;
  latinFont: string;
}

export const FARSI_FONT_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Noto Nastaliq Urdu (Nastaliq)', value: 'Noto Nastaliq Urdu' },
  { label: 'IranNastaliq (Local System)', value: 'IranNastaliq' },
  { label: 'Vazirmatn (Modern Persian)', value: 'Vazirmatn' },
  { label: 'B Nazanin (Classic Persian)', value: 'B Nazanin' },
];

export const LATIN_FONT_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans' },
  { label: 'Inter / System Sans', value: 'system-ui' },
  { label: 'Georgia Serif', value: 'Georgia' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
];

const PERSIAN_ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function detectScriptDirection(text: string): 'rtl' | 'ltr' {
  if (!text) return 'ltr';
  return PERSIAN_ARABIC_REGEX.test(text) ? 'rtl' : 'ltr';
}

export function isSrtContent(content: string): boolean {
  return /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(
    content
  );
}

export function parseSrtTime(timeStr: string): number {
  const cleaned = timeStr.trim().replace(',', '.');
  const match = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) {
    throw new Error(`Invalid SRT timestamp: "${timeStr}"`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) {
    throw new Error(`Out-of-range SRT timestamp: "${timeStr}"`);
  }
  const millis = match[4] ? Number(match[4].padEnd(3, '0')) : 0;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function formatSrtTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  const adjustedSec = millis === 1000 ? seconds + 1 : seconds;
  const adjustedMillis = millis === 1000 ? 0 : millis;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0'
  )}:${String(adjustedSec).padStart(2, '0')},${String(adjustedMillis).padStart(3, '0')}`;
}

export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe - Math.floor(safe)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(
    centis
  ).padStart(2, '0')}`;
}

export function parseTimecodeInput(value: string): number | null {
  const trimmed = value.trim();
  const colonParts = trimmed.split(':');
  if (colonParts.length === 1) {
    const num = Number(colonParts[0]);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }
  if (colonParts.length === 2) {
    const mins = Number(colonParts[0]);
    const secs = Number(colonParts[1]);
    if (Number.isFinite(mins) && Number.isFinite(secs) && mins >= 0 && secs >= 0) {
      return mins * 60 + secs;
    }
    return null;
  }
  if (colonParts.length === 3) {
    const hrs = Number(colonParts[0]);
    const mins = Number(colonParts[1]);
    const secs = Number(colonParts[2].replace(',', '.'));
    if (
      Number.isFinite(hrs) &&
      Number.isFinite(mins) &&
      Number.isFinite(secs) &&
      hrs >= 0 &&
      mins >= 0 &&
      secs >= 0
    ) {
      return hrs * 3600 + mins * 60 + secs;
    }
  }
  return null;
}

function makeCueId(index: number): string {
  return `cue-${index + 1}-${Math.random().toString(36).slice(2, 7)}`;
}

function mapLinesToTracks(lines: string[]): {
  primary: string;
  roman: string;
  english: string;
} {
  if (lines.length === 1 && lines[0].includes('|')) {
    const parts = lines[0].split('|').map((p) => p.trim());
    return {
      primary: parts[0] ?? '',
      roman: parts[1] ?? '',
      english: parts[2] ?? '',
    };
  }
  return {
    primary: (lines[0] ?? '').trim(),
    roman: (lines[1] ?? '').trim(),
    english: (lines[2] ?? '').trim(),
  };
}

export function parseSrt(content: string): LyricCue[] {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const cues: LyricCue[] = [];

  for (const block of blocks) {
    const rawLines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (rawLines.length === 0) continue;

    const timeLineIdx = rawLines.findIndex((line) => line.includes('-->'));
    if (timeLineIdx === -1) continue;

    const timeLine = rawLines[timeLineIdx];
    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim());
    if (!startRaw || !endRaw) continue;

    let startTime = 0;
    let endTime = 0;
    try {
      startTime = parseSrtTime(startRaw);
      endTime = parseSrtTime(endRaw.split(/\s+/)[0]);
    } catch {
      continue;
    }

    if (endTime <= startTime) {
      endTime = startTime + 0.5;
    }

    const textLines = rawLines.slice(timeLineIdx + 1);
    if (textLines.length === 0) continue;

    const tracks = mapLinesToTracks(textLines);
    cues.push({
      id: makeCueId(cues.length),
      startTime,
      endTime,
      sourceStartTime: startTime,
      sourceEndTime: endTime,
      ...tracks,
    });
  }

  return cues.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Parses a single-language SRT file in the browser, returning cues tagged with its track
 * plus non-blocking validation warnings for malformed timestamps, reversed spans, or empty text.
 */
export function parseTrackSrt(
  content: string,
  track: LyricTrackType
): {
  cues: TrackCueItem[];
  warnings: SrtValidationWarning[];
} {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) {
    return {
      cues: [],
      warnings: [
        {
          id: `warn-empty-${track}`,
          kind: 'empty-cue',
          track,
          message: `The uploaded ${track} SRT file was empty.`,
        },
      ],
    };
  }

  const blocks = normalized.split(/\n{2,}/);
  const cues: TrackCueItem[] = [];
  const warnings: SrtValidationWarning[] = [];

  blocks.forEach((block, bIdx) => {
    const rawLines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (rawLines.length === 0) return;

    const timeLineIdx = rawLines.findIndex((line) => line.includes('-->'));
    if (timeLineIdx === -1) {
      warnings.push({
        id: `warn-ts-missing-${track}-${bIdx}`,
        kind: 'invalid-timestamp',
        track,
        message: `Block #${bIdx + 1} (${track} SRT) is missing a valid "-->" timestamp line.`,
      });
      return;
    }

    const timeLine = rawLines[timeLineIdx];
    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim());
    if (!startRaw || !endRaw) {
      warnings.push({
        id: `warn-ts-empty-${track}-${bIdx}`,
        kind: 'invalid-timestamp',
        track,
        message: `Block #${bIdx + 1} (${track} SRT) has an incomplete timestamp range.`,
      });
      return;
    }

    let startTime = 0;
    let endTime = 0;
    try {
      startTime = parseSrtTime(startRaw);
      endTime = parseSrtTime(endRaw.split(/\s+/)[0]);
    } catch {
      warnings.push({
        id: `warn-ts-bad-${track}-${bIdx}`,
        kind: 'invalid-timestamp',
        track,
        message: `Block #${bIdx + 1} (${track} SRT) has invalid timestamp "${timeLine}".`,
      });
      return;
    }

    if (endTime <= startTime) {
      warnings.push({
        id: `warn-ts-order-${track}-${bIdx}`,
        kind: 'invalid-timestamp',
        track,
        message: `Block #${bIdx + 1} (${track} SRT) ends before it starts (${formatTimecode(startTime)} -> ${formatTimecode(endTime)}). Auto-clamped to +0.5s.`,
      });
      endTime = Number((startTime + 0.5).toFixed(3));
    }

    const text = rawLines.slice(timeLineIdx + 1).join(' ').trim();
    if (!text) {
      warnings.push({
        id: `warn-empty-cue-${track}-${bIdx}`,
        kind: 'empty-cue',
        track,
        message: `Cue #${bIdx + 1} (${track} SRT) at ${formatTimecode(startTime)} has empty lyric text.`,
      });
    }

    cues.push({
      id: `${track}-${cues.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      startTime,
      endTime,
      text,
      track,
    });
  });

  cues.sort((a, b) => a.startTime - b.startTime);
  return { cues, warnings };
}

function setTrackField(cue: LyricCue, track: LyricTrackType, text: string): LyricCue {
  if (track === 'farsi') return { ...cue, primary: text };
  if (track === 'romanized') return { ...cue, roman: text };
  return { ...cue, english: text };
}

/**
 * Merges a single-language SRT track into existing project cues by timestamp overlap or
 * time proximity (`toleranceSec`), preserving unmatched cues cleanly and marking unmatched tracks.
 */
export function mergeTrackSrtIntoCues(
  existingCues: LyricCue[],
  incoming: TrackCueItem[],
  track: LyricTrackType,
  toleranceSec = 0.65
): { cues: LyricCue[]; unmatchedCount: number } {
  if (incoming.length === 0) {
    return { cues: existingCues, unmatchedCount: 0 };
  }

  // If project currently has no cues (or user replaced all cues on fresh single-track import),
  // build directly from incoming track.
  if (existingCues.length === 0) {
    const fresh: LyricCue[] = incoming.map((item, idx) => {
      const base: LyricCue = {
        id: makeCueId(idx),
        startTime: item.startTime,
        endTime: item.endTime,
        sourceStartTime: item.startTime,
        sourceEndTime: item.endTime,
        primary: '',
        roman: '',
        english: '',
      };
      return setTrackField(base, track, item.text);
    });
    return { cues: fresh, unmatchedCount: 0 };
  }

  // Clear previous text for this specific track before merging the new file for this track
  const working: LyricCue[] = existingCues.map((c) => {
    const cleared = setTrackField(c, track, '');
    return {
      ...cleared,
      unmatchedTracks: cleared.unmatchedTracks?.filter((t) => t !== track),
    };
  });

  const matchedCueIndices = new Set<number>();
  let unmatchedCount = 0;

  for (const item of incoming) {
    let bestIdx = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < working.length; i++) {
      if (matchedCueIndices.has(i)) continue;
      const target = working[i];
      const overlap = Math.min(target.endTime, item.endTime) - Math.max(target.startTime, item.startTime);
      const startDiff = Math.abs(target.startTime - item.startTime);
      const midDiff = Math.abs(
        (target.startTime + target.endTime) / 2 - (item.startTime + item.endTime) / 2
      );

      if (overlap > 0.1 || startDiff <= toleranceSec || midDiff <= toleranceSec) {
        // Lower score is better match
        const score = startDiff * 0.7 + midDiff * 0.3 - Math.max(0, overlap) * 0.5;
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    }

    if (bestIdx !== -1) {
      matchedCueIndices.add(bestIdx);
      working[bestIdx] = setTrackField(working[bestIdx], track, item.text);
    } else {
      unmatchedCount++;
      let created: LyricCue = {
        id: makeCueId(working.length),
        startTime: item.startTime,
        endTime: item.endTime,
        sourceStartTime: item.startTime,
        sourceEndTime: item.endTime,
        primary: '',
        roman: '',
        english: '',
        unmatchedTracks: [track],
      };
      created = setTrackField(created, track, item.text);
      working.push(created);
    }
  }

  // Flag existing cues that have text in other tracks but were missed by incoming multi-SRT merge
  for (let i = 0; i < working.length; i++) {
    if (!matchedCueIndices.has(i)) {
      const c = working[i];
      const hasOtherText = Boolean(c.primary.trim() || c.roman.trim() || c.english.trim());
      if (hasOtherText && !setTrackField({ ...c }, track, '').unmatchedTracks?.includes(track)) {
        const existingOtherTrackContent =
          (track !== 'farsi' && c.primary.trim()) ||
          (track !== 'romanized' && c.roman.trim()) ||
          (track !== 'english' && c.english.trim());
        if (existingOtherTrackContent) {
          unmatchedCount++;
          c.unmatchedTracks = Array.from(new Set([...(c.unmatchedTracks ?? []), track]));
        }
      }
    }
  }

  const cleaned = working
    .filter((c) => Boolean(c.primary.trim() || c.roman.trim() || c.english.trim()))
    .sort((a, b) => a.startTime - b.startTime);

  return { cues: cleaned, unmatchedCount };
}

/**
 * Validates cues for overlaps, empty text, cues beyond song duration, and unmatched tracks.
 */
export function validateLyricCues(
  cues: LyricCue[],
  songDuration: number,
  parseWarnings: SrtValidationWarning[] = []
): SrtValidationWarning[] {
  const warnings: SrtValidationWarning[] = [...parseWarnings];
  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sorted.length; i++) {
    const cue = sorted[i];
    const hasAnyText = Boolean(
      cue.primary.trim() || cue.roman.trim() || cue.english.trim()
    );
    if (!hasAnyText) {
      warnings.push({
        id: `val-empty-${cue.id}`,
        kind: 'empty-cue',
        cueId: cue.id,
        message: `Line ${i + 1} (${formatTimecode(cue.startTime)}) has no lyric text.`,
      });
    }

    if (cue.startTime < 0 || (songDuration > 0 && cue.endTime > songDuration + 0.05)) {
      warnings.push({
        id: `val-dur-${cue.id}`,
        kind: 'out-of-duration',
        cueId: cue.id,
        message: `Line ${i + 1} (${formatTimecode(cue.startTime)}–${formatTimecode(
          cue.endTime
        )}) extends outside song duration (${formatTimecode(songDuration)}).`,
      });
    }

    if (cue.endTime <= cue.startTime) {
      warnings.push({
        id: `val-order-${cue.id}`,
        kind: 'invalid-timestamp',
        cueId: cue.id,
        message: `Line ${i + 1} has invalid duration (${formatTimecode(
          cue.startTime
        )} >= ${formatTimecode(cue.endTime)}).`,
      });
    }

    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      if (cue.endTime - next.startTime > 0.02) {
        warnings.push({
          id: `val-overlap-${cue.id}`,
          kind: 'overlap',
          cueId: cue.id,
          message: `Line ${i + 1} overlaps Line ${i + 2} by ${(
            cue.endTime - next.startTime
          ).toFixed(2)}s.`,
        });
      }
    }

    if (cue.unmatchedTracks && cue.unmatchedTracks.length > 0) {
      warnings.push({
        id: `val-unmatched-${cue.id}`,
        kind: 'unmatched-track',
        cueId: cue.id,
        message: `Line ${i + 1} (${formatTimecode(
          cue.startTime
        )}) could not match ${cue.unmatchedTracks.join(', ')} timestamps.`,
      });
    }
  }

  return warnings;
}

export function parsePlainLyrics(
  content: string,
  options: {
    mode?: PlainImportMode;
    totalDuration?: number;
  } = {}
): LyricCue[] {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return [];

  if (isSrtContent(normalized)) {
    const srtCues = parseSrt(normalized);
    if (srtCues.length > 0) return srtCues;
  }

  const totalDuration = Math.max(4, options.totalDuration ?? 30);
  let mode: PlainImportMode = options.mode ?? 'auto';

  if (mode === 'auto') {
    const nonEmptyLines = normalized
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (nonEmptyLines.some((l) => l.includes('|'))) {
      mode = 'pipe-separated';
    } else if (/\n\s*\n/.test(normalized)) {
      const blocks = normalized
        .split(/\n{2,}/)
        .map((b) =>
          b
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        )
        .filter((lines) => lines.length > 0);

      const mixedBlocks = blocks.filter((lines) => {
        if (lines.length < 2 || lines.length > 3) return false;
        const dirs = new Set(lines.map((l) => detectScriptDirection(l)));
        return dirs.has('rtl') && dirs.has('ltr');
      });

      if (blocks.length > 0 && mixedBlocks.length >= Math.ceil(blocks.length * 0.5)) {
        const avgLines =
          mixedBlocks.reduce((acc, lines) => acc + lines.length, 0) /
          mixedBlocks.length;
        mode = avgLines >= 2.5 ? 'paired-3' : 'paired-2';
      } else {
        mode = 'single';
      }
    } else {
      mode = 'single';
    }
  }

  const entries: Array<{
    primary: string;
    roman: string;
    english: string;
    stanzaIndex: number;
  }> = [];

  if (mode === 'pipe-separated') {
    const blocks = normalized.split(/\n{2,}/);
    blocks.forEach((block, sIdx) => {
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        entries.push({ ...mapLinesToTracks([line]), stanzaIndex: sIdx });
      }
    });
  } else if (mode === 'paired-2' || mode === 'paired-3') {
    const groupSize = mode === 'paired-2' ? 2 : 3;
    const hasBlankSeparators = /\n\s*\n/.test(normalized);
    if (hasBlankSeparators) {
      const stanzas = normalized.split(/\n{2,}/);
      stanzas.forEach((stanza, sIdx) => {
        const lines = stanza
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) return;
        if (lines.length <= 3) {
          entries.push({ ...mapLinesToTracks(lines), stanzaIndex: sIdx });
        } else {
          for (let i = 0; i < lines.length; i += groupSize) {
            entries.push({
              ...mapLinesToTracks(lines.slice(i, i + groupSize)),
              stanzaIndex: sIdx,
            });
          }
        }
      });
    } else {
      const lines = normalized
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      for (let i = 0; i < lines.length; i += groupSize) {
        entries.push({ ...mapLinesToTracks(lines.slice(i, i + groupSize)), stanzaIndex: 0 });
      }
    }
  } else {
    const stanzas = /\n\s*\n/.test(normalized) ? normalized.split(/\n{2,}/) : [normalized];
    stanzas.forEach((stanza, sIdx) => {
      const lines = stanza
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        entries.push({ primary: line, roman: '', english: '', stanzaIndex: sIdx });
      }
    });
  }

  if (entries.length === 0) return [];

  const slotDuration = totalDuration / entries.length;
  return entries.map((entry, idx) => {
    const startTime = Number((idx * slotDuration).toFixed(2));
    const endTime = Number(((idx + 1) * slotDuration).toFixed(2));
    return {
      id: makeCueId(idx),
      startTime,
      endTime: Math.max(startTime + 0.5, endTime),
      primary: entry.primary,
      roman: entry.roman,
      english: entry.english,
      stanzaIndex: entry.stanzaIndex,
    };
  });
}

export function getActiveCueAtTime(
  cues: LyricCue[],
  currentTime: number,
  globalOffset = 0
): LyricCue | null {
  const adjustedTime = currentTime + globalOffset;
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (adjustedTime >= cue.startTime && adjustedTime < cue.endTime) {
      return cue;
    }
  }
  return null;
}

export function stampCueSync(
  cues: LyricCue[],
  activeIndex: number,
  currentTime: number,
  totalDuration: number
): { cues: LyricCue[]; nextIndex: number } {
  if (cues.length === 0 || activeIndex < 0 || activeIndex >= cues.length) {
    return { cues, nextIndex: activeIndex };
  }

  const clampedTime = Math.max(0, Math.min(currentTime, Math.max(0.2, totalDuration - 0.1)));
  const updated = cues.map((c) => ({ ...c }));

  if (activeIndex > 0) {
    const prev = updated[activeIndex - 1];
    prev.endTime = Number(Math.max(prev.startTime + 0.25, clampedTime).toFixed(2));
  }

  const current = updated[activeIndex];
  current.startTime = Number(clampedTime.toFixed(2));

  const nextStart =
    activeIndex + 1 < updated.length
      ? updated[activeIndex + 1].startTime
      : totalDuration;
  const fallbackEnd = Math.min(
    totalDuration,
    Math.max(
      current.startTime + 2.5,
      nextStart > current.startTime + 0.3 ? nextStart : current.startTime + 2.5
    )
  );
  current.endTime = Number(Math.max(current.startTime + 0.3, fallbackEnd).toFixed(2));

  const nextIndex = Math.min(updated.length - 1, activeIndex + 1);
  return { cues: updated, nextIndex };
}

export function updateCueTiming(
  cues: LyricCue[],
  id: string,
  startTime: number,
  endTime: number
): LyricCue[] {
  const safeStart = Math.max(0, Number(startTime.toFixed(2)));
  const safeEnd = Math.max(safeStart + 0.2, Number(endTime.toFixed(2)));
  return cues
    .map((cue) =>
      cue.id === id ? { ...cue, startTime: safeStart, endTime: safeEnd } : cue
    )
    .sort((a, b) => a.startTime - b.startTime);
}

export function splitCueAtTime(
  cues: LyricCue[],
  id: string,
  splitTime: number
): LyricCue[] {
  const idx = cues.findIndex((c) => c.id === id);
  if (idx === -1) return cues;
  const target = cues[idx];
  const midpoint = (target.startTime + target.endTime) / 2;
  const effectiveSplit =
    splitTime > target.startTime + 0.2 && splitTime < target.endTime - 0.2
      ? Number(splitTime.toFixed(2))
      : Number(midpoint.toFixed(2));

  if (effectiveSplit <= target.startTime + 0.15 || effectiveSplit >= target.endTime - 0.15) {
    return cues;
  }

  const first: LyricCue = {
    ...target,
    endTime: effectiveSplit,
  };
  const second: LyricCue = {
    ...target,
    id: makeCueId(cues.length + 1),
    startTime: effectiveSplit,
  };
  const next = [...cues];
  next.splice(idx, 1, first, second);
  return next.sort((a, b) => a.startTime - b.startTime);
}

export function duplicateCue(cues: LyricCue[], id: string): LyricCue[] {
  const idx = cues.findIndex((c) => c.id === id);
  if (idx === -1) return cues;
  const target = cues[idx];
  const len = Math.max(0.4, target.endTime - target.startTime);
  const copyStart = Number((target.endTime + 0.05).toFixed(2));
  const copy: LyricCue = {
    ...target,
    id: makeCueId(cues.length + 2),
    startTime: copyStart,
    endTime: Number((copyStart + len).toFixed(2)),
  };
  const next = [...cues];
  next.splice(idx + 1, 0, copy);
  return next.sort((a, b) => a.startTime - b.startTime);
}

export function shiftAllCues(cues: LyricCue[], offsetSeconds: number): LyricCue[] {
  return cues.map((cue) => {
    const duration = Math.max(0.2, cue.endTime - cue.startTime);
    const nextStart = Math.max(0, Number((cue.startTime + offsetSeconds).toFixed(2)));
    const nextEnd = Number((nextStart + duration).toFixed(2));
    return {
      ...cue,
      startTime: nextStart,
      endTime: nextEnd,
    };
  });
}

export function exportToSrt(
  cues: LyricCue[],
  enabledTracks: EnabledTracks,
  globalOffset = 0
): string {
  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
  const blocks: string[] = [];

  sorted.forEach((cue) => {
    const lines: string[] = [];
    if (enabledTracks.primary && cue.primary.trim()) lines.push(cue.primary.trim());
    if (enabledTracks.roman && cue.roman.trim()) lines.push(cue.roman.trim());
    if (enabledTracks.english && cue.english.trim()) lines.push(cue.english.trim());

    if (lines.length === 0) return;

    const start = Math.max(0, cue.startTime - globalOffset);
    const end = Math.max(start + 0.2, cue.endTime - globalOffset);
    blocks.push(
      `${blocks.length + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(
        end
      )}\n${lines.join('\n')}`
    );
  });

  return blocks.join('\n\n') + (blocks.length > 0 ? '\n' : '');
}

export const SAMPLE_MULTI_LYRICS = `شبِ یلدا وُ بارونِ پاییز | Shab-e yalda o baaroone paayeez | Solstice night and autumn rain
تو کنارم نشستی چِه آرام | To kenaaram neshesti che aaraam | Sitting beside me, calm and warm
صدایِ سازِ تو پیچیده دَر باد | Sedaaye saaze to peechide dar baad | The sound of your melody drifts in the wind
هر نَفَس با تو رنگی زِ رویاست | Har nafas baa to rangi ze royaast | Every breath with you holds the color of a dream
تا سحر می‌خونم قصّه‌یِ ما | Taa sahar mikhoonam ghesseye maa | Until dawn I will sing our story`;

export function createSampleCues(totalDuration = 24): LyricCue[] {
  return parsePlainLyrics(SAMPLE_MULTI_LYRICS, {
    mode: 'pipe-separated',
    totalDuration,
  });
}
