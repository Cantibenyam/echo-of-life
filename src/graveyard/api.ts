import { DRAW_TIMEOUT_MS, GRAVEYARD_API, GRAVE_ENV, GRAVE_SENT_KEY } from '../config';
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
 * Asks the graveyard to draw this life's lifespan (it keeps it, and only lays a grave at that age).
 * Resolves to the sealed lifespan, or null if the graveyard can't be reached: then the life goes on
 * with the one drawn here, and leaves no grave. Asking again for the same life gives the same answer.
 */
export async function drawLife(record: LifeRecord): Promise<number | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), DRAW_TIMEOUT_MS);
  try {
    const res = await fetch(`${GRAVEYARD_API}/lives?env=${GRAVE_ENV}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ lifeId: record.id, name: record.name }),
      signal: abort.signal,
    });
    if (!res.ok) return null;
    const { seal } = (await res.json()) as { seal?: unknown };
    return typeof seal === 'number' ? seal : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lays this life's grave, once. Called when the life ends, and again whenever the memorial is shown
 * in case the first attempt never arrived (offline, tab closed). Never throws.
 */
export async function layGrave(record: LifeRecord): Promise<void> {
  if (record.ended === null || !record.name || sentFor() === record.id) return;
  try {
    // Sent as text/plain: a "simple" cross-origin request with no preflight (the server parses the JSON itself).
    const res = await fetch(`${GRAVEYARD_API}/graves?env=${GRAVE_ENV}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      // The name and the age laid are the graveyard's own; the age sent here is only checked against them.
      body: JSON.stringify({ lifeId: record.id, age: record.age, ended: record.ended }),
    });
    // 201: laid. 4xx: it will never be accepted (a life the graveyard didn't draw), so stop trying.
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
