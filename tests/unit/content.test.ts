import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import facts from '../../src/content/facts.json';

interface Selected {
  age: number;
  text: string;
  evidence: string;
  check: string;
}

const audit: Selected[] = existsSync('content/facts/selected.json')
  ? JSON.parse(readFileSync('content/facts/selected.json', 'utf8'))
  : [];

const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

describe('facts', () => {
  it('has exactly one fact for every age 0..122', () => {
    expect(facts.map((f) => f.age)).toEqual(Array.from({ length: 123 }, (_, i) => i));
  });

  it('keeps every fact short, sourced, and in the right voice', () => {
    for (const f of facts) {
      expect(f.text.length, `age ${f.age}`).toBeGreaterThanOrEqual(40);
      expect(f.text.length, `age ${f.age}`).toBeLessThanOrEqual(180);
      expect(f.source.url, `age ${f.age}`).toMatch(/^https:\/\//);
      expect(f.source.label.length, `age ${f.age}`).toBeGreaterThan(2);
      expect(f.text, `age ${f.age}`).not.toMatch(/!|placeholder|lorem|TODO|studies show|did you know/i);
      expect(f.text, `age ${f.age}`).not.toMatch(/^At \d/);
    }
  });

  it('never repeats a fact', () => {
    const texts = new Set(facts.map((f) => f.text));
    expect(texts.size).toBe(facts.length);
  });

  it('keeps the mix varied', () => {
    const counts = new Map<string, number>();
    for (const f of facts) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
    for (const [kind, n] of counts) expect(n / facts.length, kind).toBeLessThanOrEqual(0.4);
  });

  it('places month-based milestones inside their year', () => {
    const toMonths = (raw: string) => (/^\d+$/.test(raw) ? Number(raw) : WORDS.indexOf(raw.toLowerCase()) + 1);
    // Ages in months ("18 months old", "by 30 months", "aged 12 to 19 months"), not durations ("nine months before").
    const ageInMonths = /\b(?:by|at|aged|as young as)\s+(\d+|[a-z]+)(?:\s+to\s+(\d+))?\s+months\b|\b(\d+|[a-z]+)[- ]months?[- ]old\b/gi;
    for (const f of facts) {
      const lo = 12 * f.age;
      const hi = 12 * f.age + 11;
      for (const m of f.text.matchAll(ageInMonths)) {
        const from = toMonths(m[1] ?? m[3]!);
        const to = m[2] ? Number(m[2]) : from;
        if (from <= 0) continue;
        if (to < lo || from > hi) expect.fail(`age ${f.age}: "${m[0]}" falls outside months ${lo}-${hi}`);
      }
    }
  });

  it('keeps the evidence for every fact on file', () => {
    expect(audit.length).toBe(123);
    for (const a of audit) {
      expect(a.evidence.length, `age ${a.age}`).toBeGreaterThan(10);
      expect(a.check.length, `age ${a.age}`).toBeGreaterThan(5);
    }
  });
});
