import { Card, Rank, Suit } from './cards';
import { Hand, StraightTop, StraightFlushTop } from './hands';

export interface HandExistsResult {
  exists: boolean;
  matchingCards: Card[];
}

export function handExists(hand: Hand, cards: readonly Card[]): HandExistsResult {
  switch (hand.kind) {
    case 'high': {
      const match = cards.find((c) => c.rank === hand.rank);
      if (match) {
        return { exists: true, matchingCards: [match] };
      }
      return { exists: false, matchingCards: [] };
    }

    case 'pair': {
      const matches = cards.filter((c) => c.rank === hand.rank);
      if (matches.length >= 2) {
        return { exists: true, matchingCards: matches.slice(0, 2) };
      }
      return { exists: false, matchingCards: [] };
    }

    case 'twoPair': {
      const highMatches = cards.filter((c) => c.rank === hand.high);
      const lowMatches = cards.filter((c) => c.rank === hand.low);
      if (highMatches.length >= 2 && lowMatches.length >= 2) {
        return {
          exists: true,
          matchingCards: [...highMatches.slice(0, 2), ...lowMatches.slice(0, 2)],
        };
      }
      return { exists: false, matchingCards: [] };
    }

    case 'trips': {
      const matches = cards.filter((c) => c.rank === hand.rank);
      if (matches.length >= 3) {
        return { exists: true, matchingCards: matches.slice(0, 3) };
      }
      return { exists: false, matchingCards: [] };
    }

    case 'straight': {
      const straightCards = getStraightCards(cards, hand.top);
      if (straightCards) {
        return { exists: true, matchingCards: straightCards };
      }
      return { exists: false, matchingCards: [] };
    }

    case 'flush': {
      const suitMatches = cards.filter((c) => c.suit === hand.suit);
      if (suitMatches.length >= 5) {
        return { exists: true, matchingCards: suitMatches.slice(0, 5) };
      }
      return { exists: false, matchingCards: [] };
    }

    case 'fullHouse': {
      const tripsMatches = cards.filter((c) => c.rank === hand.trips);
      const pairMatches = cards.filter((c) => c.rank === hand.pair);
      if (tripsMatches.length >= 3 && pairMatches.length >= 2) {
        return {
          exists: true,
          matchingCards: [...tripsMatches.slice(0, 3), ...pairMatches.slice(0, 2)],
        };
      }
      return { exists: false, matchingCards: [] };
    }

    case 'quads': {
      const matches = cards.filter((c) => c.rank === hand.rank);
      if (matches.length >= 4) {
        return { exists: true, matchingCards: matches.slice(0, 4) };
      }
      return { exists: false, matchingCards: [] };
    }

    case 'straightFlush': {
      const sfCards = getStraightFlushCards(cards, hand.top);
      if (sfCards) {
        return { exists: true, matchingCards: sfCards };
      }
      return { exists: false, matchingCards: [] };
    }

    case 'royalFlush': {
      const rfCards = getStraightFlushCards(cards, 14);
      if (rfCards) {
        return { exists: true, matchingCards: rfCards };
      }
      return { exists: false, matchingCards: [] };
    }
  }
}

function getRanksForTop(top: StraightTop): Rank[] {
  if (top === 5) {
    return [14, 2, 3, 4, 5];
  }
  const ranks: Rank[] = [];
  for (let r = top - 4; r <= top; r++) {
    ranks.push(r as Rank);
  }
  return ranks;
}

function getStraightCards(cards: readonly Card[], top: StraightTop): Card[] | null {
  const neededRanks = getRanksForTop(top);
  const result: Card[] = [];
  for (const rank of neededRanks) {
    const card = cards.find((c) => c.rank === rank && !result.includes(c));
    if (!card) {
      return null;
    }
    result.push(card);
  }
  return result;
}

function getStraightFlushCards(
  cards: readonly Card[],
  top: StraightFlushTop | 14
): Card[] | null {
  const suits: Suit[] = ['c', 'd', 'h', 's'];
  const neededRanks = getRanksForTop(top as StraightTop);

  for (const suit of suits) {
    const suitCards = cards.filter((c) => c.suit === suit);
    const result: Card[] = [];
    let allFound = true;
    for (const rank of neededRanks) {
      const card = suitCards.find((c) => c.rank === rank);
      if (!card) {
        allFound = false;
        break;
      }
      result.push(card);
    }
    if (allFound) {
      return result;
    }
  }
  return null;
}
