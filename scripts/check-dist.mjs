// Post-build assertions for dist/. Fails the build (exit 1) if any check fails.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const BASE = '/echo-of-life/';
const DEV_MARKERS = ['__EOL_DEV__', 'echooflife:dev:life'];
const LIFE_KEYS = ['echooflife:life', 'echooflife:preview:life'];

const failures = [];
const fail = (msg) => failures.push(msg);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('check-dist: dist/index.html is missing — run the build first.');
  process.exit(1);
}

const pages = ['index.html', 'credits.html'].filter((p) => existsSync(join(DIST, p)));

for (const page of pages) {
  const html = readFileSync(join(DIST, page), 'utf8');

  // 1. First paint is black: the inline background precedes any stylesheet.
  const inlineAt = html.search(/<style>[^<]*background:#000/);
  const firstSheetAt = html.search(/<link[^>]+rel="stylesheet"/);
  if (inlineAt < 0) fail(`${page} has no inline black background style.`);
  if (firstSheetAt >= 0 && inlineAt > firstSheetAt) fail(`${page}: inline black background comes after the first stylesheet.`);

  // 2. Every root-relative asset reference carries the Pages base path.
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]*)"/g)) {
    if (!m[1].startsWith(BASE)) fail(`${page} references ${m[1]} without the ${BASE} base path.`);
  }
}

// 3. Dev-only code is absent, and exactly the expected life key is present.
const textFiles = walk(DIST).filter((p) => /\.(js|html|css)$/.test(p));
const bundle = textFiles.map((p) => readFileSync(p, 'utf8')).join('\n');
for (const marker of DEV_MARKERS) {
  if (bundle.includes(marker)) fail(`dev marker "${marker}" found in dist/.`);
}

if (existsSync('src/config.ts')) {
  const expected = process.env.EXPECT_LIFE_KEY || 'echooflife:preview:life';
  if (!bundle.includes(expected)) fail(`expected life key "${expected}" not found in the bundle.`);
  for (const key of LIFE_KEYS) {
    if (key !== expected && bundle.includes(`"${key}"`)) fail(`unexpected life key "${key}" found in the bundle.`);
  }
}

if (failures.length) {
  console.error('check-dist failed:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log(`check-dist: ok (${textFiles.length} text files checked)`);
