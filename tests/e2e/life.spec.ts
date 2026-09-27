import { expect, test, type Page } from '@playwright/test';
import { createRecord, type LifeRecord } from '../../src/life/record';

const KEY = process.env.EXPECT_LIFE_KEY || 'echooflife:preview:life';
const BIRTH_LOCK = 5000;
const COOLDOWN = 3200;

// Never touch the real graveyard from tests: answer its requests here and remember what was sent.
const laid: Record<string, unknown>[] = [];
test.beforeEach(async ({ page }) => {
  await page.route('**/graves**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      laid.push(JSON.parse(req.postData() ?? '{}'));
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': '*' } });
    }
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
    }
    const graves = [
      { id: 3, name: 'Ana Maria', age: 67, ended: Date.now() - 3_600_000 },
      { id: 2, name: '<b>Sam</b>', age: 0, ended: Date.now() - 86_400_000 },
    ];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ graves, total: 2, next: null }), headers: { 'access-control-allow-origin': '*' } });
  });
});

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function stored(page: Page): Promise<LifeRecord | null> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, KEY);
}

async function seed(page: Page, record: LifeRecord): Promise<void> {
  await page.addInitScript(
    ([k, r]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(k, r);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [KEY, JSON.stringify(record)] as const,
  );
}

async function begin(page: Page, name = 'Ana'): Promise<void> {
  const button = page.locator('button.begin');
  await expect(button).toBeVisible();
  await page.waitForFunction(() => document.querySelector('.gate')?.classList.contains('revealed'));
  const input = page.locator('.name-input');
  if (await input.count()) await input.fill(name);
  await button.click();
}

const numeral = (page: Page) => page.locator('.life:not(.memorial) .numeral span').last();

test('first paint is black', async ({ page, request }) => {
  const html = await (await request.get('./')).text();
  expect(html).toMatch(/<style>[^<]*background:#000/);
  expect(html).toContain('<meta name="theme-color" content="#000000"');
  await page.goto('./', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement !== null && document.head !== null);
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(bg).toBe('rgb(0, 0, 0)');
});

test('the gate: early presses reveal, never begin; Begin is birth', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect(page.locator('.gate-title')).toHaveText('The Echo of Life');
  // An early tap where the (still invisible) graveyard link sits only brings the lines in sooner.
  const link = (await page.locator('.gate-foot .grave-link').boundingBox())!;
  await page.mouse.click(link.x + link.width / 2, link.y + link.height / 2);
  await page.waitForTimeout(600);
  await expect(page.locator('.graveyard-layer')).toHaveCount(0);
  await page.mouse.click(200, 200);
  expect(await stored(page)).toBeNull();
  await begin(page);
  const rec = await stored(page);
  expect(rec?.v).toBe(1);
  expect(rec?.age).toBe(0);
  expect(rec?.ended).toBeNull();
  await expect(page.locator('#announce')).toContainText('Age 0');
  expect(errors, errors.join(" | ")).toEqual([]);
});

test('a year per press, a cooldown, and no way back', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  const historyBefore = await page.evaluate(() => history.length);
  await begin(page);
  await page.waitForTimeout(BIRTH_LOCK + 200);
  // Two presses in the same instant: the second falls inside the cooldown and is dropped.
  await page.evaluate(() => {
    const press = () => document.querySelector<HTMLButtonElement>('.advance')!.click();
    press();
    press();
  });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await stored(page))?.age).toBe(1);
  await page.waitForTimeout(300);
  expect((await stored(page))?.age).toBe(1);
  await page.waitForTimeout(COOLDOWN);
  await page.mouse.click(120, 120);
  await expect.poll(async () => (await stored(page))?.age).toBe(2);
  await expect(numeral(page)).toHaveText('2');
  expect(await page.evaluate(() => history.length)).toBe(historyBefore);

  await page.reload();
  await expect(page.locator('.gate')).toContainText('You are 2.');
  await begin(page);
  await expect(numeral(page)).toHaveText('2');
  expect(errors, errors.join(" | ")).toEqual([]);
});

test('a tap right beside a link or the mute control never spends a year', async ({ page }) => {
  await page.goto('./');
  await begin(page);
  await page.waitForTimeout(BIRTH_LOCK + 2000);
  const link = await page.locator('.fact-source').boundingBox();
  expect(link).not.toBeNull();
  await page.mouse.click(link!.x - 10, link!.y + link!.height / 2);
  const mute = await page.locator('.mute').boundingBox();
  await page.mouse.click(mute!.x - 10, mute!.y + mute!.height / 2);
  await page.waitForTimeout(300);
  expect((await stored(page))?.age).toBe(0);
});

test('the ending is permanent and silent afterwards', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const record = { ...createRecord('0badcafe-1111-4222-8333-444455556666', Date.now() - 60_000, 1), age: 1 };
  await seed(page, record);
  await page.goto('./');
  await expect(page.locator('.gate')).toContainText('You are 1.');
  await begin(page);
  await page.waitForTimeout(2800);
  await page.mouse.click(150, 150);
  await expect.poll(async () => (await stored(page))?.ended).not.toBeNull();
  await expect(page.locator('.memorial-age')).toHaveText('A life of 1 year.', { timeout: 40_000 });
  await expect(page.locator('.memorial-name')).toHaveText('Ana');
  await expect(page.locator('.memorial-cause')).toContainText('the most common causes of death among children under five');
  await expect.poll(() => laid.find((g) => g.lifeId === record.id)).toMatchObject({ name: 'Ana', age: 1 });

  // Forever after: the memorial, at once, and no audio context is ever created.
  await page.addInitScript(() => {
    (window as unknown as { __contexts: number }).__contexts = 0;
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        (window as unknown as { __contexts: number }).__contexts++;
      }
    } as typeof AudioContext;
  });
  await page.reload();
  await expect(page.locator('.memorial-age')).toHaveText('A life of 1 year.');
  await expect(page.locator('.gate')).toHaveCount(0);
  await page.mouse.click(300, 300);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __contexts: number }).__contexts)).toBe(0);
  expect((await stored(page))?.age).toBe(1);
  expect(errors, errors.join(" | ")).toEqual([]);
});

test('if the recordings fail to load, the life and the music go on', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/audio/*.mp3', (route) => route.fulfill({ status: 404, body: 'gone' }));
  await page.goto('./');
  await begin(page);
  await page.waitForTimeout(BIRTH_LOCK + 200);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await stored(page))?.age).toBe(1);
  await page.waitForTimeout(2000);
  expect(errors.filter((e) => !/404|Failed to load resource/.test(e))).toEqual([]);
});

test('dev overrides do nothing in production', async ({ page }) => {
  await page.goto('./?age=50&lifespan=3&fast');
  await expect(page.locator('.gate-title')).toHaveText('The Echo of Life');
  await begin(page);
  expect((await stored(page))?.age).toBe(0);
});

test('fits a small phone without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('./');
  await begin(page);
  await page.waitForTimeout(4500);
  const m = await page.evaluate(() => {
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const n = box('.numeral');
    const t = box('.timeline');
    const f = box('.fact');
    const mute = box('.mute');
    return {
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
      numeralAboveTimeline: n.bottom <= t.top + 1,
      factBelowTimeline: f.top >= t.bottom - 1,
      factInView: f.bottom <= innerHeight,
      mute: [mute.width, mute.height],
    };
  });
  expect(m.scroll).toBeLessThanOrEqual(m.width);
  expect(m.numeralAboveTimeline).toBe(true);
  expect(m.factBelowTimeline).toBe(true);
  expect(m.factInView).toBe(true);
  expect(m.mute[0]).toBeGreaterThanOrEqual(44);
  expect(m.mute[1]).toBeGreaterThanOrEqual(44);
});

test('reduced motion: dissolves only', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await begin(page);
  const d = await page.evaluate(() => getComputedStyle(document.querySelector('.track')!).transitionDuration);
  expect(d).toBe('0s');
});

test('a life needs a kind name before it begins', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => document.querySelector('.gate')?.classList.contains('revealed'));
  const input = page.locator('.name-input');
  await expect(page.locator('button.begin')).toHaveAttribute('aria-disabled', 'true');
  await input.press('Enter');
  await expect(page.locator('.name-error')).toHaveText('A name, please.');
  expect(await stored(page)).toBeNull();
  await input.fill('f u c k');
  await input.press('Enter');
  await expect(page.locator('.name-error')).toHaveText('Please choose another name.');
  expect(await stored(page)).toBeNull();
  await input.fill('  Zoë   Ann ');
  await input.press('Enter');
  await expect.poll(async () => (await stored(page))?.name).toBe('Zoë Ann');
});

test('the graveyard lists finished lives, safely', async ({ page }) => {
  await page.goto('./graveyard.html');
  await expect(page.locator('.stone')).toHaveCount(2);
  await expect(page.locator('.stone-name').first()).toHaveText('Ana Maria');
  await expect(page.locator('.stone-name').nth(1)).toHaveText('<b>Sam</b>');
  await expect(page.locator('.grave-count')).toHaveText('2 lives so far.');
  await expect(page.locator('.stone b')).toHaveCount(0);
  await expect(page.locator('.grave-return')).toHaveText('Return to The Echo of Life');
});

test('the way down to the graveyard is a descent, and back up again', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.waitForFunction(() => document.querySelector('.gate')?.classList.contains('revealed'));
  await page.locator('.gate-foot .grave-link').click();
  await expect(page.locator('.stone')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.grave-title')).toBeVisible();
  // It never scrolls: the wheel moves nothing.
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => [scrollY, document.querySelector('.grave-screen')!.scrollTop])).toEqual([0, 0]);
  await page.locator('.grave-return').click();
  await expect(page.locator('.graveyard-layer')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.gate-title')).toBeVisible();
  // Looking at the graveyard spends nothing.
  expect(await stored(page)).toBeNull();
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('the memorial fits a small phone, name, causes and all', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const record = { ...createRecord('0badcafe-1111-4222-8333-444455556666', Date.now() - 60_000, 9), age: 9, ended: Date.now(), name: 'Oluwaseun Adeyemi-Okafor' };
  await seed(page, record);
  await page.goto('./');
  await expect(page.locator('.memorial-foot .grave-link')).toBeVisible();
  const m = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.memorial-numeral, .memorial-line, .memorial-text > *, .memorial-foot > *')].map((n) => n.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        if (a.bottom > b.top + 1 && b.bottom > a.top + 1 && a.right > b.left && b.right > a.left) overlaps++;
      }
    return { overlaps, inView: boxes.every((r) => r.top >= 0 && r.bottom <= innerHeight) };
  });
  expect(m).toEqual({ overlaps: 0, inView: true });

  // The way down is there too, once it can be seen, and it comes back to the memorial.
  const link = (await page.locator('.memorial-foot .grave-link').boundingBox())!;
  await page.mouse.click(link.x + link.width / 2, link.y + link.height / 2);
  await page.waitForTimeout(600);
  await expect(page.locator('.graveyard-layer')).toHaveCount(0);
  await expect(page.locator('.memorial-foot.asleep')).toHaveCount(0, { timeout: 10_000 });
  await page.locator('.memorial-foot .grave-link').click();
  await expect(page.locator('.stone')).toHaveCount(2, { timeout: 10_000 });
  await page.locator('.grave-return').click();
  await expect(page.locator('.graveyard-layer')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.memorial-name')).toBeInViewport();
  expect(await page.evaluate(() => document.querySelector('.memorial')!.getAnimations().length)).toBe(0);
});
