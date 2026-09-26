/**
 * The ten chapters of a life, as pure data. Every [start, end] pair is interpolated across the
 * chapter's ages, so each year sounds a little different. Gains are in dB.
 *
 * Keys move by at most one sharp or flat between neighbours (F, C, G, Em, D, G, Am, F, Bb, Eb),
 * so chapter crossfades never clash, and the life ends one step darker than it began.
 */

export type Range = readonly [number, number];
export type VoiceName = 'musicbox' | 'marimba' | 'synth' | 'epiano' | 'glass';

export interface RecordingUse {
  readonly id: string;
  readonly gain: number;
  /** Optional low-pass (Hz): heard from inside, or from far away. */
  readonly lpf?: number;
  /** Only within these ages (inclusive). */
  readonly ages?: Range;
}

export interface ChapterSpec {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  /** Root of the major scale the chapter's notes come from. */
  readonly root: string;
  /** Melodies stay on the pentatonic subset. */
  readonly penta: boolean;
  /** Chord progressions as major-scale degrees (0 = I, 5 = vi). */
  readonly progressions: readonly (readonly number[])[];
  readonly drone: readonly string[];
  readonly bpm: Range;
  readonly motif: { readonly voice: VoiceName; readonly octave: number };
  readonly drones: { readonly gain: Range };
  readonly air?: { readonly color: 'pink' | 'brown'; readonly gain: Range; readonly rate: number; readonly base: number; readonly octaves: number };
  readonly pad?: { readonly gain: Range; readonly attack: Range; readonly release: number; readonly bars: Range; readonly octave: number };
  readonly bells?: { readonly gain: Range; readonly density: Range; readonly every: '2n' | '4n' | '8n'; readonly octaves: Range; readonly voice: VoiceName };
  readonly pluck?: { readonly gain: Range; readonly density: Range; readonly octave: number };
  readonly keys?: { readonly gain: Range; readonly density: Range; readonly every: '2n' | '1m'; readonly octave: number };
  readonly pulse?: { readonly gain: Range; readonly density: Range };
  readonly glass?: { readonly gain: Range; readonly density: Range; readonly octave: number };
  readonly delay?: { readonly wet: number; readonly feedback: number };
  readonly recordings: readonly RecordingUse[];
}

export const CHAPTERS: readonly ChapterSpec[] = [
  {
    id: 'cradle', from: 0, to: 2, root: 'F', penta: true,
    progressions: [[0, 3, 0, 4], [0, 5, 3, 4]],
    drone: ['F2', 'C3'], bpm: [54, 58],
    motif: { voice: 'musicbox', octave: 5 },
    drones: { gain: [-15, -17] },
    air: { color: 'pink', gain: [-27, -33], rate: 0.25, base: 180, octaves: 2.5 },
    pad: { gain: [-40, -25], attack: [5, 4], release: 9, bars: [4, 4], octave: 3 },
    bells: { gain: [-24, -20], density: [0.22, 0.35], every: '2n', octaves: [5, 6], voice: 'musicbox' },
    recordings: [
      { id: 'rain', gain: -6, lpf: 700 },
      { id: 'infant', gain: -14, ages: [1, 2] },
    ],
  },
  {
    id: 'wonder', from: 3, to: 6, root: 'C', penta: true,
    progressions: [[0, 4, 5, 3], [0, 3, 4, 0]],
    drone: ['C2', 'G2'], bpm: [60, 66],
    motif: { voice: 'musicbox', octave: 5 },
    drones: { gain: [-17, -18] },
    pad: { gain: [-24, -23], attack: [4, 3.5], release: 8, bars: [2, 4], octave: 3 },
    bells: { gain: [-21, -20], density: [0.35, 0.45], every: '4n', octaves: [5, 6], voice: 'musicbox' },
    pluck: { gain: [-27, -24], density: [0.15, 0.25], octave: 4 },
    recordings: [
      { id: 'birdsong', gain: -5 },
      { id: 'playground_distant', gain: -10, lpf: 2500 },
    ],
  },
  {
    id: 'play', from: 7, to: 11, root: 'G', penta: false,
    progressions: [[0, 4, 5, 3], [3, 0, 4, 4], [0, 5, 3, 4]],
    drone: ['G1', 'D2'], bpm: [66, 72],
    motif: { voice: 'marimba', octave: 5 },
    drones: { gain: [-18, -19] },
    pad: { gain: [-24, -24], attack: [3, 3], release: 7, bars: [2, 2], octave: 3 },
    pluck: { gain: [-22, -21], density: [0.35, 0.5], octave: 4 },
    bells: { gain: [-22, -22], density: [0.3, 0.3], every: '4n', octaves: [4, 5], voice: 'marimba' },
    recordings: [
      { id: 'playground_near', gain: -5 },
      { id: 'birdsong', gain: -11 },
    ],
  },
  {
    id: 'becoming', from: 12, to: 17, root: 'G', penta: false,
    progressions: [[5, 3, 0, 4], [5, 2, 3, 4]],
    drone: ['E2', 'B2'], bpm: [72, 74],
    motif: { voice: 'synth', octave: 4 },
    drones: { gain: [-18, -18] },
    pad: { gain: [-22, -21], attack: [2.5, 2], release: 6, bars: [2, 2], octave: 3 },
    pulse: { gain: [-25, -22], density: [0.6, 0.7] },
    bells: { gain: [-25, -24], density: [0.2, 0.22], every: '8n', octaves: [4, 5], voice: 'synth' },
    delay: { wet: 0.25, feedback: 0.35 },
    recordings: [
      { id: 'rain', gain: -8 },
      { id: 'city', gain: -10, ages: [14, 17] },
    ],
  },
  {
    id: 'open', from: 18, to: 29, root: 'D', penta: false,
    progressions: [[0, 4, 5, 3], [0, 3, 5, 4], [5, 3, 0, 4]],
    drone: ['D2', 'A2'], bpm: [74, 70],
    motif: { voice: 'synth', octave: 5 },
    drones: { gain: [-18, -19] },
    pad: { gain: [-21, -22], attack: [2, 3], release: 7, bars: [2, 2], octave: 3 },
    pluck: { gain: [-23, -25], density: [0.45, 0.35], octave: 4 },
    bells: { gain: [-24, -24], density: [0.25, 0.2], every: '4n', octaves: [5, 6], voice: 'glass' },
    pulse: { gain: [-24, -44], density: [0.6, 0.4] },
    recordings: [
      { id: 'city', gain: -9, ages: [18, 24] },
      { id: 'station', gain: -11, ages: [19, 27] },
      { id: 'cafe', gain: -11, ages: [22, 29] },
    ],
  },
  {
    id: 'building', from: 30, to: 44, root: 'G', penta: false,
    progressions: [[0, 5, 3, 4], [3, 4, 0, 5]],
    drone: ['G1', 'D2'], bpm: [68, 64],
    motif: { voice: 'epiano', octave: 4 },
    drones: { gain: [-18, -19] },
    keys: { gain: [-20, -21], density: [0.5, 0.4], every: '2n', octave: 3 },
    pad: { gain: [-24, -24], attack: [3, 4], release: 8, bars: [2, 4], octave: 3 },
    bells: { gain: [-27, -28], density: [0.15, 0.12], every: '4n', octaves: [5, 6], voice: 'glass' },
    recordings: [
      { id: 'kitchen_clock', gain: -10 },
      { id: 'playground_distant', gain: -10, ages: [32, 40] },
    ],
  },
  {
    id: 'midstream', from: 45, to: 59, root: 'C', penta: false,
    progressions: [[5, 3, 0, 4], [0, 5, 3, 4]],
    drone: ['A1', 'E2'], bpm: [62, 58],
    motif: { voice: 'epiano', octave: 4 },
    drones: { gain: [-18, -19] },
    keys: { gain: [-21, -22], density: [0.4, 0.3], every: '2n', octave: 3 },
    pad: { gain: [-23, -23], attack: [4, 5], release: 9, bars: [4, 4], octave: 3 },
    bells: { gain: [-29, -30], density: [0.1, 0.1], every: '4n', octaves: [5, 6], voice: 'glass' },
    recordings: [
      { id: 'rain', gain: -9 },
      { id: 'sea', gain: -7, ages: [48, 59] },
    ],
  },
  {
    id: 'harvest', from: 60, to: 74, root: 'F', penta: false,
    progressions: [[0, 3, 0, 4], [3, 0, 5, 4]],
    drone: ['F1', 'C2'], bpm: [56, 52],
    motif: { voice: 'epiano', octave: 4 },
    drones: { gain: [-18, -18] },
    pad: { gain: [-22, -22], attack: [6, 6], release: 10, bars: [4, 4], octave: 3 },
    keys: { gain: [-24, -26], density: [0.2, 0.15], every: '1m', octave: 3 },
    glass: { gain: [-30, -30], density: [0.05, 0.08], octave: 5 },
    recordings: [
      { id: 'birdsong', gain: -5 },
      { id: 'grandfather_clock', gain: -11 },
    ],
  },
  {
    id: 'evening', from: 75, to: 89, root: 'Bb', penta: true,
    progressions: [[0, 3, 0, 4], [0, 5, 3, 0]],
    drone: ['Bb1', 'F2'], bpm: [50, 46],
    motif: { voice: 'glass', octave: 5 },
    drones: { gain: [-18, -18] },
    pad: { gain: [-22, -23], attack: [6, 7], release: 11, bars: [4, 6], octave: 3 },
    glass: { gain: [-26, -27], density: [0.1, 0.08], octave: 5 },
    air: { color: 'brown', gain: [-36, -31], rate: 0.1, base: 300, octaves: 2 },
    recordings: [
      { id: 'grandfather_clock', gain: -7 },
      { id: 'rain', gain: -11, ages: [75, 84] },
      { id: 'bells', gain: -13, ages: [80, 89] },
    ],
  },
  {
    id: 'stillness', from: 90, to: 122, root: 'Eb', penta: true,
    progressions: [[0, 3, 0, 4]],
    drone: ['Eb2', 'Bb2'], bpm: [44, 40],
    motif: { voice: 'glass', octave: 5 },
    drones: { gain: [-18, -21] },
    air: { color: 'brown', gain: [-29, -27], rate: 0.07, base: 250, octaves: 2 },
    glass: { gain: [-27, -33], density: [0.08, 0.02], octave: 5 },
    pad: { gain: [-24, -60], attack: [7, 8], release: 12, bars: [6, 8], octave: 3 },
    recordings: [
      { id: 'wind', gain: -9 },
      { id: 'birdsong', gain: -11, ages: [90, 105] },
    ],
  },
];

export function chapterIndexOf(age: number): number {
  const i = CHAPTERS.findIndex((c) => age >= c.from && age <= c.to);
  return i < 0 ? CHAPTERS.length - 1 : i;
}

export const chapterOf = (age: number): ChapterSpec => CHAPTERS[chapterIndexOf(age)]!;

/** Position of an age within its chapter, 0..1. */
export function progressIn(c: ChapterSpec, age: number): number {
  return c.to === c.from ? 0 : Math.min(1, Math.max(0, (age - c.from) / (c.to - c.from)));
}

export const lerp = (r: Range, t: number): number => r[0] + (r[1] - r[0]) * t;

/** Recordings of this chapter that belong to this age. */
export function recordingsAt(c: ChapterSpec, age: number): RecordingUse[] {
  return c.recordings.filter((r) => !r.ages || (age >= r.ages[0] && age <= r.ages[1]));
}

export function bpmAt(age: number): number {
  const c = chapterOf(age);
  return lerp(c.bpm, progressIn(c, age));
}
