import * as Tone from 'tone';
import { AUDIO, DEATH, sec } from '../config';
import { MAX_AGE } from '../life/mortality';
import { hashString, mulberry32 } from '../life/rng';
import { Bus } from './bus';
import { bpmAt, chapterOf, recordingsAt } from './chapters';
import { Heartbeat } from './heartbeat';
import { hz, lifeMotif, pentaNote } from './music';
import { RecordingBank } from './recordings/bank';
import { Scene, noteStats } from './scene';
import { makeVoice, type Poly } from './voices';

export interface EngineOptions {
  readonly lifeId: string;
  readonly onBeat?: () => void;
  /** Offline renders wait for recordings before starting. */
  readonly offline?: boolean;
  /** Dev: render the music without the field recordings. */
  readonly recordings?: boolean;
  /** Dev: render only the field recordings. */
  readonly recordingsOnly?: boolean;
  /** Dev: render only these layers (and no heartbeat unless 'heart' is listed). */
  readonly only?: readonly string[];
}

/**
 * The score of one life. It is told only three things: begin at an age, move to an age, and die.
 * It never learns the lifespan, and nothing it loads depends on it.
 */
export class Engine {
  readonly ctx: Tone.BaseContext;
  private readonly bank: RecordingBank;
  private readonly motif: number[];
  private bus: Bus | null = null;
  private heart: Heartbeat | null = null;
  private echoVoice: Poly | null = null;
  private current: Scene | null = null;
  private readonly live: Scene[] = [];
  private age = 0;
  private pendingAge: number | null = null;
  private begun = false;
  private dead = false;
  private disposed = false;

  constructor(private readonly opts: EngineOptions) {
    this.ctx = Tone.getContext();
    this.bank = new RecordingBank(this.ctx, opts.recordings !== false);
    this.motif = lifeMotif(mulberry32(hashString(opts.lifeId)));
  }

  /** Runs node-creating code against this engine's context (an offline render may have restored the global one). */
  private within<T>(fn: () => T): T {
    const prev = Tone.getContext();
    if (prev === this.ctx) return fn();
    Tone.setContext(this.ctx);
    try {
      return fn();
    } finally {
      Tone.setContext(prev);
    }
  }

  async init(age: number): Promise<void> {
    this.bus = await this.within(() => Bus.create(age));
    const first = this.bank.preload(recordingsAt(chapterOf(age), age).map((r) => r.id));
    if (this.opts.offline) await first;
    else await Promise.race([first, new Promise((r) => globalThis.setTimeout(r, AUDIO.initRecordingsWait * 1000))]);
  }

  private yearJitter(age: number): { brightness: number; bpm: number } {
    const r = mulberry32(hashString(`year:${age}`));
    return { brightness: 0.95 + r() * 0.1, bpm: (r() - 0.5) * 4 };
  }

  private newScene(age: number): Scene {
    const scene = new Scene(chapterOf(age), age, {
      ctx: this.ctx,
      bus: this.bus!,
      bank: this.bank,
      motif: this.motif,
      recordingsOnly: this.opts.recordingsOnly,
      only: this.opts.only,
    });
    this.live.push(scene);
    return scene;
  }

  private retire(scene: Scene): void {
    const i = this.live.indexOf(scene);
    if (i >= 0) this.live.splice(i, 1);
    // Offline, every callback runs before the audio is rendered, so disposing would erase the
    // scene from the whole render. Keep it; the render is thrown away afterwards anyway.
    if (!this.opts.offline) scene.dispose();
  }

  /**
   * Keeps warm only the recordings this year and the next two years will use (a scene still fading
   * out holds its own). Which ones depends only on the age, never on the lifespan.
   */
  private preloadAround(age: number): void {
    const ids = new Set<string>();
    for (let a = age; a <= Math.min(MAX_AGE, age + 2); a++) recordingsAt(chapterOf(a), a).forEach((r) => ids.add(r.id));
    this.bank.keepOnly(ids);
    void this.bank.preload(ids);
  }

  begin(age: number, birth: boolean, at = this.ctx.now()): void {
    if (this.begun || !this.bus) return;
    this.within(() => {
      const bus = this.bus!;
      this.age = this.pendingAge ?? age;
      this.pendingAge = null;
      const j = this.yearJitter(this.age);
      const transport = this.ctx.transport;
      transport.bpm.value = bpmAt(this.age) + j.bpm;
      transport.start(at);

      const fade = birth ? sec(AUDIO.birthFade) : 3;
      bus.setAge(this.age, at, j.brightness);
      bus.fadeIn(at, fade);
      this.heart = new Heartbeat(bus.heartIn, this.age, this.ctx, this.opts.onBeat);
      if (!this.opts.recordingsOnly && (!this.opts.only || this.opts.only.includes('heart'))) this.heart.start(at + 0.3);
      this.current = this.newScene(this.age);
      this.current.start(at);
      this.current.fadeIn(at, fade);

      const echoGain = new Tone.Gain(Tone.dbToGain(-12));
      this.echoVoice = makeVoice(this.ctx, 'glass', 8);
      this.echoVoice.connect(echoGain);
      echoGain.connect(bus.echoIn);
      echoGain.connect(bus.input);

      this.preloadAround(this.age);
      this.begun = true;
    });
  }

  setAge(age: number, at = this.ctx.now()): void {
    if (!this.begun) {
      this.pendingAge = age;
      return;
    }
    if (this.dead || this.disposed || age === this.age || !this.current) return;
    this.within(() => {
      const before = this.current!;
      this.age = age;
      const j = this.yearJitter(age);
      this.bus!.setAge(age, at, j.brightness);
      this.heart!.setAge(age, at);
      this.ctx.transport.bpm.rampTo(bpmAt(age) + j.bpm, sec(AUDIO.morph), at);
      const decade = age % 10 === 0;

      this.preloadAround(age);
      if (chapterOf(age).id === before.chapter.id) {
        before.morph(age, at);
        before.chime(at + 0.9, decade);
        return;
      }

      // A new chapter: crossfade scenes. Never more than two alive at once.
      for (const old of this.live.filter((s) => s !== before)) {
        old.fadeOut(at, 0, 1);
        const o = old;
        this.ctx.setTimeout(() => this.retire(o), 1.2);
      }
      before.fadeOut(at, sec(AUDIO.chapterHold), sec(AUDIO.chapterOut));
      this.ctx.setTimeout(() => this.retire(before), sec(AUDIO.chapterDispose));
      const next = this.newScene(age);
      next.start(at);
      next.fadeIn(at, sec(AUDIO.chapterIn));
      next.chime(at + 1.6, true);
      this.current = next;
    });
  }

  die(at = this.ctx.now()): void {
    if (!this.begun || this.dead) return;
    this.dead = true;
    this.within(() => {
      this.live.forEach((s) => s.die(at));
      this.heart?.die(at);
      this.bus?.die(at);
      // The echo: the life's own motif, once more, into the long hall.
      const root = chapterOf(this.age).root;
      this.motif.forEach((step, i) => {
        this.echoVoice?.triggerAttackRelease(hz(pentaNote(root, step, 5)), 1.6, at + sec(DEATH.echoAt) + i * sec(DEATH.echoStep), 0.42);
      });
      if (!this.opts.offline) this.ctx.setTimeout(() => this.dispose(), sec(DEATH.close));
    });
  }

  setMuted(muted: boolean): void {
    this.bus?.setMuted(muted, this.ctx.now());
  }

  /** For dev soak checks. */
  stats(): { scenes: number; buffers: number; onTime: number; late: number; errors: number } {
    return { scenes: this.live.length, buffers: this.bank.size, ...noteStats };
  }

  /** Recent heartbeat times, for checks. */
  beatTimes(): readonly number[] {
    return this.heart?.recent ?? [];
  }

  isDead(): boolean {
    return this.dead;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.within(() => {
      this.ctx.transport.stop();
      this.ctx.transport.cancel(0);
      [...this.live].forEach((s) => this.retire(s));
      this.heart?.dispose();
      this.echoVoice?.dispose();
      this.bus?.dispose();
    });
  }
}
