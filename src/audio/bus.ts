import * as Tone from 'tone';
import { AUDIO, DEATH, sec } from '../config';
import { mulberry32 } from '../life/rng';
import { hallSend, hearingHz, roomSend } from './curves';

/** One final listening adjustment for the whole piece. */
export const MASTER_TRIM_DB = -4;

/**
 * The impulse Tone's Reverb would make for this decay: stereo noise, silent until the pre-delay, then
 * falling away with Tone's time constant for the decay. Tone renders the whole decay time, but the
 * sound is 60 dB down long before that (after 3 s of a "9 s" hall), far below hearing in this mix; the
 * rest was most of the reverb's work, so the impulse ends there, with a short fade.
 */
export function reverbImpulse(raw: BaseAudioContext, decay: number, preDelay: number, seed: number): AudioBuffer {
  const k = Math.log(decay + 1) / Math.log(200);
  const sr = raw.sampleRate;
  const start = Math.round(preDelay * sr);
  const length = start + Math.ceil((60 / 8.686) * k * sr);
  const fade = Math.floor(0.05 * sr);
  const buffer = raw.createBuffer(2, length, sr);
  for (let c = 0; c < 2; c++) {
    const rand = mulberry32(seed + c);
    const d = buffer.getChannelData(c);
    for (let i = start; i < length; i++) {
      let env = Math.exp(-(i - start) / sr / k);
      if (i > length - fade) env *= (length - i) / fade;
      d[i] = (rand() * 2 - 1) * env;
    }
  }
  // The level Tone's reverb had: the browser scales an impulse by its average power over the whole
  // buffer, and Tone's buffer was the full decay long. Apply that same scale here (the Web Audio
  // normalization formula, over Tone's length) and switch the browser's own off, or the shorter
  // impulse would come out quieter.
  let energy = 0;
  for (let c = 0; c < 2; c++) for (const v of buffer.getChannelData(c)) energy += v * v;
  const toneLength = Math.ceil((decay + preDelay) * sr);
  const power = Math.max(0.000125, Math.sqrt(energy / (2 * toneLength)));
  const scale = (0.00125 * (44100 / sr)) / power;
  for (let c = 0; c < 2; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) d[i]! *= scale;
  }
  return buffer;
}

function convolver(raw: BaseAudioContext, decay: number, preDelay: number, seed: number): ConvolverNode {
  const node = raw.createConvolver();
  node.normalize = false;
  node.buffer = reverbImpulse(raw, decay, preDelay, seed);
  return node;
}

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
  private readonly raw = Tone.getContext().rawContext as BaseAudioContext;
  private readonly room = convolver(this.raw, 2.5, 0.02, 0x2a11);
  private readonly hall = convolver(this.raw, 9, 0.04, 0x9a11);
  private readonly heartFilter = this.raw.createBiquadFilter();
  private readonly comp = new Tone.Compressor({ threshold: -24, ratio: 2, knee: 12, attack: 0.3, release: 1 });
  private readonly limiter = new Tone.Limiter(-3);
  private readonly master = new Tone.Gain(0);
  private readonly mute = new Tone.Gain(1);

  /** Builds the bus with both reverb impulses in place before anything is connected. */
  static async create(age: number): Promise<Bus> {
    const bus = new Bus();
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
    Tone.connect(this.room, this.sum);
    Tone.connect(this.hall, this.sum);
    this.sum.connect(this.hearing);
    this.hearing.connect(this.comp);
    this.heartFilter.type = 'lowpass';
    this.heartFilter.frequency.value = 320;
    this.heartIn.connect(this.heartFilter);
    Tone.connect(this.heartFilter, this.comp);
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
    [this.input, this.heartIn, this.echoIn, this.sum, this.hearing, this.roomSend, this.hallSend, this.comp, this.limiter, this.master, this.mute].forEach((n) =>
      n.dispose(),
    );
    [this.room, this.hall, this.heartFilter].forEach((n) => n.disconnect());
  }
}
