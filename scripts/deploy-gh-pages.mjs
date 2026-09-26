// Builds the site, checks it, and publishes dist/ to the gh-pages branch (GitHub Pages "deploy from a branch").
// Used while the GitHub token lacks the `workflow` scope needed for the Actions pipeline in deploy/.
//
// Usage: node scripts/deploy-gh-pages.mjs            (preview: lives use the preview storage key)
//        node scripts/deploy-gh-pages.mjs --release  (the real key: every visitor's one life)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const release = process.argv.includes('--release');
const key = release ? 'echooflife:life' : 'echooflife:preview:life';
const env = { ...process.env, VITE_LIFE_KEY: key, EXPECT_LIFE_KEY: key };
const run = (cmd, cwd = process.cwd()) => execSync(cmd, { stdio: 'inherit', env, cwd });

const status = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim();
if (status) {
  console.error('deploy: commit your changes first (the deploy records the commit it was built from).');
  process.exit(1);
}
const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();

run('npm run typecheck');
run('npm test');
run('npm run build');
run('npm run check-dist');

const out = resolve('.cache/gh-pages');
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('dist', out, { recursive: true });
writeFileSync(resolve(out, '.nojekyll'), '');

run('git init -q -b gh-pages', out);
run('git add -A', out);
run(`git commit -q -m "Deploy ${commit} (${release ? 'release' : 'preview'})"`, out);
run(`git push -f -q ${remote} gh-pages`, out);
console.log(`deploy: published ${commit} as ${release ? 'the release' : 'a preview'} (key ${key}).`);
