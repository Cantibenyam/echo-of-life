import { DEATH, ms } from '../config';
import { deathCauseLine } from '../content/death-causes';
import type { LifeRecord } from '../life/record';
import { el, fade, formatAgeWords, livedHereLine, reducedMotion } from './dom';
import { lifeLine } from './timeline';
import { Numeral, announce } from './views';

/**
 * What remains. Shown forever on this device once a life has ended, in silence.
 * `fromDeath` plays the slow arrival right after the ending; otherwise it simply fades in.
 */
export function showMemorial(
  parent: HTMLElement,
  record: LifeRecord,
  fromDeath: boolean,
  links: { readonly creditsHref: string; readonly graveyardHref: string },
): HTMLElement {
  const root = el('section', 'life memorial');
  root.setAttribute('aria-label', 'A life, ended');
  const stage = el('div', 'stage');

  const numeral = new Numeral('numeral memorial-numeral');
  numeral.set(record.age, false);

  const line = lifeLine(record.age);

  const text = el('div', 'memorial-text');
  const nameLine = record.name ? el('p', 'memorial-name', record.name) : null;
  const age = el('p', 'memorial-age', formatAgeWords(record.age));
  const when = el('p', 'memorial-when', livedHereLine(record.born, record.ended ?? Date.now()));
  const cause = deathCauseLine(record.age);
  const causeBlock = el('div', 'memorial-cause');
  const causeLink = el('a', 'quiet-link', cause.source.label);
  causeLink.href = cause.source.url;
  causeLink.target = '_blank';
  causeLink.rel = 'noopener noreferrer';
  causeBlock.append(el('p', undefined, cause.text), causeLink);
  if (nameLine) text.append(nameLine);
  text.append(age, when, causeBlock);

  stage.append(numeral.el, line, text);
  const foot = el('div', 'memorial-foot');
  const graveyard = el('a', 'quiet-link', 'The graveyard');
  graveyard.href = links.graveyardHref;
  const credits = el('a', 'quiet-link', 'Sounds and sources');
  credits.href = links.creditsHref;
  foot.append(graveyard, credits);
  root.append(stage, foot);
  [numeral.el, line, age, when, causeBlock, foot, ...(nameLine ? [nameLine] : [])].forEach((n) => (n.style.opacity = '0'));
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
    if (nameLine) fade(nameLine, 1, ms(3000), textAt - ms(1200));
    fade(age, 1, ms(3000), textAt);
    fade(when, 1, ms(3000), textAt + ms(1600));
    fade(causeBlock, 1, ms(3000), textAt + ms(4200));
    fade(foot, 1, ms(2400), textAt + ms(6000));
    setTimeout(() => announce(`This life has ended. ${record.name ? `${record.name}. ` : ''}${formatAgeWords(record.age)}`), textAt);
  } else {
    [numeral.el, line].forEach((n) => fade(n, 1, ms(2200), ms(400)));
    if (nameLine) fade(nameLine, 1, ms(2200), ms(900));
    fade(age, 1, ms(2200), ms(1200));
    fade(when, 1, ms(2200), ms(1800));
    fade(causeBlock, 1, ms(2200), ms(2600));
    fade(foot, 1, ms(2200), ms(3200));
    announce(`This life has ended. ${record.name ? `${record.name}. ` : ''}${formatAgeWords(record.age)}`);
  }
  return root;
}
