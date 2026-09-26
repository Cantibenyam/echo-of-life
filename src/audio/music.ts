/** Pitch helpers: note names, the major scale, its pentatonic subset, chords, and the life motif. */

const PITCH: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
/** Degrees of the major scale that form the major pentatonic. */
const PENTA = [0, 1, 2, 4, 5] as const; // scale steps 1, 2, 3, 5, 6

export type PitchClass = keyof typeof PITCH;

export function midi(note: string): number {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`bad note ${note}`);
  return 12 * (Number(m[2]) + 1) + PITCH[m[1]!]!;
}

export const hz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** A degree of the major scale (0 = root; may exceed 6 or go negative) as a MIDI number. */
export function scaleNote(root: string, degree: number, octave: number): number {
  const o = Math.floor(degree / 7);
  const d = ((degree % 7) + 7) % 7;
  return 12 * (octave + 1 + o) + PITCH[root]! + MAJOR[d]!;
}

/** The i-th step of the major pentatonic ladder above the root at the given octave. */
export function pentaNote(root: string, index: number, octave: number): number {
  const o = Math.floor(index / 5);
  const d = PENTA[((index % 5) + 5) % 5]!;
  return scaleNote(root, d + 7 * o, octave);
}

/** A triad on a scale degree (optionally with the added ninth), as MIDI numbers. */
export function chord(root: string, degree: number, octave: number, addNine = false): number[] {
  const notes = [degree, degree + 2, degree + 4].map((d) => scaleNote(root, d, octave));
  if (addNine) notes.push(scaleNote(root, degree + 8, octave));
  return notes;
}

/**
 * The life motif: five steps on the pentatonic ladder, seeded by the life. It returns in every
 * chapter in that chapter's key and voice, and once more after the last heartbeat.
 */
export function lifeMotif(rand: () => number): number[] {
  const steps = [-2, -1, 1, 1, 2, 2, 3];
  let idx = 2 + Math.floor(rand() * 3);
  const out = [idx];
  for (let i = 1; i < 5; i++) {
    let next = idx + steps[Math.floor(rand() * steps.length)]!;
    if (next < 0 || next > 8) next = idx - Math.sign(next - idx) * 1;
    idx = next;
    out.push(idx);
  }
  // Settle: the motif ends a step away from the root, so it sounds unfinished, like a question.
  if (out[4] === 0) out[4] = 1;
  return out;
}
