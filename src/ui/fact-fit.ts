import { allFacts } from '../content/facts';
import { el } from './dom';

/**
 * Makes room below the timeline for the tallest fact at this screen's width and text size, so no
 * fact ever runs off the screen or under the controls, and the timeline stays in one place from
 * year to year. On a tall screen nothing changes (the line stays in the middle); on a short one
 * the line rises just enough. If even that isn't enough (a phone on its side), the fact text is
 * set a little smaller.
 */

/** Clear of the mute button (10px from the bottom, 44px tall) and the idle hint (26px up, one line). */
function bottomReserve(safeBottom: number): number {
  return Math.max(Math.max(10, safeBottom) + 44 - safeBottom, 26 + 26) + 8;
}

const MIN_SCALE = 0.7;
const TIMELINE = 48;

/** Heights of every fact block at the stage's current width, in one layout pass. */
function tallestFact(stage: HTMLElement): number {
  const probes = allFacts().map((f) => {
    const probe = el('div', 'fact fact-probe');
    probe.setAttribute('aria-hidden', 'true');
    const link = el('span', 'quiet-link fact-source', f.source.label);
    probe.append(el('p', 'fact-text', f.text), link);
    return probe;
  });
  stage.append(...probes);
  const tallest = Math.max(...probes.map((p) => p.offsetHeight));
  probes.forEach((p) => p.remove());
  return tallest;
}

export function fitFacts(stage: HTMLElement, fact: HTMLElement, numeral: HTMLElement): void {
  const cs = getComputedStyle(stage);
  const inner = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const nm = getComputedStyle(numeral);
  const numeralRoom = numeral.offsetHeight + parseFloat(nm.marginBottom) + 8;
  const marginTop = parseFloat(getComputedStyle(fact).marginTop);
  const reserve = bottomReserve(parseFloat(cs.paddingBottom));

  let scale = 1;
  let room = 0;
  for (;;) {
    stage.style.setProperty('--fact-scale', String(scale));
    room = Math.ceil(marginTop + tallestFact(stage) + reserve);
    if (inner - TIMELINE - room >= numeralRoom || scale <= MIN_SCALE) break;
    scale = Math.max(MIN_SCALE, +(scale - 0.05).toFixed(2));
  }
  stage.style.setProperty('--fact-room', `${room}px`);
}
