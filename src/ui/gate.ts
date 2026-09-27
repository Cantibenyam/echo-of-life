import { ms, T } from '../config';
import type { LifeRecord } from '../life/record';
import { NAME_MAX, checkName, type NameProblem } from '../shared/names';
import { el, fade, reducedMotion } from './dom';

export interface GateOptions {
  readonly returning: LifeRecord | null;
  readonly creditsHref: string;
  readonly graveyardHref: string;
  /** Descend into the graveyard from this view (the link's href is the fallback). */
  readonly onGraveyard?: (from: HTMLElement) => void;
  /**
   * Called synchronously inside the Begin/Continue gesture (audio must be unlocked there),
   * with the name given, or null when the life already has one.
   */
  readonly onBegin: (name: string | null) => void;
}

export interface Gate {
  readonly el: HTMLElement;
  leave(): Promise<void>;
}

function youAre(age: number): string {
  if (age === 0) return 'You are not yet a year old.';
  return `You are ${age}.`;
}

const PROBLEM_TEXT: Record<NameProblem, string> = {
  empty: 'A name, please.',
  long: `A shorter name, please (${NAME_MAX} letters at most).`,
  chars: 'Letters, spaces, hyphens and apostrophes only.',
  unkind: 'Please choose another name.',
};

/**
 * The soft greeting. Lines arrive one by one; a press before the end only brings the remaining lines
 * sooner, it never begins the life. A life needs a name (for the graveyard) before it can begin.
 */
export function mountGate(parent: HTMLElement, opts: GateOptions): Gate {
  const root = el('section', 'gate');
  root.setAttribute('aria-label', 'The Echo of Life');

  const needsName = !opts.returning || opts.returning.name === null;
  const lines: HTMLElement[] = [];
  const begin = el('button', 'begin', opts.returning ? 'Continue' : 'Begin');
  begin.type = 'button';
  begin.tabIndex = -1;

  // The name, asked quietly just above Begin.
  const nameBlock = el('div', 'name-block');
  const input = el('input', 'name-input');
  const nameError = el('p', 'name-error');
  nameError.id = 'name-error';
  nameError.setAttribute('aria-live', 'polite');
  if (needsName) {
    input.type = 'text';
    input.placeholder = 'Your name';
    input.maxLength = NAME_MAX + 8;
    input.autocomplete = 'given-name';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Your name');
    input.setAttribute('aria-describedby', 'name-error');
    input.tabIndex = -1;
    nameBlock.append(input, nameError);
  }

  let schedule: readonly number[];
  if (opts.returning) {
    const h = el('h1', 'gate-line', 'Welcome back.');
    const p = el('p', 'gate-line', youAre(opts.returning.age));
    const end = el('div', 'gate-end');
    if (needsName) end.append(nameBlock);
    end.append(begin);
    lines.push(h, p, end);
    schedule = T.returningLines;
  } else {
    const title = el('h1', 'gate-title', 'The Echo of Life');
    const l1 = el('p', 'gate-line', 'Each press is one year. There is no going back.');
    const l2 = el('p', 'gate-line', 'You get one life here, and no one knows how long it lasts.');
    const end = el('div', 'gate-end');
    end.append(el('p', 'gate-note', 'Sound on, if you can.'), nameBlock, begin);
    lines.push(title, l1, l2, end);
    schedule = T.gateLines;
  }
  root.append(...lines);

  const foot = el('div', 'gate-foot');
  const graveyard = el('a', 'grave-link', 'The graveyard');
  graveyard.href = opts.graveyardHref;
  graveyard.addEventListener('click', (e) => {
    if (!opts.onGraveyard || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    opts.onGraveyard(root);
  });
  const credits = el('a', 'quiet-link', 'Sounds and sources');
  credits.href = opts.creditsHref;
  foot.append(graveyard, credits);
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

  // Begin waits for a name the server will accept (the server checks again).
  let touched = false;
  const validate = (): string | null => {
    if (!needsName) return null;
    const result = checkName(input.value);
    begin.classList.toggle('waiting', !result.ok);
    begin.setAttribute('aria-disabled', String(!result.ok));
    nameError.textContent = !result.ok && touched && input.value.trim() !== '' ? PROBLEM_TEXT[result.problem] : '';
    return result.ok ? result.name : null;
  };
  if (needsName) {
    validate();
    input.addEventListener('input', () => validate());
    input.addEventListener('blur', () => {
      touched = true;
      validate();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      touched = true;
      begin.click();
    });
  }

  const markRevealed = () => {
    if (revealed) return;
    revealed = true;
    root.classList.add('revealed');
    begin.tabIndex = 0;
    if (needsName) {
      input.tabIndex = 0;
      setTimeout(() => input.focus({ preventScroll: true }), ms(900));
    }
    fade(foot, 1, ms(1800), ms(600));
  };

  // Keyboard: once everything is shown, Enter or Space begins (Tab also reaches the button).
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (document.activeElement !== document.body && document.activeElement !== null) return;
    if (document.querySelector('.graveyard-layer')) return; // the graveyard is open above the gate
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
    touched = true;
    const name = validate();
    if (needsName && name === null) {
      if (!input.value.trim()) nameError.textContent = PROBLEM_TEXT.empty;
      input.focus({ preventScroll: true });
      return;
    }
    begun = true;
    input.blur();
    opts.onBegin(name);
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
