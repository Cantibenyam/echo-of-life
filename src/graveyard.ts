import '@fontsource-variable/newsreader/opsz.css';
import './ui/graveyard.css';

import { LIFE_KEY } from './config';
import { fetchGraves, type Grave } from './graveyard/api';
import { migrate } from './life/record';
import { el } from './ui/dom';

const list = document.getElementById('graves')!;
const count = document.getElementById('count')!;
const more = document.getElementById('more') as HTMLButtonElement;
const status = document.getElementById('status')!;
const yours = document.getElementById('yours')!;

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function ago(ms: number): string {
  const s = (ms - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
  return rtf.format(Math.round(s / (86400 * 365)), 'year');
}

const years = (age: number): string => (age === 0 ? 'less than a year' : age === 1 ? '1 year' : `${age} years`);

function stone(g: Grave): HTMLElement {
  const li = el('li', 'stone');
  const age = el('span', 'stone-age', String(g.age));
  age.setAttribute('aria-hidden', 'true');
  li.append(el('span', 'stone-name', g.name), el('span', 'visually-hidden', `, ${years(g.age)}, `), age, el('span', 'stone-when', ago(g.ended)));
  return li;
}

// If this device's life has ended, say so.
try {
  const r = migrate(JSON.parse(localStorage.getItem(LIFE_KEY) ?? 'null'));
  if (r && r !== 'foreign' && r.ended !== null && r.name) {
    yours.textContent = `Your life: ${r.name}, ${years(r.age)}.`;
    yours.hidden = false;
  }
} catch {
  /* no life on this device */
}

let next: number | null = null;
let loading = false;

async function load(): Promise<void> {
  if (loading) return;
  loading = true;
  more.disabled = true;
  status.textContent = '';
  try {
    const page = await fetchGraves(next ?? undefined);
    count.textContent = page.total === 0 ? '' : page.total === 1 ? 'One life so far.' : `${page.total.toLocaleString()} lives so far.`;
    if (page.total === 0) status.textContent = 'No one has finished a life here yet.';
    for (const g of page.graves) list.append(stone(g));
    next = page.next;
    more.textContent = 'Walk further';
    more.hidden = next === null;
  } catch {
    status.textContent = 'The graveyard can’t be reached right now. Try again in a moment.';
    more.textContent = 'Try again';
    more.hidden = false;
  } finally {
    loading = false;
    more.disabled = false;
  }
}

more.addEventListener('click', () => void load());
void load();
