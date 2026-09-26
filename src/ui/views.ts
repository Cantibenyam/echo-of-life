import { ms, T } from '../config';
import { factFor } from '../content/facts';
import { el, reducedMotion } from './dom';

const EASE = 'cubic-bezier(.4,0,.2,1)';

/** The large age numeral; one number dissolves into the next. */
export class Numeral {
  readonly el: HTMLElement;
  private current: HTMLElement | null = null;

  constructor(className = 'numeral') {
    this.el = el('div', className);
    this.el.setAttribute('aria-hidden', 'true');
  }

  set(age: number, animate: boolean): void {
    const next = el('span', undefined, String(age));
    const old = this.current;
    this.current = next;
    this.el.append(next);
    if (!animate) {
      old?.remove();
      return;
    }
    const reduce = reducedMotion();
    if (old) {
      const out = old.animate(
        reduce
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)' },
              { opacity: 0, filter: 'blur(6px)', transform: 'translateY(-0.08em)' },
            ],
        { duration: ms(reduce ? 600 : T.numeralOut), easing: EASE, fill: 'forwards' },
      );
      out.addEventListener('finish', () => old.remove());
    }
    next.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, filter: 'blur(6px)', transform: 'translateY(0.08em)' },
            { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)' },
          ],
      { duration: ms(reduce ? 600 : T.numeralIn), delay: ms(reduce ? 0 : T.numeralInDelay), easing: EASE, fill: 'backwards' },
    );
  }
}

/** The fact for the current age, with its source. */
export class FactView {
  readonly el: HTMLElement;
  readonly link: HTMLAnchorElement;
  private readonly text: HTMLParagraphElement;
  private token = 0;

  constructor() {
    this.el = el('div', 'fact');
    this.text = el('p', 'fact-text');
    this.link = el('a', 'quiet-link fact-source');
    this.link.target = '_blank';
    this.link.rel = 'noopener noreferrer';
    this.el.append(this.text, this.link);
  }

  private fill(age: number): void {
    const f = factFor(age);
    this.text.textContent = f.text;
    this.link.textContent = f.source.label;
    this.link.href = f.source.url;
    this.link.setAttribute('aria-label', `Source: ${f.source.label} (opens in a new tab)`);
  }

  /** Stops any running animation, keeping the element exactly where it visually is. */
  private settle(p: HTMLElement): number {
    const o = Number(getComputedStyle(p).opacity);
    p.getAnimations().forEach((a) => a.cancel());
    p.style.opacity = String(o);
    p.style.transform = '';
    return o;
  }

  set(age: number, animate: boolean): void {
    const token = ++this.token;
    const parts = [this.text, this.link];
    if (!animate) {
      parts.forEach((p) => this.settle(p));
      this.fill(age);
      return;
    }
    const reduce = reducedMotion();
    let pending = parts.length;
    parts.forEach((p) => {
      const from = this.settle(p);
      const out = p.animate([{ opacity: from }, { opacity: 0 }], { duration: ms(T.factOut), easing: EASE });
      out.addEventListener('finish', () => {
        p.style.opacity = '0';
        if (token !== this.token || --pending > 0) return;
        this.fill(age);
        parts.forEach((q, i) => {
          const inAnim = q.animate(
            reduce
              ? [{ opacity: 0 }, { opacity: 1 }]
              : [
                  { opacity: 0, transform: 'translateY(6px)' },
                  { opacity: 1, transform: 'translateY(0)' },
                ],
            {
              duration: ms(reduce ? 600 : T.factIn),
              delay: ms(Math.max(0, T.factInDelay - T.factOut) + i * 250),
              easing: EASE,
              fill: 'backwards',
            },
          );
          inAnim.addEventListener('finish', () => {
            if (token === this.token) q.style.opacity = '1';
          });
          // The inline 0 sits under the running animation; lift it once the fade has begun.
          inAnim.ready.then(() => {
            if (token === this.token) q.style.opacity = '1';
          });
        });
      });
    });
  }

  fadeAway(duration: number): void {
    this.token++;
    [this.text, this.link].forEach((p) => {
      const from = this.settle(p);
      p.style.opacity = '0';
      p.animate([{ opacity: from }, { opacity: 0 }], { duration, easing: EASE });
    });
    this.link.style.pointerEvents = 'none';
  }
}

/** The small mute control: three thin bars that flatten when the sound is off. */
export class MuteButton {
  readonly el: HTMLButtonElement;

  constructor(muted: boolean, onToggle: () => void) {
    this.el = el('button', 'mute');
    this.el.type = 'button';
    this.el.append(el('span'), el('span'), el('span'));
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggle();
    });
    this.set(muted);
  }

  set(muted: boolean): void {
    this.el.setAttribute('aria-pressed', String(muted));
    this.el.setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound');
    this.el.title = muted ? 'Sound off (M)' : 'Sound on (M)';
  }
}

export function announce(text: string): void {
  const region = document.getElementById('announce');
  if (!region) return;
  region.textContent = '';
  // A fresh text node after a tick makes screen readers read repeated content too.
  setTimeout(() => (region.textContent = text), 60);
}
