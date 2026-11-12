import {
  Rank,
  Suit,
  RANK_NAMES,
  RANK_PLURALS,
  SUIT_NAMES,
} from './cards';

export type StraightTop = 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type StraightFlushTop = 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type Hand =
  | { kind: 'high'; rank: Rank }
  | { kind: 'pair'; rank: Rank }
  | { kind: 'twoPair'; high: Rank; low: Rank }
  | { kind: 'trips'; rank: Rank }
  | { kind: 'straight'; top: StraightTop }
  | { kind: 'flush'; suit: Suit }
  | { kind: 'fullHouse'; trips: Rank; pair: Rank }
  | { kind: 'quads'; rank: Rank }
  | { kind: 'straightFlush'; top: StraightFlushTop }
  | { kind: 'royalFlush' };

export interface Rules {
  straightBeatsFlush: boolean;
}

export const DEFAULT_RULES: Rules = {
  straightBeatsFlush: false,
};

const CATEGORY_ORDER: Record<Hand['kind'], number> = {
  high: 1,
  pair: 2,
  twoPair: 3,
  trips: 4,
  straight: 5,
  flush: 6,
  fullHouse: 7,
  quads: 8,
  straightFlush: 9,
  royalFlush: 10,
};

const CATEGORY_ORDER_STRAIGHT_BEATS_FLUSH: Record<Hand['kind'], number> = {
  high: 1,
  pair: 2,
  twoPair: 3,
  trips: 4,
  flush: 5,
  straight: 6,
  fullHouse: 7,
  quads: 8,
  straightFlush: 9,
  royalFlush: 10,
};

/** Hand categories from the highest to the lowest under these rules. */
export function handKindsHighToLow(rules: Rules = DEFAULT_RULES): Hand['kind'][] {
  const order = rules.straightBeatsFlush ? CATEGORY_ORDER_STRAIGHT_BEATS_FLUSH : CATEGORY_ORDER;
  return (Object.keys(order) as Hand['kind'][]).sort((a, b) => order[b] - order[a]);
}

export function compareHands(a: Hand, b: Hand, rules: Rules = DEFAULT_RULES): number {
  const order = rules.straightBeatsFlush ? CATEGORY_ORDER_STRAIGHT_BEATS_FLUSH : CATEGORY_ORDER;
  const catA = order[a.kind];
  const catB = order[b.kind];
  if (catA !== catB) {
    return catA - catB;
  }

  switch (a.kind) {
    case 'high': {
      const bHigh = b as typeof a;
      return a.rank - bHigh.rank;
    }
    case 'pair': {
      const bPair = b as typeof a;
      return a.rank - bPair.rank;
    }
    case 'twoPair': {
      const bTwoPair = b as typeof a;
      if (a.high !== bTwoPair.high) {
        return a.high - bTwoPair.high;
      }
      return a.low - bTwoPair.low;
    }
    case 'trips': {
      const bTrips = b as typeof a;
      return a.rank - bTrips.rank;
    }
    case 'straight': {
      const bStraight = b as typeof a;
      return a.top - bStraight.top;
    }
    case 'flush': {
      // ALL FLUSHES ARE EQUAL. compareHands returns 0 for any two flushes.
      return 0;
    }
    case 'fullHouse': {
      const bFH = b as typeof a;
      if (a.trips !== bFH.trips) {
        return a.trips - bFH.trips;
      }
      return a.pair - bFH.pair;
    }
    case 'quads': {
      const bQuads = b as typeof a;
      return a.rank - bQuads.rank;
    }
    case 'straightFlush': {
      const bSF = b as typeof a;
      return a.top - bSF.top;
    }
    case 'royalFlush': {
      return 0;
    }
  }
}

function formatStraightBound(rankVal: number): string {
  if (rankVal === 14) return 'Ace';
  if (rankVal === 13) return 'King';
  if (rankVal === 12) return 'Queen';
  if (rankVal === 11) return 'Jack';
  return String(rankVal);
}

function formatStraightRange(top: StraightTop): string {
  if (top === 5) {
    return 'Ace to 5';
  }
  const low = top - 4;
  return `${formatStraightBound(low)} to ${formatStraightBound(top)}`;
}

export function normalForm(hand: Hand): string {
  switch (hand.kind) {
    case 'high':
      return `${RANK_NAMES[hand.rank]} High`;
    case 'pair':
      return `Pair of ${RANK_PLURALS[hand.rank]}`;
    case 'twoPair':
      return `Two Pair, ${RANK_PLURALS[hand.high]} and ${RANK_PLURALS[hand.low]}`;
    case 'trips':
      return `Three ${RANK_PLURALS[hand.rank]}`;
    case 'straight':
      return `Straight, ${formatStraightRange(hand.top)}`;
    case 'flush':
      return `Flush of ${SUIT_NAMES[hand.suit]}`;
    case 'fullHouse':
      return `Full House, Three ${RANK_PLURALS[hand.trips]} and Two ${RANK_PLURALS[hand.pair]}`;
    case 'quads':
      return `Four ${RANK_PLURALS[hand.rank]}`;
    case 'straightFlush':
      return `Straight Flush, ${formatStraightRange(hand.top)}`;
    case 'royalFlush':
      return 'Royal Flush';
  }
}
