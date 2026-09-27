import { MAX_AGE, sampleLifespan } from './mortality';
import { createRecord, lifespanOf, type LifeRecord } from './record';

/**
 * The life, as a pure reducer. Persisted state is only the record (alive or ended);
 * `dying` exists only in memory, and `ended` absorbs every later event.
 */
export type State =
  | { readonly k: 'boot' }
  | { readonly k: 'gate'; readonly record: LifeRecord | null }
  | { readonly k: 'alive'; readonly record: LifeRecord; readonly coolUntil: number }
  | { readonly k: 'dying'; readonly record: LifeRecord }
  | { readonly k: 'ended'; readonly record: LifeRecord };

export type Event =
  | { readonly t: 'loaded'; readonly record: LifeRecord | null }
  /** The begin/continue press. `stored` is a fresh read of storage at that moment. */
  | {
      readonly t: 'begin';
      readonly now: number;
      readonly u: number;
      readonly id: string;
      readonly stored: LifeRecord | null;
      /** The name given at the gate (null when continuing a life that already has one). */
      readonly name?: string | null;
    }
  /** A press on the timeline. `stored` is a fresh read (another tab may have moved on). */
  | { readonly t: 'press'; readonly now: number; readonly stored: LifeRecord | null }
  | { readonly t: 'external'; readonly record: LifeRecord | null }
  /** The graveyard drew this life's lifespan (sealed). Taken only before the first year is lived. */
  | { readonly t: 'sealed'; readonly id: string; readonly seal: number }
  | { readonly t: 'dyingDone' };

export type Effect =
  | { readonly t: 'save'; readonly record: LifeRecord }
  | { readonly t: 'showGate'; readonly returning: LifeRecord | null }
  | { readonly t: 'born'; readonly record: LifeRecord }
  | { readonly t: 'resumed'; readonly record: LifeRecord }
  | { readonly t: 'advanced'; readonly record: LifeRecord }
  | { readonly t: 'jumped'; readonly record: LifeRecord }
  | { readonly t: 'die'; readonly record: LifeRecord }
  | { readonly t: 'showMemorial'; readonly record: LifeRecord; readonly fromDeath: boolean };

export interface MachineConfig {
  readonly cooldownMs: number;
  readonly birthLockMs: number;
  readonly resumeLockMs: number;
}

export interface Step {
  readonly state: State;
  readonly effects: readonly Effect[];
}

const same = (state: State): Step => ({ state, effects: [] });

/** Merges a fresh read of the same life into ours, taking whichever is further along. */
function furthest(ours: LifeRecord, stored: LifeRecord | null): LifeRecord {
  if (!stored || stored.id !== ours.id) return ours;
  if (stored.ended !== null) return stored;
  // Still at birth: the stored life may carry the lifespan the graveyard drew (from another tab).
  if (stored.age === 0 && ours.age === 0) return stored;
  return stored.age > ours.age ? stored : ours;
}

const unborn = (r: LifeRecord): boolean => r.age === 0 && r.ended === null;

export const initialState: State = { k: 'boot' };

export function reduce(state: State, event: Event, cfg: MachineConfig): Step {
  switch (state.k) {
    case 'boot': {
      if (event.t !== 'loaded') return same(state);
      const r = event.record;
      if (r && r.ended !== null) return { state: { k: 'ended', record: r }, effects: [{ t: 'showMemorial', record: r, fromDeath: false }] };
      return { state: { k: 'gate', record: r }, effects: [{ t: 'showGate', returning: r }] };
    }

    case 'gate': {
      if (event.t === 'external') return same({ k: 'gate', record: event.record ?? state.record });
      if (event.t !== 'begin') return same(state);
      const found = event.stored ?? state.record;
      if (found) {
        if (found.ended !== null) {
          return { state: { k: 'ended', record: found }, effects: [{ t: 'showMemorial', record: found, fromDeath: false }] };
        }
        // A life begun before names existed takes the name given now.
        const existing: LifeRecord = found.name === null && event.name ? { ...found, name: event.name } : found;
        return {
          state: { k: 'alive', record: existing, coolUntil: event.now + cfg.resumeLockMs },
          effects: [{ t: 'save', record: existing }, { t: 'resumed', record: existing }],
        };
      }
      const record = createRecord(event.id, event.now, sampleLifespan(event.u), event.name ?? null);
      return {
        state: { k: 'alive', record, coolUntil: event.now + cfg.birthLockMs },
        effects: [{ t: 'save', record }, { t: 'born', record }],
      };
    }

    case 'alive': {
      if (event.t === 'external') {
        const r = event.record;
        if (!r || r.id !== state.record.id) return same(state);
        if (r.ended !== null) return { state: { k: 'ended', record: r }, effects: [{ t: 'showMemorial', record: r, fromDeath: false }] };
        if (r.age > state.record.age) return { state: { ...state, record: r }, effects: [{ t: 'jumped', record: r }] };
        if (unborn(r) && unborn(state.record)) return same({ ...state, record: r });
        return same(state);
      }
      if (event.t === 'sealed') {
        const r = state.record;
        if (event.id !== r.id || !unborn(r) || event.seal === r.seal) return same(state);
        if (!Number.isInteger(event.seal) || event.seal < 0 || event.seal > MAX_AGE) return same(state);
        const sealed: LifeRecord = { ...r, seal: event.seal };
        return { state: { ...state, record: sealed }, effects: [{ t: 'save', record: sealed }] };
      }
      if (event.t !== 'press') return same(state);
      if (event.now < state.coolUntil) return same(state);

      const rec = furthest(state.record, event.stored);
      if (rec.ended !== null) {
        return { state: { k: 'ended', record: rec }, effects: [{ t: 'showMemorial', record: rec, fromDeath: false }] };
      }
      if (rec.age > state.record.age) {
        // Another tab lived on; this press only catches up.
        return { state: { k: 'alive', record: rec, coolUntil: event.now + cfg.cooldownMs }, effects: [{ t: 'jumped', record: rec }] };
      }
      if (rec.age < lifespanOf(rec)) {
        const next: LifeRecord = { ...rec, age: rec.age + 1 };
        return {
          state: { k: 'alive', record: next, coolUntil: event.now + cfg.cooldownMs },
          effects: [{ t: 'save', record: next }, { t: 'advanced', record: next }],
        };
      }
      // The year that does not come. Persist the ending before anything is heard or seen.
      const ended: LifeRecord = { ...rec, ended: event.now };
      return { state: { k: 'dying', record: ended }, effects: [{ t: 'save', record: ended }, { t: 'die', record: ended }] };
    }

    case 'dying': {
      if (event.t !== 'dyingDone') return same(state);
      return { state: { k: 'ended', record: state.record }, effects: [{ t: 'showMemorial', record: state.record, fromDeath: true }] };
    }

    case 'ended':
      return same(state);
  }
}
