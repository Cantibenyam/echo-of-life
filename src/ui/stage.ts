import { DEATH, ms, T } from '../config';
import type { LifeRecord } from '../life/record';
import { coarsePointer, el, fade } from './dom';
import { fitFacts } from './fact-fit';
import { Timeline } from './timeline';
import { FactView, Numeral } from './views';

/**
 * The single view of a life: the age, the timeline, the fact. The whole viewport is one
 * transparent button underneath, so the press target is everywhere except the few links.
 */
export class Stage {
  readonly root: HTMLElement;
  readonly advance: HTMLButtonElement;
  readonly fact: FactView;
  private readonly numeral = new Numeral();
  private readonly timeline = new Timeline();
  private readonly hint: HTMLElement;
  private hintTimer = 0;
  private hintShown = false;
  private readonly stageEl: HTMLElement;
  private fitTimer = 0;
  private readonly onResize = () => {
    window.clearTimeout(this.fitTimer);
    this.fitTimer = window.setTimeout(() => this.fit(), 150);
  };

  constructor(parent: HTMLElement, onPress: (e: MouseEvent) => void) {
    this.root = el('section', 'life');
    this.root.setAttribute('aria-label', 'A life');
    this.advance = el('button', 'advance');
    this.advance.type = 'button';
    this.advance.setAttribute('aria-label', 'Live one more year');
    this.advance.addEventListener('click', onPress);

    const stage = el('div', 'stage');
    this.stageEl = stage;
    this.fact = new FactView();
    stage.append(this.numeral.el, this.timeline.el, this.fact.el);
    this.hint = el('p', 'hint');
    this.hint.setAttribute('aria-hidden', 'true');
    this.root.append(this.advance, stage, this.hint);
    [this.numeral.el, this.timeline.el, this.fact.el].forEach((n) => (n.style.opacity = '0'));
    parent.append(this.root);
    this.fit();
    void document.fonts?.ready.then(() => this.fit());
    window.addEventListener('resize', this.onResize);
  }

  /** Room for the tallest fact on this screen (see fact-fit). */
  private fit(): void {
    if (this.root.isConnected) fitFacts(this.stageEl, this.fact.el, this.numeral.el);
  }

  /** Interactive elements that must never be near-missed into spending a year. */
  interactive(): HTMLElement[] {
    return [this.fact.link];
  }

  enter(record: LifeRecord, mode: 'birth' | 'resume'): void {
    const age = record.age;
    this.numeral.set(age, false);
    this.timeline.set(age, false);
    this.fact.set(age, false);
    const birth = mode === 'birth';
    const at = birth ? T.birthTimelineAt : 1000;
    fade(this.numeral.el, 1, ms(2500), ms(at));
    fade(this.timeline.el, 1, ms(2500), ms(at));
    fade(this.fact.el, 1, ms(1800), ms(birth ? T.birthFactAt : 2000));
    setTimeout(() => this.advance.focus({ preventScroll: true }), ms(at));
    this.armHint(age, ms(birth ? T.birthLock : T.resumeLock) + ms(T.idleHint));
  }

  advanceTo(age: number): void {
    this.hideHint();
    this.timeline.setReady(false);
    this.numeral.set(age, true);
    this.timeline.set(age, true);
    this.fact.set(age, true);
    this.armHint(age, ms(T.cooldown) + ms(T.idleHint));
  }

  jumpTo(age: number): void {
    this.hideHint();
    this.numeral.set(age, true);
    this.timeline.set(age, false);
    this.fact.set(age, true);
  }

  setReady(ready: boolean): void {
    this.timeline.setReady(ready);
  }

  beat(): void {
    this.timeline.beat();
  }

  showMessage(text: string | null): void {
    window.clearTimeout(this.hintTimer);
    if (text === null) {
      this.hideHint();
      return;
    }
    this.hint.textContent = text;
    this.hintShown = true;
    fade(this.hint, 1, ms(1600));
  }

  /** Only at the very start of a life, and only after a quiet while, say how to go on. */
  private armHint(age: number, after: number): void {
    window.clearTimeout(this.hintTimer);
    if (age > 1) return;
    this.hintTimer = window.setTimeout(() => {
      this.showMessage(coarsePointer() ? 'Touch anywhere to live a year.' : 'Press space, or click, to live a year.');
    }, after);
  }

  private hideHint(): void {
    window.clearTimeout(this.hintTimer);
    if (!this.hintShown) return;
    this.hintShown = false;
    fade(this.hint, 0, ms(700));
  }

  /** The visual ending, up to the moment the whole life is laid out (the memorial takes over). */
  die(): void {
    this.hideHint();
    this.root.classList.add('still');
    this.advance.disabled = true;
    this.timeline.stopShort();
    setTimeout(() => this.fact.fadeAway(ms(2400)), ms(DEATH.factFade * 1000));
    setTimeout(() => this.timeline.fadeFuture(), ms(1500));
    setTimeout(() => this.timeline.ring(), ms(DEATH.dotRing * 1000));
  }

  leave(duration: number): Promise<void> {
    window.removeEventListener('resize', this.onResize);
    window.clearTimeout(this.fitTimer);
    return new Promise((resolve) => {
      this.root.style.pointerEvents = 'none';
      const anim = fade(this.root, 0, duration);
      anim.addEventListener('finish', () => {
        this.root.remove();
        resolve();
      });
    });
  }
}
