import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, bpmAt, chapterOf, lerp, progressIn, recordingsAt } from '../../src/audio/chapters';
import { hallSend, heartRate, hearingHz } from '../../src/audio/curves';
import { RECORDINGS } from '../../src/audio/recordings.generated';
import { AUDIO, T } from '../../src/config';
import { MAX_AGE } from '../../src/life/mortality';

describe('chapters', () => {
  it('cover every age 0..122 exactly once, in order', () => {
    expect(CHAPTERS[0]!.from).toBe(0);
    expect(CHAPTERS[CHAPTERS.length - 1]!.to).toBe(MAX_AGE);
    for (let i = 1; i < CHAPTERS.length; i++) expect(CHAPTERS[i]!.from).toBe(CHAPTERS[i - 1]!.to + 1);
    for (let age = 0; age <= MAX_AGE; age++) {
      const c = chapterOf(age);
      expect(age).toBeGreaterThanOrEqual(c.from);
      expect(age).toBeLessThanOrEqual(c.to);
    }
  });

  it('never lets more than two scenes overlap in normal play', () => {
    // A chapter crossfade must finish before the next chapter can begin.
    const inner = CHAPTERS.slice(1, -1).map((c) => c.to - c.from + 1);
    const shortest = Math.min(...inner);
    expect(AUDIO.chapterDispose).toBeLessThan((shortest * T.cooldown) / 1000);
  });

  it('only uses recordings that exist, with their files', () => {
    const ids = new Set(RECORDINGS.map((r) => r.id));
    for (const c of CHAPTERS) {
      for (const r of c.recordings) expect(ids.has(r.id), `${c.id} uses ${r.id}`).toBe(true);
    }
    for (const r of RECORDINGS) {
      expect(existsSync(`public/audio/${r.file}`), r.file).toBe(true);
      if (r.loop === 'pulse') {
        expect(r.loopStart!).toBeGreaterThanOrEqual(0);
        expect(r.loopEnd!).toBeGreaterThan(r.loopStart! + 2);
        expect(r.loopEnd!).toBeLessThanOrEqual(r.duration);
      }
    }
    expect(existsSync('public/audio/silence.mp3')).toBe(true);
  });

  it('never needs more than four recordings in memory (this year and the next two)', () => {
    for (let age = 0; age <= MAX_AGE; age++) {
      const ids = new Set<string>();
      for (let a = age; a <= Math.min(MAX_AGE, age + 2); a++) recordingsAt(chapterOf(a), a).forEach((r) => ids.add(r.id));
      expect(ids.size, `age ${age}: ${[...ids].join(', ')}`).toBeLessThanOrEqual(4);
    }
  });

  it('produces finite parameters for every age', () => {
    for (let age = 0; age <= MAX_AGE; age++) {
      const c = chapterOf(age);
      const t = progressIn(c, age);
      const ranges = [c.bpm, c.drones.gain, c.air?.gain, c.pad?.gain, c.bells?.density, c.pluck?.density, c.keys?.density, c.glass?.density];
      for (const r of ranges) if (r) expect(Number.isFinite(lerp(r, t))).toBe(true);
      expect(bpmAt(age)).toBeGreaterThan(30);
      expect(bpmAt(age)).toBeLessThan(90);
      expect(hearingHz(age)).toBeGreaterThan(1000);
      expect(hallSend(age)).toBeLessThanOrEqual(0.6);
    }
  });

  it('keeps the heartbeat in a resting range that never rises through childhood', () => {
    for (let age = 0; age <= MAX_AGE; age++) {
      expect(heartRate(age)).toBeGreaterThanOrEqual(60);
      expect(heartRate(age)).toBeLessThanOrEqual(140);
      if (age > 0 && age <= 18) expect(heartRate(age)).toBeLessThanOrEqual(heartRate(age - 1));
    }
  });
});
