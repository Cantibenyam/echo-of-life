import { ms, T } from '../config';
import type { LifeRecord } from '../life/record';
import { el, fade, reducedMotion } from './dom';

export interface GateOptions {
  readonly returning: LifeRecord | null;
  readonly creditsHref: string;
  /** Called synchronously inside the Begin/Continue gesture (audio must be unlocked there). */
  readonly onBegin: () => void;
}

export interface Gate {
  readonly el: HTMLElement;
  leave(): Promise<void>;
}

function youAre(age: number): string {
  if (age === 0) return 'You are not yet a year old.';
  return `You are ${age}.`;
}

/**
 * The soft greeting. Lines arrive one by one; a press before the end only brings the remaining lines
 * sooner, it never begins the life.
 */
export function mountGate(parent: HTMLElement, opts: GateOptions): Gate {
  const root = el('section', 'gate');
  root.setAttribute('aria-label', 'The Echo of Life');

  const lines: HTMLElement[] = [];
  const begin = el('button', 'begin', opts.returning ? 'Continue' : 'Begin');
  begin.type = 'button';
  begin.tabIndex = -1;

  let schedule: readonly number[];
  if (opts.returning) {
    const h = el('h1', 'gate-line', 'Welcome back.');
    const p = el('p', 'gate-line', youAre(opts.returning.age));
    const end = el('div', 'gate-end');
    end.append(begin);
    lines.push(h, p, end);
    schedule = T.returningLines;
  } else {
    const title = el('h1', 'gate-title', 'The Echo of Life');
    const l1 = el('p', 'gate-line', 'Each press is one year. There is no going back.');
    const l2 = el('p', 'gate-line', 'You get one life here, and no one knows how long it lasts.');
    const end = el('div', 'gate-end');
    end.append(el('p', 'gate-note', 'Sound on, if you can.'), begin);
    lines.push(title, l1, l2, end);
    schedule = T.gateLines;
  }
  root.append(...lines);

  const foot = el('div', 'gate-foot');
  const credits = el('a', 'quiet-link', 'Sounds and sources');
  credits.href = opts.creditsHref;
  foot.append(credits);
  root.append(foot);
  parent.append(root);

  const reduce = reducedMotion();
  const timers: number[] = [];
  let shown = 0;
  let revealed = false;

  const showLine = (node: HTMLElement, duration: number) => {
    if (reduce) {
      fade(node, 1, 600);
      return;
    }
    node.animate(
      [
        { opacity: 0, filter: 'blur(4px)' },
        { opacity: 1, filter: 'blur(0px)' },
      ],
      { duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
    ).addEventListener('finish', () => (node.style.opacity = '1'));
  };

  const markRevealed = () => {
    if (revealed) return;
    revealed = true;
    root.classList.add('revealed');
    begin.tabIndex = 0;
    fade(foot, 1, ms(1800), ms(600));
  };

  // Keyboard: once everything is shown, Enter or Space begins (Tab also reaches the button).
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (document.activeElement !== document.body && document.activeElement !== null) return;
    e.preventDefault();
    if (revealed) begin.click();
    else root.dispatchEvent(new PointerEvent('pointerdown'));
  };
  window.addEventListener('keydown', onKey);

  const next = () => {
    const node = lines[shown++];
    if (!node) return;
    showLine(node, ms(1800));
    if (shown === lines.length) markRevealed();
  };

  schedule.forEach((at) => timers.push(window.setTimeout(next, ms(at))));

  // An early press brings the remaining lines sooner.
  root.addEventListener('pointerdown', (e) => {
    if (revealed || e.target === begin) return;
    timers.forEach(clearTimeout);
    let i = 0;
    while (shown < lines.length) {
      const node = lines[shown++]!;
      setTimeout(() => showLine(node, ms(900)), i++ * ms(180));
    }
    markRevealed();
  });

  let begun = false;
  begin.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!revealed || begun) return;
    begun = true;
    opts.onBegin();
  });

  return {
    el: root,
    leave: () =>
      new Promise((resolve) => {
        timers.forEach(clearTimeout);
        window.removeEventListener('keydown', onKey);
        root.style.pointerEvents = 'none';
        const anim = fade(root, 0, ms(T.gateFade));
        anim.addEventListener('finish', () => {
          root.remove();
          resolve();
        });
      }),
  };
}
