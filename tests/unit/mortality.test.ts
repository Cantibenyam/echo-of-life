import { describe, expect, it } from 'vitest';
import { MAX_AGE, TABLE, lifeExpectancy, meanLifespan, sampleLifespan } from '../../src/life/mortality';
import { Q } from '../../src/life/mortality.table';
import { mulberry32 } from '../../src/life/rng';
import nqx from '../../data/who/LIFE_0000000030-2019.json';

describe('mortality table (WHO 2019, global, both sexes)', () => {
  it('covers ages 0..122 with a hard cap', () => {
    expect(Q.length).toBe(123);
    expect(MAX_AGE).toBe(122);
    expect(Q[122]).toBe(1);
  });

  it('uses the WHO infant mortality exactly', () => {
    expect(Q[0]).toBeCloseTo(0.028942508, 9);
  });

  it('reproduces every WHO age-group survival probability', () => {
    for (const row of nqx.rows) {
      const m = /YEARS(\d\d)-(\d\d)$/.exec(row.ageGroup);
      if (!m) continue; // 85+
      const from = Number(m[1]);
      const n = from === 0 ? 1 : Number(m[2]) - from + 1;
      let survive = 1;
      for (let x = from; x < from + n; x++) survive *= 1 - Q[x]!;
      expect(Math.abs(1 - survive - row.value)).toBeLessThan(1e-9);
    }
  });

  it('has sane life expectancies', () => {
    expect(lifeExpectancy(0)).toBeGreaterThan(72.9);
    expect(lifeExpectancy(0)).toBeLessThan(73.3);
    expect(lifeExpectancy(85)).toBeGreaterThan(5.65);
    expect(lifeExpectancy(85)).toBeLessThan(5.73);
  });

  it('is a proper distribution', () => {
    const total = TABLE.d.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-12);
    expect(TABLE.cdf[122]).toBe(1);
  });

  it('never decreases from age 10, and plateaus at or below 0.5 before the cap', () => {
    for (let x = 11; x <= 122; x++) expect(Q[x]!).toBeGreaterThanOrEqual(Q[x - 1]!);
    for (let x = 85; x < 122; x++) {
      expect(Q[x]!).toBeGreaterThan(0);
      expect(Q[x]!).toBeLessThanOrEqual(0.5);
    }
  });

  it('matches the expected survival curve', () => {
    expect(1 - TABLE.S[5]!).toBeCloseTo(0.0383, 3);
    expect(TABLE.S[18]!).toBeCloseTo(0.953, 3);
    expect(TABLE.S[65]!).toBeCloseTo(0.776, 3);
    expect(TABLE.S[80]!).toBeCloseTo(0.473, 3);
    expect(TABLE.S[100]!).toBeGreaterThan(0.005);
    expect(TABLE.S[100]!).toBeLessThan(0.009);
    expect(TABLE.S[110]!).toBeLessThan(5e-5);
  });
});

describe('sampleLifespan', () => {
  it('maps the unit interval onto ages at the right boundaries', () => {
    expect(sampleLifespan(0)).toBe(0);
    expect(sampleLifespan(0.02894)).toBe(0);
    expect(sampleLifespan(0.029)).toBe(1);
    expect(sampleLifespan(1 - 1e-12)).toBe(122);
  });

  it('averages to the table mean over a million seeded draws', () => {
    const rand = mulberry32(20190101);
    const N = 1_000_000;
    let sum = 0;
    let infants = 0;
    for (let i = 0; i < N; i++) {
      const age = sampleLifespan(rand());
      sum += age;
      if (age === 0) infants++;
    }
    expect(meanLifespan()).toBeCloseTo(72.59, 1);
    expect(Math.abs(sum / N - meanLifespan())).toBeLessThan(0.1);
    expect(Math.abs(infants / N - 0.0289)).toBeLessThan(0.0006);
  });
});
