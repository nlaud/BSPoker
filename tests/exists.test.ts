import { describe, it, expect } from 'vitest';
import { handExists } from '../src/engine/exists';
import { createCard, Card } from '../src/engine/cards';

describe('handExists', () => {
  it('detects high card', () => {
    const cards: Card[] = [createCard(14, 's'), createCard(10, 'h'), createCard(2, 'c')];
    const aceResult = handExists({ kind: 'high', rank: 14 }, cards);
    expect(aceResult.exists).toBe(true);
    expect(aceResult.matchingCards).toHaveLength(1);
    expect(aceResult.matchingCards[0].rank).toBe(14);

    const kingResult = handExists({ kind: 'high', rank: 13 }, cards);
    expect(kingResult.exists).toBe(false);
    expect(kingResult.matchingCards).toHaveLength(0);
  });

  it('detects pair, trips, quads', () => {
    const cards: Card[] = [
      createCard(9, 'h'),
      createCard(9, 's'),
      createCard(9, 'd'),
      createCard(9, 'c'),
      createCard(2, 's'),
    ];

    expect(handExists({ kind: 'pair', rank: 9 }, cards).exists).toBe(true);
    expect(handExists({ kind: 'pair', rank: 9 }, cards).matchingCards).toHaveLength(2);

    expect(handExists({ kind: 'trips', rank: 9 }, cards).exists).toBe(true);
    expect(handExists({ kind: 'trips', rank: 9 }, cards).matchingCards).toHaveLength(3);

    expect(handExists({ kind: 'quads', rank: 9 }, cards).exists).toBe(true);
    expect(handExists({ kind: 'quads', rank: 9 }, cards).matchingCards).toHaveLength(4);

    expect(handExists({ kind: 'pair', rank: 8 }, cards).exists).toBe(false);
    expect(handExists({ kind: 'trips', rank: 2 }, cards).exists).toBe(false);
  });

  it('detects two pair', () => {
    const cards: Card[] = [
      createCard(14, 's'),
      createCard(14, 'h'),
      createCard(13, 'c'),
      createCard(13, 'd'),
      createCard(5, 's'),
    ];

    const res = handExists({ kind: 'twoPair', high: 14, low: 13 }, cards);
    expect(res.exists).toBe(true);
    expect(res.matchingCards).toHaveLength(4);

    const fail = handExists({ kind: 'twoPair', high: 14, low: 12 }, cards);
    expect(fail.exists).toBe(false);
  });

  it('detects full house', () => {
    const cards: Card[] = [
      createCard(9, 's'),
      createCard(9, 'h'),
      createCard(9, 'd'),
      createCard(14, 'c'),
      createCard(14, 's'),
      createCard(2, 'h'),
    ];

    const res = handExists({ kind: 'fullHouse', trips: 9, pair: 14 }, cards);
    expect(res.exists).toBe(true);
    expect(res.matchingCards).toHaveLength(5);

    // trips and pair swapped should fail
    expect(handExists({ kind: 'fullHouse', trips: 14, pair: 9 }, cards).exists).toBe(false);
  });

  it('detects straights including Ace-low (wheel)', () => {
    const wheelCards: Card[] = [
      createCard(14, 's'),
      createCard(2, 'h'),
      createCard(3, 'c'),
      createCard(4, 'd'),
      createCard(5, 's'),
      createCard(9, 'h'),
    ];

    const wheelRes = handExists({ kind: 'straight', top: 5 }, wheelCards);
    expect(wheelRes.exists).toBe(true);
    expect(wheelRes.matchingCards).toHaveLength(5);

    const sixHighCards: Card[] = [
      createCard(2, 'h'),
      createCard(3, 'c'),
      createCard(4, 'd'),
      createCard(5, 's'),
      createCard(6, 'h'),
    ];
    expect(handExists({ kind: 'straight', top: 6 }, sixHighCards).exists).toBe(true);
    expect(handExists({ kind: 'straight', top: 7 }, sixHighCards).exists).toBe(false);

    const broadwayCards: Card[] = [
      createCard(10, 's'),
      createCard(11, 'h'),
      createCard(12, 'c'),
      createCard(13, 'd'),
      createCard(14, 'h'),
    ];
    expect(handExists({ kind: 'straight', top: 14 }, broadwayCards).exists).toBe(true);
    expect(handExists({ kind: 'straight', top: 13 }, broadwayCards).exists).toBe(false);
  });

  it('detects flushes', () => {
    const cards: Card[] = [
      createCard(2, 'h'),
      createCard(6, 'h'),
      createCard(9, 'h'),
      createCard(11, 'h'),
      createCard(14, 'h'),
      createCard(5, 'c'),
    ];

    const res = handExists({ kind: 'flush', suit: 'h' }, cards);
    expect(res.exists).toBe(true);
    expect(res.matchingCards).toHaveLength(5);

    expect(handExists({ kind: 'flush', suit: 's' }, cards).exists).toBe(false);
  });

  it('detects straight flush and royal flush', () => {
    const sfCards: Card[] = [
      createCard(5, 's'),
      createCard(6, 's'),
      createCard(7, 's'),
      createCard(8, 's'),
      createCard(9, 's'),
      createCard(10, 'h'),
    ];

    const sfRes = handExists({ kind: 'straightFlush', top: 9 }, sfCards);
    expect(sfRes.exists).toBe(true);
    expect(sfRes.matchingCards).toHaveLength(5);

    // Mixed suits should not be straight flush
    const mixedCards: Card[] = [
      createCard(5, 's'),
      createCard(6, 's'),
      createCard(7, 's'),
      createCard(8, 's'),
      createCard(9, 'h'), // hearts!
    ];
    expect(handExists({ kind: 'straightFlush', top: 9 }, mixedCards).exists).toBe(false);

    const rfCards: Card[] = [
      createCard(10, 'd'),
      createCard(11, 'd'),
      createCard(12, 'd'),
      createCard(13, 'd'),
      createCard(14, 'd'),
    ];
    expect(handExists({ kind: 'royalFlush' }, rfCards).exists).toBe(true);
    expect(handExists({ kind: 'straightFlush', top: 13 }, rfCards).exists).toBe(false);
  });
});
