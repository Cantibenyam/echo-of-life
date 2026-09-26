import data from './facts.json';

export type FactKind = 'body' | 'mind' | 'people' | 'world' | 'numbers';

export interface Fact {
  readonly age: number;
  readonly text: string;
  readonly source: { readonly label: string; readonly url: string };
  readonly kind: FactKind;
}

const FACTS = data as readonly Fact[];

export function factFor(age: number): Fact {
  return FACTS[Math.min(Math.max(0, Math.round(age)), FACTS.length - 1)]!;
}

export const allFacts = (): readonly Fact[] => FACTS;
