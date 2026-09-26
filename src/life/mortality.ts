import { Q } from './mortality.table';

export { MODEL_ID } from './mortality.table';

/** The oldest possible age (the hard cap, q = 1). */
export const MAX_AGE = Q.length - 1;

export interface LifeTable {
  /** Probability of dying between exact ages x and x + 1. */
  readonly q: readonly number[];
  /** Probability of reaching exact age x. */
  readonly S: readonly number[];
  /** Probability that the completed lifespan is exactly x. */
  readonly d: readonly number[];
  /** P(lifespan <= x). The last entry is exactly 1. */
  readonly cdf: readonly number[];
}

export function buildLifeTable(q: readonly number[] = Q): LifeTable {
  const S: number[] = [];
  const d: number[] = [];
  const cdf: number[] = [];
  let alive = 1;
  let acc = 0;
  for (let x = 0; x < q.length; x++) {
    S.push(alive);
    const dx = alive * q[x]!;
    d.push(dx);
    acc += dx;
    cdf.push(acc);
    alive -= dx;
  }
  cdf[cdf.length - 1] = 1;
  return { q, S, d, cdf };
}

export const TABLE = buildLifeTable();

/**
 * Inverse-CDF sample of a completed lifespan (in whole years) from a uniform u in [0, 1).
 * Returns the first age x whose cumulative probability exceeds u.
 */
export function sampleLifespan(u: number, table: LifeTable = TABLE): number {
  const { cdf } = table;
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cdf[mid]! > u) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Mean completed lifespan in whole years (what the sampler averages to). */
export function meanLifespan(table: LifeTable = TABLE): number {
  return table.d.reduce((sum, dx, x) => sum + x * dx, 0);
}

/** Life expectancy at exact age x, assuming a constant hazard within each year (a0 for infants). */
export function lifeExpectancy(fromAge = 0, table: LifeTable = TABLE, a0 = 0.15): number {
  const { q, S } = table;
  let years = 0;
  for (let x = fromAge; x < q.length; x++) {
    const qx = q[x]!;
    let lived: number;
    if (x === 0) lived = 1 - qx + a0 * qx;
    else if (qx >= 1) lived = 0.5;
    else lived = qx / -Math.log(1 - qx);
    years += S[x]! * lived;
  }
  return years / S[fromAge]!;
}
