import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import './ui/styles.css';

import type { AudioApi } from './audio/types';
import { DEATH, LIFE_KEY, MUTED_KEY, T, ms, setTimeScale } from './config';
import { factFor } from './content/facts';
import { initialState, reduce, type Effect, type Event, type MachineConfig, type State } from './life/machine';
import type { LifeRecord } from './life/record';
import { cryptoUniform, newId } from './life/rng';
import { MemoryLifeStore, createLifeStore, type LifeStore } from './life/store';
import { fade, wait } from './ui/dom';
import { mountGate, type Gate } from './ui/gate';
import { showMemorial } from './ui/memorial';
import { PulseDriver } from './ui/pulse';
import { Stage } from './ui/stage';
import { MuteButton, announce } from './ui/views';

const app = document.getElementById('app')!;
const CREDITS_HREF = `${import.meta.env.BASE_URL}credits.html`;
/** Presses this close (px) to a link or control never spend a year. */
const NEAR_MISS = 24;

let store: LifeStore = createLifeStore(LIFE_KEY);

if (import.meta.env.DEV) {
  const dev = await import('./dev/overrides');
  const o = dev.readOverrides();
  if (o.fast) setTimeScale(0.1);
  if (o.active) store = new MemoryLifeStore(dev.devRecord(o));
  dev.expose({
    state: () => state,
    audio: () => audio,
    loadAudio: () => loadAudio(),
    overrides: o,
    render: () => import('./dev/render'),
    engineStats: async () => (await import('./audio')).debugEngine()?.stats() ?? null,
  });
}

const cfg: MachineConfig = { cooldownMs: ms(T.cooldown), birthLockMs: ms(T.birthLock), resumeLockMs: ms(T.resumeLock) };

let state: State = initialState;
let gate: Gate | null = null;
let stage: Stage | null = null;
let mute: MuteButton | null = null;
let readyTimer = 0;
const pulse = new PulseDriver(() => stage?.beat());

// ---------- Sound (loaded lazily, never for the memorial) ----------

let audio: AudioApi | null = null;
let audioLoading: Promise<AudioApi | null> | null = null;
let muted = readMuted();

function loadAudio(): Promise<AudioApi | null> {
  if (!audioLoading) {
    (window as unknown as { TONE_SILENCE_LOGGING: boolean }).TONE_SILENCE_LOGGING = true;
    audioLoading = import('./audio')
      .then((m) => (audio = m.audio))
      .catch((err: unknown) => {
        console.warn('[echo] the sound could not be loaded', err);
        return null;
      });
  }
  return audioLoading;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(value: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, value ? '1' : '0');
  } catch {
    /* the preference just won't be remembered */
  }
}

function currentRecord(): LifeRecord | null {
  return state.k === 'alive' || state.k === 'dying' || state.k === 'ended' ? state.record : null;
}

/** Starts the sound for the current life. Only works fully inside a gesture (or right after unlock). */
function startAudio(record: LifeRecord, birth: boolean): void {
  if (!audio || muted || audio.started()) return;
  audio.start({ age: record.age, lifeId: record.id, birth, muted, onBeat: () => pulse.audioBeat() });
}

// ---------- The life ----------

function freshRead(): LifeRecord | null {
  const loaded = store.load();
  return loaded === 'foreign' ? null : loaded;
}

function dispatch(event: Event): void {
  const step = reduce(state, event, cfg);
  state = step.state;
  step.effects.forEach(run);
}

function run(effect: Effect): void {
  switch (effect.t) {
    case 'save':
      if (!store.save(effect.record)) {
        const stored = freshRead();
        if (stored) queueMicrotask(() => dispatch({ t: 'external', record: stored }));
      }
      break;
    case 'showGate':
      gate = mountGate(app, { returning: effect.returning, creditsHref: CREDITS_HREF, onBegin });
      idle(() => void loadAudio());
      break;
    case 'born':
    case 'resumed':
      enterLife(effect.record, effect.t === 'born' ? 'birth' : 'resume');
      break;
    case 'advanced':
      onAdvanced(effect.record);
      break;
    case 'jumped':
      stage?.jumpTo(effect.record.age);
      audio?.setAge(effect.record.age);
      pulse.setAge(effect.record.age);
      scheduleReady();
      break;
    case 'die':
      onDie();
      break;
    case 'showMemorial':
      onMemorial(effect.record, effect.fromDeath);
      break;
  }
}

/** Inside the Begin/Continue gesture. */
function onBegin(): void {
  if (audio && !muted) audio.unlock();
  dispatch({ t: 'begin', now: Date.now(), u: cryptoUniform(), id: newId(), stored: freshRead() });
}

function enterLife(record: LifeRecord, mode: 'birth' | 'resume'): void {
  const leaving = gate;
  gate = null;
  void leaving?.leave();

  stage = new Stage(app, onPress);
  stage.enter(record, mode);
  mute = new MuteButton(muted, toggleMute);
  app.append(mute.el);
  fade(mute.el, 1, ms(2400), ms(mode === 'birth' ? 4000 : 2500));

  pulse.setAge(record.age);
  pulse.start();
  scheduleReady();
  announce(`${mode === 'birth' ? 'Born. ' : ''}Age ${record.age}. ${factFor(record.age).text}`);

  if (audio) startAudio(record, mode === 'birth');
  else {
    // The sound arrived late: it will ask for a touch to begin.
    void loadAudio().then(() => {
      const r = currentRecord();
      if (r && state.k === 'alive') {
        startAudio(r, false);
        checkResume();
      }
    });
  }
  if (mode === 'birth') requestPersistence();
}

function onAdvanced(record: LifeRecord): void {
  stage?.advanceTo(record.age);
  audio?.setAge(record.age);
  pulse.setAge(record.age);
  scheduleReady();
  announce(`Age ${record.age}. ${factFor(record.age).text}`);
}

function scheduleReady(): void {
  window.clearTimeout(readyTimer);
  stage?.setReady(false);
  if (state.k !== 'alive') return;
  const wait = Math.max(0, state.coolUntil - Date.now());
  readyTimer = window.setTimeout(() => stage?.setReady(true), wait);
}

function onDie(): void {
  window.clearTimeout(readyTimer);
  stage?.die();
  audio?.die();
  setTimeout(() => pulse.stop(), ms(DEATH.dotStill * 1000));
  if (mute) fade(mute.el, 0, ms(4000), ms(6000));
  setTimeout(() => dispatch({ t: 'dyingDone' }), ms(DEATH.relayoutFrom * 1000));
}

function onMemorial(record: LifeRecord, fromDeath: boolean): void {
  pulse.stop();
  window.clearTimeout(readyTimer);
  const leaving = stage;
  stage = null;
  void leaving?.leave(ms(fromDeath ? 2400 : 1200));
  gate?.leave();
  gate = null;
  mute?.el.remove();
  mute = null;
  if (!fromDeath && audio?.started()) audio.die();
  showMemorial(app, record, fromDeath, CREDITS_HREF);
}

// ---------- Input ----------

function nearInteractive(x: number, y: number): boolean {
  const targets: HTMLElement[] = [...(stage?.interactive() ?? [])];
  if (mute) targets.push(mute.el);
  return targets.some((t) => {
    const r = t.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    return x >= r.left - NEAR_MISS && x <= r.right + NEAR_MISS && y >= r.top - NEAR_MISS && y <= r.bottom + NEAR_MISS;
  });
}

let resumeMessage = false;

function onPress(e: MouseEvent): void {
  if (state.k !== 'alive') return;
  // A real pointer press next to a link or the mute control is ignored (keyboard presses have detail 0).
  if (e.detail > 0 && nearInteractive(e.clientX, e.clientY)) return;
  if (audio && !muted) {
    if (audio.started() && audio.needsResume()) {
      // This touch only brings the sound back; it never spends a year.
      audio.resume();
      if (resumeMessage) stage?.showMessage(null);
      resumeMessage = false;
      return;
    }
    if (!audio.started()) {
      audio.unlock();
      startAudio(state.record, false);
    }
  }
  dispatch({ t: 'press', now: Date.now(), stored: freshRead() });
}

function toggleMute(): void {
  muted = !muted;
  writeMuted(muted);
  mute?.set(muted);
  if (!audio) return;
  const r = currentRecord();
  if (!muted && !audio.started() && r && state.k === 'alive') {
    audio.unlock();
    startAudio(r, false);
    return;
  }
  audio.setMuted(muted);
  if (!muted && resumeMessage) {
    stage?.showMessage(null);
    resumeMessage = false;
  }
}

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.key === 'm' || e.key === 'M') && state.k === 'alive' && mute) {
    toggleMute();
    return;
  }
  const onPage = document.activeElement === document.body || document.activeElement === null;
  if ((e.key === ' ' || e.key === 'Enter') && onPage && state.k === 'alive' && stage) {
    e.preventDefault();
    stage.advance.click();
  }
});

function checkResume(): void {
  setTimeout(() => {
    if (state.k === 'alive' && audio && !muted && audio.started() && audio.needsResume()) {
      resumeMessage = true;
      stage?.showMessage('Touch to bring back the sound.');
    }
  }, ms(T.resumeCheck));
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || state.k !== 'alive' || !audio || muted || !audio.started()) return;
  audio.resume();
  checkResume();
});

window.addEventListener('pageshow', (e) => {
  if (e.persisted && state.k === 'alive' && audio?.started() && !muted) {
    audio.resume();
    checkResume();
  }
});

// ---------- Boot ----------

function idle(fn: () => void): void {
  if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 400);
}

function requestPersistence(): void {
  if (/firefox/i.test(navigator.userAgent)) return; // Firefox would ask the visitor
  void navigator.storage?.persist?.().catch(() => {});
}

store.onExternal((record) => dispatch({ t: 'external', record }));
await Promise.race([document.fonts?.ready, wait(1500)]);
dispatch({ t: 'loaded', record: freshRead() });
