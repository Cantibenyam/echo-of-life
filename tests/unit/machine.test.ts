import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { initialState, reduce, type Effect, type Event, type MachineConfig, type State } from '../../src/life/machine';
import { createRecord, lifespanOf, sealLifespan, type LifeRecord } from '../../src/life/record';
import { TABLE } from '../../src/life/mortality';

const cfg: MachineConfig = { cooldownMs: 3200, birthLockMs: 5000, resumeLockMs: 2500 };
const ID = '12345678-aaaa-4bbb-8ccc-dddddddddddd';

/** A uniform u that samples exactly the given lifespan. */
function uFor(lifespan: number): number {
  const lo = lifespan === 0 ? 0 : TABLE.cdf[lifespan - 1]!;
  return (lo + TABLE.cdf[lifespan]!) / 2;
}

function run(events: Event[], start: State = initialState) {
  let state = start;
  const effects: Effect[] = [];
  for (const e of events) {
    const step = reduce(state, e, cfg);
    state = step.state;
    effects.push(...step.effects);
  }
  return { state, effects };
}

describe('life machine', () => {
  it('boots to the gate, memorial, or returning gate', () => {
    expect(run([{ t: 'loaded', record: null }]).state).toEqual({ k: 'gate', record: null });
    const alive = { ...createRecord(ID, 1000, 50), age: 12 };
    expect(run([{ t: 'loaded', record: alive }]).effects).toEqual([{ t: 'showGate', returning: alive }]);
    const dead = { ...alive, ended: 2000 };
    const r = run([{ t: 'loaded', record: dead }]);
    expect(r.state.k).toBe('ended');
    expect(r.effects).toEqual([{ t: 'showMemorial', record: dead, fromDeath: false }]);
  });

  it('is born with a sealed lifespan and saves before anything else', () => {
    const r = run([
      { t: 'loaded', record: null },
      { t: 'begin', now: 10_000, u: uFor(40), id: ID, stored: null },
    ]);
    expect(r.state.k).toBe('alive');
    const [save, born] = r.effects.slice(1);
    expect(save!.t).toBe('save');
    expect(born!.t).toBe('born');
    const rec = (save as { record: LifeRecord }).record;
    expect(rec.age).toBe(0);
    expect(rec.ended).toBeNull();
    expect(lifespanOf(rec)).toBe(40);
  });

  it('carries the name given at the gate, and names an older unnamed life on continue', () => {
    const born = run([
      { t: 'loaded', record: null },
      { t: 'begin', now: 0, u: uFor(40), id: ID, stored: null, name: 'Ana' },
    ]);
    expect((born.state as { record: LifeRecord }).record.name).toBe('Ana');
    const unnamed = { ...createRecord(ID, 1, 60), age: 5 };
    const resumed = run([
      { t: 'loaded', record: unnamed },
      { t: 'begin', now: 9, u: 0.5, id: 'ignored-0000', stored: unnamed, name: 'Bea' },
    ]);
    expect(resumed.effects[1]).toEqual({ t: 'save', record: { ...unnamed, name: 'Bea' } });
  });

  it('respects the birth lock and the cooldown, dropping early presses', () => {
    const born = run([
      { t: 'loaded', record: null },
      { t: 'begin', now: 0, u: uFor(40), id: ID, stored: null },
    ]).state;
    const early = run([{ t: 'press', now: 4999, stored: null }], born);
    expect(early.effects).toEqual([]);
    const first = run([{ t: 'press', now: 5000, stored: null }], born);
    expect((first.state as { record: LifeRecord }).record.age).toBe(1);
    const again = run([{ t: 'press', now: 5000 + 3199, stored: null }], first.state);
    expect(again.effects).toEqual([]);
    const next = run([{ t: 'press', now: 5000 + 3200, stored: null }], first.state);
    expect((next.state as { record: LifeRecord }).record.age).toBe(2);
  });

  it('shows the final year, then the next press ends the life, saving before dying', () => {
    const alive: State = { k: 'alive', record: { ...createRecord(ID, 1, 2), age: 2 }, coolUntil: 0 };
    const r = run([{ t: 'press', now: 100, stored: null }], alive);
    expect(r.state.k).toBe('dying');
    expect(r.effects.map((e) => e.t)).toEqual(['save', 'die']);
    expect((r.effects[0] as { record: LifeRecord }).record.ended).toBe(100);
    const done = run([{ t: 'dyingDone' }], r.state);
    expect(done.state.k).toBe('ended');
    expect(done.effects).toEqual([{ t: 'showMemorial', record: (r.state as { record: LifeRecord }).record, fromDeath: true }]);
  });

  it('an infant death still shows age 0 first', () => {
    const born = run([
      { t: 'loaded', record: null },
      { t: 'begin', now: 0, u: 0, id: ID, stored: null },
    ]);
    expect((born.state as { record: LifeRecord }).record.age).toBe(0);
    const r = run([{ t: 'press', now: 6000, stored: null }], born.state);
    expect(r.state.k).toBe('dying');
  });

  it('ended absorbs every event', () => {
    const dead: State = { k: 'ended', record: { ...createRecord(ID, 1, 5), age: 5, ended: 9 } };
    const events: Event[] = [
      { t: 'press', now: 1e9, stored: null },
      { t: 'begin', now: 1e9, u: 0.5, id: 'x', stored: null },
      { t: 'external', record: null },
      { t: 'loaded', record: null },
      { t: 'dyingDone' },
    ];
    for (const e of events) expect(reduce(dead, e, cfg)).toEqual({ state: dead, effects: [] });
  });

  it('adopts progress from another tab, and follows it into death', () => {
    const rec = { ...createRecord(ID, 1, 60), age: 10 };
    const alive: State = { k: 'alive', record: rec, coolUntil: 0 };
    const ahead = { ...rec, age: 14 };
    const r = run([{ t: 'press', now: 1, stored: ahead }], alive);
    expect(r.effects).toEqual([{ t: 'jumped', record: ahead }]);
    const dead = { ...ahead, ended: 5 };
    const d = run([{ t: 'external', record: dead }], r.state);
    expect(d.state.k).toBe('ended');
  });

  it('continue resumes the stored life instead of starting a new one', () => {
    const rec = { ...createRecord(ID, 1, 60), age: 33 };
    const r = run([
      { t: 'loaded', record: rec },
      { t: 'begin', now: 50, u: 0.99, id: 'other-id-000', stored: rec },
    ]);
    expect(r.state).toEqual({ k: 'alive', record: rec, coolUntil: 50 + cfg.resumeLockMs });
    expect(r.effects.at(-1)).toEqual({ t: 'resumed', record: rec });
  });

  it('takes the lifespan the graveyard drew, but only before the first year', () => {
    const born = run([
      { t: 'loaded', record: null },
      { t: 'begin', now: 0, u: uFor(40), id: ID, stored: null },
    ]).state;
    const sealed = run([{ t: 'sealed', id: ID, seal: sealLifespan(0, ID) }], born);
    expect(sealed.effects).toHaveLength(1);
    expect(sealed.effects[0]!.t).toBe('save');
    // Drawn 0: the first press after the birth lock ends the life.
    const pressed = run([{ t: 'press', now: cfg.birthLockMs, stored: null }], sealed.state);
    expect(pressed.state.k).toBe('dying');
    expect(pressed.state.k === 'dying' && pressed.state.record.age).toBe(0);

    // Too late: a year has been lived, or the life is ending; and never for another life.
    const lived = run([{ t: 'press', now: cfg.birthLockMs, stored: null }], born).state;
    expect(lived.k === 'alive' && lived.record.age).toBe(1);
    expect(reduce(lived, { t: 'sealed', id: ID, seal: sealLifespan(90, ID) }, cfg)).toEqual({ state: lived, effects: [] });
    expect(reduce(born, { t: 'sealed', id: 'another-life', seal: 3 }, cfg)).toEqual({ state: born, effects: [] });
    expect(reduce(born, { t: 'sealed', id: ID, seal: 500 }, cfg)).toEqual({ state: born, effects: [] });
    const dying = run([{ t: 'press', now: cfg.birthLockMs, stored: null }], sealed.state).state;
    expect(reduce(dying, { t: 'sealed', id: ID, seal: sealLifespan(90, ID) }, cfg)).toEqual({ state: dying, effects: [] });
  });

  it('property: age never decreases, never passes the lifespan, and the life ends exactly once', () => {
    const eventArb = fc.oneof(
      fc.record({ t: fc.constant('press' as const), dt: fc.integer({ min: 0, max: 8000 }) }),
      fc.record({ t: fc.constant('dyingDone' as const) }),
      fc.record({ t: fc.constant('begin' as const) }),
      fc.record({ t: fc.constant('sealed' as const), lifespan: fc.integer({ min: 0, max: 122 }) }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 122 }), fc.array(eventArb, { maxLength: 300 }), (lifespan, script) => {
        let state = reduce(initialState, { t: 'loaded', record: null }, cfg).state;
        let now = 0;
        let lastAge = 0;
        let endedSaves = 0;
        let livedSeal: number | null = null; // the seal once a year has been lived: it never changes again
        const begin = reduce(state, { t: 'begin', now, u: uFor(lifespan), id: ID, stored: null }, cfg);
        state = begin.state;
        for (const s of script) {
          let step;
          if (s.t === 'press') {
            now += s.dt;
            step = reduce(state, { t: 'press', now, stored: null }, cfg);
          } else if (s.t === 'sealed') {
            step = reduce(state, { t: 'sealed', id: ID, seal: sealLifespan(s.lifespan, ID) }, cfg);
          } else if (s.t === 'begin') {
            step = reduce(state, { t: 'begin', now, u: 0.5, id: 'zzzzzzzz', stored: null }, cfg);
          } else {
            step = reduce(state, { t: 'dyingDone' }, cfg);
          }
          state = step.state;
          for (const e of step.effects) {
            if (e.t === 'save') {
              expect(e.record.age).toBeGreaterThanOrEqual(lastAge);
              expect(e.record.age).toBeLessThanOrEqual(lifespanOf(e.record));
              if (e.record.age > 0) {
                livedSeal ??= e.record.seal;
                expect(e.record.seal).toBe(livedSeal);
              }
              lastAge = e.record.age;
              if (e.record.ended !== null) endedSaves++;
            }
          }
          expect(endedSaves).toBeLessThanOrEqual(1);
        }
        if (state.k === 'dying' || state.k === 'ended') {
          expect(endedSaves).toBe(1);
          expect(state.record.age).toBe(lifespanOf(state.record));
        }
      }),
      { numRuns: 10_000 },
    );
  });
});
