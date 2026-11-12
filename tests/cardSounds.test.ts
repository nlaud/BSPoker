import { describe, it, expect } from 'vitest';
import {
  preloadCardSounds,
  playShuffle,
  playDealCard,
  playCommunityFlip,
  playRevealCard,
  playVerdictHadIt,
  playVerdictBS,
  playElimination,
  CARD_SOUND_DEMOS,
} from '../src/ui/cardSounds';
import { getAudioContext, getRawAudioContext, getMuted, setMuted } from '../src/ui/sound';

describe('cardSounds', () => {
  it('exports all expected playback functions', () => {
    expect(typeof playShuffle).toBe('function');
    expect(typeof playDealCard).toBe('function');
    expect(typeof playCommunityFlip).toBe('function');
    expect(typeof playRevealCard).toBe('function');
    expect(typeof playVerdictHadIt).toBe('function');
    expect(typeof playVerdictBS).toBe('function');
    expect(typeof playElimination).toBe('function');
    expect(typeof preloadCardSounds).toBe('function');
  });

  it('runs safely in headless environment without throwing', () => {
    expect(() => preloadCardSounds()).not.toThrow();
    expect(() => playShuffle()).not.toThrow();
    expect(() => playDealCard(0, 10)).not.toThrow();
    expect(() => playCommunityFlip()).not.toThrow();
    expect(() => playRevealCard(0, 5)).not.toThrow();
    expect(() => playVerdictHadIt()).not.toThrow();
    expect(() => playVerdictBS()).not.toThrow();
    expect(() => playElimination()).not.toThrow();
  });

  it('respects muted state safely', () => {
    setMuted(true);
    expect(getMuted()).toBe(true);
    expect(() => playShuffle()).not.toThrow();
    expect(() => playDealCard(1, 10)).not.toThrow();
    expect(() => playVerdictBS()).not.toThrow();
    setMuted(false);
  });

  it('provides working CARD_SOUND_DEMOS for auditioning', () => {
    expect(CARD_SOUND_DEMOS).toBeDefined();
    for (const [name, demo] of Object.entries(CARD_SOUND_DEMOS)) {
      expect(typeof name).toBe('string');
      expect(typeof demo).toBe('function');
      expect(() => demo()).not.toThrow();
    }
  });

  it('exports getters from sound.ts', () => {
    expect(typeof getAudioContext).toBe('function');
    expect(typeof getRawAudioContext).toBe('function');
  });
});
