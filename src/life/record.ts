import { MAX_AGE, MODEL_ID } from './mortality';
import { hashString } from './rng';

/** The persisted life. Only `age` and `ended` ever change after birth, and only forward. */
export interface LifeRecord {
  readonly v: 1;
  readonly id: string;
  /** Epoch ms of the press that began the life. */
  readonly born: number;
  /** Highest age reached. */
  readonly age: number;
  /** The lifespan, offset by a key derived from the id so it isn't readable at a glance. */
  readonly seal: number;
  /** Epoch ms of death, or null while alive. Once set it never changes. */
  readonly ended: number | null;
  readonly model: string;
}

const N = MAX_AGE + 1;

function keyOf(id: string): number {
  const hex = id.replace(/-/g, '').slice(0, 8);
  const k = /^[0-9a-f]{8}$/i.test(hex) ? parseInt(hex, 16) : hashString(id);
  return k % N;
}

export function sealLifespan(lifespan: number, id: string): number {
  return (lifespan + keyOf(id)) % N;
}

export function lifespanOf(record: LifeRecord): number {
  return (record.seal - keyOf(record.id) + N) % N;
}

export function createRecord(id: string, born: number, lifespan: number): LifeRecord {
  return { v: 1, id, born, age: 0, seal: sealLifespan(lifespan, id), ended: null, model: MODEL_ID };
}

export const isEnded = (r: LifeRecord): boolean => r.ended !== null;

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Validates a parsed stored value.
 * - a valid v1 record is returned as-is
 * - a record from a newer schema is 'foreign' (run without writing, never overwrite it)
 * - anything else is null (treated like cleared data: a new life)
 */
export function migrate(raw: unknown): LifeRecord | 'foreign' | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.v === 'number' && r.v > 1) return 'foreign';
  if (r.v !== 1) return null;
  if (typeof r.id !== 'string' || r.id.length < 8) return null;
  if (!isTime(r.born)) return null;
  if (!isInt(r.age, 0, MAX_AGE) || !isInt(r.seal, 0, MAX_AGE)) return null;
  if (r.ended !== null && !isTime(r.ended)) return null;
  if (typeof r.model !== 'string') return null;
  return { v: 1, id: r.id, born: r.born, age: r.age, seal: r.seal, ended: r.ended as number | null, model: r.model };
}
