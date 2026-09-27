import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

/**
 * Names for the graveyard: the one rule set shared by the page (instant feedback) and the server
 * (the authority). Letters from any script, spaces, hyphens, apostrophes and full stops; no digits,
 * no links; nothing unkind.
 */

export const NAME_MAX = 24;

export type NameProblem = 'empty' | 'long' | 'chars' | 'unkind';
export type NameCheck = { readonly ok: true; readonly name: string } | { readonly ok: false; readonly problem: NameProblem };

const ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M} '’.\-]*$/u;

/** Real names that contain an unlucky substring. Matched as whole words. */
const ALLOW_WORDS = new Set([
  'dick', 'dickens', 'dickinson', 'cumming', 'cummings', 'cumhur', 'cockburn', 'hancock', 'peacock', 'babcock', 'hitchcock',
  'shiitake', 'shitsuke', 'shitij', 'shital', 'semen', 'dyke', 'dykes',
]);

/** Hate and a few common obscenities in other languages, matched inside any word. */
const BLOCK_ANYWHERE = [
  'hitler', 'heilhitler', 'siegheil', 'hurensohn', 'vaffanculo', 'putain', 'scheisse', 'scheise', 'wichser', 'arschloch',
  'mierda', 'pendejo', 'cabron', 'hijoputa', 'gilipollas', 'salope', 'connard', 'enculer', 'caralho', 'klootzak', 'kurwa', 'blyat', 'pizdec',
];
/** Short words that are only unkind on their own (so "Nazia" and "Sukanya" are fine). */
const BLOCK_WORDS = new Set(['nazi', 'nazis', 'kkk', 'puta', 'puto', 'coño', 'cono', 'verga', 'merde', 'fotze', 'cazzo', 'stronzo', 'porra', 'foda', 'kut', 'suka', 'pizda']);

let matcher: RegExpMatcher | null = null;
const english = (): RegExpMatcher =>
  (matcher ??= new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers }));

/** Tidies what someone typed: normal Unicode form, single spaces, no edges. */
export function cleanName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');

export function checkName(raw: string): NameCheck {
  const name = cleanName(raw);
  if (!name) return { ok: false, problem: 'empty' };
  if ([...name].length > NAME_MAX) return { ok: false, problem: 'long' };
  if (!ALLOWED.test(name)) return { ok: false, problem: 'chars' };

  const words = fold(name).split(/[\s'’.\-]+/).filter(Boolean);
  const kept = words.filter((w) => !ALLOW_WORDS.has(w));
  // Letters spaced or dotted apart ("f u c k", "S.h.i.t") are read squeezed together as well;
  // ordinary names are not, so "Diana Lee" is never read as one word.
  const spacedOut = words.length >= 3 && words.filter((w) => w.length <= 2).length / words.length >= 0.6;
  const readings = spacedOut ? [...kept, kept.join('')] : kept;
  if (readings.some((w) => BLOCK_WORDS.has(w))) return { ok: false, problem: 'unkind' };
  if (readings.some((w) => BLOCK_ANYWHERE.some((t) => w.includes(t)))) return { ok: false, problem: 'unkind' };
  if (english().hasMatch(kept.join(' ')) || (spacedOut && english().hasMatch(kept.join('')))) return { ok: false, problem: 'unkind' };
  return { ok: true, name };
}
