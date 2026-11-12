let audioCtx: AudioContext | null = null;
let isMuted = false;
let lastHoverTime = 0;

export function initSound(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      isMuted = localStorage.getItem('bspoker:muted') === 'true';
    }
  } catch {
    // ignore
  }

  const unlock = () => {
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }
}

export function setMuted(muted: boolean): void {
  isMuted = muted;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bspoker:muted', String(muted));
    }
  } catch {
    // ignore
  }
}

export function getMuted(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('bspoker:muted') === 'true';
    }
  } catch {
    // ignore
  }
  return isMuted;
}

function getContext(): AudioContext | null {
  if (isMuted) return null;
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playCardHover(pointerType?: string): void {
  if (pointerType && pointerType !== 'mouse') return;
  const now = Date.now();
  if (now - lastHoverTime < 60) return;
  lastHoverTime = now;

  const ctx = getContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, t);

    gain.gain.setValueAtTime(0.015, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.025);
  } catch {
    // ignore
  }
}

export function playFlipUp(): void {
  const ctx = getContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(750, t + 0.08);

    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.08);
  } catch {
    // ignore
  }
}

export function playFlipDown(): void {
  const ctx = getContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(750, t);
    osc.frequency.exponentialRampToValueAtTime(280, t + 0.08);

    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.08);
  } catch {
    // ignore
  }
}

export function playTurnChime(): void {
  const ctx = getContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, t); // C5
    gain1.gain.setValueAtTime(0.08, t);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.3);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, t + 0.12); // E5
    gain2.gain.setValueAtTime(0.08, t + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.12);
    osc2.stop(t + 0.45);
  } catch {
    // ignore
  }
}

export function playBsThud(): void {
  const ctx = getContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.18);
  } catch {
    // ignore
  }
}

export function getAudioContext(): AudioContext | null {
  return getContext();
}

export function getRawAudioContext(): AudioContext | null {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

