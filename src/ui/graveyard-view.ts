import { fetchGraves, type Grave } from '../graveyard/api';
import { el, reducedMotion } from './dom';

/**
 * The graveyard, reached by descending: the current view slides up and away and the graveyard rises
 * from below. It never scrolls; "Walk further" descends another screen, "Return" rises back.
 * Each screen's names arrive one by one, the way the gate's lines do.
 */

const SLIDE_MS = 2200;
const EASE = 'cubic-bezier(.65,0,.35,1)';

export interface GraveyardOptions {
  readonly parent: HTMLElement;
  /** The view we descend from (gate or memorial). Absent on the standalone page. */
  readonly from?: HTMLElement;
  /** Where "Return" goes on the standalone page. */
  readonly returnHref?: string;
  /** "Your life: Ana, 67 years." when this device's life has ended. */
  readonly yours?: string | null;
  readonly onClosed?: () => void;
}

const years = (age: number): string => (age === 0 ? 'less than a year' : age === 1 ? '1 year' : `${age} years`);

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

function stone(g: Grave): HTMLElement {
  const li = el('li', 'stone');
  const age = el('span', 'stone-age', String(g.age));
  age.setAttribute('aria-hidden', 'true');
  li.append(el('span', 'stone-name', g.name), el('span', 'visually-hidden', `, ${years(g.age)}, `), age, el('span', 'stone-when', ago(g.ended)));
  return li;
}

/** Brings elements in one after another: a fade from blur to sharp. */
function reveal(nodes: readonly HTMLElement[], start: number, step: number, duration = 1400): void {
  const reduce = reducedMotion();
  nodes.forEach((n, i) => {
    n.style.opacity = '0';
    const anim = n.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, filter: 'blur(4px)' },
            { opacity: 1, filter: 'blur(0px)' },
          ],
      { duration: reduce ? 600 : duration, delay: start + i * step, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards' },
    );
    anim.ready.then(() => (n.style.opacity = '1')).catch(() => {});
  });
}

/** Slides one full-screen element out upward (or downward) while another comes in. */
function slide(out: HTMLElement | null, inn: HTMLElement | null, direction: 'down' | 'up'): Promise<void> {
  const reduce = reducedMotion();
  const sign = direction === 'down' ? 1 : -1;
  const anims: Animation[] = [];
  const opts: KeyframeAnimationOptions = { duration: reduce ? 700 : SLIDE_MS, easing: EASE, fill: 'forwards' };
  if (out) {
    anims.push(
      out.animate(
        reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'translateY(0)' }, { transform: `translateY(${-100 * sign}dvh)` }],
        opts,
      ),
    );
  }
  if (inn) {
    anims.push(
      inn.animate(
        reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: `translateY(${100 * sign}dvh)` }, { transform: 'translateY(0)' }],
        opts,
      ),
    );
  }
  return Promise.all(anims.map((a) => a.finished)).then(() => undefined);
}

export class GraveyardView {
  private readonly root: HTMLElement;
  private screens: HTMLElement[] = [];
  private graves: Grave[] = [];
  private shown = 0;
  private next: number | null = null;
  private total = 0;
  private busy = false;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') void this.close();
  };

  constructor(private readonly opts: GraveyardOptions) {
    this.root = el('div', 'graveyard-layer');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'The graveyard');
    opts.parent.append(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  /** Descend into the graveyard. */
  async open(): Promise<void> {
    this.busy = true;
    const first = this.makeScreen(true);
    const load = this.fetchMore();
    if (this.opts.from) {
      this.opts.from.style.pointerEvents = 'none';
      await slide(this.opts.from, first.el, 'down');
    }
    await load;
    this.fill(first);
    first.el.querySelector<HTMLElement>('.grave-return')?.focus({ preventScroll: true });
    this.busy = false;
  }

  private async fetchMore(): Promise<boolean> {
    try {
      const page = await fetchGraves(this.next ?? undefined);
      this.graves.push(...page.graves);
      this.next = page.next;
      this.total = page.total;
      return true;
    } catch {
      return false;
    }
  }

  private makeScreen(first: boolean): { el: HTMLElement; header: HTMLElement[]; grid: HTMLOListElement; foot: HTMLElement; status: HTMLElement } {
    const screen = el('section', 'grave-screen');
    const back = el('a', 'quiet-link grave-return', this.opts.from ? 'Return' : 'Return to The Echo of Life');
    back.href = this.opts.returnHref ?? './';
    back.addEventListener('click', (e) => {
      if (!this.opts.from) return;
      e.preventDefault();
      void this.close();
    });
    const header: HTMLElement[] = [back];
    const top = el('header', 'grave-head');
    top.append(back);
    if (first) {
      const h = el('h1', 'grave-title', 'The graveyard');
      const lede = el('p', 'grave-lede', 'Everyone who has lived a life here, and for how long.');
      const count = el('p', 'grave-count');
      top.append(h, lede, count);
      header.push(h, lede, count);
      if (this.opts.yours) {
        const yours = el('p', 'grave-yours', this.opts.yours);
        top.append(yours);
        header.push(yours);
      }
    }
    const grid = el('ol', 'graves');
    const status = el('p', 'grave-status');
    status.setAttribute('aria-live', 'polite');
    const foot = el('div', 'grave-foot');
    screen.append(top, grid, status, foot);
    header.forEach((n) => (n.style.opacity = '0'));
    this.root.append(screen);
    this.screens.push(screen);
    return { el: screen, header, grid, foot, status };
  }

  /** How many stones fit on one screen without scrolling. */
  private capacity(grid: HTMLElement): number {
    const rect = grid.getBoundingClientRect();
    const narrow = window.innerWidth <= 480;
    const colW = narrow ? 150 : 176;
    const rowH = narrow ? 104 : 118;
    const cols = Math.max(2, Math.floor((rect.width + 24) / colW));
    const rows = Math.max(1, Math.floor((rect.height + 20) / rowH));
    grid.style.setProperty('--cols', String(cols));
    return cols * rows;
  }

  private fill(screen: ReturnType<GraveyardView['makeScreen']>): void {
    const isFirst = this.screens.length === 1;
    const count = screen.header.find((n) => n.classList.contains('grave-count'));
    if (count) {
      count.textContent =
        this.total === 0 ? '' : this.total === 1 ? 'One life so far.' : `${this.total.toLocaleString()} lives so far.`;
    }
    reveal(screen.header, 150, 420, 1600);

    const room = this.capacity(screen.grid);
    const batch = this.graves.slice(this.shown, this.shown + room);
    this.shown += batch.length;
    const stones = batch.map(stone);
    screen.grid.append(...stones);
    const headerTime = isFirst ? 150 + screen.header.length * 420 : 400;
    reveal(stones, headerTime, 110, 1300);
    const doneAt = headerTime + stones.length * 110 + 900;

    if (this.graves.length === 0) {
      screen.status.textContent = this.total === 0 && this.next === null ? 'No one has finished a life here yet.' : 'The graveyard can’t be reached right now. Try again in a moment.';
      reveal([screen.status], headerTime, 0, 1400);
      return;
    }
    const more = this.shown < this.graves.length || this.next !== null;
    if (more) {
      const further = el('button', 'grave-further', 'Walk further');
      further.type = 'button';
      further.addEventListener('click', () => void this.further());
      screen.foot.append(further);
      reveal([further], doneAt, 0, 1400);
    }
  }

  private async further(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (this.shown >= this.graves.length && this.next !== null) await this.fetchMore();
    const current = this.screens[this.screens.length - 1]!;
    const screen = this.makeScreen(false);
    await slide(current, screen.el, 'down');
    current.style.visibility = 'hidden';
    this.fill(screen);
    this.busy = false;
  }

  /** Rise back up to where we came from. */
  async close(): Promise<void> {
    if (this.busy || !this.opts.from) return;
    this.busy = true;
    window.removeEventListener('keydown', this.onKey);
    const current = this.screens[this.screens.length - 1]!;
    const from = this.opts.from;
    await slide(current, from, 'up');
    from.getAnimations().forEach((a) => a.cancel());
    from.style.pointerEvents = '';
    this.root.remove();
    this.opts.onClosed?.();
  }
}

export function openGraveyard(opts: GraveyardOptions): GraveyardView {
  const view = new GraveyardView(opts);
  void view.open();
  return view;
}
