import { migrate, type LifeRecord } from './record';

export type Loaded = LifeRecord | 'foreign' | null;

export interface LifeStore {
  /** False when the life only lives in memory (storage unavailable, or a foreign record present). */
  readonly persistent: boolean;
  load(): Loaded;
  /** Returns false if the write was refused (it would move the life backwards) or failed. */
  save(record: LifeRecord): boolean;
  /** Called when another tab changes the stored life. */
  onExternal(cb: (record: LifeRecord | null) => void): () => void;
}

/**
 * The irreversibility guard. A stored life may only move forward:
 * same id, age never lower, and once ended it never changes again.
 */
export function canReplace(prev: LifeRecord | null, next: LifeRecord): boolean {
  if (!prev) return true;
  if (prev.id !== next.id) return false;
  if (next.age < prev.age) return false;
  if (prev.ended !== null) return next.ended === prev.ended && next.age === prev.age;
  return true;
}

export class MemoryLifeStore implements LifeStore {
  readonly persistent = false;
  private record: LifeRecord | null;

  constructor(initial: LifeRecord | null = null) {
    this.record = initial;
  }

  load(): Loaded {
    return this.record;
  }

  save(record: LifeRecord): boolean {
    if (!canReplace(this.record, record)) return false;
    this.record = record;
    return true;
  }

  onExternal(): () => void {
    return () => {};
  }
}

export class LocalLifeStore implements LifeStore {
  private fallback: MemoryLifeStore | null = null;

  constructor(
    private readonly storage: Storage,
    private readonly key: string,
    private readonly target: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = null,
  ) {}

  get persistent(): boolean {
    return this.fallback === null;
  }

  private read(): Loaded {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      return migrate(JSON.parse(raw));
    } catch {
      console.warn('[echo] stored life was unreadable; starting fresh');
      return null;
    }
  }

  load(): Loaded {
    if (this.fallback) return this.fallback.load();
    return this.read();
  }

  save(record: LifeRecord): boolean {
    if (this.fallback) return this.fallback.save(record);
    const current = this.read();
    if (current === 'foreign') return false;
    if (!canReplace(current, record)) return false;
    try {
      this.storage.setItem(this.key, JSON.stringify(record));
      return true;
    } catch {
      // Storage full or blocked mid-life: keep living in memory for this visit.
      console.warn('[echo] could not save the life; continuing in memory');
      this.fallback = new MemoryLifeStore(current);
      return this.fallback.save(record);
    }
  }

  onExternal(cb: (record: LifeRecord | null) => void): () => void {
    if (!this.target) return () => {};
    const handler = (e: StorageEvent) => {
      if (e.key !== this.key) return;
      const loaded = this.read();
      cb(loaded === 'foreign' ? null : loaded);
    };
    this.target.addEventListener('storage', handler as EventListener);
    return () => this.target!.removeEventListener('storage', handler as EventListener);
  }
}

/** Returns localStorage if it is usable, or null (blocked, private modes that throw, quota 0). */
export function usableLocalStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__echooflife_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * The store for this visit. Falls back to memory if storage is unusable, or if it holds a record
 * from a newer version of the site (which must never be overwritten).
 */
export function createLifeStore(key: string): LifeStore {
  const storage = usableLocalStorage();
  if (!storage) return new MemoryLifeStore();
  const store = new LocalLifeStore(storage, key, window);
  if (store.load() === 'foreign') return new MemoryLifeStore();
  return store;
}
