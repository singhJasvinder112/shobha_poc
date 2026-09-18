/**
 * Plays the audio the Gemini Live API streams back.
 *
 * The model sends raw, headerless PCM — 24 kHz, 16-bit, signed, mono — in
 * base64 chunks. `decodeAudioData` cannot read that (it expects a container
 * like WAV or MP3), so each chunk is converted by hand and scheduled onto a
 * moving playhead. Scheduling back-to-back rather than playing each chunk on
 * arrival is what keeps speech continuous instead of stuttering.
 */

const INPUT_SAMPLE_RATE = 24000;

export class LiveAudioPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  /** Absolute context time the next chunk should start at. */
  private playhead = 0;
  private sources = new Set<AudioBufferSourceNode>();

  /**
   * Must be called from a user gesture (the Start button): browsers refuse to
   * start an AudioContext otherwise, which is the usual cause of silent audio.
   */
  async start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    // Ask for the model's own rate so no resampling is needed in the common
    // case; the browser may still pick its own, which is handled below.
    this.ctx = new Ctor({ sampleRate: INPUT_SAMPLE_RATE });
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.playhead = this.ctx.currentTime;
  }

  /** Queue one base64 PCM chunk from a serverContent part. */
  enqueue(base64: string) {
    const ctx = this.ctx;
    const gain = this.gain;
    if (!ctx || !gain) return;

    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) return;

    // Int16 -> Float32 in [-1, 1). 32768 (not 32767) matches the encoder, so
    // full-scale samples do not clip.
    const frames = pcm.length;
    const float = new Float32Array(frames);
    for (let i = 0; i < frames; i++) float[i] = pcm[i] / 32768;

    const buffer = ctx.createBuffer(1, frames, INPUT_SAMPLE_RATE);
    buffer.copyToChannel(float, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // If the browser refused our requested rate, play it back faster/slower so
    // the voice keeps its natural pitch instead of sounding chipmunked.
    source.playbackRate.value = INPUT_SAMPLE_RATE / ctx.sampleRate;
    source.connect(gain);

    // Never schedule in the past: after a pause the playhead has fallen behind
    // and every chunk would fire at once.
    const startAt = Math.max(this.playhead, ctx.currentTime + 0.02);
    source.start(startAt);
    this.playhead = startAt + buffer.duration * (ctx.sampleRate / INPUT_SAMPLE_RATE);

    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  /** Cut playback immediately — used when the model reports an interruption. */
  stopCurrent() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    if (this.ctx) this.playhead = this.ctx.currentTime;
  }

  async dispose() {
    this.stopCurrent();
    this.gain?.disconnect();
    this.gain = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        // context may already be closed
      }
    }
  }
}

function base64ToInt16(base64: string): Int16Array {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return new Int16Array(0);
  }
  const bytes = binary.length;
  // Two bytes per sample; drop a trailing odd byte rather than misaligning.
  const samples = bytes >> 1;
  const out = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    // Little-endian, sign-extended.
    const v = (hi << 8) | lo;
    out[i] = v >= 0x8000 ? v - 0x10000 : v;
  }
  return out;
}
