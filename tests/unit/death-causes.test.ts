import { describe, expect, it } from 'vitest';
import { deathCauseLine } from '../../src/content/death-causes';
import data from '../../src/content/death-causes.json';

describe('causes of death shown at the end', () => {
  it('has a line for every age a life can end at', () => {
    for (let age = 0; age <= 122; age++) {
      const line = deathCauseLine(age);
      expect(line.text, `age ${age}`).toMatch(/^Worldwide in 2019, the most common causes of death among .+ were .+\.$/);
      expect(line.text.length, `age ${age}`).toBeLessThanOrEqual(220);
      expect(line.source.url).toMatch(/^https:\/\/www\.who\.int\//);
    }
  });

  it('covers ages 0..122 with no gaps, three causes each', () => {
    let next = 0;
    for (const g of data.groups) {
      expect(g.from).toBe(next);
      expect(g.causes).toHaveLength(3);
      next = g.to + 1;
    }
    expect(next).toBe(123);
  });

  it('reads naturally', () => {
    expect(deathCauseLine(67).text).toBe(
      'Worldwide in 2019, the most common causes of death among people aged 60 to 69 were heart disease, stroke and chronic lung disease.',
    );
    expect(deathCauseLine(0).text).toContain('; and ');
  });
});
