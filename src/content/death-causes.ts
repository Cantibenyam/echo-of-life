import data from './death-causes.json';

export interface CauseLine {
  readonly text: string;
  readonly source: { readonly label: string; readonly url: string };
}

/** "a, b and c", or with semicolons when an item already contains "and". */
function list(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  const sep = items.some((i) => i.includes(' and ')) ? '; ' : ', ';
  return `${items.slice(0, -1).join(sep)}${sep === '; ' ? '; and ' : ' and '}${items[items.length - 1]}`;
}

/** The leading causes of death worldwide for the age group a life ended in. */
export function deathCauseLine(age: number): CauseLine {
  const group = data.groups.find((g) => age >= g.from && age <= g.to) ?? data.groups[data.groups.length - 1]!;
  return {
    text: `Worldwide in ${data.year}, the most common causes of death among ${group.label} were ${list(group.causes)}.`,
    source: data.source,
  };
}
