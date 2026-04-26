const SFX_KEY = "labmind:sfx";

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
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}
