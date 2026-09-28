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
  readonly only?: readonly string[];
}

export async function render(plan: RenderPlan): Promise<{ buffer: AudioBuffer; scenesMax: number; beats: readonly number[] }> {
  let scenesMax = 0;
  let beats: readonly number[] = [];
  const out = await Tone.Offline(
    async (context) => {
      const engine = new Engine({ lifeId: plan.lifeId ?? 'render-life-0000', offline: true, recordings: plan.recordings, recordingsOnly: plan.recordingsOnly, only: plan.only });
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

/** RMS (dB) of the buffer within a band, via a band-pass filter in a separate offline context. */
export async function bandDb(buf: AudioBuffer, lo: number, hi: number, from = 0, to = buf.duration): Promise<number> {
  const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = lo;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = hi;
  src.connect(hp).connect(lp).connect(ctx.destination);
  src.start();
  return analyze(await ctx.startRendering(), from, to).rmsDb;
}

/** Which layer puts how much energy where: [layer, lows<250, mids 250-1000, highs>1000]. */
export async function layerBands(age: number): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (const only of [['drone'], ['air'], ['pad'], ['bells'], ['pluck'], ['keys'], ['pulse'], ['glass'], ['heart']]) {
    const { buffer } = await render({ age, seconds: 16, recordings: false, only });
    const all = analyze(buffer, 6, 16).rmsDb;
    if (all < -90) continue;
    rows.push([only[0], +all.toFixed(1), +(await bandDb(buffer, 20, 250, 6, 16)).toFixed(1), +(await bandDb(buffer, 250, 1000, 6, 16)).toFixed(1), +(await bandDb(buffer, 1000, 16000, 6, 16)).toFixed(1)]);
  }
  return rows;
}

/** Note callbacks so far in this page (offline renders included): on time, late, and failed. */
export async function noteStats(): Promise<{ onTime: number; late: number; errors: number }> {
  return { ...(await import('../audio/scene')).noteStats };
}

// ---------- parity: the old Tone synths against the native voices, note for note ----------

type Maker = () => { connect(d: Tone.InputNode): unknown; triggerAttackRelease(f: number, d: number, t: number, v: number): unknown };

/** The instruments exactly as they were before the native voices (Tone's synths), for comparison. */
function toneVoices(): Record<string, Maker> {
  // Loosely typed on purpose: these are the old settings, passed as they were.
  const fm = (o: object) => () => new Tone.PolySynth(Tone.FMSynth, o as never);
  return {
    musicbox: fm({ harmonicity: 3.5, modulationIndex: 5, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.6 }, modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.3 } }),
    marimba: fm({ harmonicity: 4, modulationIndex: 2, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.003, decay: 0.7, sustain: 0, release: 0.7 }, modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 } }),
    synth: fm({ harmonicity: 1, modulationIndex: 1.4, oscillator: { type: 'sine' }, modulation: { type: 'triangle' }, envelope: { attack: 0.03, decay: 1.0, sustain: 0.08, release: 1.4 }, modulationEnvelope: { attack: 0.05, decay: 0.6, sustain: 0.1, release: 0.8 } }),
    epiano: fm({ harmonicity: 1, modulationIndex: 1.2, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.006, decay: 2.2, sustain: 0.12, release: 2.6 }, modulationEnvelope: { attack: 0.004, decay: 0.5, sustain: 0.05, release: 0.6 } }),
    glass: () => new Tone.PolySynth(Tone.Synth, <never>{ oscillator: { type: 'sine' }, envelope: { attack: 0.35, decay: 1.4, sustain: 0.3, release: 4.5 } }),
    pad: () => new Tone.PolySynth(Tone.Synth, <never>{ oscillator: { type: 'fattriangle', count: 3, spread: 18 }, envelope: { attack: 1.2, decay: 1.5, sustain: 0.8, release: 3 } }),
    pluck: () => new Tone.PolySynth(Tone.Synth, <never>{ oscillator: { type: 'triangle' }, envelope: { attack: 0.004, decay: 0.7, sustain: 0, release: 0.6 } }),
    pulse: () => new Tone.MonoSynth(<never>{ oscillator: { type: 'sine' }, envelope: { attack: 0.012, decay: 0.38, sustain: 0, release: 0.25 }, filter: { type: 'lowpass', rolloff: -12, Q: 0.5 }, filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0, release: 0.2, baseFrequency: 110, octaves: 1.6 } }),
    heart: () => new Tone.MembraneSynth(<never>{ pitchDecay: 0.03, octaves: 2, oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.08 } }),
  };
}

async function nativeVoices(): Promise<Record<string, (ctx: Tone.BaseContext) => Maker extends () => infer R ? R : never>> {
  const v = await import('../audio/voices');
  const { Instrument } = await import('../audio/native');
  return {
    musicbox: (c) => v.makeVoice(c, 'musicbox', 10),
    marimba: (c) => v.makeVoice(c, 'marimba', 10),
    synth: (c) => v.makeVoice(c, 'synth', 10),
    epiano: (c) => v.makeVoice(c, 'epiano', 12),
    glass: (c) => v.makeVoice(c, 'glass', 8),
    pad: (c) => v.makePad(c, 1.2, 3),
    pluck: (c) => v.makePluck(c),
    pulse: (c) => v.makePulse(c),
    heart: (c) => new Instrument(c, { kind: 'membrane', pitchDecay: 0.03, octaves: 2, envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.08 } }, 2),
  };
}

/** Per voice: the largest difference (dB) between old and new in 10 ms windows louder than -50 dB, and the overall level difference. */
export async function voiceParity(): Promise<Record<string, unknown>[]> {
  const tone = toneVoices();
  const native = await nativeVoices();
  // [frequency, duration, velocity]: a short note, and a note released during its decay.
  const notes: Record<string, [number, number, number][]> = {
    musicbox: [[784, 0.4, 0.5]], marimba: [[523, 0.4, 0.6]], synth: [[392, 0.6, 0.5]], epiano: [[330, 1.2, 0.4]],
    glass: [[659, 2.5, 0.4]], pad: [[220, 4, 0.5], [277, 1.0, 0.5]], pluck: [[440, 0.3, 0.5]], pulse: [[98, 0.2, 0.6]], heart: [[55, 0.08, 0.9]],
  };
  const rows: Record<string, unknown>[] = [];
  for (const name of Object.keys(tone)) {
    const seconds = name === 'pad' ? 9 : name === 'glass' ? 8 : 4;
    const play = async (build: (ctx: Tone.BaseContext) => ReturnType<Maker>) =>
      (
        await Tone.Offline((ctx) => {
          const inst = build(ctx);
          inst.connect(ctx.destination);
          for (const [f, d, v] of notes[name]!) inst.triggerAttackRelease(f, d, 0.1, v);
        }, seconds, 1, SR)
      ).get()!;
    const a = await play(() => tone[name]!());
    const b = await play((ctx) => native[name]!(ctx));
    const win = Math.floor(0.01 * SR);
    let worst = 0;
    for (let s = 0; s + win <= a.length; s += win) {
      let ea = 0;
      let eb = 0;
      const da = a.getChannelData(0);
      const dbb = b.getChannelData(0);
      for (let i = s; i < s + win; i++) {
        ea += da[i]! * da[i]!;
        eb += dbb[i]! * dbb[i]!;
      }
      const la = 10 * Math.log10(ea / win + 1e-20);
      const lb = 10 * Math.log10(eb / win + 1e-20);
      if (Math.max(la, lb) > -50) worst = Math.max(worst, Math.abs(la - lb));
    }
    const ra = analyze(a).rmsDb;
    const rb = analyze(b).rmsDb;
    rows.push({ voice: name, oldDb: +ra.toFixed(2), newDb: +rb.toFixed(2), levelDiff: +(rb - ra).toFixed(2), worstWindowDiff: +worst.toFixed(2) });
  }
  return rows;
}
