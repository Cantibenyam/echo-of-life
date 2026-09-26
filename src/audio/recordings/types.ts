export interface RecordingInfo {
  readonly id: string;
  /** File name under public/audio/. */
  readonly file: string;
  /** Seconds. */
  readonly duration: number;
  /**
   * texture: rain, birds, crowds; looped as random segments with long equal-power crossfades.
   * pulse: clocks; looped natively between two points that sit in the quiet between ticks.
   */
  readonly loop: 'texture' | 'pulse';
  readonly loopStart?: number;
  readonly loopEnd?: number;
}
