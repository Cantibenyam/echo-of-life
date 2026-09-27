// The leading causes of death by age group (world, both sexes, 2019), from the WHO Global Health
// Estimates 2021 summary tables, for the line shown when a life ends.
//
// Ranks specific causes (level 3 of the GHE cause list, or level-2 causes that have no subdivisions),
// leaving out residual "Other ..." categories, as WHO's leading-cause rankings do.
// Writes data/who/ghe-2019-global-leading-causes.json (audit) and src/content/death-causes.json (site).
//
// Usage: node scripts/content/build-death-causes.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readSheet } from './xlsx.mjs';

const URL =
  'https://cdn.who.int/media/docs/default-source/gho-documents/global-health-estimates/ghe2021_deaths_global_new2.xlsx?sfvrsn=e1f725b1_3';
const PAGE = 'https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates/ghe-leading-causes-of-death';
const CACHE = '.cache/who/ghe2021_deaths_global.xlsx';
const YEAR = 2019;

if (!existsSync(CACHE)) {
  mkdirSync('.cache/who', { recursive: true });
  const res = await fetch(URL, { headers: { 'User-Agent': 'EchoOfLife/1.0 (https://github.com/Cantibenyam/echo-of-life)' } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
}

const rows = readSheet(readFileSync(CACHE), `Global ${YEAR}`);
const header = rows.find((r) => r?.[5] === 'Age group');
const groupsIn = header.slice(9, 17); // male columns 9..16, female columns 17..24, same groups
const want = ['0-28 days', '1-59 months', '5-14', '15-29', '30-49', '50-59', '60-69', '70+'];
if (want.some((g, i) => groupsIn[i] !== g)) throw new Error(`unexpected age groups: ${groupsIn.join(', ')}`);

// Parse the cause hierarchy: the marker column (1..4) gives the level, the name follows it.
const causes = [];
for (const r of rows) {
  if (!r || typeof r[0] !== 'number' || r[0] === 0) continue;
  let level = 0;
  for (let c = 1; c <= 4; c++) if (r[c] != null && /^[IVX]+\.|^[A-Z]\.|^\d+\.|^[a-z]\.$/.test(String(r[c]).trim())) level = c;
  if (!level) continue;
  const name = String(r[level + 1] ?? '').trim();
  const male = r.slice(9, 17).map((v) => Number(v) || 0);
  const female = r.slice(17, 25).map((v) => Number(v) || 0);
  causes.push({ code: r[0], level, name, deaths: male.map((m, i) => m + female[i]) });
}

// Rankable: level 3, or level 2 without level-3 children. Leave out residual "Other ..." groups.
const rankable = causes.filter((c, i) => {
  if (/^other\b/i.test(c.name)) return false;
  if (c.level === 3) return true;
  if (c.level !== 2) return false;
  const next = causes[i + 1];
  return !next || next.level <= 2;
});

const PLAIN = {
  'Ischaemic heart disease': 'heart disease',
  Stroke: 'stroke',
  'Chronic obstructive pulmonary disease': 'chronic lung disease',
  'Lower respiratory infections': 'pneumonia and other chest infections',
  'Preterm birth complications': 'complications of being born too early',
  'Birth asphyxia and birth trauma': 'lack of oxygen or injury during birth',
  'Neonatal sepsis and infections': 'infections in the first weeks of life',
  'Diarrhoeal diseases': 'diarrhoeal diseases',
  'Road injury': 'road injuries',
  'Self-harm': 'suicide',
  'Interpersonal violence': 'violence',
  Tuberculosis: 'tuberculosis',
  'HIV/AIDS': 'HIV/AIDS',
  Malaria: 'malaria',
  Drowning: 'drowning',
  'Trachea, bronchus, lung cancers': 'lung cancer',
  'Alzheimer disease and other dementias': 'dementia',
  'Diabetes mellitus': 'diabetes',
  'Kidney diseases': 'kidney disease',
  'Cirrhosis of the liver': 'cirrhosis of the liver',
  'Congenital heart anomalies': 'heart conditions present from birth',
  'Hypertensive heart disease': 'heart disease caused by high blood pressure',
  'Maternal conditions': 'complications of pregnancy and childbirth',
  'Protein-energy malnutrition': 'malnutrition',
  Meningitis: 'meningitis',
  Measles: 'measles',
  'Breast cancer': 'breast cancer',
  'Liver cancer': 'liver cancer',
  'Stomach cancer': 'stomach cancer',
  'Colon and rectum cancers': 'bowel cancer',
  Falls: 'falls',
  Leukaemia: 'leukaemia',
  'Collective violence and legal intervention': 'war and conflict',
  'Childhood-cluster diseases': 'childhood diseases such as measles and whooping cough',
  'Congenital anomalies': 'conditions present from birth',
  'Parasitic and vector diseases': 'malaria and other parasitic diseases',
  'Fire, heat and hot substances': 'burns',
  'Epilepsy': 'epilepsy',
};

const SITE_GROUPS = [
  { from: 0, to: 4, cols: [0, 1], label: 'children under five' },
  { from: 5, to: 14, cols: [2], label: 'people aged 5 to 14' },
  { from: 15, to: 29, cols: [3], label: 'people aged 15 to 29' },
  { from: 30, to: 49, cols: [4], label: 'people aged 30 to 49' },
  { from: 50, to: 59, cols: [5], label: 'people aged 50 to 59' },
  { from: 60, to: 69, cols: [6], label: 'people aged 60 to 69' },
  { from: 70, to: 122, cols: [7], label: 'people aged 70 and over' },
];

const out = [];
const missing = new Set();
for (const g of SITE_GROUPS) {
  const total = causes.filter((c) => c.level === 1).reduce((s, c) => s + g.cols.reduce((a, i) => a + c.deaths[i], 0), 0);
  const ranked = rankable
    .map((c) => ({ name: c.name, deaths: g.cols.reduce((a, i) => a + c.deaths[i], 0) }))
    .sort((a, b) => b.deaths - a.deaths)
    .slice(0, 3)
    .map((c) => {
      if (!PLAIN[c.name]) missing.add(c.name);
      return { name: c.name, plain: PLAIN[c.name], deaths: Math.round(c.deaths), share: +(c.deaths / total).toFixed(3) };
    });
  out.push({ from: g.from, to: g.to, label: g.label, totalDeaths: Math.round(total), causes: ranked });
}

if (missing.size) throw new Error(`add plain names for: ${[...missing].join('; ')}`);
const meta = { source: 'WHO Global Health Estimates 2021: deaths by cause, age and sex, 2000-2021', year: YEAR, url: PAGE, file: URL };
writeFileSync('data/who/ghe-2019-global-leading-causes.json', JSON.stringify({ ...meta, groups: out }, null, 2) + '\n');
writeFileSync(
  'src/content/death-causes.json',
  JSON.stringify({ year: YEAR, source: { label: `WHO Global Health Estimates, ${YEAR}`, url: PAGE }, groups: out.map(({ from, to, label, causes: cs }) => ({ from, to, label, causes: cs.map((c) => c.plain), shares: cs.map((c) => c.share) })) }, null, 2) + '\n',
);
for (const g of out) console.log(`${g.from}-${g.to}: ${g.causes.map((c) => `${c.name} (${(c.share * 100).toFixed(1)}%)`).join('; ')}`);
