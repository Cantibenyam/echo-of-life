// Fetches the WHO Global Health Observatory life-table indicators used by the mortality model
// and saves raw snapshots under data/who/ (committed, so builds never need the network).
//
//   LIFE_0000000030  nqx: probability of dying between ages x and x+n
//   LIFE_0000000035  ex:  expectation of life at age x
//
// Usage: node scripts/mortality/fetch-who.mjs [--year 2019]
import { mkdirSync, writeFileSync } from 'node:fs';

const yearArg = process.argv.indexOf('--year');
const YEAR = yearArg > -1 ? Number(process.argv[yearArg + 1]) : 2019;
const INDICATORS = ['LIFE_0000000030', 'LIFE_0000000035'];
const BASE = 'https://ghoapi.azureedge.net/api';

mkdirSync('data/who', { recursive: true });

for (const code of INDICATORS) {
  const filter = `SpatialDim eq 'GLOBAL' and Dim1 eq 'SEX_BTSX' and TimeDim eq ${YEAR}`;
  const url = `${BASE}/${code}?$filter=${encodeURIComponent(filter)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'EchoOfLife/1.0 (https://github.com/Cantibenyam/echo-of-life)' } });
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  const json = await res.json();
  const rows = (json.value ?? [])
    .map((r) => ({ ageGroup: r.Dim2, value: r.NumericValue }))
    .sort((a, b) => a.ageGroup.localeCompare(b.ageGroup));
  if (!rows.length) throw new Error(`${code}: no rows for ${YEAR}`);
  const out = { indicator: code, spatial: 'GLOBAL', sex: 'SEX_BTSX', year: YEAR, source: url, fetchedAt: new Date().toISOString(), rows };
  writeFileSync(`data/who/${code}-${YEAR}.json`, JSON.stringify(out, null, 2) + '\n');
  console.log(`${code} ${YEAR}: ${rows.length} age groups`);
}
