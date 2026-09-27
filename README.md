# The Echo of Life

One life, lived one year at a time, in sound. There is no going back.

A visitor is greeted into a single black view with a timeline. Each press moves it one year forward and can never be undone. Soft music plays the whole time and changes with the age. It is synthesized live and layered with real recordings of the world around a person at that age. Beneath each age is one fact, from a public source.

Each device gets one life. How long it lasts is drawn once, at birth, from the WHO's global life table. When it ends, the heartbeat slows and stops, the life's own melody sounds one last time, and then there is silence. After that, the device only ever shows a quiet memorial.

**Live:** https://cantibenyam.github.io/echo-of-life/. Test it in a private window, or you spend your own one life.

## Running it

```sh
npm install
npm run dev          # http://localhost:5173/echo-of-life/
npm run verify       # typecheck, unit tests, build, dist checks, e2e (uses your installed Chrome)
```

In development, a few URL flags help you listen to any age without touching a real life. Each one keeps the life in memory only, and none of them exist in production builds:

| Flag | Effect |
|---|---|
| `?age=34` | start (continue) at 34 |
| `?lifespan=40` | end after 40 (default: the cap, 122) |
| `?fast` | everything ten times faster |

The dev console also exposes offline renders:

```js
const r = await __eol.render();
await r.chapterLevels();                 // RMS and peak per chapter
await r.balance();                       // recordings against music, per chapter
await r.deathCheck(70);                  // heartbeat stops, echo, then silence
await r.download({ age: 34, seconds: 30 });  // a WAV to listen to
```

## How it's built

- **The life** (`src/life/`) is a pure reducer: `gate → alive(age) → dying → ended`. It is saved as a small sealed record in localStorage. A guard refuses any write that would move a life backwards. Pre-release builds use the key `echooflife:preview:life`, and releases use `echooflife:life` (set with `VITE_LIFE_KEY`).
- **Mortality** (`scripts/mortality/`) comes from the WHO GHO 2019 global life table, both sexes. It is converted to single years and extended past 85 with a Gompertz curve calibrated to WHO's life expectancy at 85, then capped at 122. Life expectancy at birth works out to 73.1, and about 1 in 35 lives ends in year 0.
- **Sound** (`src/audio/`) uses Tone.js across ten chapters (cradle, wonder, play, becoming, open, building, midstream, harvest, evening, stillness). Each chapter has its own key, tempo, instruments and recordings, and moves a little every year.
  - A heartbeat follows typical resting heart rates.
  - A low-pass "hearing" curve opens in childhood and closes gently with age.
  - A five-note motif, unique to each life, returns in every chapter and once more at the end.
- **Recordings** (`audio-sources/`, `scripts/audio/`) come from Wikimedia Commons. Each is licence-checked and sha1-verified, trimmed to its steadiest stretch, loudness-normalised, and looped without seams.
- **Facts** (`content/facts/`) were researched, verified against the fetched source pages, and picked in `selection.json`.

## The graveyard

Every life begins with a name. When the life ends, the name and the age it reached are sent to the graveyard, which anyone can visit from the gate or the memorial (`graveyard.html`).

- **Backend:** a Neon Function (`backend/graveyard/index.ts`) in the Neon project `echo-of-life`, backed by one table (`backend/graveyard/schema.sql`). It accepts a grave only if its name passes `src/shared/names.ts`, the same rules the page uses. It also limits each IP (hashed) to 12 graves an hour and ignores duplicates.
- **Environments:** graves are kept apart by build: `dev`, `preview` and `release`. Tests never touch the real graveyard.
- **Moderation:** to hide a grave, run `update graves set hidden = true where id = <id>;` in the Neon SQL editor.
- **Redeploying the function:** run `node scripts/backend/build-graveyard.mjs`, then deploy `.cache/graveyard/function.zip` as the `graveyard` function, either with `neon functions deploy graveyard --src backend/graveyard/index.ts` or through the Neon API.

## Changing things

- **Swap a recording:** edit `audio-sources/manifest.json`, giving a Commons file title, or a local file with its licence and author. Then run `npm run audio`, which fetches, processes and rebuilds the credits.
- **Change a fact:** edit `content/facts/selection.json` (pick another candidate, or override the text), then run `npm run facts && npm run credits`.
- **Regenerate the mortality table:** run `npm run mortality`.
- **Wanted sounds:** a real café with no intelligible speech, and a softer city street. Both slots work today, but better recordings would help.

## Deploying

```sh
npm run deploy           # preview: lives are kept under a preview key, so testing never spends a real one
npm run deploy:release   # the real thing: every visitor's one life
```

Each command typechecks, tests, builds, checks `dist/` and publishes it to the `gh-pages` branch, which GitHub Pages serves.

**Deploying automatically with Actions** instead:

1. Give the GitHub CLI the `workflow` scope: `gh auth refresh -h github.com -s workflow`.
2. Move `deploy/github-pages-workflow.yml` to `.github/workflows/deploy.yml`.
3. Switch Pages to "GitHub Actions" in the repository settings.

## Credits

See [CREDITS.md](CREDITS.md) and the site's own "Sounds and sources" page. The code is MIT-licensed. The recordings keep their own licences.
