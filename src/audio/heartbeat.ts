import * as Tone from 'tone';
import { AUDIO, DEATH, sec } from '../config';
import { mulberry32 } from '../life/rng';
import { heartGainDb, heartRate } from './curves';

const LUB = 55; // A1
const DUB = 69.3; // C#2

/**
 * The heartbeat under everything, from the first moment to the last. It follows the typical resting
 * heart rate for the age, with a little natural variability, and it is the last thing to stop.
 */
export class Heartbeat {
  private readonly synth = new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.08 },
  });
  private readonly gain: Tone.Gain;
  private readonly clock: Tone.Clock;
  private readonly rand = mulberry32(0x4ea27);
  private bpm: number;
  private deathAt = Infinity;
  private skipped = false;
  /** The most recent beat times (for checks). */
  readonly recent: number[] = [];

  constructor(
    out: Tone.InputNode,
    age: number,
    private readonly ctx: Tone.BaseContext,
    private readonly onBeat?: () => void,
  ) {
    this.bpm = heartRate(age);
    this.gain = new Tone.Gain(Tone.dbToGain(heartGainDb(age)));
    this.synth.connect(this.gain);
    this.gain.connect(out);
    this.clock = new Tone.Clock((time) => this.beat(time), this.bpm / 60);
  }

  start(at: number): void {
    this.clock.start(at);
  }

  setAge(age: number, at: number): void {
    this.bpm = heartRate(age);
    this.clock.frequency.rampTo(this.bpm / 60, sec(AUDIO.morph), at);
    this.gain.gain.rampTo(Tone.dbToGain(heartGainDb(age)), sec(AUDIO.morph), at);
  }

  private beat(time: number): void {
    // A beat that is already late (the page stalled) is skipped rather than crammed in.
    if (!this.ctx.isOffline && time < this.ctx.currentTime) return;
    let velocity = 0.9;
    if (time >= this.deathAt) {
      const since = time - this.deathAt;
      if (since > sec(DEATH.lastBeat) + 0.05) return;
      // Slowing, fainter, one missed beat, and then no more.
      if (!this.skipped && since > sec(DEATH.heartSlowFrom + 2.5)) {
        this.skipped = true;
        return;
      }
      if (since > sec(DEATH.heartSlowFrom)) {
        const k = Math.min(1, (since - sec(DEATH.heartSlowFrom)) / sec(DEATH.lastBeat - DEATH.heartSlowFrom));
        velocity = 0.9 - 0.5 * k;
      }
    }
    const jitter = (this.rand() - 0.5) * 0.03;
    const t = time + Math.max(0, jitter);
    const gap = 0.35 * Math.sqrt(60 / this.bpm);
    this.recent.push(t);
    if (this.recent.length > 64) this.recent.shift();
    try {
      this.synth.triggerAttackRelease(LUB, 0.08, t, velocity);
      this.synth.triggerAttackRelease(DUB, 0.07, t + gap, velocity * 0.6);
    } catch {
      return; // a scheduling hiccup must never stop the heart
    }
    if (this.onBeat) this.ctx.draw.schedule(this.onBeat, t);
  }

  die(t0: number): void {
    this.deathAt = t0;
    this.clock.frequency.rampTo(0.55, sec(DEATH.heartSlowFor), t0 + sec(DEATH.heartSlowFrom));
    this.clock.stop(t0 + sec(DEATH.lastBeat) + 0.5);
  }

  dispose(): void {
    this.clock.dispose();
    this.synth.dispose();
    this.gain.dispose();
  }
}
