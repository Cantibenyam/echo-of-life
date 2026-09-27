/**
 * Every timing in one place. Durations are multiplied by the time scale, which is 1 in production
 * and 0.1 with the dev-only `?fast` flag (audio and CSS read the same scale).
 */

let scale = 1;

export function setTimeScale(s: number): void {
  scale = s;
  document.documentElement.style.setProperty('--ts', String(s));
}

/** Scales a duration in ms. */
export const ms = (v: number): number => v * scale;
/** Scales a duration in seconds. */
export const sec = (v: number): number => v * scale;

export const LIFE_KEY: string = import.meta.env.DEV
  ? 'echooflife:dev:life'
  : (import.meta.env.VITE_LIFE_KEY ?? 'echooflife:preview:life');

export const MUTED_KEY = 'echooflife:muted';

/** UI timings in ms (unscaled). */
export const T = {
  cooldown: 3200,
  birthLock: 5000,
  resumeLock: 2500,
  trackSlide: 2400,
  numeralOut: 1200,
  numeralIn: 1600,
  numeralInDelay: 500,
  factOut: 700,
  factIn: 1400,
  factInDelay: 900,
  gateFade: 1800,
  gateLines: [600, 3000, 5200, 7400],
  returningLines: [600, 2200, 3800],
  birthTimelineAt: 1200,
  birthFactAt: 3000,
  idleHint: 6000,
  resumeCheck: 600,
} as const;

/** The ending, in seconds after the final press (unscaled). UI and audio read the same table. */
export const DEATH = {
  recordingsFade: 6,
  bellsStop: 2,
  pluckStop: 3.5,
  pulseStop: 5,
  padsRelease: 6,
  heartSlowFrom: 8,
  heartSlowFor: 5,
  lastBeat: 14,
  echoAt: 15.2,
  echoStep: 0.95,
  droneFadeFrom: 12,
  droneFadeFor: 10,
  hearingFrom: 19,
  hearingFor: 6,
  masterFadeFrom: 21,
  masterFadeFor: 4,
  close: 26.5,
  // visual
  trackStopFor: 3.5,
  factFade: 4,
  futureFadeFor: 6,
  dotStill: 14,
  dotRing: 16,
  relayoutFrom: 18,
  relayoutFor: 6,
  memorialText: 27,
  done: 30,
} as const;

/** Audio transition timings in seconds (unscaled). */
export const AUDIO = {
  birthFade: 6,
  morph: 6,
  chapterIn: 8,
  chapterHold: 1.5,
  chapterOut: 7.5,
  chapterDispose: 10,
  muteOut: 0.6,
  unmuteIn: 1.5,
  suspendAfterMute: 10,
  recordingFadeIn: 8,
  recordingTimeout: 15,
  initRecordingsWait: 4,
} as const;

/** The graveyard (a Neon Function; see backend/graveyard). */
export const GRAVEYARD_API = 'https://br-steep-firefly-b4cj3xa2-graveyard.compute.c-6.us-east-2.aws.neon.tech';

/** Graves are kept apart per build: development, preview, and the real release. */
export const GRAVE_ENV: 'dev' | 'preview' | 'release' = import.meta.env.DEV
  ? 'dev'
  : LIFE_KEY === 'echooflife:life'
    ? 'release'
    : 'preview';

/** Remembers that this device's grave has been laid, so it is sent once. */
export const GRAVE_SENT_KEY = `${LIFE_KEY}:grave`;
