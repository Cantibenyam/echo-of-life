/** Lifelong curves, as piecewise-linear anchors. Pure: shared by the UI and the audio engine. */

export type Anchors = readonly (readonly [number, number])[];

export function interp(anchors: Anchors, x: number): number {
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i]!;
    const [x0, y0] = anchors[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/**
 * Typical resting heart rate (beats per minute) by age: approximate medians of the normal ranges for
 * children (Fleming et al., The Lancet 2011;377:1011-18) settling into the adult resting range.
 */
export const HEART_BPM: Anchors = [
  [0, 130], [1, 120], [2, 110], [4, 100], [6, 95], [10, 85], [14, 78], [18, 72], [30, 70], [60, 70], [80, 71], [100, 72], [122, 72],
];
export const heartRate = (age: number): number => interp(HEART_BPM, age);

/** Heartbeat level (dB): the mother's heartbeat is close at birth, then it settles far under the music. */
export const heartGainDb = (age: number): number => interp([[0, -18], [2, -26], [10, -30], [60, -30], [100, -28], [122, -28]], age);

/**
 * The single control for brightness: a low-pass loosely following hearing across a life
 * (muffled like the womb at birth, widest in youth, closing gently with age-related hearing loss).
 */
export const hearingHz = (age: number): number =>
  interp([[0, 2200], [2, 5000], [8, 11000], [20, 14000], [40, 11000], [60, 7500], [75, 5000], [90, 3500], [110, 2500], [122, 2000]], age);

/** The space grows with age: more of the long hall, less of the small room. */
export const hallSend = (age: number): number => interp([[0, 0.15], [40, 0.25], [122, 0.55]], age);
export const roomSend = (age: number): number => interp([[0, 0.35], [122, 0.2]], age);
