import * as Tone from 'tone';

/**
 * The instruments, built from plain Web Audio nodes: each note is a few nodes that exist only while
 * it sounds (two for a simple tone, four for an FM bell), then stop and are let go.
 *
 * Why not Tone's synths: every Tone voice keeps a dozen or more nodes running whether it plays or
 * not (each frequency, detune and envelope is a node of its own), and the audio thread visits every
 * one of them 375 times a second. That was most of the work, and more than a phone could do.
 *
 * The sound is the same by construction: the envelopes below are Tone's (a linear attack; decay and
 * release that approach their target exponentially and turn linear for the last tenth), the FM
 * wiring and levels are Tone's, and so are the oscillator shapes.
 */

export interface EnvelopeSpec {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
}

/** Tone's time constant for an exponential approach that should take `ramp` seconds. */
const tc = (ramp: number): number => Math.log(ramp + 1) / Math.log(200);

/** The shape of one note's envelope in time, from its attack to its end. */
export class EnvelopeShape {
  private readonly a: number;
  private readonly hasDecay: boolean;
  private readonly tcd: number;
  private readonly tcr: number;
  private readonly releaseAt: number;
  private readonly vr: number;

  constructor(
    readonly env: EnvelopeSpec,
    readonly t0: number,
    releaseAt: number,
    sampleTime: number,
  ) {
    this.a = env.attack < sampleTime ? 0 : env.attack;
    this.hasDecay = env.decay > 0 && env.sustain < 1;
    this.tcd = tc(env.decay);
    this.tcr = tc(env.release);
    this.releaseAt = Math.max(t0, releaseAt);
    this.vr = this.before(this.releaseAt);
  }

  /** The envelope (0..1) if it were never released. */
  private before(t: number): number {
    const { t0, a } = this;
    if (t <= t0) return a === 0 ? (t < t0 ? 0 : 1) : 0;
    if (a > 0 && t < t0 + a) return (t - t0) / a;
    if (!this.hasDecay) return 1;
    const { decay: d, sustain: s } = this.env;
    const td = t - (t0 + a);
    if (td <= 0.9 * d) return s + (1 - s) * Math.exp(-td / this.tcd);
    const v90 = s + (1 - s) * Math.exp((-0.9 * d) / this.tcd);
    if (td < d) return v90 + ((s - v90) * (td - 0.9 * d)) / (0.1 * d);
    return s;
  }

  /** When the envelope has fully closed. */
  get end(): number {
    return this.releaseAt + this.env.release;
  }

  /** When Tone would stop the oscillator (early, for a note with no sustain). */
  get stopAt(): number {
    return this.env.sustain === 0 ? Math.min(this.t0 + this.a + this.env.decay, this.end) : this.end;
  }

  valueAt(t: number): number {
    if (t < this.releaseAt) return this.before(t);
    const r = this.env.release;
    const tr = t - this.releaseAt;
    if (tr >= r) return 0;
    if (tr <= 0.9 * r) return this.vr * Math.exp(-tr / this.tcr);
    const v90 = this.vr * Math.exp((-0.9 * r) / this.tcr);
    return v90 * (1 - (tr - 0.9 * r) / (0.1 * r));
  }

  /**
   * Draws the envelope on a parameter as base + scale * envelope, all of it at once (no cancel-and-hold,
   * which not every browser has): up to the release exactly as Tone would, then the release.
   */
  schedule(param: AudioParam, scale: number, base = 0): void {
    const m = (v: number) => base + scale * v;
    const { t0, a, releaseAt: tr } = this;
    param.setValueAtTime(m(0), t0);
    let t = t0;
    if (a > 0) {
      if (tr <= t0 + a) {
        param.linearRampToValueAtTime(m(this.vr), tr);
        this.scheduleRelease(param, m);
        return;
      }
      param.linearRampToValueAtTime(m(1), t0 + a);
      t = t0 + a;
    } else param.setValueAtTime(m(1), t0);
    if (this.hasDecay && tr > t) {
      const { decay: d, sustain: s } = this.env;
      param.setTargetAtTime(m(s), t, this.tcd);
      const t90 = t + 0.9 * d;
      if (tr > t90) {
        param.setValueAtTime(m(this.before(t90)), t90);
        param.linearRampToValueAtTime(m(tr < t + d ? this.vr : s), Math.min(tr, t + d));
      }
    }
    this.scheduleRelease(param, m);
  }

  private scheduleRelease(param: AudioParam, m: (v: number) => number): void {
    drawRelease(param, m, this.vr, this.releaseAt, this.env.release);
  }
}

/** Tone's release: from `from` towards zero, exponentially, then linearly for the last tenth. */
function drawRelease(param: AudioParam, m: (v: number) => number, from: number, at: number, release: number): void {
  param.setValueAtTime(m(from), at);
  if (release <= 0) {
    param.setValueAtTime(m(0), at);
    return;
  }
  const k = tc(release);
  param.setTargetAtTime(m(0), at, k);
  param.setValueAtTime(m(from * Math.exp((-0.9 * release) / k)), at + 0.9 * release);
  param.linearRampToValueAtTime(m(0), at + release);
}

// ---------- oscillator shapes (Tone's own series, so the waveforms match) ----------

const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

/** A triangle with a starting phase (radians), built from the same series Tone uses. */
function triangleWave(ctx: BaseAudioContext, phase: number): PeriodicWave {
  let cache = waves.get(ctx);
  if (!cache) waves.set(ctx, (cache = new Map()));
  const key = `triangle:${phase.toFixed(4)}`;
  let wave = cache.get(key);
  if (!wave) {
    const size = 2048;
    const real = new Float32Array(size);
    const imag = new Float32Array(size);
    for (let n = 1; n < size; n++) {
      if (!(n & 1)) continue;
      const pi = 2 / (n * Math.PI);
      const b = 2 * pi * pi * (((n - 1) >> 1) & 1 ? -1 : 1);
      real[n] = -b * Math.sin(phase * n);
      imag[n] = b * Math.cos(phase * n);
    }
    wave = ctx.createPeriodicWave(real, imag);
    cache.set(key, wave);
  }
  return wave;
}

// ---------- instruments ----------

export type Shape = 'sine' | 'triangle';

export type InstrumentSpec =
  | {
      readonly kind: 'tone';
      readonly shape: Shape;
      /** Tone's "fat" oscillator: detuned copies with spread starting phases. */
      readonly fat?: { readonly count: number; readonly spread: number };
      readonly envelope: EnvelopeSpec;
    }
  | {
      readonly kind: 'fm';
      readonly harmonicity: number;
      readonly modulationIndex: number;
      readonly shape: Shape;
      readonly modulation: Shape;
      readonly envelope: EnvelopeSpec;
      readonly modulationEnvelope: EnvelopeSpec;
    }
  | {
      /** Tone's MonoSynth: a tone through a low-pass whose cutoff follows its own envelope. */
      readonly kind: 'filtered';
      readonly shape: Shape;
      readonly envelope: EnvelopeSpec;
      readonly filterQ: number;
      readonly filterEnvelope: EnvelopeSpec & { readonly baseFrequency: number; readonly octaves: number };
    }
  | {
      /** Tone's MembraneSynth: a tone whose pitch falls from `octaves` times the note into it. */
      readonly kind: 'membrane';
      readonly pitchDecay: number;
      readonly octaves: number;
      readonly envelope: EnvelopeSpec;
    };

/** Moves a source's stop time; older Safari refuses a second stop (then the envelope has silenced it anyway). */
function restop(node: AudioScheduledSourceNode, at: number): void {
  try {
    node.stop(at);
  } catch {
    /* already stopping */
  }
}

/** Inside Tone's FM synth, carrier and modulator each play at -10 dB. */
const FM_LEVEL = Tone.dbToGain(-10);

interface Note {
  /** The amplitude envelope: when it ends, the note is over. */
  shape: EnvelopeShape;
  /** Each source with the envelope that decides when it stops. */
  sources: { node: AudioScheduledSourceNode; shape: EnvelopeShape }[];
}

/**
 * A polyphonic instrument. Notes beyond `polyphony` at once are dropped, as Tone's PolySynth does,
 * so the worst case stays bounded.
 */
export class Instrument {
  readonly output: GainNode;
  private readonly raw: BaseAudioContext;
  private readonly live = new Set<Note>();
  private attack: number | null = null;
  private disposed = false;

  constructor(
    private readonly ctx: Tone.BaseContext,
    private readonly spec: InstrumentSpec,
    private readonly polyphony: number,
  ) {
    this.raw = ctx.rawContext as BaseAudioContext;
    this.output = this.raw.createGain();
  }

  connect(destination: Tone.InputNode): this {
    Tone.connect(this.output, destination);
    return this;
  }

  /** A new attack time for notes from now on (the pad's attack changes as the years pass). */
  setAttack(attack: number): void {
    this.attack = attack;
  }

  triggerAttackRelease(notes: number | readonly number[], duration: number, time: number, velocity = 1): void {
    if (this.disposed) return;
    for (const n of this.live) if (n.shape.end <= time) this.live.delete(n);
    for (const f of typeof notes === 'number' ? [notes] : notes) {
      if (this.live.size >= this.polyphony) return;
      this.live.add(this.play(f, duration, time, velocity));
    }
  }

  private env(e: EnvelopeSpec): EnvelopeSpec {
    return this.attack === null ? e : { ...e, attack: this.attack };
  }

  private play(f: number, duration: number, t0: number, velocity: number): Note {
    const raw = this.raw;
    const st = 1 / raw.sampleRate;
    const spec = this.spec;
    const amp = raw.createGain();
    amp.gain.value = 0;
    amp.connect(this.output);
    const shape = new EnvelopeShape(this.env(spec.envelope), t0, t0 + duration, st);
    const note: Note = { shape, sources: [] };
    const drive = (param: AudioParam, s: EnvelopeShape, scale: number, base = 0) => s.schedule(param, scale, base);
    const osc = (type: Shape, freq: number, stopsWith = shape) => {
      const o = raw.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      note.sources.push({ node: o, shape: stopsWith });
      return o;
    };

    switch (spec.kind) {
      case 'tone': {
        if (spec.fat) {
          const { count, spread } = spec.fat;
          // Each copy at -6 - 1.1 * count dB, detuned across the spread, phases evenly apart (as Tone).
          const level = Tone.dbToGain(-6 - count * 1.1);
          for (let i = 0; i < count; i++) {
            const o = raw.createOscillator();
            o.setPeriodicWave(triangleWave(raw, ((i / count) * 360 * Math.PI) / 180));
            o.frequency.value = f;
            o.detune.value = -spread / 2 + (spread / (count - 1)) * i;
            note.sources.push({ node: o, shape });
            o.connect(amp);
          }
          drive(amp.gain, shape, velocity * level);
        } else {
          osc(spec.shape, f).connect(amp);
          drive(amp.gain, shape, velocity);
        }
        break;
      }
      case 'fm': {
        const modShape = new EnvelopeShape(spec.modulationEnvelope, t0, t0 + duration, st);
        const carrier = osc(spec.shape, f);
        const modulator = osc(spec.modulation, f * spec.harmonicity, modShape);
        const depth = raw.createGain();
        depth.gain.value = 0;
        modulator.connect(depth);
        depth.connect(carrier.frequency);
        carrier.connect(amp);
        drive(amp.gain, shape, velocity * FM_LEVEL);
        drive(depth.gain, modShape, f * spec.modulationIndex * FM_LEVEL * velocity);
        break;
      }
      case 'filtered': {
        const filter = raw.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = spec.filterQ;
        const fe = spec.filterEnvelope;
        osc(spec.shape, f).connect(filter);
        filter.connect(amp);
        drive(amp.gain, shape, velocity);
        const filterShape = new EnvelopeShape(fe, t0, t0 + duration, st);
        drive(filter.frequency, filterShape, fe.baseFrequency * (2 ** fe.octaves - 1), fe.baseFrequency);
        break;
      }
      case 'membrane': {
        const o = osc('sine', f);
        o.frequency.setValueAtTime(f * spec.octaves, t0);
        o.frequency.exponentialRampToValueAtTime(f, t0 + spec.pitchDecay);
        o.connect(amp);
        drive(amp.gain, shape, velocity);
        break;
      }
    }

    let last = note.sources[0]!;
    for (const s of note.sources) {
      s.node.start(t0);
      s.node.stop(s.shape.stopAt);
      if (s.shape.stopAt >= last.shape.stopAt) last = s;
    }
    last.node.onended = () => {
      this.live.delete(note);
      note.sources.forEach((s) => s.node.disconnect());
      amp.disconnect();
    };
    return note;
  }

  /**
   * Every note still sounding at `time` lets go there (the pads, when a life ends). The release is drawn
   * once on the instrument's output, with Tone's release curve, and each note stops when it is silent;
   * nothing already scheduled has to be cancelled, so nothing can jump. The instrument stays silent
   * afterwards: nothing is played once a life has ended.
   */
  releaseAll(time = this.ctx.now()): void {
    const release = this.spec.envelope.release;
    drawRelease(this.output.gain, (v) => v, 1, time, release);
    for (const note of this.live) {
      if (note.shape.end <= time) continue;
      for (const s of note.sources) restop(s.node, Math.min(s.shape.stopAt, time + release));
    }
  }

  /** A short fade, then silence: nothing still ringing is cut off with a click. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.now();
    this.output.gain.setTargetAtTime(0, now, 0.015);
    for (const note of this.live) for (const s of note.sources) restop(s.node, now + 0.12);
    this.live.clear();
    this.ctx.setTimeout(() => this.output.disconnect(), 0.15);
  }
}
