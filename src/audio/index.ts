import * as Tone from 'tone';
import { AUDIO, DEATH, sec } from '../config';
import { Engine } from './engine';
import type { AudioApi, StartOptions } from './types';

/**
 * The page's handle on the sound. Owns the audio context (created inside the first gesture),
 * the iOS unlocks, mute, and resuming after interruptions.
 */

let contextReady = false;
let engine: Engine | null = null;
let isStarted = false;
let muted = false;
let suspendTimer = 0;
let unlockEl: HTMLAudioElement | null = null;

const isIOS = (): boolean =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);

function playThroughSilentSwitch(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      session.type = 'playback';
      return;
    }
    if (!isIOS()) return;
    unlockEl ??= Object.assign(new Audio(`${import.meta.env.BASE_URL}audio/silence.mp3`), { loop: true });
    unlockEl.setAttribute('playsinline', '');
    void unlockEl.play().catch(() => {});
  } catch {
    /* best effort */
  }
}

function running(): boolean {
  return contextReady && Tone.getContext().state === 'running';
}

export const audio: AudioApi = {
  unlock() {
    playThroughSilentSwitch();
    if (!contextReady) {
      // Notes are scheduled 0.3 s ahead: on a slow phone's busy page a shorter lead let a few notes
      // arrive late (they are dropped, not bunched). A press's chime simply lands a moment later.
      Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 0.3 }), true);
      contextReady = true;
    }
    void Tone.start().catch(() => {});
  },

  start(opts: StartOptions) {
    if (isStarted) return;
    if (!contextReady) audio.unlock();
    isStarted = true;
    muted = opts.muted;
    const e = new Engine({ lifeId: opts.lifeId, onBeat: opts.onBeat });
    engine = e;
    e.init(opts.age)
      .then(() => {
        e.begin(opts.age, opts.birth);
        if (muted) e.setMuted(true);
      })
      .catch((err: unknown) => console.warn('[echo] the sound could not start', err));
  },

  started: () => isStarted,

  setAge(age: number) {
    engine?.setAge(age);
  },

  die() {
    if (!engine || engine.isDead()) return;
    engine.die();
    const raw = Tone.getContext().rawContext as AudioContext;
    window.setTimeout(() => void raw.close().catch(() => {}), (sec(DEATH.close) + 0.5) * 1000);
  },

  setMuted(value: boolean) {
    muted = value;
    window.clearTimeout(suspendTimer);
    if (!contextReady) return;
    if (value) {
      engine?.setMuted(true);
      // After a quiet while, let the device rest.
      suspendTimer = window.setTimeout(() => {
        if (muted) void (Tone.getContext().rawContext as AudioContext).suspend().catch(() => {});
      }, sec(AUDIO.suspendAfterMute) * 1000);
    } else {
      playThroughSilentSwitch();
      void Tone.getContext().resume().catch(() => {});
      engine?.setMuted(false);
    }
  },

  needsResume: () => isStarted && !muted && contextReady && !engine?.isDead() && !running(),

  resume() {
    if (!contextReady || muted) return;
    playThroughSilentSwitch();
    void Tone.getContext().resume().catch(() => {});
  },
};

/** For dev tools only. */
export const debugEngine = (): Engine | null => engine;
