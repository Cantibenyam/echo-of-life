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
// Second-round research: facts about the age itself (content/facts/BRIEF-2.md).
const redo = new Map();
for (const f of readdirSync(DIR).filter((n) => /^redo-out-[A-Z]\.json$/.test(n))) {
  for (const entry of JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))) redo.set(entry.age, entry.candidates);
}

/** Typographer's quotes: apostrophes and quotation marks curl the right way. */
function smarten(s) {
  return s
    .replace(/(\w)'(\w)/g, '$1’$2')
    .replace(/(^|[\s(\[“])'/g, '$1‘')
    .replace(/'/g, '’')
    .replace(/(^|[\s(\[])"/g, '$1“')
    .replace(/"/g, '”');
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
  const c = choice.redo !== undefined ? redo.get(age)?.[choice.redo] : cands[choice.pick];
  if (!c) {
    problems.push(`age ${age}: candidate ${choice.redo ?? choice.pick} missing`);
    continue;
  }
  const text = smarten((choice.text ?? c.text).trim());
  if (text.length < 40 || text.length > 180) problems.push(`age ${age}: text length ${text.length}`);
  if (!/^https:\/\//.test(choice.sourceUrl ?? c.source.url)) problems.push(`age ${age}: source is not https`);
  const source = { label: choice.sourceLabel ?? c.source.label, url: choice.sourceUrl ?? c.source.url };
  selected.push({ age, text, source, kind: choice.kind ?? c.kind, evidence: c.evidence, check: c.check });
}

if (problems.length) {
  console.error('merge-facts:\n  ' + problems.join('\n  '));
  process.exit(1);
}

writeFileSync(`${DIR}/selected.json`, JSON.stringify(selected, null, 2) + '\n');
writeFileSync('src/content/facts.json', JSON.stringify(selected.map(({ age, text, source, kind }) => ({ age, text, source, kind })), null, 2) + '\n');
const kinds = selected.reduce((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {});
console.log(`merge-facts: ${selected.length} facts`, kinds);
