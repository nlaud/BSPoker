import { describe, it, expect } from 'vitest';
import { parseHand } from '../src/engine/parser';
import { Hand, normalForm, StraightTop, StraightFlushTop } from '../src/engine/hands';
import { RANKS, SUITS } from '../src/engine/cards';

describe('parseHand', () => {
  const tableCases: [string, string][] = [
    ['pair of nines', 'Pair of Nines'],
    ['pair 9', 'Pair of Nines'],
    ['two 9s', 'Pair of Nines'],
    ['9s', 'Pair of Nines'],
    ['nines', 'Pair of Nines'],
    ['high pair', 'Pair of Aces'],
    ['three nines two aces', 'Full House, Three Nines and Two Aces'],
    ['3 9s 2 As', 'Full House, Three Nines and Two Aces'],
    ['nines full of aces', 'Full House, Three Nines and Two Aces'],
    ['boat nines over aces', 'Full House, Three Nines and Two Aces'],
    ['full house nines over aces', 'Full House, Three Nines and Two Aces'],
    ['two aces two kings', 'Two Pair, Aces and Kings'],
    ['aces and kings', 'Two Pair, Aces and Kings'],
    ['two pair kings aces', 'Two Pair, Aces and Kings'],
    ['two pair aces and kings', 'Two Pair, Aces and Kings'],
    ['three sevens', 'Three Sevens'],
    ['trips 7', 'Three Sevens'],
    ['set of sevens', 'Three Sevens'],
    ['flush of hearts', 'Flush of Hearts'],
    ['heart flush', 'Flush of Hearts'],
    ['flush h', 'Flush of Hearts'],
    ['flush ♥', 'Flush of Hearts'],
    ['straight flush 5 to 9', 'Straight Flush, 5 to 9'],
    ['9 high straight flush', 'Straight Flush, 5 to 9'],
    ['straight flush 10 to ace', 'Royal Flush'],
    ['straight starting at 3', 'Straight, 3 to 7'],
    ['straight 3-7', 'Straight, 3 to 7'],
    ['7 high straight', 'Straight, 3 to 7'],
    ['high straight', 'Straight, 10 to Ace'],
    ['broadway', 'Straight, 10 to Ace'],
    ['straight to ace', 'Straight, 10 to Ace'],
    ['low straight', 'Straight, Ace to 5'],
    ['wheel', 'Straight, Ace to 5'],
    ['straight ace to 5', 'Straight, Ace to 5'],
    ['royal flush', 'Royal Flush'],
    ['royal', 'Royal Flush'],
    ['four kings', 'Four Kings'],
    ['quad kings', 'Four Kings'],
    ['4 Ks', 'Four Kings'],
    ['ace high', 'Ace High'],
    ['high card ace', 'Ace High'],
    ['ace', 'Ace High'],
    ['par of nins', 'Pair of Nines'],
    ['flsh of harts', 'Flush of Hearts'],
  ];

  for (const [input, expected] of tableCases) {
    it(`parses "${input}" to "${expected}"`, () => {
      const result = parseHand(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.normal).toBe(expected);
      }
    });
  }

  const errorCases = [
    'two pair nines nines',
    'straight 9 to 13',
    'flush',
    'nines full',
    'banana',
    'straight 9',
    'straight starting at queen',
    '',
    '   ',
    'invalid gibberish text',
  ];

  for (const input of errorCases) {
    it(`rejects invalid input "${input}"`, () => {
      const result = parseHand(input);
      expect(result.ok).toBe(false);
    });
  }

  // Extra test cases to reach 70+ cases
  const extraCases: [string, string][] = [
    ['pair of twos', 'Pair of Twos'],
    ['deuces', 'Pair of Twos'],
    ['pair deuces', 'Pair of Twos'],
    ['pair of 10s', 'Pair of Tens'],
    ['pair jacks', 'Pair of Jacks'],
    ['pair queens', 'Pair of Queens'],
    ['pair kings', 'Pair of Kings'],
    ['pair aces', 'Pair of Aces'],
    ['two pair 2s and 3s', 'Two Pair, Threes and Twos'],
    ['two pair queens and jacks', 'Two Pair, Queens and Jacks'],
    ['two pair 10s 9s', 'Two Pair, Tens and Nines'],
    ['two pair aces 2s', 'Two Pair, Aces and Twos'],
    ['three 2s', 'Three Twos'],
    ['three 3s', 'Three Threes'],
    ['three jacks', 'Three Jacks'],
    ['three queens', 'Three Queens'],
    ['three aces', 'Three Aces'],
    ['four 2s', 'Four Twos'],
    ['four aces', 'Four Aces'],
    ['four jacks', 'Four Jacks'],
    ['straight 2 to 6', 'Straight, 2 to 6'],
    ['straight 4 to 8', 'Straight, 4 to 8'],
    ['straight 6 to 10', 'Straight, 6 to 10'],
    ['straight 7 to jack', 'Straight, 7 to Jack'],
    ['straight 8 to queen', 'Straight, 8 to Queen'],
    ['straight 9 to king', 'Straight, 9 to King'],
    ['straight 10 to ace', 'Straight, 10 to Ace'],
    ['straight from 5', 'Straight, 5 to 9'],
    ['straight from 6', 'Straight, 6 to 10'],
    ['straight from 10', 'Straight, 10 to Ace'],
    ['straight starting at ace', 'Straight, Ace to 5'],
    ['straight ending at 6', 'Straight, 2 to 6'],
    ['straight ending at king', 'Straight, 9 to King'],
    ['flush of clubs', 'Flush of Clubs'],
    ['flush of diamonds', 'Flush of Diamonds'],
    ['flush of spades', 'Flush of Spades'],
    ['spade flush', 'Flush of Spades'],
    ['club flush', 'Flush of Clubs'],
    ['diamond flush', 'Flush of Diamonds'],
    ['flush c', 'Flush of Clubs'],
    ['flush d', 'Flush of Diamonds'],
    ['flush s', 'Flush of Spades'],
    ['flush ♣', 'Flush of Clubs'],
    ['flush ♦', 'Flush of Diamonds'],
    ['flush ♠', 'Flush of Spades'],
    ['full house aces over kings', 'Full House, Three Aces and Two Kings'],
    ['full house 2s over 3s', 'Full House, Three Twos and Two Threes'],
    ['3 kings 2 queens', 'Full House, Three Kings and Two Queens'],
    ['kings full of queens', 'Full House, Three Kings and Two Queens'],
    ['boat kings over queens', 'Full House, Three Kings and Two Queens'],
    ['straight flush ace to 5', 'Straight Flush, Ace to 5'],
    ['straight flush 2 to 6', 'Straight Flush, 2 to 6'],
    ['straight flush 9 to king', 'Straight Flush, 9 to King'],
    ['king high', 'King High'],
    ['seven high', 'Seven High'],
    ['two high', 'Two High'],
    ['high card 9', 'Nine High'],
    ['high card king', 'King High'],
    ['high card 2', 'Two High'],
    ['king', 'King High'],
    ['queen', 'Queen High'],
    ['jack', 'Jack High'],
    ['ten', 'Ten High'],
  ];

  for (const [input, expected] of extraCases) {
    it(`parses extra case "${input}" to "${expected}"`, () => {
      const result = parseHand(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.normal).toBe(expected);
      }
    });
  }

  // Bug fixes and newly supported inputs
  const bugFixAndNewCases: [string, string][] = [
    // Bug fixes:
    ['2 pair kings queens', 'Two Pair, Kings and Queens'],
    ['2 pairs kings queens', 'Two Pair, Kings and Queens'],
    ['triple queens pair kings', 'Full House, Three Queens and Two Kings'],
    ['trips queens pair of kings', 'Full House, Three Queens and Two Kings'],
    ['three queens and a pair of kings', 'Full House, Three Queens and Two Kings'],
    // Newly accepted:
    ['three of a kind queens', 'Three Queens'],
    ['3 of a kind queens', 'Three Queens'],
    ['queens three of a kind', 'Three Queens'],
    ['three of queens', 'Three Queens'],
    ['four of a kind queens', 'Four Queens'],
    ['4 of a kind queens', 'Four Queens'],
    ['queens four of a kind', 'Four Queens'],
    ['four of queens', 'Four Queens'],
    ['one pair queens', 'Pair of Queens'],
    ['1 pair queens', 'Pair of Queens'],
    ['low pair', 'Pair of Twos'],
    ['double pair kings queens', 'Two Pair, Kings and Queens'],
    ['a high', 'Ace High'],
    ['flush in hearts', 'Flush of Hearts'],
    ['flush in spades', 'Flush of Spades'],
    ['flush in clubs', 'Flush of Clubs'],
    ['flush in diamonds', 'Flush of Diamonds'],
    ['straight 5 6 7 8 9', 'Straight, 5 to 9'],
    ['straight 2 3 4 5 6', 'Straight, 2 to 6'],
    ['straight flush 5 6 7 8 9', 'Straight Flush, 5 to 9'],
    // "to"/"too" typed for "two":
    ['to pair kings queens', 'Two Pair, Kings and Queens'],
    ['too pair aces and fours', 'Two Pair, Aces and Fours'],
  ];

  for (const [input, expected] of bugFixAndNewCases) {
    it(`parses bug fix or new case "${input}" to "${expected}"`, () => {
      const result = parseHand(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.normal).toBe(expected);
      }
    });
  }

  // General rule tests: must reject inputs with unexplained leftover tokens or ranks
  const generalRuleErrorCases = [
    'three queens pair',
    'three queens kings',
    'flush of hearts kings',
    'four kings queens',
    'pair kings queens',
    'two pair kings queens jacks',
    'full house kings over queens jacks',
    'straight 5 6 7 8 10',
    'straight 5 6 7 8',
    'royal flush kings',
  ];

  for (const input of generalRuleErrorCases) {
    it(`rejects leftover or unexplained input "${input}"`, () => {
      const result = parseHand(input);
      expect(result.ok).toBe(false);
    });
  }

  it('round-trips every normal form back to the identical hand', () => {
    const allHands: Hand[] = [];

    // High
    for (const r of RANKS) {
      allHands.push({ kind: 'high', rank: r });
    }
    // Pair
    for (const r of RANKS) {
      allHands.push({ kind: 'pair', rank: r });
    }
    // Two pair
    for (let i = 0; i < RANKS.length; i++) {
      for (let j = 0; j < i; j++) {
        allHands.push({ kind: 'twoPair', high: RANKS[i], low: RANKS[j] });
      }
    }
    // Trips
    for (const r of RANKS) {
      allHands.push({ kind: 'trips', rank: r });
    }
    // Straight
    for (let top = 5; top <= 14; top++) {
      allHands.push({ kind: 'straight', top: top as StraightTop });
    }
    // Flush
    for (const s of SUITS) {
      allHands.push({ kind: 'flush', suit: s });
    }
    // Full House
    for (const trips of RANKS) {
      for (const pair of RANKS) {
        if (trips !== pair) {
          allHands.push({ kind: 'fullHouse', trips, pair });
        }
      }
    }
    // Quads
    for (const r of RANKS) {
      allHands.push({ kind: 'quads', rank: r });
    }
    // Straight Flush
    for (let top = 5; top <= 13; top++) {
      allHands.push({ kind: 'straightFlush', top: top as StraightFlushTop });
    }
    // Royal Flush
    allHands.push({ kind: 'royalFlush' });

    expect(allHands.length).toBeGreaterThan(250);

    for (const hand of allHands) {
      const str = normalForm(hand);
      const parsed = parseHand(str);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.hand).toEqual(hand);
        expect(parsed.normal).toBe(str);
      }
    }
  });
});
