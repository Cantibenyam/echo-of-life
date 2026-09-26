// Merges the researched candidates (content/facts/part-*.json) with the editor's picks
// (content/facts/selection.json) into:
//   src/content/facts.json      what the site shows: age, text, source, kind
//   content/facts/selected.json the same plus evidence and age arithmetic, for audit
//
// Usage: node scripts/content/merge-facts.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const MAX_AGE = 122;
const DIR = 'content/facts';
const selection = JSON.parse(readFileSync(`${DIR}/selection.json`, 'utf8')).picks;

const candidates = new Map();
for (const f of readdirSync(DIR).filter((n) => /^part-\d+-\d+\.json$/.test(n))) {
  for (const entry of JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))) candidates.set(entry.age, entry.candidates);
}

const problems = [];
const selected = [];
for (let age = 0; age <= MAX_AGE; age++) {
  const cands = candidates.get(age);
  const pick = selection[String(age)];
  if (!cands) {
    problems.push(`age ${age}: no candidates`);
    continue;
  }
  if (pick === undefined) {
    problems.push(`age ${age}: no pick`);
    continue;
  }
  const choice = typeof pick === 'number' ? { pick } : pick;
  const c = cands[choice.pick];
  if (!c) {
    problems.push(`age ${age}: candidate ${choice.pick} missing`);
    continue;
  }
  const text = (choice.text ?? c.text).trim();
  if (text.length < 40 || text.length > 180) problems.push(`age ${age}: text length ${text.length}`);
  if (!/^https:\/\//.test(c.source.url)) problems.push(`age ${age}: source is not https`);
  selected.push({ age, text, source: { label: c.source.label, url: c.source.url }, kind: c.kind, evidence: c.evidence, check: c.check });
}

if (problems.length) {
  console.error('merge-facts:\n  ' + problems.join('\n  '));
  process.exit(1);
}

writeFileSync(`${DIR}/selected.json`, JSON.stringify(selected, null, 2) + '\n');
writeFileSync('src/content/facts.json', JSON.stringify(selected.map(({ age, text, source, kind }) => ({ age, text, source, kind })), null, 2) + '\n');
const kinds = selected.reduce((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {});
console.log(`merge-facts: ${selected.length} facts`, kinds);
