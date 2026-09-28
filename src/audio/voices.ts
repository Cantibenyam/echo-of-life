import type * as Tone from 'tone';
import type { VoiceName } from './chapters';
import { Instrument, type InstrumentSpec } from './native';

/**
 * The instruments. Every voice is soft by design: slow or gentle attacks, sine-based tones,
 * nothing brighter than it needs to be (the hearing filter on the bus shapes the rest).
 * They are the same instruments as before (Tone's FMSynth, Synth and MonoSynth settings, unchanged),
 * played by the lighter native voices in native.ts.
 */

export type Poly = Instrument;

const VOICES: Record<VoiceName, InstrumentSpec> = {
  musicbox: {
    kind: 'fm',
    harmonicity: 3.5,
    modulationIndex: 5,
    shape: 'sine',
    modulation: 'sine',
    envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.6 },
    modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.3 },
  },
  marimba: {
    kind: 'fm',
    harmonicity: 4,
    modulationIndex: 2,
    shape: 'sine',
    modulation: 'sine',
    envelope: { attack: 0.003, decay: 0.7, sustain: 0, release: 0.7 },
    modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
  },
  synth: {
    kind: 'fm',
    harmonicity: 1,
    modulationIndex: 1.4,
    shape: 'sine',
    modulation: 'triangle',
    envelope: { attack: 0.03, decay: 1.0, sustain: 0.08, release: 1.4 },
    modulationEnvelope: { attack: 0.05, decay: 0.6, sustain: 0.1, release: 0.8 },
  },
  epiano: {
    kind: 'fm',
    harmonicity: 1,
    modulationIndex: 1.2,
    shape: 'sine',
    modulation: 'sine',
    envelope: { attack: 0.006, decay: 2.2, sustain: 0.12, release: 2.6 },
    modulationEnvelope: { attack: 0.004, decay: 0.5, sustain: 0.05, release: 0.6 },
  },
  glass: {
    kind: 'tone',
    shape: 'sine',
    envelope: { attack: 0.35, decay: 1.4, sustain: 0.3, release: 4.5 },
  },
};

export function makeVoice(ctx: Tone.BaseContext, name: VoiceName, polyphony = 6): Poly {
  return new Instrument(ctx, VOICES[name], polyphony);
}

export function makePad(ctx: Tone.BaseContext, attack: number, release: number): Instrument {
  return new Instrument(
    ctx,
    { kind: 'tone', shape: 'triangle', fat: { count: 3, spread: 18 }, envelope: { attack, decay: 1.5, sustain: 0.8, release } },
    14,
  );
}

/** A soft plucked tone (a kalimba or a harp heard from the next room). */
export function makePluck(ctx: Tone.BaseContext): Instrument {
  return new Instrument(ctx, { kind: 'tone', shape: 'triangle', envelope: { attack: 0.004, decay: 0.7, sustain: 0, release: 0.6 } }, 8);
}

/** A soft low pulse (Tone's MonoSynth: a sine through a low-pass that opens with each note). */
export function makePulse(ctx: Tone.BaseContext): Instrument {
  return new Instrument(
    ctx,
    {
      kind: 'filtered',
      shape: 'sine',
      envelope: { attack: 0.012, decay: 0.38, sustain: 0, release: 0.25 },
      filterQ: 0.5,
      filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0, release: 0.2, baseFrequency: 110, octaves: 1.6 },
    },
    2,
  );
}
