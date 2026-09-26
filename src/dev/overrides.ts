// Development-only helpers. This module is imported only under import.meta.env.DEV, so it never
// reaches a production build (scripts/check-dist.mjs fails the build if this marker is found).
export const DEV_MARKER = '__EOL_DEV__';

import { MAX_AGE } from '../life/mortality';
import { createRecord, type LifeRecord } from '../life/record';
import { newId } from '../life/rng';

export interface Overrides {
  /** Any override present: the life lives in memory only and never touches storage. */
  readonly active: boolean;
  readonly age: number | null;
  readonly lifespan: number | null;
  readonly fast: boolean;
  readonly hud: boolean;
  readonly render: string | null;
}

const int = (v: string | null, max: number): number | null => {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

export function readOverrides(search = location.search): Overrides {
  const p = new URLSearchParams(search);
  const age = int(p.get('age'), MAX_AGE);
  const lifespan = int(p.get('lifespan'), MAX_AGE);
  const fast = p.has('fast');
  const hud = p.has('hud');
  const render = p.get('render');
  const active = age !== null || lifespan !== null || fast || hud || render !== null;
  return { active, age, lifespan, fast, hud, render };
}

/** A throwaway life for auditioning an age. Without ?lifespan it lives to the cap. */
export function devRecord(o: Overrides): LifeRecord | null {
  if (o.age === null && o.lifespan === null) return null;
  const lifespan = Math.max(o.lifespan ?? MAX_AGE, o.age ?? 0);
  return { ...createRecord(newId(), Date.now(), lifespan), age: o.age ?? 0 };
}

export function expose(api: Record<string, unknown>): void {
  (window as unknown as Record<string, unknown>)[DEV_MARKER] = api;
  (window as unknown as Record<string, unknown>).__eol = api;
}
