import { describe, it, expect } from 'vitest';
import { compareHands, normalForm, Hand, DEFAULT_RULES, Rules } from '../src/engine/hands';

describe('compareHands', () => {
  it('orders categories correctly from low to high', () => {
    const hands: Hand[] = [
      { kind: 'high', rank: 14 },
      { kind: 'pair', rank: 2 },
      { kind: 'twoPair', high: 3, low: 2 },
      { kind: 'trips', rank: 2 },
      { kind: 'straight', top: 5 },
      { kind: 'flush', suit: 'c' },
      { kind: 'fullHouse', trips: 2, pair: 3 },
      { kind: 'quads', rank: 2 },
      { kind: 'straightFlush', top: 5 },
      { kind: 'royalFlush' },
    ];

    for (let i = 0; i < hands.length; i++) {
      for (let j = 0; j < hands.length; j++) {
        if (i < j) {
          expect(compareHands(hands[i], hands[j])).toBeLessThan(0);
          expect(compareHands(hands[j], hands[i])).toBeGreaterThan(0);
        } else if (i === j && hands[i].kind !== 'flush') {
          expect(compareHands(hands[i], hands[j])).toBe(0);
        }
      }
    }
  });

  it('treats all flushes as equal', () => {
    const flushH: Hand = { kind: 'flush', suit: 'h' };
    const flushC: Hand = { kind: 'flush', suit: 'c' };
    const flushD: Hand = { kind: 'flush', suit: 'd' };
    const flushS: Hand = { kind: 'flush', suit: 's' };

    expect(compareHands(flushH, flushC)).toBe(0);
    expect(compareHands(flushH, flushD)).toBe(0);
    expect(compareHands(flushH, flushS)).toBe(0);
    expect(compareHands(flushC, flushS)).toBe(0);

    // After flush, only full house or better beats it
    const straight: Hand = { kind: 'straight', top: 14 };
    const fullHouse: Hand = { kind: 'fullHouse', trips: 2, pair: 3 };

    expect(compareHands(straight, flushH)).toBeLessThan(0);
    expect(compareHands(fullHouse, flushH)).toBeGreaterThan(0);
  });

  it('orders high card, pair, trips, quads by rank', () => {
    expect(compareHands({ kind: 'high', rank: 14 }, { kind: 'high', rank: 13 })).toBeGreaterThan(0);
    expect(compareHands({ kind: 'high', rank: 7 }, { kind: 'high', rank: 8 })).toBeLessThan(0);

    expect(compareHands({ kind: 'pair', rank: 14 }, { kind: 'pair', rank: 13 })).toBeGreaterThan(0);
    expect(compareHands({ kind: 'pair', rank: 10 }, { kind: 'pair', rank: 10 })).toBe(0);

    expect(compareHands({ kind: 'trips', rank: 11 }, { kind: 'trips', rank: 10 })).toBeGreaterThan(0);
    expect(compareHands({ kind: 'quads', rank: 14 }, { kind: 'quads', rank: 13 })).toBeGreaterThan(0);
  });

  it('orders two pair by high pair then low pair', () => {
    const aaKk: Hand = { kind: 'twoPair', high: 14, low: 13 };
    const aaQq: Hand = { kind: 'twoPair', high: 14, low: 12 };
    const kkQq: Hand = { kind: 'twoPair', high: 13, low: 12 };

    expect(compareHands(aaKk, aaQq)).toBeGreaterThan(0);
    expect(compareHands(aaQq, aaKk)).toBeLessThan(0);
    expect(compareHands(aaQq, kkQq)).toBeGreaterThan(0);
    expect(compareHands(aaKk, aaKk)).toBe(0);
  });

  it('orders straights by top card (Ace to 5 is lowest, 10 to Ace is highest)', () => {
    const wheel: Hand = { kind: 'straight', top: 5 };
    const sixHigh: Hand = { kind: 'straight', top: 6 };
    const broadway: Hand = { kind: 'straight', top: 14 };

    expect(compareHands(sixHigh, wheel)).toBeGreaterThan(0);
    expect(compareHands(broadway, sixHigh)).toBeGreaterThan(0);
    expect(compareHands(wheel, broadway)).toBeLessThan(0);
  });

  it('orders full houses by trips then pair', () => {
    const fh9overA: Hand = { kind: 'fullHouse', trips: 9, pair: 14 };
    const fh8overA: Hand = { kind: 'fullHouse', trips: 8, pair: 14 };
    const fh9overK: Hand = { kind: 'fullHouse', trips: 9, pair: 13 };

    expect(compareHands(fh9overA, fh8overA)).toBeGreaterThan(0);
    expect(compareHands(fh9overA, fh9overK)).toBeGreaterThan(0);
    expect(compareHands(fh8overA, fh9overK)).toBeLessThan(0);
  });

  it('orders straight flushes by top card', () => {
    const sf5: Hand = { kind: 'straightFlush', top: 5 };
    const sf9: Hand = { kind: 'straightFlush', top: 9 };
    const sf13: Hand = { kind: 'straightFlush', top: 13 };
    const royal: Hand = { kind: 'royalFlush' };

    expect(compareHands(sf9, sf5)).toBeGreaterThan(0);
    expect(compareHands(sf13, sf9)).toBeGreaterThan(0);
    expect(compareHands(royal, sf13)).toBeGreaterThan(0);
  });

  it('formats normal forms correctly', () => {
    expect(normalForm({ kind: 'high', rank: 13 })).toBe('King High');
    expect(normalForm({ kind: 'pair', rank: 9 })).toBe('Pair of Nines');
    expect(normalForm({ kind: 'twoPair', high: 14, low: 13 })).toBe('Two Pair, Aces and Kings');
    expect(normalForm({ kind: 'trips', rank: 7 })).toBe('Three Sevens');
    expect(normalForm({ kind: 'straight', top: 9 })).toBe('Straight, 5 to 9');
    expect(normalForm({ kind: 'straight', top: 5 })).toBe('Straight, Ace to 5');
    expect(normalForm({ kind: 'straight', top: 14 })).toBe('Straight, 10 to Ace');
    expect(normalForm({ kind: 'flush', suit: 'h' })).toBe('Flush of Hearts');
    expect(normalForm({ kind: 'fullHouse', trips: 9, pair: 14 })).toBe('Full House, Three Nines and Two Aces');
    expect(normalForm({ kind: 'quads', rank: 9 })).toBe('Four Nines');
    expect(normalForm({ kind: 'straightFlush', top: 9 })).toBe('Straight Flush, 5 to 9');
    expect(normalForm({ kind: 'royalFlush' })).toBe('Royal Flush');
  });

  it('orders categories correctly when straightBeatsFlush is enabled', () => {
    const rules: Rules = { straightBeatsFlush: true };
    const hands: Hand[] = [
      { kind: 'high', rank: 14 },
      { kind: 'pair', rank: 2 },
      { kind: 'twoPair', high: 3, low: 2 },
      { kind: 'trips', rank: 2 },
      { kind: 'flush', suit: 'c' },
      { kind: 'straight', top: 5 },
      { kind: 'fullHouse', trips: 2, pair: 3 },
      { kind: 'quads', rank: 2 },
      { kind: 'straightFlush', top: 5 },
      { kind: 'royalFlush' },
    ];

    for (let i = 0; i < hands.length; i++) {
      for (let j = 0; j < hands.length; j++) {
        if (i < j) {
          expect(compareHands(hands[i], hands[j], rules)).toBeLessThan(0);
          expect(compareHands(hands[j], hands[i], rules)).toBeGreaterThan(0);
        } else if (i === j && hands[i].kind !== 'flush') {
          expect(compareHands(hands[i], hands[j], rules)).toBe(0);
        }
      }
    }

    // Default rules has straight < flush
    const straightWheel: Hand = { kind: 'straight', top: 5 };
    const flushHeart: Hand = { kind: 'flush', suit: 'h' };
    expect(compareHands(straightWheel, flushHeart, DEFAULT_RULES)).toBeLessThan(0);
    expect(compareHands(straightWheel, flushHeart, rules)).toBeGreaterThan(0);
  });
});
