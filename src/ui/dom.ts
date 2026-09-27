export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const coarsePointer = (): boolean => window.matchMedia('(pointer: coarse)').matches;

/** Fades an element's opacity with the Web Animations API and leaves it at the final value. */
export function fade(node: HTMLElement, to: number, duration: number, delay = 0): Animation {
  const from = getComputedStyle(node).opacity;
  const anim = node.animate([{ opacity: from }, { opacity: String(to) }], {
    duration: Math.max(0, duration),
    delay: Math.max(0, delay),
    easing: 'cubic-bezier(.4,0,.2,1)',
    fill: 'forwards',
  });
  anim.addEventListener('finish', () => {
    node.style.opacity = String(to);
    anim.cancel();
  });
  return anim;
}

/** Keeps a node's links out of reach until its fade-in has finished: nothing unseen can be pressed. */
export function wakeAfter(node: HTMLElement, anim: Animation): void {
  node.classList.add('asleep');
  anim.addEventListener('finish', () => node.classList.remove('asleep'));
}

export function formatAgeWords(age: number): string {
  if (age === 0) return 'Less than a year.';
  if (age === 1) return 'A life of 1 year.';
  return `A life of ${age} years.`;
}

/** "9 minutes", "3 hours", "2 days": how long a life took to live here. */
export function formatDuration(msSpan: number): string {
  const minutes = Math.max(0, msSpan) / 60000;
  if (minutes < 1) return 'less than a minute';
  if (minutes < 90) {
    const m = Math.round(minutes);
    return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  }
  const hours = minutes / 60;
  if (hours < 48) {
    const h = Math.round(hours);
    return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  const d = Math.round(hours / 24);
  return `${d} days`;
}

export function livedHereLine(born: number, ended: number): string {
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });
  const sameDay = new Date(born).toDateString() === new Date(ended).toDateString();
  const span = formatDuration(ended - born);
  return sameDay
    ? `Lived here in ${span}, on ${date.format(ended)}.`
    : `Lived here over ${span}, ending ${date.format(ended)}.`;
}
