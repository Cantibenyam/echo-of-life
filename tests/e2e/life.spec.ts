import { expect, test, type Page } from '@playwright/test';
import { createRecord, type LifeRecord } from '../../src/life/record';

const KEY = process.env.EXPECT_LIFE_KEY || 'echooflife:preview:life';
const BIRTH_LOCK = 5000;
const COOLDOWN = 3200;

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

async function begin(page: Page): Promise<void> {
  const button = page.locator('button.begin');
  await expect(button).toBeVisible();
  await page.waitForFunction(() => document.querySelector('.gate')?.classList.contains('revealed'));
  await button.click();
}

const numeral = (page: Page) => page.locator('.life:not(.memorial) .numeral span').last();

test('first paint is black', async ({ page, request }) => {
  const html = await (await request.get('./')).text();
  expect(html).toMatch(/<style>[^<]*background:#000/);
  expect(html).toContain('<meta name="theme-color" content="#000000"');
  await page.goto('./', { waitUntil: 'commit' });
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(bg).toBe('rgb(0, 0, 0)');
});

test('the gate: early presses reveal, never begin; Begin is birth', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect(page.locator('.gate-title')).toHaveText('The Echo of Life');
  await page.mouse.click(200, 200);
  expect(await stored(page)).toBeNull();
  await begin(page);
  const rec = await stored(page);
  expect(rec?.v).toBe(1);
  expect(rec?.age).toBe(0);
  expect(rec?.ended).toBeNull();
  await expect(page.locator('#announce')).toContainText('Age 0');
  expect(errors).toEqual([]);
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
  expect(errors).toEqual([]);
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
  expect(errors).toEqual([]);
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
