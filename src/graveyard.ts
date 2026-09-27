import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import './ui/styles.css';

import { LIFE_KEY } from './config';
import { migrate } from './life/record';
import { openGraveyard } from './ui/graveyard-view';

// The graveyard on its own page (a shared link): the same view, without the descent.
let yours: string | null = null;
try {
  const r = migrate(JSON.parse(localStorage.getItem(LIFE_KEY) ?? 'null'));
  if (r && r !== 'foreign' && r.ended !== null && r.name) {
    yours = `Your life: ${r.name}, ${r.age === 0 ? 'less than a year' : r.age === 1 ? '1 year' : `${r.age} years`}.`;
  }
} catch {
  /* no life on this device */
}
openGraveyard({ parent: document.getElementById('app')!, returnHref: import.meta.env.BASE_URL, yours });
