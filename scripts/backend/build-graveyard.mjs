// Bundles the graveyard function into .cache/graveyard/function.zip (index.mjs inside), ready to deploy
// as a Neon Function (the deploy endpoint takes a zip whose entry is index.mjs).
//
// Usage: node scripts/backend/build-graveyard.mjs
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const OUT = '.cache/graveyard';
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: ['backend/graveyard/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  minify: true,
  legalComments: 'none',
  banner: {
    js: "import{createRequire as ___cr}from'module';import{fileURLToPath as ___f}from'url';import{dirname as ___d}from'path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);",
  },
  outfile: `${OUT}/index.mjs`,
  logLevel: 'warning',
});

// A minimal single-file zip (deflate), so no zip tool is needed.
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function zip(name, data) {
  const file = Buffer.from(name);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(file.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(file.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + file.length, 12);
  end.writeUInt32LE(30 + file.length + packed.length, 16);
  return Buffer.concat([local, file, packed, central, file, end]);
}

const code = readFileSync(`${OUT}/index.mjs`);
const archive = zip('index.mjs', code);
writeFileSync(`${OUT}/function.zip`, archive);
writeFileSync(`${OUT}/function.zip.b64`, archive.toString('base64'));
console.log(`graveyard: index.mjs ${(code.length / 1024).toFixed(0)} KB, zip ${(archive.length / 1024).toFixed(0)} KB`);
