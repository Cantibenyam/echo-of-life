import * as Tone from 'tone';
import { mulberry32, hashString } from '../../life/rng';
import type { RecordingInfo } from './types';

const CURVE_POINTS = 64;
const FADE_IN = Float32Array.from({ length: CURVE_POINTS }, (_, i) => Math.sin(((i / (CURVE_POINTS - 1)) * Math.PI) / 2));
const FADE_OUT = Float32Array.from({ length: CURVE_POINTS }, (_, i) => Math.cos(((i / (CURVE_POINTS - 1)) * Math.PI) / 2));

/**
 * Plays a recording forever without an audible seam.
 * - texture: random 20-35 s segments from random offsets, joined by 4 s equal-power crossfades
 *   (MP3 encoder padding makes the file's own ends useless as loop points).
 * - pulse (clocks): a native loop between two points that sit in the quiet between ticks.
 */
export class Looper {
  readonly out = new Tone.Gain(1);
  private readonly rand: () => number;
  private readonly live = new Set<{ src: AudioBufferSourceNode; gain: GainNode }>();
  private clock: Tone.Clock | null = null;
  private next = 0;

  constructor(
    private readonly ctx: Tone.BaseContext,
    private readonly buffer: AudioBuffer,
    private readonly info: RecordingInfo,
  ) {
    this.rand = mulberry32(hashString(info.id));
  }

  start(at: number): void {
    if (this.info.loop === 'pulse') {
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = this.buffer;
      src.loop = true;
      const start = this.info.loopStart ?? 0;
      src.loopStart = start;
      src.loopEnd = this.info.loopEnd ?? this.buffer.duration;
      src.connect(gain);
      Tone.connect(gain, this.out);
      src.start(at, start);
      this.live.add({ src, gain });
      return;
    }
    this.next = at;
    this.clock = new Tone.Clock((time) => {
      while (this.next < time + 3) this.segment(this.next);
    }, 2);
    this.clock.start(at);
    this.segment(this.next);
  }

  private segment(t: number): void {
    const dur = this.buffer.duration;
    const fade = Math.min(4, dur / 4);
    const length = Math.min(dur, Math.max(3 * fade, 20 + this.rand() * 15));
    const offset = this.rand() * Math.max(0, dur - length);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = this.buffer;
    gain.gain.value = 0;
    gain.gain.setValueCurveAtTime(FADE_IN, t, fade);
    gain.gain.setValueCurveAtTime(FADE_OUT, t + length - fade, fade);
    src.connect(gain);
    Tone.connect(gain, this.out);
    src.start(t, offset, length);
    const voice = { src, gain };
    this.live.add(voice);
    src.onended = () => {
      this.live.delete(voice);
      src.disconnect();
      gain.disconnect();
    };
    this.next = t + length - fade;
  }

  dispose(): void {
    this.clock?.dispose();
    this.clock = null;
    for (const { src, gain } of this.live) {
      try {
        src.stop();
      } catch {
        /* not started yet */
      }
      src.disconnect();
      gain.disconnect();
    }
    this.live.clear();
    this.out.dispose();
  }
}
