import { MAX_AGE } from '../life/mortality';
import { el, reducedMotion } from './dom';

/** Future years are always drawn this far ahead, whatever the lifespan, so the line never gives the ending away. */
const AHEAD = 45;
const TOTAL = MAX_AGE + AHEAD + 1;

const pastOpacity = (distance: number): number => Math.max(0.12, 1 - 0.03 * distance);
const futureOpacity = (distance: number): number => (distance > 12 ? 0 : 0.3 * (1 - (distance - 1) / 12));

export class Timeline {
  readonly el: HTMLElement;
  readonly present: HTMLElement;
  private readonly track: HTMLElement;
  private readonly ticks: HTMLElement[] = [];
  private age = 0;

  constructor() {
    this.el = el('div', 'timeline');
    this.el.setAttribute('aria-hidden', 'true');
    this.track = el('div', 'track');
    this.track.append(el('div', 'past-line'));
    for (let i = 0; i < TOTAL; i++) {
      const tick = el('div', i % 10 === 0 ? 'tick decade' : 'tick');
      tick.style.setProperty('--i', String(i));
      tick.append(el('span', 'mark'), el('span', 'dot'));
      if (i % 10 === 0 && i > 0) tick.append(el('span', 'label', String(i)));
      this.ticks.push(tick);
      this.track.append(tick);
    }
    this.present = el('div', 'present');
    this.el.append(this.track, this.present);
  }

  set(age: number, animate: boolean): void {
    this.age = age;
    if (!animate) this.el.classList.add('instant');
    this.el.style.setProperty('--age', String(age));
    this.el.style.setProperty('--past', String(age));
    this.ticks.forEach((tick, i) => {
      tick.classList.toggle('next', i === age + 1);
      if (i < age) {
        tick.style.setProperty('--o', String(pastOpacity(age - i)));
        tick.style.setProperty('--f', '0');
        tick.style.setProperty('--lo', '1');
      } else if (i === age) {
        tick.style.setProperty('--o', '0');
        tick.style.setProperty('--f', '0');
        tick.style.setProperty('--lo', '0');
      } else {
        tick.style.setProperty('--o', '0');
        tick.style.setProperty('--f', String(futureOpacity(i - age)));
        tick.style.setProperty('--lo', '0');
      }
    });
    if (!animate) {
      void this.el.offsetWidth;
      requestAnimationFrame(() => this.el.classList.remove('instant'));
    }
  }

  setReady(ready: boolean): void {
    this.el.classList.toggle('ready', ready);
  }

  /** One heartbeat on the present point. */
  beat(): void {
    if (reducedMotion()) return;
    this.present.animate(
      [
        { transform: 'scale(1)', boxShadow: '0 0 14px rgba(255,255,255,.22)' },
        { transform: 'scale(1.35)', boxShadow: '0 0 20px rgba(255,255,255,.34)', offset: 0.28 },
        { transform: 'scale(1)', boxShadow: '0 0 14px rgba(255,255,255,.22)' },
      ],
      { duration: 420, easing: 'ease-out' },
    );
  }

  /** The year that does not come: the track begins to move, then stops a third of the way. */
  stopShort(): void {
    this.setReady(false);
    this.el.classList.add('stopping');
    this.el.style.setProperty('--age', String(this.age + 0.3));
  }

  /** The future dissolves (the dots' transition is lengthened by the class). */
  fadeFuture(): void {
    this.el.classList.add('fading-future');
    this.ticks.forEach((tick, i) => {
      if (i > this.age) tick.style.setProperty('--f', '0');
    });
  }

  ring(): void {
    this.present.classList.add('ring');
  }
}

/** The whole life on one line, for the memorial. */
export function lifeLine(age: number): HTMLElement {
  const wrap = el('div', 'memorial-line');
  wrap.setAttribute('aria-hidden', 'true');
  const span = Math.max(age, 1);
  const gap = Math.min(22, (0.8 * Math.min(window.innerWidth, 1400)) / span);
  const width = age * gap;
  wrap.style.width = `${width}px`;
  const line = el('div', 'life-line');
  line.style.width = `${width}px`;
  wrap.append(line);
  for (let i = 0; i < age; i++) {
    const t = el('span', i % 10 === 0 ? 'm-tick decade' : 'm-tick');
    t.style.left = `${i * gap}px`;
    if (gap < 4 && i % 10 !== 0) continue;
    wrap.append(t);
  }
  const ring = el('span', 'end-ring');
  ring.style.left = `${width}px`;
  wrap.append(ring);
  return wrap;
}
