import { describe, expect, it, vi } from 'vitest';
import { createRecord, lifespanOf, migrate, sealLifespan, type LifeRecord } from '../../src/life/record';
import { LocalLifeStore, MemoryLifeStore, canReplace } from '../../src/life/store';
import { mulberry32, newId } from '../../src/life/rng';

class FakeStorage implements Storage {
  map = new Map<string, string>();
  throwOnSet = false;
  throwOnGet = false;
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    if (this.throwOnGet) throw new Error('blocked');
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.throwOnSet) throw new Error('QuotaExceededError');
    this.map.set(k, v);
  }
}

const KEY = 'test:life';

describe('record', () => {
  it('seals and unseals every lifespan for many ids', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const id = i % 10 === 0 ? `not-a-uuid-${i}` : newId();
      const lifespan = Math.floor(rand() * 123);
      const r = createRecord(id, 1_700_000_000_000, lifespan);
      expect(lifespanOf(r)).toBe(lifespan);
      expect(r.seal).toBe(sealLifespan(lifespan, id));
    }
  });

  it('migrates v1, rejects garbage, and marks newer schemas foreign', () => {
    const r = createRecord(newId(), 1_700_000_000_000, 40);
    expect(migrate(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(migrate({ ...r, v: 2 })).toBe('foreign');
    expect(migrate({ ...r, age: -1 })).toBeNull();
    expect(migrate({ ...r, age: 123 })).toBeNull();
    expect(migrate({ ...r, ended: 'yesterday' })).toBeNull();
    expect(migrate('hello')).toBeNull();
    expect(migrate(null)).toBeNull();
  });
});

describe('store guard', () => {
  const base = createRecord('0f0f0f0f-0000-4000-8000-000000000000', 1_700_000_000_000, 30);

  it('only lets a life move forward', () => {
    const older: LifeRecord = { ...base, age: 5 };
    expect(canReplace(null, base)).toBe(true);
    expect(canReplace(base, older)).toBe(true);
    expect(canReplace(older, base)).toBe(false);
    expect(canReplace(base, { ...base, id: newId() })).toBe(false);
    const dead: LifeRecord = { ...older, ended: 1_700_000_100_000 };
    expect(canReplace(older, dead)).toBe(true);
    expect(canReplace(dead, older)).toBe(false);
    expect(canReplace(dead, { ...dead, age: 6 })).toBe(false);
    expect(canReplace(dead, dead)).toBe(true);
  });

  it('persists through localStorage and refuses backwards writes', () => {
    const storage = new FakeStorage();
    const store = new LocalLifeStore(storage, KEY);
    expect(store.load()).toBeNull();
    expect(store.save({ ...base, age: 3 })).toBe(true);
    expect(store.save({ ...base, age: 2 })).toBe(false);
    expect((store.load() as LifeRecord).age).toBe(3);
  });

  it('never overwrites a foreign (newer) record', () => {
    const storage = new FakeStorage();
    storage.setItem(KEY, JSON.stringify({ ...base, v: 2 }));
    const store = new LocalLifeStore(storage, KEY);
    expect(store.load()).toBe('foreign');
    expect(store.save(base)).toBe(false);
  });

  it('falls back to memory without throwing when storage breaks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = new FakeStorage();
    const store = new LocalLifeStore(storage, KEY);
    storage.throwOnSet = true;
    expect(store.save(base)).toBe(true);
    expect(store.persistent).toBe(false);
    expect(store.save({ ...base, age: 1 })).toBe(true);
    expect((store.load() as LifeRecord).age).toBe(1);
    storage.throwOnGet = true;
    expect(() => store.load()).not.toThrow();
    warn.mockRestore();
  });

  it('treats unreadable JSON as no life', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = new FakeStorage();
    storage.setItem(KEY, '{not json');
    expect(new LocalLifeStore(storage, KEY).load()).toBeNull();
    warn.mockRestore();
  });

  it('memory store applies the same guard', () => {
    const m = new MemoryLifeStore();
    expect(m.save({ ...base, age: 4 })).toBe(true);
    expect(m.save({ ...base, age: 3 })).toBe(false);
  });
});
