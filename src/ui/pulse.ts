import { heartRate } from '../audio/curves';

/**
 * Drives the present point's heartbeat. The audio heartbeat leads when it is running;
 * when it isn't (muted, suspended, not started, failed), a timer keeps the same pace.
 */
export class PulseDriver {
  private lastAudioBeat = -Infinity;
  private timer = 0;
  private age = 0;
  private running = false;

  constructor(private readonly onPulse: () => void) {}

  private period(): number {
    return 60000 / heartRate(this.age);
  }

  setAge(age: number): void {
    this.age = age;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      if (document.visibilityState === 'visible' && performance.now() - this.lastAudioBeat > 2.5 * this.period()) this.onPulse();
      this.timer = window.setTimeout(tick, this.period());
    };
    this.timer = window.setTimeout(tick, this.period());
  }

  audioBeat(): void {
    if (!this.running) return;
    this.lastAudioBeat = performance.now();
    this.onPulse();
  }

  stop(): void {
    this.running = false;
    window.clearTimeout(this.timer);
  }
}
