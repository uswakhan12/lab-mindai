const SFX_KEY = "labmind:sfx";

/** Peak gain for the click (linear 0–1). Previously ~0.05 was inaudible on many systems. */
const SFX_PEAK_GAIN = 0.32;

export type SfxMode = "on" | "off";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

export function getStoredSfx(): SfxMode {
  if (typeof window === "undefined") return "on";
  return window.localStorage.getItem(SFX_KEY) === "off" ? "off" : "on";
}

export function setStoredSfx(mode: SfxMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SFX_KEY, mode);
}

export function playButtonSfx(): void {
  if (getStoredSfx() === "off") return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(720, now);
  osc.frequency.exponentialRampToValueAtTime(960, now + 0.055);

  const peak = SFX_PEAK_GAIN;
  const attackEnd = now + 0.014;
  const releaseEnd = now + 0.14;
  /* Start above zero to avoid unstable exponential ramp from true zero. */
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(peak, attackEnd);
  gain.gain.exponentialRampToValueAtTime(0.001, releaseEnd);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(releaseEnd + 0.02);
}
