import type { AudioApi } from './types';

// Temporary silent implementation (replaced by the engine in the audio milestone).
let isStarted = false;

export const audio: AudioApi = {
  unlock() {},
  start() {
    isStarted = true;
  },
  started: () => isStarted,
  setAge() {},
  die() {},
  setMuted() {},
  needsResume: () => false,
  resume() {},
};
