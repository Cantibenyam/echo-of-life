import * as Tone from 'tone';
import { AUDIO } from '../../config';
import { RECORDINGS } from '../recordings.generated';
import type { RecordingInfo } from './types';

const MAX_BUFFERS = 4;

/**
 * Loads and keeps decoded recordings. A failed load is a warning, never an error:
 * the music simply goes on without that recording.
 */
export class RecordingBank {
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly info: Map<string, RecordingInfo>;

  constructor(
    private readonly ctx: Tone.BaseContext,
    enabled = true,
  ) {
    this.info = new Map(enabled ? RECORDINGS.map((r) => [r.id, r]) : []);
  }

  has(id: string): boolean {
    return this.info.has(id);
  }

  meta(id: string): RecordingInfo | undefined {
    return this.info.get(id);
  }

  load(id: string): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(id);
    if (existing) return existing;
    const info = this.info.get(id);
    if (!info) return Promise.resolve(null);
    const p = this.fetchDecode(info).catch((err: unknown) => {
      console.warn(`[echo] recording "${id}" unavailable; continuing without it`, err);
      return null;
    });
    this.buffers.set(id, p);
    return p;
  }

  private async fetchDecode(info: RecordingInfo): Promise<AudioBuffer | null> {
    const ctl = new AbortController();
    const timer = globalThis.setTimeout(() => ctl.abort(), AUDIO.recordingTimeout * 1000);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/${info.file}`, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(data);
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  preload(ids: Iterable<string>): Promise<void> {
    return Promise.all([...ids].map((id) => this.load(id))).then(() => undefined);
  }

  /**
   * Keeps memory bounded: forget buffers not needed by the current or next chapter.
   * (A scene still fading out keeps its own reference until it is disposed.)
   */
  keepOnly(needed: Set<string>): void {
    for (const id of [...this.buffers.keys()]) {
      if (!needed.has(id)) this.buffers.delete(id);
    }
    if (this.buffers.size > MAX_BUFFERS) console.warn(`[echo] ${this.buffers.size} recordings held in memory`);
  }

  get size(): number {
    return this.buffers.size;
  }
}
