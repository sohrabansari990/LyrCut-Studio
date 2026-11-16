export type AspectRatio = '16:9' | '9:16';

export type MediaFitMode = 'cover' | 'contain-blur' | 'contain-black';

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
  primary: string; // e.g., Farsi or main lyric line
  roman: string; // e.g., Romanized / Finglish
  english: string; // e.g., English translation
  words?: WordTiming[]; // optional word-level forced alignment offsets
  stanzaIndex?: number; // preserves blank-line stanza grouping for alignment
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
}

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
  const millis = match[4] ? Number(match[4].padEnd(3, '0')) : 0;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function formatSrtTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  // Handle rounding edge case where millis === 1000
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
  // Accept MM:SS.cc or SS.cc or HH:MM:SS.mmm
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
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const cues: LyricCue[] = [];

  for (const block of blocks) {
    const rawLines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (rawLines.length === 0) continue;

    // Find timestamp line (with or without leading index line)
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
      ...tracks,
    });
  }

  return cues.sort((a, b) => a.startTime - b.startTime);
}

export function parsePlainLyrics(
  content: string,
  options: {
    mode?: PlainImportMode;
    totalDuration?: number;
  } = {}
): LyricCue[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
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

      // Only treat stanzas as multi-language translations if blocks mix scripts (RTL + LTR)
      // and have <= 3 lines per block. Same-script verse stanzas (e.g. 4-line Farsi verses)
      // must stay single-language cues (one cue per line).
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
        // If a stanza has more lines than groupSize, chunk it cleanly
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
  currentTime: number
): LyricCue | null {
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (currentTime >= cue.startTime && currentTime < cue.endTime) {
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

  // Close previous cue right as this cue begins
  if (activeIndex > 0) {
    const prev = updated[activeIndex - 1];
    prev.endTime = Number(Math.max(prev.startTime + 0.25, clampedTime).toFixed(2));
  }

  const current = updated[activeIndex];
  current.startTime = Number(clampedTime.toFixed(2));

  // Ensure current cue ends cleanly after startTime
  const nextStart =
    activeIndex + 1 < updated.length
      ? updated[activeIndex + 1].startTime
      : totalDuration;
  const fallbackEnd = Math.min(
    totalDuration,
    Math.max(current.startTime + 2.5, nextStart > current.startTime + 0.3 ? nextStart : current.startTime + 2.5)
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
  enabledTracks: EnabledTracks
): string {
  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
  const blocks: string[] = [];

  sorted.forEach((cue, idx) => {
    const lines: string[] = [];
    if (enabledTracks.primary && cue.primary.trim()) lines.push(cue.primary.trim());
    if (enabledTracks.roman && cue.roman.trim()) lines.push(cue.roman.trim());
    if (enabledTracks.english && cue.english.trim()) lines.push(cue.english.trim());

    if (lines.length === 0) return;

    blocks.push(
      `${blocks.length + 1}\n${formatSrtTime(cue.startTime)} --> ${formatSrtTime(
        cue.endTime
      )}\n${lines.join('\n')}`
    );
  });

  return blocks.join('\n\n') + (blocks.length > 0 ? '\n' : '');
}

export interface RawTranscribedCue {
  startTime: number;
  endTime: number;
  primary: string;
  roman?: string;
  english?: string;
}

export function normalizeTranscribedCues(
  rawCues: RawTranscribedCue[],
  totalDuration: number,
  offsetSeconds = 0
): LyricCue[] {
  const safeTotal = Math.max(1, totalDuration);
  const cleaned: LyricCue[] = [];

  for (let i = 0; i < rawCues.length; i++) {
    const item = rawCues[i];
    const primary = (item.primary ?? '').trim();
    const roman = (item.roman ?? '').trim();
    const english = (item.english ?? '').trim();
    if (!primary && !roman && !english) continue;

    const rawStart = Number.isFinite(item.startTime)
      ? item.startTime + offsetSeconds
      : offsetSeconds;
    const startTime = Number(
      Math.max(0, Math.min(safeTotal - 0.3, rawStart)).toFixed(2)
    );
    const rawEnd = Number.isFinite(item.endTime)
      ? item.endTime + offsetSeconds
      : startTime + 2.5;
    const endTime = Number(
      Math.min(safeTotal, Math.max(startTime + 0.3, rawEnd)).toFixed(2)
    );

    cleaned.push({
      id: `ai-cue-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
      startTime,
      endTime,
      primary,
      roman,
      english,
    });
  }

  cleaned.sort((a, b) => a.startTime - b.startTime);

  // Prevent overlapping cues
  for (let i = 0; i < cleaned.length - 1; i++) {
    if (cleaned[i].endTime > cleaned[i + 1].startTime) {
      cleaned[i].endTime = Number(
        Math.max(cleaned[i].startTime + 0.2, cleaned[i + 1].startTime).toFixed(2)
      );
    }
  }

  return cleaned;
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
