// Downloads the field recordings named in audio-sources/manifest.json from Wikimedia Commons,
// checks each license against the allowlist and each file against its sha1, and writes
// audio-sources/sources.lock.json (the record of where every sound came from).
//
// Usage: node scripts/audio/fetch-commons.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'EchoOfLife/1.0 (https://github.com/Cantibenyam/echo-of-life)';
const CACHE = '.cache/audio-src';
const ALLOWED = [/^public domain$/i, /^pd\b/i, /^cc0\b/i, /^cc by(?!-nc|-nd)(-sa)? \d/i, /^cc by(-sa)?$/i];

const manifest = JSON.parse(readFileSync('audio-sources/manifest.json', 'utf8'));
mkdirSync(CACHE, { recursive: true });

const strip = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function info(title) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|sha1|size|mime|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|UsageTerms',
  });
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);
  const page = (await res.json()).query.pages[0];
  if (page.missing) throw new Error(`${title}: not found on Commons`);
  const ii = page.imageinfo[0];
  const m = ii.extmetadata ?? {};
  return {
    title,
    pageUrl: ii.descriptionurl,
    fileUrl: ii.url,
    sha1: ii.sha1,
    size: ii.size,
    mime: ii.mime,
    license: strip(m.LicenseShortName?.value),
    licenseUrl: strip(m.LicenseUrl?.value) || null,
    author: strip(m.Artist?.value) || 'Unknown',
    credit: strip(m.Credit?.value) || null,
  };
}

const lock = { generatedAt: new Date().toISOString(), recordings: [] };
let failed = 0;

for (const entry of manifest.recordings) {
  try {
    let meta;
    let path;
    if (entry.commons) {
      meta = await info(entry.commons);
      if (!ALLOWED.some((re) => re.test(meta.license))) throw new Error(`license "${meta.license}" is not on the allowlist`);
      path = join(CACHE, `${entry.id}${extname(meta.fileUrl) || '.bin'}`);
      const cachedOk = existsSync(path) && createHash('sha1').update(readFileSync(path)).digest('hex') === meta.sha1;
      if (!cachedOk) {
        process.stdout.write(`  downloading ${entry.id} (${(meta.size / 1e6).toFixed(1)} MB)... `);
        const res = await fetch(meta.fileUrl, { headers: { 'User-Agent': UA } });
        if (!res.ok) throw new Error(`download HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const sha1 = createHash('sha1').update(buf).digest('hex');
        if (sha1 !== meta.sha1) throw new Error(`sha1 mismatch (${sha1} != ${meta.sha1})`);
        writeFileSync(path, buf);
        console.log('ok');
      }
    } else if (entry.file) {
      // A local recording: the manifest must say where it came from.
      if (!entry.license || !entry.author) throw new Error('local files need "license" and "author"');
      path = entry.file;
      meta = { title: entry.title ?? entry.file, pageUrl: entry.pageUrl ?? null, license: entry.license, licenseUrl: entry.licenseUrl ?? null, author: entry.author };
    } else {
      throw new Error('no source');
    }
    lock.recordings.push({ id: entry.id, source: path.replace(/\\/g, '/'), ...meta });
    console.log(`${entry.id.padEnd(20)} ${meta.license.padEnd(14)} ${meta.author.slice(0, 50)}`);
  } catch (err) {
    failed++;
    console.error(`${entry.id}: ${err.message}`);
  }
}

writeFileSync('audio-sources/sources.lock.json', JSON.stringify(lock, null, 2) + '\n');
if (failed) {
  console.error(`${failed} recording(s) failed; they will be skipped (the music plays on without them).`);
  process.exitCode = 1;
}
