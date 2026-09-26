import * as Tone from 'tone';
import { AUDIO, DEATH, sec } from '../config';
import { hashString, mulberry32 } from '../life/rng';
import type { Bus } from './bus';
import { lerp, progressIn, type ChapterSpec, type Range, type RecordingUse } from './chapters';
import { chord, hz, midi, pentaNote, scaleNote } from './music';
import type { RecordingBank } from './recordings/bank';
import { Looper } from './recordings/looper';
import { makePad, makePluck, makePulse, makeVoice, type Poly } from './voices';

export interface SceneDeps {
  readonly ctx: Tone.BaseContext;
  readonly bus: Bus;
  readonly bank: RecordingBank;
  /** The life motif, as steps on the pentatonic ladder. */
  readonly motif: readonly number[];
  /** Dev: build only the recordings (for balance checks). */
  readonly recordingsOnly?: boolean;
  /** Dev: build only these layers. */
  readonly only?: readonly string[];
}

interface Bed {
  readonly use: RecordingUse;
  readonly gain: Tone.Gain;
  readonly filter: Tone.Filter | null;
  looper: Looper | null;
  loading: boolean;
  active: boolean;
}

const db = (v: number): number => Tone.dbToGain(v);

/**
 * Mix trims (dB) on top of each chapter's layer gains, set from measured levels so the drone is a bed
 * rather than the whole sound, and the melodic layers can be heard above it.
 */
const TRIM: Record<string, number> = { drone: -9, pad: 2, bells: 11, pluck: 8, keys: 12, glass: 9, pulse: 6, air: 4, motif: 8 };
const trimmed = (name: string, dB: number): number => db(dB + (TRIM[name] ?? 0));
/** Field recordings sit about 8-10 dB under the music. */
const RECORDING_TRIM = -5;

/**
 * One chapter of the music: its drone, its instruments, its recordings. A new scene is built at each
 * chapter change and crossfaded; within a chapter the scene morphs as the years pass.
 */
export class Scene {
  readonly out = new Tone.Gain(0);
  private readonly c: ChapterSpec;
  private readonly deps: SceneDeps;
  private t = 0;
  private age: number;
  private rand: () => number;
  private progression: readonly number[] = [0];
  private step = 0;
  private deathAt = Infinity;
  private disposed = false;

  private readonly gains = new Map<string, Tone.Gain>();
  private readonly density = new Map<string, number>();
  private readonly nodes: { dispose(): unknown }[] = [];
  private readonly loops: Tone.Loop[] = [];
  private readonly sources: (Tone.Oscillator | Tone.Noise)[] = [];
  private readonly beds: Bed[] = [];

  private pad: Tone.PolySynth<Tone.Synth> | null = null;
  private bells: Poly | null = null;
  private pluck: Tone.PolySynth<Tone.Synth> | null = null;
  private keys: Poly | null = null;
  private pulse: Tone.MonoSynth | null = null;
  private glass: Poly | null = null;
  private readonly motifVoice: Poly;

  constructor(chapter: ChapterSpec, age: number, deps: SceneDeps) {
    this.c = chapter;
    this.deps = deps;
    this.age = age;
    this.t = progressIn(chapter, age);
    this.rand = mulberry32(hashString(`${chapter.id}:${age}`));
    this.pickProgression();
    this.out.connect(deps.bus.input);

    if (!deps.recordingsOnly) {
      const want = (name: string) => !deps.only || deps.only.includes(name);
      if (want('drone')) this.buildDrone();
      if (want('air')) this.buildAir();
      if (want('pad')) this.buildPad();
      if (want('bells')) this.buildBells();
      if (want('pluck')) this.buildPluck();
      if (want('keys')) this.buildKeys();
      if (want('pulse')) this.buildPulse();
      if (want('glass')) this.buildGlass();
    }
    this.motifVoice = makeVoice(chapter.motif.voice, 10);
    this.motifVoice.connect(this.layerGain('motif', -14));
    this.nodes.push(this.motifVoice);
    this.buildBeds();
  }

  get chapter(): ChapterSpec {
    return this.c;
  }

  // ---------- construction ----------

  private layerGain(name: string, dB: number): Tone.Gain {
    const g = new Tone.Gain(trimmed(name, dB));
    g.connect(this.out);
    this.gains.set(name, g);
    this.nodes.push(g);
    return g;
  }

  private at(r: Range): number {
    return lerp(r, this.t);
  }

  private buildDrone(): void {
    const g = this.layerGain('drone', this.at(this.c.drones.gain));
    const filter = new Tone.Filter({ type: 'lowpass', frequency: 700, rolloff: -12 });
    const lfo = new Tone.LFO({ frequency: 0.03, min: 380, max: 950 }).connect(filter.frequency);
    filter.connect(g);
    this.nodes.push(filter, lfo);
    lfo.start();
    for (const note of this.c.drone) {
      for (const detune of [-4, 4]) {
        const osc = new Tone.Oscillator({ frequency: hz(midi(note)), type: 'sine', detune, volume: -9 });
        osc.connect(filter);
        this.sources.push(osc);
      }
    }
  }

  private buildAir(): void {
    const a = this.c.air;
    if (!a) return;
    const g = this.layerGain('air', this.at(a.gain));
    const noise = new Tone.Noise({ type: a.color, volume: -4 });
    const auto = new Tone.AutoFilter({
      frequency: a.rate,
      baseFrequency: a.base,
      octaves: a.octaves,
      depth: 1,
      wet: 1,
      filter: { type: 'lowpass', rolloff: -12, Q: 0.8 },
    }).start();
    noise.connect(auto);
    auto.connect(g);
    this.sources.push(noise);
    this.nodes.push(auto);
  }

  private buildPad(): void {
    const p = this.c.pad;
    if (!p) return;
    const g = this.layerGain('pad', this.at(p.gain));
    const filter = new Tone.Filter({ type: 'lowpass', frequency: 1500, rolloff: -12 });
    this.pad = makePad(this.at(p.attack), p.release);
    this.pad.connect(filter);
    filter.connect(g);
    this.nodes.push(filter, this.pad);
    const bars = Math.round(this.at(p.bars));
    this.loop(`${bars}m`, (time) => {
      if (!this.alive(time, sec(DEATH.padsRelease))) return;
      const degree = this.progression[this.step % this.progression.length]!;
      this.step++;
      const notes = chord(this.c.root, degree, p.octave, this.rand() < 0.4).map(hz);
      const measure = (4 * 60) / this.deps.ctx.transport.bpm.value;
      this.pad!.triggerAttackRelease(notes, bars * measure * 0.92, time, 0.5);
    });
  }

  private buildBells(): void {
    const b = this.c.bells;
    if (!b) return;
    const g = this.layerGain('bells', this.at(b.gain));
    this.bells = makeVoice(b.voice, 10);
    this.nodes.push(this.bells);
    if (this.c.delay) {
      const delay = new Tone.PingPongDelay({ delayTime: '4n.', feedback: this.c.delay.feedback, wet: this.c.delay.wet });
      this.bells.connect(delay);
      delay.connect(g);
      this.nodes.push(delay);
    } else {
      this.bells.connect(g);
    }
    this.density.set('bells', this.at(b.density));
    this.loop(b.every, (time) => {
      if (!this.alive(time, sec(DEATH.bellsStop)) || !this.chance('bells', time)) return;
      const octave = Math.round(lerp(b.octaves, this.rand()));
      this.bells!.triggerAttackRelease(hz(this.melodyNote(octave)), 0.4, time, 0.35 + this.rand() * 0.25);
    });
  }

  private buildPluck(): void {
    const p = this.c.pluck;
    if (!p) return;
    const g = this.layerGain('pluck', this.at(p.gain));
    this.pluck = makePluck();
    this.pluck.connect(g);
    this.nodes.push(this.pluck);
    this.density.set('pluck', this.at(p.density));
    let i = 0;
    this.loop('8n', (time) => {
      if (!this.alive(time, sec(DEATH.pluckStop)) || !this.chance('pluck', time)) return;
      const tones = this.chordTones(p.octave);
      this.pluck!.triggerAttackRelease(hz(tones[i++ % tones.length]!), 0.3, time, 0.5);
    });
  }

  private buildKeys(): void {
    const k = this.c.keys;
    if (!k) return;
    const g = this.layerGain('keys', this.at(k.gain));
    this.keys = makeVoice('epiano', 12);
    this.keys.connect(g);
    this.nodes.push(this.keys);
    this.density.set('keys', this.at(k.density));
    this.loop(k.every, (time) => {
      if (!this.alive(time, sec(DEATH.padsRelease)) || !this.chance('keys', time)) return;
      const tones = this.chordTones(k.octave);
      const count = 1 + Math.floor(this.rand() * 3);
      for (let n = 0; n < count; n++) {
        this.keys!.triggerAttackRelease(hz(tones[n % tones.length]!), 1.2, time + n * 0.09, 0.3 + this.rand() * 0.2);
      }
    });
  }

  private buildPulse(): void {
    const p = this.c.pulse;
    if (!p) return;
    const g = this.layerGain('pulse', this.at(p.gain));
    this.pulse = makePulse();
    this.pulse.connect(g);
    this.nodes.push(this.pulse);
    this.density.set('pulse', this.at(p.density));
    this.loop('4n', (time) => {
      if (!this.alive(time, sec(DEATH.pulseStop)) || !this.chance('pulse', time)) return;
      const degree = this.progression[Math.max(0, this.step - 1) % this.progression.length]!;
      this.pulse!.triggerAttackRelease(hz(scaleNote(this.c.root, degree, 2)), 0.2, time, 0.6);
    });
  }

  private buildGlass(): void {
    const gl = this.c.glass;
    if (!gl) return;
    const g = this.layerGain('glass', this.at(gl.gain));
    this.glass = makeVoice('glass', 8);
    this.glass.connect(g);
    this.nodes.push(this.glass);
    this.density.set('glass', this.at(gl.density));
    this.loop('2n', (time) => {
      if (!this.alive(time, sec(DEATH.bellsStop)) || !this.chance('glass', time)) return;
      this.glass!.triggerAttackRelease(hz(pentaNote(this.c.root, 2 + Math.floor(this.rand() * 5), gl.octave)), 2.5, time, 0.4);
    });
  }

  private buildBeds(): void {
    for (const use of this.c.recordings) {
      if (!this.deps.bank.has(use.id)) continue;
      const gain = new Tone.Gain(0);
      const filter = use.lpf ? new Tone.Filter({ type: 'lowpass', frequency: use.lpf, rolloff: -12 }) : null;
      if (filter) filter.connect(gain);
      gain.connect(this.out);
      this.nodes.push(gain);
      if (filter) this.nodes.push(filter);
      this.beds.push({ use, gain, filter, looper: null, loading: false, active: false });
    }
  }

  // ---------- helpers ----------

  private loop(interval: Tone.Unit.Time, fn: (time: number) => void): void {
    const l = new Tone.Loop((time) => {
      if (!this.disposed) fn(time);
    }, interval);
    this.loops.push(l);
  }

  private alive(time: number, stopAfter: number): boolean {
    return time < this.deathAt + stopAfter;
  }

  /** Seeded density gate; after death, density halves every two seconds. */
  private chance(layer: string, time: number): boolean {
    let d = this.density.get(layer) ?? 0;
    if (time > this.deathAt) d *= 0.5 ** Math.floor((time - this.deathAt) / sec(2));
    return this.rand() < d;
  }

  private chordTones(octave: number): number[] {
    const degree = this.progression[Math.max(0, this.step - 1) % this.progression.length]!;
    return chord(this.c.root, degree, octave);
  }

  /** A melody note: often a chord tone, otherwise from the chapter's scale. */
  private melodyNote(octave: number): number {
    if (this.rand() < 0.5) {
      const tones = this.chordTones(octave);
      return tones[Math.floor(this.rand() * tones.length)]!;
    }
    if (this.c.penta) return pentaNote(this.c.root, Math.floor(this.rand() * 5), octave);
    return scaleNote(this.c.root, Math.floor(this.rand() * 7), octave);
  }

  private pickProgression(): void {
    const all = this.c.progressions;
    const base = all[Math.floor(this.rand() * all.length)]!;
    const rot = Math.floor(this.rand() * base.length);
    this.progression = [...base.slice(rot), ...base.slice(0, rot)];
    this.step = 0;
  }

  // ---------- life ----------

  start(at: number): void {
    this.sources.forEach((s) => s.start(at));
    const transport = this.deps.ctx.transport;
    const startTick = Math.ceil(transport.getTicksAtTime(at) + transport.PPQ / 8);
    this.loops.forEach((l) => l.start(`${startTick}i`));
    this.updateBeds(at, true);
  }

  fadeIn(at: number, seconds: number): void {
    this.out.gain.cancelScheduledValues(at);
    this.out.gain.setValueAtTime(this.out.gain.getValueAtTime(at), at);
    this.out.gain.linearRampToValueAtTime(1, at + seconds);
  }

  fadeOut(at: number, hold: number, seconds: number): void {
    this.out.gain.exponentialRampTo(0.0001, seconds, at + hold);
  }

  /** Within a chapter, each year moves every parameter a little. */
  morph(age: number, at: number): void {
    this.age = age;
    this.t = progressIn(this.c, age);
    this.rand = mulberry32(hashString(`${this.c.id}:${age}`));
    this.pickProgression();
    const ramp = sec(AUDIO.morph);
    const set = (name: string, r: Range | undefined) => {
      if (r) this.gains.get(name)?.gain.rampTo(trimmed(name, this.at(r)), ramp, at);
    };
    set('drone', this.c.drones.gain);
    set('air', this.c.air?.gain);
    set('pad', this.c.pad?.gain);
    set('bells', this.c.bells?.gain);
    set('pluck', this.c.pluck?.gain);
    set('keys', this.c.keys?.gain);
    set('pulse', this.c.pulse?.gain);
    set('glass', this.c.glass?.gain);
    const dens = (name: string, r: Range | undefined) => {
      if (r) this.density.set(name, this.at(r));
    };
    dens('bells', this.c.bells?.density);
    dens('pluck', this.c.pluck?.density);
    dens('keys', this.c.keys?.density);
    dens('pulse', this.c.pulse?.density);
    dens('glass', this.c.glass?.density);
    if (this.pad && this.c.pad) this.pad.set({ envelope: { attack: this.at(this.c.pad.attack) } });
    this.updateBeds(at, false);
  }

  /** The life motif in this chapter's voice: its first note on arrival, all of it on decade birthdays. */
  chime(at: number, full: boolean): void {
    if (this.disposed) return;
    const { octave, voice } = this.c.motif;
    const spacing = voice === 'glass' ? 0.9 : 0.55;
    const notes = full ? this.deps.motif : this.deps.motif.slice(0, 1);
    notes.forEach((step, i) => {
      this.motifVoice.triggerAttackRelease(hz(pentaNote(this.c.root, step, octave)), 0.6, at + i * spacing, 0.5);
    });
  }

  private updateBeds(at: number, initial: boolean): void {
    for (const bed of this.beds) {
      const want = !bed.use.ages || (this.age >= bed.use.ages[0] && this.age <= bed.use.ages[1]);
      if (want === bed.active) continue;
      bed.active = want;
      if (want) this.bringIn(bed, initial ? at : at + 1);
      else bed.gain.gain.rampTo(0, sec(AUDIO.morph), at);
    }
  }

  private bringIn(bed: Bed, at: number): void {
    const fadeIn = () => {
      const now = Math.max(at, this.deps.ctx.now());
      bed.gain.gain.rampTo(db(bed.use.gain + RECORDING_TRIM), sec(AUDIO.recordingFadeIn), now);
    };
    if (bed.looper) {
      fadeIn();
      return;
    }
    if (bed.loading) return;
    bed.loading = true;
    void this.deps.bank.load(bed.use.id).then((buffer) => {
      bed.loading = false;
      if (!buffer || this.disposed || !bed.active || this.deathAt < Infinity) return;
      const info = this.deps.bank.meta(bed.use.id)!;
      bed.looper = new Looper(this.deps.ctx, buffer, info);
      bed.looper.out.connect(bed.filter ?? bed.gain);
      bed.looper.start(Math.max(at, this.deps.ctx.now()));
      fadeIn();
    });
  }

  /** Recording ids this scene may want, for preloading. */
  recordingIds(): string[] {
    return this.beds.map((b) => b.use.id);
  }

  die(t0: number): void {
    this.deathAt = t0;
    for (const bed of this.beds) bed.gain.gain.exponentialRampTo(0.0001, sec(DEATH.recordingsFade), t0);
    this.pad?.releaseAll(t0 + sec(DEATH.padsRelease));
    this.keys?.releaseAll(t0 + sec(DEATH.padsRelease));
    this.gains.get('drone')?.gain.exponentialRampTo(0.0001, sec(DEATH.droneFadeFor), t0 + sec(DEATH.droneFadeFrom));
    this.gains.get('air')?.gain.exponentialRampTo(0.0001, sec(DEATH.droneFadeFor), t0 + sec(DEATH.droneFadeFrom - 4));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loops.forEach((l) => l.dispose());
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* never started */
      }
      s.dispose();
    });
    this.beds.forEach((b) => b.looper?.dispose());
    this.nodes.forEach((n) => n.dispose());
    this.out.dispose();
  }
}
