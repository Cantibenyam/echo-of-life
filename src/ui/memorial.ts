import { DEATH, ms } from '../config';
import type { LifeRecord } from '../life/record';
import { el, fade, formatAgeWords, livedHereLine, reducedMotion } from './dom';
import { lifeLine } from './timeline';
import { Numeral, announce } from './views';

/**
 * What remains. Shown forever on this device once a life has ended, in silence.
 * `fromDeath` plays the slow arrival right after the ending; otherwise it simply fades in.
 */
export function showMemorial(parent: HTMLElement, record: LifeRecord, fromDeath: boolean, creditsHref: string): HTMLElement {
  const root = el('section', 'life memorial');
  root.setAttribute('aria-label', 'A life, ended');
  const stage = el('div', 'stage');

  const numeral = new Numeral('numeral memorial-numeral');
  numeral.set(record.age, false);

  const line = lifeLine(record.age);

  const text = el('div', 'memorial-text');
  const age = el('p', 'memorial-age', formatAgeWords(record.age));
  const when = el('p', 'memorial-when', livedHereLine(record.born, record.ended ?? Date.now()));
  text.append(age, when);

  stage.append(numeral.el, line, text);
  const foot = el('div', 'memorial-foot');
  const credits = el('a', 'quiet-link', 'Sounds and sources');
  credits.href = creditsHref;
  foot.append(credits);
  root.append(stage, foot);
  [numeral.el, line, age, when, foot].forEach((n) => (n.style.opacity = '0'));
  parent.append(root);

  const reduce = reducedMotion();
  if (fromDeath) {
    const drawFor = ms((DEATH.relayoutFor - 1) * 1000);
    fade(numeral.el, 1, ms(3000), ms(600));
    fade(line, 1, ms(1200));
    if (!reduce) {
      line.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], {
        duration: drawFor,
        easing: 'cubic-bezier(.3,0,.2,1)',
        fill: 'backwards',
      });
    }
    const textAt = ms((DEATH.memorialText - DEATH.relayoutFrom) * 1000);
    fade(age, 1, ms(3000), textAt);
    fade(when, 1, ms(3000), textAt + ms(1600));
    fade(foot, 1, ms(2400), textAt + ms(3200));
    setTimeout(() => announce(`This life has ended. ${formatAgeWords(record.age)}`), textAt);
  } else {
    [numeral.el, line].forEach((n) => fade(n, 1, ms(2200), ms(400)));
    fade(age, 1, ms(2200), ms(1200));
    fade(when, 1, ms(2200), ms(1800));
    fade(foot, 1, ms(2200), ms(2400));
    announce(`This life has ended. ${formatAgeWords(record.age)}`);
  }
  return root;
}
