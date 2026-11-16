import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectScriptDirection,
  parseSrtTime,
  formatSrtTime,
  parseSrt,
  parsePlainLyrics,
  stampCueSync,
  updateCueTiming,
  shiftAllCues,
  exportToSrt,
  getActiveCueAtTime,
  normalizeTranscribedCues,
  SAMPLE_MULTI_LYRICS,
} from './lyrics-parser';

test('detectScriptDirection identifies Farsi/Arabic as rtl and Roman/English as ltr', () => {
  assert.equal(detectScriptDirection('شب یلدا و بارون پاییز'), 'rtl');
  assert.equal(detectScriptDirection('Shab-e yalda o baaroone paayeez'), 'ltr');
  assert.equal(detectScriptDirection('Solstice night and autumn rain'), 'ltr');
});

test('parseSrtTime and formatSrtTime round-trip accurately', () => {
  const secs = parseSrtTime('00:01:23,450');
  assert.equal(secs, 83.45);
  assert.equal(formatSrtTime(secs), '00:01:23,450');
});

test('parseSrt parses multi-line tri-lingual SRT blocks', () => {
  const srt = `1
00:00:01,000 --> 00:00:04,500
سلام دنیا
Salaam donya
Hello world

2
00:00:05,000 --> 00:00:09,000
شب بخیر
Shab bekheir
Good night`;

  const cues = parseSrt(srt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startTime, 1);
  assert.equal(cues[0].endTime, 4.5);
  assert.equal(cues[0].primary, 'سلام دنیا');
  assert.equal(cues[0].roman, 'Salaam donya');
  assert.equal(cues[0].english, 'Hello world');
  assert.equal(cues[1].startTime, 5);
});

test('parsePlainLyrics parses pipe-separated Farsi | Roman | English lyrics', () => {
  const cues = parsePlainLyrics(SAMPLE_MULTI_LYRICS, {
    mode: 'auto',
    totalDuration: 25,
  });
  assert.equal(cues.length, 5);
  assert.equal(cues[0].startTime, 0);
  assert.equal(cues[0].endTime, 5);
  assert.equal(cues[0].primary, 'شبِ یلدا وُ بارونِ پاییز');
  assert.equal(cues[0].roman, 'Shab-e yalda o baaroone paayeez');
  assert.equal(cues[0].english, 'Solstice night and autumn rain');
});

test('parsePlainLyrics parses 3-line stanzas into paired tracks', () => {
  const stanzaText = `خط اول فارسی
Khatte avval
First Persian line

خط دوم فارسی
Khatte dovvom
Second Persian line`;

  const cues = parsePlainLyrics(stanzaText, {
    mode: 'paired-3',
    totalDuration: 12,
  });
  assert.equal(cues.length, 2);
  assert.equal(cues[0].primary, 'خط اول فارسی');
  assert.equal(cues[0].roman, 'Khatte avval');
  assert.equal(cues[0].english, 'First Persian line');
  assert.equal(cues[1].startTime, 6);
  assert.equal(cues[1].endTime, 12);
});

test('stampCueSync stamps singer time and closes previous cue cleanly', () => {
  const initial = parsePlainLyrics('Line 1\nLine 2\nLine 3', {
    mode: 'single',
    totalDuration: 15,
  });

  const step1 = stampCueSync(initial, 0, 1.25, 15);
  assert.equal(step1.cues[0].startTime, 1.25);
  assert.equal(step1.nextIndex, 1);

  const step2 = stampCueSync(step1.cues, step1.nextIndex, 4.8, 15);
  assert.equal(step2.cues[0].endTime, 4.8);
  assert.equal(step2.cues[1].startTime, 4.8);
  assert.equal(step2.nextIndex, 2);
});

test('updateCueTiming, shiftAllCues, and getActiveCueAtTime behave deterministically', () => {
  const cues = parsePlainLyrics('A\nB', { mode: 'single', totalDuration: 10 });
  const updated = updateCueTiming(cues, cues[0].id, 1, 4);
  assert.equal(updated[0].startTime, 1);
  assert.equal(updated[0].endTime, 4);

  const shifted = shiftAllCues(updated, 0.5);
  assert.equal(shifted[0].startTime, 1.5);
  assert.equal(shifted[0].endTime, 4.5);

  const active = getActiveCueAtTime(shifted, 2.0);
  assert.equal(active?.primary, 'A');
  assert.equal(getActiveCueAtTime(shifted, 0.2), null);
});

test('exportToSrt respects enabled language track filters', () => {
  const cues = parsePlainLyrics('فارسی | Farsi | Persian', {
    mode: 'pipe-separated',
    totalDuration: 4,
  });
  const srtAll = exportToSrt(cues, { primary: true, roman: true, english: true });
  assert.match(srtAll, /فارسی\nFarsi\nPersian/);

  const srtFarsiOnly = exportToSrt(cues, {
    primary: true,
    roman: false,
    english: false,
  });
  assert.match(srtFarsiOnly, /فارسی/);
  assert.doesNotMatch(srtFarsiOnly, /Farsi/);
});

test('normalizeTranscribedCues clamps timestamps, sorts, and prevents overlaps', () => {
  const normalized = normalizeTranscribedCues(
    [
      {
        startTime: 6.5,
        endTime: 14.0,
        primary: '  خط دوم  ',
        roman: 'Khatte dovvom',
        english: 'Second line',
      },
      {
        startTime: -1,
        endTime: 7.5,
        primary: 'خط اول',
        roman: 'Khatte avval',
        english: 'First line',
      },
      {
        startTime: 2,
        endTime: 3,
        primary: '   ',
        roman: '',
        english: '',
      },
    ],
    10
  );

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].startTime, 0);
  assert.equal(normalized[0].endTime, 6.5);
  assert.equal(normalized[1].startTime, 6.5);
  assert.equal(normalized[1].endTime, 10);
  assert.equal(normalized[1].primary, 'خط دوم');

  const shiftedChunk = normalizeTranscribedCues(
    [{ startTime: 2, endTime: 5, primary: 'Chunk 2 line' }],
    200,
    150
  );
  assert.equal(shiftedChunk[0].startTime, 152);
  assert.equal(shiftedChunk[0].endTime, 155);
});

test('parsePlainLyrics auto-detects multi-verse Farsi stanzas as 16 individual lines', () => {
  const farsiSong = `امشب دلم میخواد برقصم
با نورِ شب، از غصه رد شم
موسیقی میپیچه توی قلبم
امشب دیگه مالِ خودمم

همه میخندن، حالا وقتشه
این شبِ ما تازه شروع شده
دستامو بالا، قلبم رها
هی میرقصم، بیفکرِ فردا

بیا بیا، بیا بیا
دلم میخواد امشب برقصم
بیا بیا، بیا بیا
با تو از این دنیا جدا شم

بیا بیا، بیا بیا
چشمات منو دیوونه کرده
بیا بیا، بیا بیا
این دل فقط تو رو میخواد`;

  const cues = parsePlainLyrics(farsiSong, { mode: 'auto', totalDuration: 64 });
  assert.equal(cues.length, 16);
  assert.equal(cues[0].primary, 'امشب دلم میخواد برقصم');
  assert.equal(cues[0].roman, '');
  assert.equal(cues[15].primary, 'این دل فقط تو رو میخواد');
});
