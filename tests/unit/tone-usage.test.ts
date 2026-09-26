import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const audio = files('src/audio');
const all = files('src');

describe('Tone.js usage rules', () => {
  it('never touches the deprecated globals bound to the first context', () => {
    for (const f of all) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/Tone\.(Transport|Destination|Master|Draw|Listener|context)\b/);
    }
  });

  it('keeps randomness seeded (no Loop.probability or humanize)', () => {
    for (const f of audio) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\.probability\b|humanize/);
      expect(src, f).not.toMatch(/Math\.random/);
    }
  });

  it('schedules on the audio clock, not with bare timers', () => {
    for (const f of audio) {
      if (f.endsWith(join('audio', 'index.ts'))) continue; // the page-facing facade may use window timers
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/(^|[^.\w])setTimeout\(/m);
    }
  });
});
