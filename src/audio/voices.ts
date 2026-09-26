import * as Tone from 'tone';
import type { VoiceName } from './chapters';

/**
 * The instruments. Every voice is soft by design: slow or gentle attacks, sine-based tones,
 * nothing brighter than it needs to be (the hearing filter on the bus shapes the rest).
 */

export type Poly = Tone.PolySynth<Tone.FMSynth> | Tone.PolySynth<Tone.Synth>;

export function makeVoice(name: VoiceName, polyphony = 6): Poly {
  let poly: Poly;
  switch (name) {
    case 'musicbox':
      poly = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.5,
        modulationIndex: 5,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.6 },
        modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.3 },
      });
      break;
    case 'marimba':
      poly = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 4,
        modulationIndex: 2,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.003, decay: 0.7, sustain: 0, release: 0.7 },
        modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
      });
      break;
    case 'synth':
      poly = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1,
        modulationIndex: 1.4,
        oscillator: { type: 'sine' },
        modulation: { type: 'triangle' },
        envelope: { attack: 0.03, decay: 1.0, sustain: 0.08, release: 1.4 },
        modulationEnvelope: { attack: 0.05, decay: 0.6, sustain: 0.1, release: 0.8 },
      });
      break;
    case 'epiano':
      poly = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1,
        modulationIndex: 1.2,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.006, decay: 2.2, sustain: 0.12, release: 2.6 },
        modulationEnvelope: { attack: 0.004, decay: 0.5, sustain: 0.05, release: 0.6 },
      });
      break;
    case 'glass':
      poly = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.35, decay: 1.4, sustain: 0.3, release: 4.5 },
      });
      break;
  }
  poly.maxPolyphony = polyphony;
  return poly;
}

export function makePad(attack: number, release: number): Tone.PolySynth<Tone.Synth> {
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fattriangle', count: 3, spread: 18 },
    envelope: { attack, decay: 1.5, sustain: 0.8, release },
  });
  pad.maxPolyphony = 14;
  return pad;
}

export function makePluck(): Tone.PluckSynth {
  return new Tone.PluckSynth({ attackNoise: 0.5, dampening: 2600, resonance: 0.9, release: 1 });
}

export function makePulse(): Tone.MonoSynth {
  return new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.012, decay: 0.38, sustain: 0, release: 0.25 },
    filter: { type: 'lowpass', rolloff: -12, Q: 0.5 },
    filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0, release: 0.2, baseFrequency: 110, octaves: 1.6 },
  });
}
