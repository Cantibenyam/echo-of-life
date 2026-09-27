import { GRAVEYARD_API, GRAVE_ENV, GRAVE_SENT_KEY } from '../config';
import type { LifeRecord } from '../life/record';

export interface Grave {
  readonly id: number;
  readonly name: string;
  readonly age: number;
  readonly ended: number;
}

export interface GravePage {
  readonly graves: readonly Grave[];
  readonly total: number;
  readonly next: number | null;
}

export async function fetchGraves(before?: number): Promise<GravePage> {
  const q = new URLSearchParams({ env: GRAVE_ENV });
  if (before) q.set('before', String(before));
  const res = await fetch(`${GRAVEYARD_API}/graves?${q}`);
  if (!res.ok) throw new Error(`graveyard ${res.status}`);
  return (await res.json()) as GravePage;
}

function sentFor(): string | null {
  try {
    return localStorage.getItem(GRAVE_SENT_KEY);
  } catch {
    return null;
  }
}

/**
 * Lays this life's grave, once. Called when the life ends, and again whenever the memorial is shown
 * in case the first attempt never arrived (offline, tab closed). Never throws.
 */
export async function layGrave(record: LifeRecord): Promise<void> {
  if (record.ended === null || !record.name || sentFor() === record.id) return;
  try {
    const res = await fetch(`${GRAVEYARD_API}/graves?env=${GRAVE_ENV}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lifeId: record.id, name: record.name, age: record.age, born: record.born, ended: record.ended }),
      keepalive: true,
    });
    // 201: laid. 4xx: it will never be accepted (a name the server refuses), so stop trying.
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
      try {
        localStorage.setItem(GRAVE_SENT_KEY, record.id);
      } catch {
        /* it will simply be tried again next time */
      }
    }
  } catch {
    /* offline: tried again when the memorial is next shown */
  }
}
