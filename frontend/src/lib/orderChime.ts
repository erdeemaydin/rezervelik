// Audible "new order" chime for the order-station board, generated on the fly
// via the Web Audio API — no binary asset (checked frontend/public/: only
// file.svg/globe.svg/next.svg/vercel.svg/window.svg exist, nothing audio) and
// no new npm dependency. A two-tone rising ping, cheap and unmistakable over
// a kitchen's ambient noise.
//
// Browsers block audio until a user gesture happens on the page (autoplay
// policy) — createAudioContext() below is meant to be called once from a
// document-level click/touchstart listener so the very first real chime
// after that isn't silently swallowed. It's safe to call repeatedly; only the
// first call actually constructs anything.

let ctx: AudioContext | null = null;

export function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function playOrderChime(): void {
  const audioCtx = ensureAudioContext();
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    [880, 1108].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  } catch (err) {
    console.error('[order-station] chime playback failed:', err);
  }
}
