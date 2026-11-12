import { getAudioContext, getMuted, getRawAudioContext } from './sound';

const SHUFFLE_FILE = 'shuffle.mp3';

const DEAL_FILES = [
  'deal-1.mp3',
  'deal-2.mp3',
  'deal-3.mp3',
  'deal-4.mp3',
  'deal-5.mp3',
  'deal-6.mp3',
  'deal-7.mp3',
  'deal-8.mp3',
];

const PLACE_FILES = [
  'place-1.mp3',
  'place-2.mp3',
  'place-3.mp3',
  'place-4.mp3',
];

const ALL_SOUND_FILES = [SHUFFLE_FILE, ...DEAL_FILES, ...PLACE_FILES];

const soundBufferCache = new Map<string, AudioBuffer>();
let preloadStarted = false;
let lastDealFile: string | null = null;

interface ActiveDealVoice {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  stopVoice: () => void;
}

const activeDealVoices: ActiveDealVoice[] = [];

function decodeAudioDataSafe(ctx: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const handleSuccess = (decoded: AudioBuffer) => {
      if (!settled) {
        settled = true;
        resolve(decoded);
      }
    };
    const handleError = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    try {
      const promise = ctx.decodeAudioData(buffer, handleSuccess, handleError);
      if (promise && typeof promise.then === 'function') {
        promise.then(handleSuccess, handleError);
      }
    } catch (err) {
      handleError(err);
    }
  });
}

/**
 * Preloads and decodes card audio samples into memory cache.
 * Automatically triggered on the first user gesture or first sound call.
 */
export function preloadCardSounds(): void {
  if (preloadStarted || typeof window === 'undefined') return;
  preloadStarted = true;

  const ctx = getRawAudioContext();
  if (!ctx) return;

  const rawBase = import.meta.env.BASE_URL || './';
  const baseUrl = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  for (const filename of ALL_SOUND_FILES) {
    if (soundBufferCache.has(filename)) continue;

    const url = `${baseUrl}sounds/${filename}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((arrayBuffer) => decodeAudioDataSafe(ctx, arrayBuffer))
      .then((decodedBuffer) => {
        soundBufferCache.set(filename, decodedBuffer);
      })
      .catch(() => {
        // Skip silently if buffer fails to load or decode
      });
  }
}

if (typeof window !== 'undefined') {
  const handleFirstGesture = () => {
    preloadCardSounds();
  };
  window.addEventListener('pointerdown', handleFirstGesture, { once: true, passive: true });
  window.addEventListener('keydown', handleFirstGesture, { once: true, passive: true });
}

function playSample(
  filename: string,
  targetGain: number,
  playbackRate: number = 1.0,
): { source: AudioBufferSourceNode; gainNode: GainNode } | null {
  if (getMuted()) return null;

  const ctx = getAudioContext();
  if (!ctx) return null;

  if (!preloadStarted) {
    preloadCardSounds();
  }

  const buffer = soundBufferCache.get(filename);
  if (!buffer) return null;

  try {
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const t = ctx.currentTime;

    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, t);

    // Micro-fade (2ms) to prevent clicks
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.linearRampToValueAtTime(targetGain, t + 0.002);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.onended = () => {
      try {
        source.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore
      }
    };

    source.start(t);
    return { source, gainNode };
  } catch {
    return null;
  }
}

/**
 * Plays a riffle-shuffle texture (shuffle.mp3).
 * Call once at the start of each round's deal when the deck is shuffled.
 */
export function playShuffle(): void {
  try {
    playSample(SHUFFLE_FILE, 0.5, 1.0);
  } catch {
    // ignore
  }
}

/**
 * Plays a crisp card slide-and-land 'thwip' with subtle random pitch and timing variation.
 * Caps simultaneous deal voices at 6 by stopping the oldest voice with a fast clickless fade.
 * Call for each card dealt to a player or the table during round dealing.
 *
 * @param index - Index of the card being dealt in the deal sequence
 * @param total - Total number of cards to be dealt in this round
 */
export function playDealCard(index: number, total: number): void {
  void index;
  void total;

  if (getMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (!preloadStarted) {
    preloadCardSounds();
  }

  // Pick random deal sample, never the same one twice in a row
  let pick: string;
  if (DEAL_FILES.length > 1) {
    let idx: number;
    do {
      idx = Math.floor(Math.random() * DEAL_FILES.length);
    } while (DEAL_FILES[idx] === lastDealFile);
    pick = DEAL_FILES[idx];
    lastDealFile = pick;
  } else {
    pick = DEAL_FILES[0];
  }

  const buffer = soundBufferCache.get(pick);
  if (!buffer) return;

  // Cap simultaneous deal voices at 6 by stopping the oldest
  while (activeDealVoices.length >= 6) {
    const oldest = activeDealVoices.shift();
    if (oldest) {
      oldest.stopVoice();
    }
  }

  try {
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const t = ctx.currentTime;

    const rate = 0.94 + Math.random() * (1.08 - 0.94);
    const targetGain = 0.35 + Math.random() * (0.45 - 0.35);

    source.buffer = buffer;
    source.playbackRate.setValueAtTime(rate, t);

    // Micro-fade to prevent clicks
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.linearRampToValueAtTime(targetGain, t + 0.002);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    let stopped = false;
    const stopVoice = () => {
      if (stopped) return;
      stopped = true;
      try {
        const now = ctx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.008);
        source.stop(now + 0.01);
      } catch {
        try {
          source.stop();
        } catch {
          // ignore
        }
      }
    };

    const voiceEntry: ActiveDealVoice = { source, gainNode, stopVoice };

    source.onended = () => {
      try {
        source.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore
      }
      const voiceIndex = activeDealVoices.indexOf(voiceEntry);
      if (voiceIndex !== -1) {
        activeDealVoices.splice(voiceIndex, 1);
      }
    };

    source.start(t);
    activeDealVoices.push(voiceEntry);
  } catch {
    // ignore
  }
}

/**
 * Plays the sound of a community card being turned face up on the felt.
 * Call when a community card is turned face up on the table felt.
 */
export function playCommunityFlip(): void {
  try {
    const idx = Math.floor(Math.random() * PLACE_FILES.length);
    playSample(PLACE_FILES[idx], 0.55, 1.0);
  } catch {
    // ignore
  }
}

/**
 * Plays one hand being revealed during the post-BS reveal sequence.
 * Pitch rises across the reveal sequence to build dramatic tension.
 * Call when a player's hand is revealed during the post-BS reveal phase.
 *
 * @param order - Reveal step or index (0-based or 1-based)
 * @param total - Total count of hands being revealed
 */
export function playRevealCard(order: number, total: number): void {
  try {
    const idx = Math.floor(Math.random() * PLACE_FILES.length);
    const denom = Math.max(1, total - 1);
    const effectiveOrder = order >= total && total > 1 ? order - 1 : Math.max(0, order);
    const progress = Math.min(1, Math.max(0, effectiveOrder / denom));
    const playbackRate = 1.0 + progress * 0.12; // 1.00 to 1.12
    playSample(PLACE_FILES[idx], 0.6, playbackRate);
  } catch {
    // ignore
  }
}

/**
 * Plays a short, warm, resolved two-to-three-note sting for 'They had it'.
 * Fully synthesized with gentle sine oscillators and smooth decay envelopes.
 * Call when the BS challenge resolves and the claimed hand actually exists.
 */
export function playVerdictHadIt(): void {
  if (getMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;
    // A4 (440.00 Hz), C#5 (554.37 Hz), E5 (659.25 Hz) major resolution
    const notes = [
      { freq: 440.0, startOffset: 0.0, peakGain: 0.06, duration: 0.28 },
      { freq: 554.37, startOffset: 0.09, peakGain: 0.07, duration: 0.3 },
      { freq: 659.25, startOffset: 0.18, peakGain: 0.08, duration: 0.38 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startT = t + note.startOffset;
      const endT = startT + note.duration;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, startT);

      gain.gain.setValueAtTime(0.0001, startT);
      gain.gain.linearRampToValueAtTime(note.peakGain, startT + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, endT);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };

      osc.start(startT);
      osc.stop(endT);
    }
  } catch {
    // ignore
  }
}

/**
 * Plays a short, punchy, slightly dissonant hit for 'BS!'.
 * Fully synthesized with punchy transient pitch drop and tritone interval color.
 * Call when the BS challenge resolves and the claimed hand was a bluff.
 */
export function playVerdictBS(): void {
  if (getMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;

    // Body / punch transient
    const oscBody = ctx.createOscillator();
    const gainBody = ctx.createGain();
    oscBody.type = 'triangle';
    oscBody.frequency.setValueAtTime(160, t);
    oscBody.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    gainBody.gain.setValueAtTime(0.0001, t);
    gainBody.gain.linearRampToValueAtTime(0.1, t + 0.004);
    gainBody.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    oscBody.connect(gainBody);
    gainBody.connect(ctx.destination);
    oscBody.onended = () => {
      try {
        oscBody.disconnect();
        gainBody.disconnect();
      } catch {
        // ignore
      }
    };
    oscBody.start(t);
    oscBody.stop(t + 0.14);

    // Dissonant color 1: F#4
    const oscColor1 = ctx.createOscillator();
    const gainColor1 = ctx.createGain();
    oscColor1.type = 'sine';
    oscColor1.frequency.setValueAtTime(369.99, t);
    oscColor1.frequency.exponentialRampToValueAtTime(320, t + 0.14);
    gainColor1.gain.setValueAtTime(0.0001, t);
    gainColor1.gain.linearRampToValueAtTime(0.07, t + 0.005);
    gainColor1.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    oscColor1.connect(gainColor1);
    gainColor1.connect(ctx.destination);
    oscColor1.onended = () => {
      try {
        oscColor1.disconnect();
        gainColor1.disconnect();
      } catch {
        // ignore
      }
    };
    oscColor1.start(t);
    oscColor1.stop(t + 0.15);

    // Dissonant color 2: C5 (tritone against F#4)
    const oscColor2 = ctx.createOscillator();
    const gainColor2 = ctx.createGain();
    oscColor2.type = 'sine';
    oscColor2.frequency.setValueAtTime(523.25, t);
    oscColor2.frequency.exponentialRampToValueAtTime(450, t + 0.14);
    gainColor2.gain.setValueAtTime(0.0001, t);
    gainColor2.gain.linearRampToValueAtTime(0.05, t + 0.005);
    gainColor2.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    oscColor2.connect(gainColor2);
    gainColor2.connect(ctx.destination);
    oscColor2.onended = () => {
      try {
        oscColor2.disconnect();
        gainColor2.disconnect();
      } catch {
        // ignore
      }
    };
    oscColor2.start(t);
    oscColor2.stop(t + 0.15);
  } catch {
    // ignore
  }
}

/**
 * Plays a short, soft descending tone when a player is knocked out.
 * Fully synthesized with gentle gliding sine oscillators.
 * Call when a player loses a challenge at 5 cards and is eliminated from the game.
 */
export function playElimination(): void {
  if (getMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;

    // Gentle descending voice 1: G4 down to G3
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(392.0, t);
    osc1.frequency.exponentialRampToValueAtTime(196.0, t + 0.42);
    gain1.gain.setValueAtTime(0.0001, t);
    gain1.gain.linearRampToValueAtTime(0.07, t + 0.012);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.onended = () => {
      try {
        osc1.disconnect();
        gain1.disconnect();
      } catch {
        // ignore
      }
    };
    osc1.start(t);
    osc1.stop(t + 0.45);

    // Melancholy voice 2: Eb4 down to D3
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(311.13, t);
    osc2.frequency.exponentialRampToValueAtTime(146.83, t + 0.45);
    gain2.gain.setValueAtTime(0.0001, t);
    gain2.gain.linearRampToValueAtTime(0.06, t + 0.012);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.onended = () => {
      try {
        osc2.disconnect();
        gain2.disconnect();
      } catch {
        // ignore
      }
    };
    osc2.start(t);
    osc2.stop(t + 0.48);
  } catch {
    // ignore
  }
}

/**
 * Dev-only audition catalog mapping descriptive labels to sound calls.
 * Can be triggered from dev tools or a test harness to audition all sounds.
 */
export const CARD_SOUND_DEMOS: Record<string, () => void> = {
  'playShuffle': () => playShuffle(),
  'playDealCard (single)': () => playDealCard(0, 10),
  'playDealCardSequence (10 rapid cards @ 60ms)': () => {
    for (let i = 0; i < 10; i++) {
      setTimeout(() => playDealCard(i, 10), i * 60);
    }
  },
  'playCommunityFlip': () => playCommunityFlip(),
  'playRevealCard (early, 0 of 5)': () => playRevealCard(0, 5),
  'playRevealCard (final, 4 of 5)': () => playRevealCard(4, 5),
  'playRevealCardSequence (5 cards rising)': () => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => playRevealCard(i, 5), i * 250);
    }
  },
  'playVerdictHadIt': () => playVerdictHadIt(),
  'playVerdictBS': () => playVerdictBS(),
  'playElimination': () => playElimination(),
};
