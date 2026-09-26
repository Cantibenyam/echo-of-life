import * as Tone from 'tone';
import { AUDIO, DEATH, sec } from '../config';
import { hallSend, hearingHz, roomSend } from './curves';

/** One final listening adjustment for the whole piece. */
export const MASTER_TRIM_DB = -4;

/**
 * scenes -> input ─┬─ dry ──────────────────────┐
 *                  ├─ roomSend -> room reverb ──┼─ sum -> hearing low-pass ─┐
 *                  └─ hallSend -> hall reverb ──┘                           ├─ compressor -> limiter -> master -> mute -> out
 * heartbeat -> heart low-pass (felt, not heard: it bypasses the hearing filter) ┘
 */
export class Bus {
  readonly input = new Tone.Gain(1);
  readonly heartIn = new Tone.Gain(1);
  /** Extra send into the hall, used by the final echo. */
  readonly echoIn = new Tone.Gain(1);
  private readonly sum = new Tone.Gain(1);
  private readonly hearing = new Tone.Filter({ type: 'lowpass', frequency: 2200, rolloff: -12, Q: 0.5 });
  private readonly roomSend = new Tone.Gain(0.35);
  private readonly hallSend = new Tone.Gain(0.15);
  private readonly room = new Tone.Reverb({ decay: 2.5, preDelay: 0.02, wet: 1 });
  private readonly hall = new Tone.Reverb({ decay: 9, preDelay: 0.04, wet: 1 });
  private readonly heartFilter = new Tone.Filter({ type: 'lowpass', frequency: 320, rolloff: -12 });
  private readonly comp = new Tone.Compressor({ threshold: -24, ratio: 2, knee: 12, attack: 0.3, release: 1 });
  private readonly limiter = new Tone.Limiter(-3);
  private readonly master = new Tone.Gain(0);
  private readonly mute = new Tone.Gain(1);

  /** Awaits both reverb impulses before anything is connected, so nothing starts dry or silent. */
  static async create(age: number): Promise<Bus> {
    const bus = new Bus();
    await Promise.all([bus.room.ready, bus.hall.ready]);
    bus.connect(age);
    return bus;
  }

  private connect(age: number): void {
    this.input.connect(this.sum);
    this.input.connect(this.roomSend);
    this.input.connect(this.hallSend);
    this.roomSend.connect(this.room);
    this.hallSend.connect(this.hall);
    this.echoIn.connect(this.hall);
    this.room.connect(this.sum);
    this.hall.connect(this.sum);
    this.sum.connect(this.hearing);
    this.hearing.connect(this.comp);
    this.heartIn.connect(this.heartFilter);
    this.heartFilter.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.mute);
    this.mute.toDestination();
    this.hearing.frequency.value = hearingHz(age);
    this.roomSend.gain.value = roomSend(age);
    this.hallSend.gain.value = hallSend(age);
  }

  fadeIn(at: number, seconds: number): void {
    this.master.gain.setValueAtTime(0, at);
    this.master.gain.linearRampTo(Tone.dbToGain(MASTER_TRIM_DB), seconds, at);
  }

  setAge(age: number, at: number, brightness = 1): void {
    const ramp = sec(AUDIO.morph);
    this.hearing.frequency.rampTo(hearingHz(age) * brightness, ramp, at);
    this.roomSend.gain.rampTo(roomSend(age), ramp, at);
    this.hallSend.gain.rampTo(hallSend(age), ramp, at);
  }

  setMuted(muted: boolean, at: number): void {
    if (muted) this.mute.gain.rampTo(0, sec(AUDIO.muteOut), at);
    else this.mute.gain.rampTo(1, sec(AUDIO.unmuteIn), at);
  }

  /** Hearing closes, then the whole piece falls silent. */
  die(t0: number): void {
    this.hearing.frequency.rampTo(400, sec(DEATH.hearingFor), t0 + sec(DEATH.hearingFrom));
    this.master.gain.exponentialRampTo(0.0001, sec(DEATH.masterFadeFor), t0 + sec(DEATH.masterFadeFrom));
  }

  dispose(): void {
    [this.input, this.heartIn, this.echoIn, this.sum, this.hearing, this.roomSend, this.hallSend, this.room, this.hall, this.heartFilter, this.comp, this.limiter, this.master, this.mute].forEach(
      (n) => n.dispose(),
    );
  }
}
