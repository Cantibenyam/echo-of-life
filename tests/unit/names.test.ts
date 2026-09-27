import { describe, expect, it } from 'vitest';
import { checkName, cleanName } from '../../src/shared/names';

const ok = (n: string) => checkName(n).ok;
const problem = (n: string) => {
  const r = checkName(n);
  return r.ok ? null : r.problem;
};

describe('names', () => {
  it('accepts ordinary names from many languages', () => {
    for (const n of ['Ana', 'Jean-Luc', "O'Brien", 'Zoë', 'Łukasz', 'Nguyễn Văn An', '李小龍', 'Сергей', 'محمد', 'Sukanya', 'Bassam', 'Titus', 'Dick', 'Anne M. Cumming'])
      expect(ok(n), n).toBe(true);
  });

  it('tidies spacing', () => {
    expect(cleanName('  Ana   Maria  ')).toBe('Ana Maria');
    expect(checkName('  Ana   Maria ')).toEqual({ ok: true, name: 'Ana Maria' });
  });

  it('refuses empty, long, and odd names', () => {
    expect(problem('   ')).toBe('empty');
    expect(problem('A'.repeat(25))).toBe('long');
    expect(problem('ana123')).toBe('chars');
    expect(problem('www.example.com/x')).toBe('chars');
    expect(problem('<script>')).toBe('chars');
    expect(problem('-Ana')).toBe('chars');
  });

  it('refuses unkind names, however they are spelled', () => {
    expect(ok('Sh1t')).toBe(false); // digits are refused outright
    for (const n of ['fuck', 'f u c k', 'S.h.i.t', 'FuCkEr', 'Hitler', 'Adolf Hitler', 'kkk', 'puta', 'Hurensohn', 'cunt face', 'nigger'])
      expect(problem(n), n).toBe('unkind');
  });
});
