// Turns the downloaded recordings into small, even, loopable MP3s in public/audio/ and writes
// src/audio/recordings.generated.ts.
//
// For each recording:
//   1. find its steadiest stretch (no sudden bursts, no silence) of the wanted length
//   2. two-pass loudness normalisation to -24 LUFS (true peak -3 dB), 50 Hz high-pass, 15 kHz low-pass
//   3. MP3 (libmp3lame VBR), metadata stripped
//   4. clocks: find the ticks and place the loop points in the quiet between them
//
// Usage: node scripts/audio/process.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ffmpegPath from 'ffmpeg-static';

const OUT = 'public/audio';
const DEFAULT_LENGTH = 40;
const manifest = JSON.parse(readFileSync('audio-sources/manifest.json', 'utf8'));
const lock = JSON.parse(readFileSync('audio-sources/sources.lock.json', 'utf8'));
mkdirSync(OUT, { recursive: true });

function ff(args, { binary = false } = {}) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-nostdin', ...args], { maxBuffer: 1 << 30, encoding: binary ? 'buffer' : 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-800)}`);
  return r;
}

function probe(path) {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-i', path], { encoding: 'utf8' });
  const err = r.stderr;
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(err);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : NaN;
  const channels = /Audio:.*?(mono|stereo|(\d+) channels)/.exec(err);
  const n = !channels ? 2 : channels[1] === 'mono' ? 1 : channels[1] === 'stereo' ? 2 : Number(channels[2]);
  return { duration, channels: n };
}

function pcm(path, { from = 0, to, rate = 8000 } = {}) {
  const args = ['-v', 'error', '-ss', String(from)];
  if (to !== undefined) args.push('-to', String(to));
  args.push('-i', path, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-');
  const buf = ff(args, { binary: true }).stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

const dbOf = (sumSq, n) => 10 * Math.log10(sumSq / Math.max(1, n) + 1e-12);

/** The start (s) of the steadiest window of `length` seconds inside [from, to]. */
function steadiest(path, from, to, length) {
  const rate = 8000;
  const x = pcm(path, { from, to, rate });
  const secs = Math.floor(x.length / rate);
  const rms = [];
  for (let s = 0; s < secs; s++) {
    let e = 0;
    for (let i = s * rate; i < (s + 1) * rate; i++) e += x[i] * x[i];
    rms.push(dbOf(e, rate));
  }
  if (secs <= length) return { start: from, score: 0 };
  let best = { start: from, score: Infinity };
  for (let s = 0; s + length <= secs; s++) {
    const w = rms.slice(s, s + length);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length);
    const sorted = [...w].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const burst = Math.max(0, sorted[sorted.length - 1] - median - 6);
    const quiet = mean < -55 ? 10 : 0;
    const score = sd + 0.6 * burst + quiet;
    if (score < best.score) best = { start: from + s, score };
  }
  return best;
}

function loudnormFilter(extra = '') {
  return `highpass=f=50,lowpass=f=15000,loudnorm=I=-24:TP=-3:LRA=15${extra}`;
}

/** Finds tick onsets and returns loop points halfway between ticks, spanning an even number of ticks. */
function tickLoop(path) {
  const rate = 44100;
  const x = pcm(path, { rate });
  const frame = Math.floor(0.005 * rate);
  const e = [];
  for (let i = 0; i + frame <= x.length; i += frame) {
    let s = 0;
    for (let j = i; j < i + frame; j++) s += x[j] * x[j];
    e.push(dbOf(s, frame));
  }
  const sorted = [...e].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.5)];
  const high = sorted[Math.floor(sorted.length * 0.995)];
  const threshold = floor + 0.55 * (high - floor);
  const onsets = [];
  for (let f = 1; f < e.length; f++) {
    const t = (f * frame) / rate;
    if (e[f] >= threshold && e[f - 1] < threshold && (onsets.length === 0 || t - onsets[onsets.length - 1] > 0.25)) onsets.push(t);
  }
  if (onsets.length < 6) throw new Error(`only ${onsets.length} ticks found`);
  const mid = (i) => (onsets[i] + onsets[i + 1]) / 2;
  const first = 1;
  let last = onsets.length - 2;
  if ((last - first) % 2 !== 0) last--;
  const intervals = onsets.slice(1).map((t, i) => t - onsets[i]);
  const period = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
  return { loopStart: +mid(first).toFixed(4), loopEnd: +mid(last).toFixed(4), ticks: last - first, period: +period.toFixed(3) };
}

const generated = [];
const lockById = new Map(lock.recordings.map((r) => [r.id, r]));

for (const entry of manifest.recordings) {
  const src = lockById.get(entry.id);
  if (!src) {
    console.warn(`${entry.id}: not in sources.lock.json (fetch failed?) - skipped`);
    continue;
  }
  const { duration, channels } = probe(src.source);
  const within = entry.within ?? [2, duration - 2];
  const from = Math.max(0, within[0]);
  const to = Math.min(duration, within[1]);
  const length = Math.min(entry.length ?? DEFAULT_LENGTH, Math.floor(to - from));
  const { start } = steadiest(src.source, from, to, length);

  // Pass 1: measure.
  const measure = ff(['-ss', String(start), '-t', String(length), '-i', src.source, '-af', loudnormFilter(':print_format=json'), '-f', 'null', '-']);
  const json = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/s.exec(measure.stderr)[0]);
  const measured = `:measured_I=${json.input_i}:measured_TP=${json.input_tp}:measured_LRA=${json.input_lra}:measured_thresh=${json.input_thresh}:offset=${json.target_offset}:linear=true`;

  // Pass 2: apply and encode.
  const file = `${entry.id}.mp3`;
  const edge = entry.loop === 'pulse' ? 0.02 : 0.25;
  const af = `${loudnormFilter(measured)},afade=t=in:d=${edge},afade=t=out:st=${(length - edge).toFixed(3)}:d=${edge},aresample=44100`;
  ff(['-y', '-v', 'error', '-ss', String(start), '-t', String(length), '-i', src.source, '-af', af, '-ac', String(Math.min(2, channels)), '-c:a', 'libmp3lame', '-q:a', '4', '-map_metadata', '-1', `${OUT}/${file}`]);

  const out = probe(`${OUT}/${file}`);
  const rec = { id: entry.id, file, duration: +out.duration.toFixed(3), loop: entry.loop };
  if (entry.loop === 'pulse') Object.assign(rec, tickLoop(`${OUT}/${file}`));
  generated.push(rec);
  src.processed = { start, length, channels: Math.min(2, channels), inputLUFS: Number(json.input_i) };
  const size = readFileSync(`${OUT}/${file}`).length;
  console.log(`${entry.id.padEnd(20)} ${String(start).padStart(4)}s +${length}s  ${channels}ch  in ${json.input_i} LUFS  -> ${(size / 1024).toFixed(0)} KB${rec.loopStart !== undefined ? `  loop ${rec.loopStart}-${rec.loopEnd} (${rec.ticks} ticks)` : ''}`);
}

// One second of silence, played through an <audio> element to let iOS play Web Audio with the silent switch on.
ff(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '1', '-c:a', 'libmp3lame', '-q:a', '9', `${OUT}/silence.mp3`]);

const ts = `// GENERATED by scripts/audio/process.mjs. Do not edit.
import type { RecordingInfo } from './recordings/types';

export const RECORDINGS: readonly RecordingInfo[] = ${JSON.stringify(
  generated.map(({ id, file, duration, loop, loopStart, loopEnd }) => ({ id, file, duration, loop, ...(loopStart !== undefined ? { loopStart, loopEnd } : {}) })),
  null,
  2,
)};
`;
writeFileSync('src/audio/recordings.generated.ts', ts);
writeFileSync('audio-sources/sources.lock.json', JSON.stringify(lock, null, 2) + '\n');
console.log(`${generated.length} recordings processed.`);
