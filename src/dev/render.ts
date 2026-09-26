// Development-only: offline renders of the score, for level checks and for listening.
import * as Tone from 'tone';
import { CHAPTERS } from '../audio/chapters';
import { Engine } from '../audio/engine';

const SR = 44100;

export interface Levels {
  readonly rmsDb: number;
  readonly peakDb: number;
  readonly nan: boolean;
}

export function analyze(buf: AudioBuffer, from = 0, to = buf.duration): Levels {
  const a = Math.floor(from * buf.sampleRate);
  const b = Math.min(buf.length, Math.floor(to * buf.sampleRate));
  let sum = 0;
  let n = 0;
  let peak = 0;
  let nan = false;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = a; i < b; i++) {
      const v = d[i]!;
      if (!Number.isFinite(v)) {
        nan = true;
        continue;
      }
      sum += v * v;
      n++;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
  }
  return { rmsDb: 10 * Math.log10(sum / Math.max(1, n) + 1e-20), peakDb: 20 * Math.log10(peak + 1e-20), nan };
}

/** Largest sample-to-sample jump where the signal is quiet (a click would show up here). */
export function quietJump(buf: AudioBuffer, from = 0, to = buf.duration): number {
  const win = Math.floor(0.01 * buf.sampleRate);
  let worst = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let s = Math.floor(from * buf.sampleRate); s + win < Math.min(buf.length, to * buf.sampleRate); s += win) {
      let e = 0;
      for (let i = s; i < s + win; i++) e += d[i]! * d[i]!;
      if (10 * Math.log10(e / win + 1e-20) > -40) continue;
      for (let i = s + 1; i < s + win; i++) worst = Math.max(worst, Math.abs(d[i]! - d[i - 1]!));
    }
  }
  return worst;
}

/** Times (s) of low-frequency onsets: heartbeats. */
export function lowOnsets(buf: AudioBuffer, from = 0, to = buf.duration): number[] {
  const d = buf.getChannelData(0);
  const k = 1 - Math.exp((-2 * Math.PI * 90) / buf.sampleRate);
  let y1 = 0;
  let y2 = 0;
  const frame = Math.floor(0.02 * buf.sampleRate);
  const energies: number[] = [];
  let acc = 0;
  for (let i = 0; i < buf.length; i++) {
    y1 += k * (d[i]! - y1);
    y2 += k * (y1 - y2);
    acc += y2 * y2;
    if ((i + 1) % frame === 0) {
      energies.push(acc / frame);
      acc = 0;
    }
  }
  const onsets: number[] = [];
  for (let f = 5; f < energies.length; f++) {
    const t = (f * frame) / buf.sampleRate;
    if (t < from || t > to) continue;
    const before = (energies[f - 5]! + energies[f - 4]! + energies[f - 3]!) / 3 + 1e-12;
    const db = 10 * Math.log10(energies[f]! + 1e-20);
    if (db > -70 && energies[f]! > before * 4 && (onsets.length === 0 || t - onsets[onsets.length - 1]! > 0.2)) onsets.push(t);
  }
  return onsets;
}

export interface RenderPlan {
  readonly age: number;
  readonly seconds: number;
  readonly steps?: readonly (readonly [number, number])[];
  readonly dieAt?: number;
  readonly lifeId?: string;
  readonly recordings?: boolean;
  readonly recordingsOnly?: boolean;
}

export async function render(plan: RenderPlan): Promise<{ buffer: AudioBuffer; scenesMax: number; beats: readonly number[] }> {
  let scenesMax = 0;
  let beats: readonly number[] = [];
  const out = await Tone.Offline(
    async (context) => {
      const engine = new Engine({ lifeId: plan.lifeId ?? 'render-life-0000', offline: true, recordings: plan.recordings, recordingsOnly: plan.recordingsOnly });
      await engine.init(plan.age);
      engine.begin(plan.age, false, 0);
      for (const [t, a] of plan.steps ?? []) engine.ctx.setTimeout(() => engine.setAge(a), t);
      if (plan.dieAt !== undefined) engine.ctx.setTimeout(() => engine.die(), plan.dieAt);
      const probe = () => {
        scenesMax = Math.max(scenesMax, engine.stats().scenes);
        beats = [...engine.beatTimes()];
        context.setTimeout(probe, 0.25);
      };
      probe();
    },
    plan.seconds,
    2,
    SR,
  );
  return { buffer: out.get()!, scenesMax, beats };
}

export async function chapterLevels(): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (const c of CHAPTERS) {
    for (const age of [c.from, Math.round((c.from + c.to) / 2), c.to]) {
      const { buffer } = await render({ age, seconds: 20 });
      const l = analyze(buffer, 6, 20);
      rows.push({ chapter: c.id, age, rms: +l.rmsDb.toFixed(1), peak: +l.peakDb.toFixed(1), nan: l.nan });
    }
  }
  return rows;
}

/** How loud the recordings sit against the music, per chapter (dB; negative = under the music). */
export async function balance(): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (const c of CHAPTERS) {
    const age = Math.round((c.from + c.to) / 2);
    const music = analyze((await render({ age, seconds: 20, recordings: false })).buffer, 8, 20).rmsDb;
    const rec = analyze((await render({ age, seconds: 20, recordingsOnly: true })).buffer, 8, 20).rmsDb;
    rows.push({ chapter: c.id, age, music: +music.toFixed(1), recordings: +rec.toFixed(1), recordingsVsMusic: +(rec - music).toFixed(1) });
  }
  return rows;
}

export async function clickCheck(): Promise<Record<string, unknown>> {
  // Presses mid-ramp, a chapter change (6 -> 7), and a press mid-crossfade.
  const { buffer, scenesMax } = await render({ age: 5, seconds: 16, steps: [[4, 6], [6, 6], [9, 7], [10.5, 8]] });
  return { quietJump: quietJump(buffer, 2, 16), scenesMax, ...analyze(buffer, 6, 16) };
}

export async function deathCheck(age = 70): Promise<Record<string, unknown>> {
  const dieAt = 3;
  const { buffer, beats } = await render({ age, seconds: dieAt + 32, dieAt });
  const rel = beats.map((t) => +(t - dieAt).toFixed(2));
  return {
    beatsAfterDeath: rel.filter((t) => t > 0),
    lastBeat: rel[rel.length - 1],
    tailDb: +analyze(buffer, dieAt + 26, dieAt + 32).rmsDb.toFixed(1),
    echoDb: +analyze(buffer, dieAt + 15, dieAt + 20).rmsDb.toFixed(1),
  };
}

function wav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length * ch * 2;
  const view = new DataView(new ArrayBuffer(44 + len));
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, len, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c]![i]!));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

/** Renders and downloads a WAV of one age (or a death) for listening. */
export async function download(plan: RenderPlan, name = `echo-age-${plan.age}.wav`): Promise<void> {
  const { buffer } = await render(plan);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(wav(buffer));
  a.download = name;
  a.click();
}

export async function wavBase64(plan: RenderPlan): Promise<string> {
  const { buffer } = await render(plan);
  const bytes = new Uint8Array(await wav(buffer).arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
