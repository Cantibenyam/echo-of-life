export interface StartOptions {
  readonly age: number;
  /** Seeds the life motif, so every life has its own echo. */
  readonly lifeId: string;
  readonly birth: boolean;
  readonly muted: boolean;
  /** Called in sync with each audible heartbeat. */
  readonly onBeat: () => void;
}

/** What the page sees of the sound. The engine never learns the lifespan: it only hears die(). */
export interface AudioApi {
  /** Must be called synchronously inside a user gesture. */
  unlock(): void;
  start(opts: StartOptions): void;
  started(): boolean;
  setAge(age: number): void;
  die(): void;
  /** Call inside a gesture when unmuting, so a suspended context can resume. */
  setMuted(muted: boolean): void;
  /** True when the sound should be playing but the context is not running (iOS interruptions). */
  needsResume(): boolean;
  /** Call inside a gesture. */
  resume(): void;
}
