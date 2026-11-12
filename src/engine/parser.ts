import { Rank, Suit } from './cards';
import { Hand, StraightTop, StraightFlushTop, normalForm } from './hands';

export type ParseResult =
  | { ok: true; hand: Hand; normal: string }
  | { ok: false; error: string; hint: string };

const DEFAULT_ERROR = "Couldn't read that hand";
const DEFAULT_HINT = 'Try: Pair of Nines, Three Kings, Flush of Hearts, Straight, 5 to 9';

interface RankInfo {
  rank: Rank;
  plural: boolean;
}

const RANK_DICT: Record<string, RankInfo> = {
  '2': { rank: 2, plural: false },
  '3': { rank: 3, plural: false },
  '4': { rank: 4, plural: false },
  '5': { rank: 5, plural: false },
  '6': { rank: 6, plural: false },
  '7': { rank: 7, plural: false },
  '8': { rank: 8, plural: false },
  '9': { rank: 9, plural: false },
  '10': { rank: 10, plural: false },
  '2s': { rank: 2, plural: true },
  '3s': { rank: 3, plural: true },
  '4s': { rank: 4, plural: true },
  '5s': { rank: 5, plural: true },
  '6s': { rank: 6, plural: true },
  '7s': { rank: 7, plural: true },
  '8s': { rank: 8, plural: true },
  '9s': { rank: 9, plural: true },
  '10s': { rank: 10, plural: true },
  j: { rank: 11, plural: false },
  js: { rank: 11, plural: true },
  q: { rank: 12, plural: false },
  qs: { rank: 12, plural: true },
  k: { rank: 13, plural: false },
  ks: { rank: 13, plural: true },
  a: { rank: 14, plural: false },
  as: { rank: 14, plural: true },
  two: { rank: 2, plural: false },
  twos: { rank: 2, plural: true },
  deuce: { rank: 2, plural: false },
  deuces: { rank: 2, plural: true },
  three: { rank: 3, plural: false },
  threes: { rank: 3, plural: true },
  trey: { rank: 3, plural: false },
  treys: { rank: 3, plural: true },
  four: { rank: 4, plural: false },
  fours: { rank: 4, plural: true },
  five: { rank: 5, plural: false },
  fives: { rank: 5, plural: true },
  six: { rank: 6, plural: false },
  sixes: { rank: 6, plural: true },
  seven: { rank: 7, plural: false },
  sevens: { rank: 7, plural: true },
  eight: { rank: 8, plural: false },
  eights: { rank: 8, plural: true },
  nine: { rank: 9, plural: false },
  nines: { rank: 9, plural: true },
  ten: { rank: 10, plural: false },
  tens: { rank: 10, plural: true },
  jack: { rank: 11, plural: false },
  jacks: { rank: 11, plural: true },
  queen: { rank: 12, plural: false },
  queens: { rank: 12, plural: true },
  king: { rank: 13, plural: false },
  kings: { rank: 13, plural: true },
  ace: { rank: 14, plural: false },
  aces: { rank: 14, plural: true },
};

const SUIT_DICT: Record<string, Suit> = {
  hearts: 'h',
  heart: 'h',
  diamonds: 'd',
  diamond: 'd',
  clubs: 'c',
  club: 'c',
  spades: 's',
  spade: 's',
};

const SINGLE_LETTER_SUITS: Record<string, Suit> = {
  h: 'h',
  d: 'd',
  c: 'c',
  s: 's',
};

const KEYWORDS = new Set([
  'pair',
  'pairs',
  'twopair',
  'trips',
  'triple',
  'set',
  'quad',
  'quads',
  'full',
  'house',
  'boat',
  'flush',
  'straight',
  'royal',
  'high',
  'low',
  'card',
  'of',
  'a',
  'the',
  'and',
  'with',
  'on',
  'o',
  'in',
  'over',
  'up',
  'to',
  'through',
  'thru',
  'from',
  'starting',
  'start',
  'starts',
  'at',
  'ending',
  'ends',
  'broadway',
  'wheel',
  'kind',
  'double',
  'one',
  '1',
]);

export function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const d: number[][] = [];
  for (let i = 0; i <= la; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= lb; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[la][lb];
}

interface MatchEntry {
  word: string;
  kind: 'keyword' | 'suit' | 'rank';
  data?: unknown;
}

const ALL_ENTRIES: MatchEntry[] = [];
for (const kw of KEYWORDS) {
  ALL_ENTRIES.push({ word: kw, kind: 'keyword' });
}
for (const [s, suit] of Object.entries(SUIT_DICT)) {
  ALL_ENTRIES.push({ word: s, kind: 'suit', data: suit });
}
for (const [r, rankInfo] of Object.entries(RANK_DICT)) {
  ALL_ENTRIES.push({ word: r, kind: 'rank', data: rankInfo });
}

/**
 * Breaks a tie between two equally close fuzzy matches.
 * A typo ending in "s" ("kins", "nins") is a plural rank, not a keyword like "kind".
 * Otherwise keywords win over ranks.
 */
function tiePriority(token: string, entry: MatchEntry): number {
  if (token.endsWith('s') && entry.kind === 'rank' && (entry.data as RankInfo).plural) return 2;
  return entry.kind === 'keyword' ? 1 : 0;
}

function matchToken(token: string): MatchEntry | null {
  // Exact match
  for (const entry of ALL_ENTRIES) {
    if (entry.word === token) {
      return entry;
    }
  }

  // Single letter suit if needed
  if (SINGLE_LETTER_SUITS[token]) {
    return { word: token, kind: 'suit', data: SINGLE_LETTER_SUITS[token] };
  }

  // Fuzzy match
  let bestEntry: MatchEntry | null = null;
  let bestDist = Infinity;

  for (const entry of ALL_ENTRIES) {
    const maxLen = Math.max(token.length, entry.word.length);
    let maxAllowed = 0;
    if (maxLen >= 6) {
      maxAllowed = 2;
    } else if (maxLen >= 4) {
      maxAllowed = 1;
    } else {
      maxAllowed = 0;
    }

    if (maxAllowed === 0) continue;

    const dist = damerauLevenshtein(token, entry.word);
    if (dist <= maxAllowed) {
      if (dist < bestDist) {
        bestDist = dist;
        bestEntry = entry;
      } else if (dist === bestDist && bestEntry && tiePriority(token, entry) > tiePriority(token, bestEntry)) {
        bestEntry = entry;
      }
    }
  }

  return bestEntry;
}

/** A typo of "pair" or "pairs", such as "piar" or "pairr". */
function isPairWord(token: string): boolean {
  if (token === 'pair' || token === 'pairs') return true;
  const m = matchToken(token);
  return m !== null && m.kind === 'keyword' && (m.word === 'pair' || m.word === 'pairs');
}

/** A typo of "two" right before "pair", such as "tw", "tow" or "twp". Real rank words do not count. */
function isTwoWord(token: string): boolean {
  if (token === 'two' || token === '2') return true;
  if (RANK_DICT[token] || !/^[a-z][a-z0-9]{1,3}$/.test(token)) return false;
  return damerauLevenshtein(token, 'two') <= 1;
}

/** Joins "<two> <pair>" written with typos ("tw piar") into the single "twopair" token. */
function mergeTwoPairTypos(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i + 1 < tokens.length && isTwoWord(tokens[i]) && isPairWord(tokens[i + 1])) {
      out.push('twopair');
      i++;
    } else {
      out.push(tokens[i]);
    }
  }
  if (!out.includes('twopair')) return out;
  // "two pair ak" or "tp kq": two rank letters written together.
  return out.flatMap((t) =>
    /^[akqjt2-9]{2}$/.test(t) && !RANK_DICT[t] ? [...t].map((c) => (c === 't' ? '10' : c)) : [t],
  );
}

interface TokenItem {
  raw: string;
  matched: string;
  kind: 'keyword' | 'suit' | 'rank';
  data?: unknown;
}

interface RankGroup {
  count: number;
  rank: Rank;
  plural: boolean;
}

export function parseHand(rawInput: string): ParseResult {
  if (!rawInput || !rawInput.trim()) {
    return { ok: false, error: DEFAULT_ERROR, hint: DEFAULT_HINT };
  }

  // 1. Normalize
  let text = rawInput.toLowerCase();
  text = text.replace(/[♥♡]/g, ' hearts ');
  text = text.replace(/[♦♢]/g, ' diamonds ');
  text = text.replace(/[♣♧]/g, ' clubs ');
  text = text.replace(/[♠♤]/g, ' spades ');

  // Normalize "two pair", "2 pair", "double pair", their plurals and shorthands into "twopair".
  // "to"/"too" directly before "pair" is the common typo for "two".
  // Typos of either word ("tw piar") are merged after tokenizing, below.
  text = text.replace(/\b(two|2|double|dbl|to|too)\s*-?\s*pairs?\b/g, 'twopair');
  text = text.replace(/\b(2p|tp|2pr)\b/g, 'twopair');

  // Normalize "one pair", "1 pair" into "pair"
  text = text.replace(/\b(one|1)\s*-?\s*pairs?\b/g, 'pair');

  // Normalize "three/3 of a kind" and "four/4 of a kind"
  text = text.replace(/\b(three|3)\s+of\s+a\s+kind\b/g, 'trips');
  text = text.replace(/\b(four|4)\s+of\s+a\s+kind\b/g, 'quads');

  // Normalize "three/3 of <rank>" and "four/4 of <rank>"
  text = text.replace(/\b(three|3)\s+of\s+(?=[a-z0-9])/g, 'trips ');
  text = text.replace(/\b(four|4)\s+of\s+(?=[a-z0-9])/g, 'quads ');

  // Replace - between ranks with ' to '
  text = text.replace(/([0-9a-z]+)\s*-\s*([0-9a-z]+)/g, (_match, p1, p2) => {
    if ((p1 === 'two' || p1 === '2' || p1 === 'double') && p2 === 'pair') {
      return 'twopair';
    }
    return `${p1} to ${p2}`;
  });

  // Strip other punctuation.
  text = text.replace(/[^a-z0-9\s]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  // 2. Tokenize
  const rawTokens = mergeTwoPairTypos(text.split(' ').filter(Boolean));
  if (rawTokens.length === 0) {
    return { ok: false, error: DEFAULT_ERROR, hint: DEFAULT_HINT };
  }

  const hasFlushContext = rawTokens.some(
    (t) => t === 'flush' || t === 'flsh' || matchToken(t)?.word === 'flush'
  );

  const tokens: TokenItem[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];

    if (t === 'a') {
      const nextToken = rawTokens[i + 1];
      const prevToken = rawTokens[i - 1];
      const isArticle =
        (nextToken !== undefined &&
          (nextToken === 'pair' ||
            nextToken === 'pairs' ||
            nextToken === 'twopair' ||
            nextToken === 'trips' ||
            nextToken === 'triple' ||
            nextToken === 'set' ||
            nextToken === 'quad' ||
            nextToken === 'quads' ||
            // "a full house" is an article, but "a full of k" means Aces full of Kings.
            (nextToken === 'full' && matchToken(rawTokens[i + 2] ?? '')?.word === 'house') ||
            nextToken === 'house' ||
            nextToken === 'boat' ||
            nextToken === 'flush' ||
            nextToken === 'straight' ||
            nextToken === 'royal')) ||
        (prevToken === 'of' && nextToken === 'kind');

      if (isArticle) {
        tokens.push({
          raw: t,
          matched: 'a',
          kind: 'keyword',
        });
      } else {
        tokens.push({
          raw: t,
          matched: 'a',
          kind: 'rank',
          data: { rank: 14, plural: false },
        });
      }
      continue;
    }

    if (SINGLE_LETTER_SUITS[t]) {
      if (hasFlushContext) {
        tokens.push({
          raw: t,
          matched: t,
          kind: 'suit',
          data: SINGLE_LETTER_SUITS[t],
        });
        continue;
      }
    }

    const m = matchToken(t);
    if (m) {
      tokens.push({
        raw: t,
        matched: m.word,
        kind: m.kind,
        data: m.data,
      });
    } else {
      return { ok: false, error: DEFAULT_ERROR, hint: DEFAULT_HINT };
    }
  }

  const recognizedSuits: Suit[] = [];
  const keywordSet = new Set<string>();

  for (let i = 0; i < tokens.length; i++) {
    const item = tokens[i];
    if (item.kind === 'suit') {
      recognizedSuits.push(item.data as Suit);
    } else if (item.kind === 'keyword') {
      keywordSet.add(item.matched);
    }
  }

  // Count words vs rank words:
  // "two", "three", "four" (and digits) followed by another rank token are counts; otherwise they are ranks.
  const hasStraightKeyword =
    keywordSet.has('straight') || keywordSet.has('broadway') || keywordSet.has('wheel');
  const rankTokenCount = tokens.filter((t) => t.kind === 'rank').length;
  const isStraightSequence = hasStraightKeyword || rankTokenCount >= 5;
  // After "two pair", "2 3" and "4 3" name two ranks. Only "two kings two nines" uses counts.
  // "pairs" with two ranks ("pairs of ace and three") also names two pair.
  const isTwoPairContext =
    keywordSet.has('twopair') || keywordSet.has('up') || (keywordSet.has('pairs') && rankTokenCount >= 2);

  const resolvedRankGroups: RankGroup[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const curr = tokens[i];
    const next = tokens[i + 1];

    const isCountCandidate =
      !isStraightSequence &&
      (!isTwoPairContext ||
        (rankTokenCount === 4 &&
          (curr.matched === '2' || curr.matched === 'two') &&
          next?.kind === 'rank' &&
          (next.data as RankInfo).plural)) &&
      (curr.matched === '2' ||
        curr.matched === 'two' ||
        curr.matched === '3' ||
        curr.matched === 'three' ||
        curr.matched === '4' ||
        curr.matched === 'four') &&
      next &&
      next.kind === 'rank';

    if (isCountCandidate) {
      let count = 1;
      if (curr.matched === '2' || curr.matched === 'two') count = 2;
      if (curr.matched === '3' || curr.matched === 'three') count = 3;
      if (curr.matched === '4' || curr.matched === 'four') count = 4;

      const rInfo = next.data as RankInfo;
      resolvedRankGroups.push({
        count,
        rank: rInfo.rank,
        plural: rInfo.plural,
      });
      i++; // skip next
    } else if (curr.kind === 'rank') {
      const rInfo = curr.data as RankInfo;
      resolvedRankGroups.push({
        count: 1,
        rank: rInfo.rank,
        plural: rInfo.plural,
      });
    }
  }

  // Helper for straight range extraction
  function extractStraight(): { ok: true; top: StraightTop } | { ok: false; error: string; hint: string } {
    const ranks = resolvedRankGroups.map((g) => g.rank);

    // 1. Five consecutive ranks (e.g. "straight 5 6 7 8 9")
    if (ranks.length === 5) {
      const sorted = [...ranks].sort((a, b) => a - b);
      if (sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5 && sorted[4] === 14) {
        return { ok: true, top: 5 };
      }
      let isConsecutive = true;
      for (let i = 1; i < 5; i++) {
        if (sorted[i] !== sorted[0] + i) {
          isConsecutive = false;
          break;
        }
      }
      if (isConsecutive && sorted[4] >= 5 && sorted[4] <= 14) {
        return { ok: true, top: sorted[4] as StraightTop };
      }
      return { ok: false, error: 'Invalid straight range', hint: 'Straight must span 5 consecutive ranks' };
    }

    if (ranks.length > 2) {
      return { ok: false, error: 'Invalid straight range', hint: 'Straight must span 5 ranks, e.g. 5 to 9' };
    }

    // Check X high: rank immediately before 'high'
    const highIndex = tokens.findIndex((t) => t.matched === 'high');
    if (highIndex > 0) {
      const before = tokens.slice(0, highIndex).reverse().find((t) => t.kind === 'rank');
      if (before) {
        const top = (before.data as RankInfo).rank;
        if (top >= 5 && top <= 14) {
          return { ok: true, top: top as StraightTop };
        }
        return { ok: false, error: 'Invalid straight top', hint: 'Straight top card must be between 5 and Ace' };
      }
    }

    // Bare "high straight" or "broadway"
    if (keywordSet.has('broadway') || (keywordSet.has('high') && keywordSet.has('straight') && !keywordSet.has('low'))) {
      return { ok: true, top: 14 };
    }
    if (keywordSet.has('wheel') || (keywordSet.has('low') && keywordSet.has('straight'))) {
      return { ok: true, top: 5 };
    }

    // X to Y
    const toIndex = tokens.findIndex((t) => t.matched === 'to' || t.matched === 'through' || t.matched === 'thru');
    if (toIndex > 0 && toIndex < tokens.length - 1) {
      const left = tokens.slice(0, toIndex).reverse().find((t) => t.kind === 'rank');
      const right = tokens.slice(toIndex + 1).find((t) => t.kind === 'rank');
      if (left && right) {
        const r1 = (left.data as RankInfo).rank;
        const r2 = (right.data as RankInfo).rank;
        const spanRanks = [r1, r2].sort((a, b) => a - b);
        if (spanRanks[0] === 2 && spanRanks[1] === 14) {
          return { ok: false, error: 'Invalid straight range', hint: 'Straight must span 5 ranks, e.g. Ace to 5 or 5 to 9' };
        }
        if (spanRanks[0] === 5 && spanRanks[1] === 14) {
          return { ok: true, top: 5 };
        }
        if (spanRanks[1] - spanRanks[0] === 4) {
          return { ok: true, top: spanRanks[1] as StraightTop };
        }
        return { ok: false, error: 'Invalid straight range', hint: 'Straight must span 5 ranks, e.g. 5 to 9' };
      }
    }

    // starting at X / from X / start X
    const startIndex = tokens.findIndex(
      (t) => t.matched === 'starting' || t.matched === 'start' || t.matched === 'starts' || t.matched === 'from'
    );
    if (startIndex !== -1) {
      const after = tokens.slice(startIndex + 1).find((t) => t.kind === 'rank');
      if (after) {
        const low = (after.data as RankInfo).rank;
        if (low === 14) {
          return { ok: true, top: 5 };
        }
        if (low >= 2 && low <= 10) {
          return { ok: true, top: (low + 4) as StraightTop };
        }
        return { ok: false, error: 'Invalid straight range', hint: 'Straight starting card cannot be higher than 10' };
      }
    }

    // ending at X / ends at X
    const endIndex = tokens.findIndex((t) => t.matched === 'ending' || t.matched === 'ends');
    if (endIndex !== -1) {
      const after = tokens.slice(endIndex + 1).find((t) => t.kind === 'rank');
      if (after) {
        const top = (after.data as RankInfo).rank;
        if (top >= 5 && top <= 14) {
          return { ok: true, top: top as StraightTop };
        }
        return { ok: false, error: 'Invalid straight top', hint: 'Straight top card must be between 5 and Ace' };
      }
    }

    // to X alone (e.g. straight to ace)
    if (toIndex !== -1) {
      const after = tokens.slice(toIndex + 1).find((t) => t.kind === 'rank');
      if (after) {
        const top = (after.data as RankInfo).rank;
        if (top >= 5 && top <= 14) {
          return { ok: true, top: top as StraightTop };
        }
      }
    }

    // Two ranks alone with straight (e.g. "straight 3 7")
    if (ranks.length === 2) {
      const sorted = [...ranks].sort((a, b) => a - b);
      if (sorted[0] === 5 && sorted[1] === 14) {
        return { ok: true, top: 5 };
      }
      if (sorted[1] - sorted[0] === 4) {
        return { ok: true, top: sorted[1] as StraightTop };
      }
      return { ok: false, error: 'Invalid straight range', hint: 'Straight must span 5 ranks, e.g. 5 to 9' };
    }

    // Bare "straight 9" is ambiguous
    if (ranks.length === 1) {
      const r = ranks[0];
      const rWord = r === 14 ? 'Ace' : String(r);
      return {
        ok: false,
        error: 'Ambiguous straight',
        hint: `Say Straight, 5 to 9 or ${rWord} high straight`,
      };
    }

    return { ok: false, error: 'Incomplete straight', hint: 'Say Straight, 5 to 9 or 9 high straight' };
  }

  // DECISION RULES IN PRIORITY ORDER

  // 1. royal (with or without flush) -> Royal Flush
  if (keywordSet.has('royal')) {
    if (
      resolvedRankGroups.length > 0 ||
      keywordSet.has('pair') ||
      keywordSet.has('pairs') ||
      keywordSet.has('twopair') ||
      keywordSet.has('trips') ||
      keywordSet.has('triple') ||
      keywordSet.has('set') ||
      keywordSet.has('quad') ||
      keywordSet.has('quads') ||
      keywordSet.has('full') ||
      keywordSet.has('house') ||
      keywordSet.has('boat')
    ) {
      return { ok: false, error: 'Conflicting keywords with royal flush', hint: 'Say Royal Flush' };
    }
    const hand: Hand = { kind: 'royalFlush' };
    return { ok: true, hand, normal: normalForm(hand) };
  }

  // 2. straight and flush both present -> Straight Flush with range extraction
  if (keywordSet.has('straight') && keywordSet.has('flush')) {
    if (
      keywordSet.has('pair') ||
      keywordSet.has('pairs') ||
      keywordSet.has('twopair') ||
      keywordSet.has('trips') ||
      keywordSet.has('triple') ||
      keywordSet.has('set') ||
      keywordSet.has('quad') ||
      keywordSet.has('quads') ||
      keywordSet.has('full') ||
      keywordSet.has('house') ||
      keywordSet.has('boat')
    ) {
      return { ok: false, error: 'Conflicting keywords with straight flush', hint: 'Say Straight Flush, 5 to 9' };
    }
    const sResult = extractStraight();
    if (!sResult.ok) {
      return sResult;
    }
    if (sResult.top === 14) {
      const hand: Hand = { kind: 'royalFlush' };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    const hand: Hand = { kind: 'straightFlush', top: sResult.top as StraightFlushTop };
    return { ok: true, hand, normal: normalForm(hand) };
  }

  // 3. flush with a suit -> Flush of that suit
  if (keywordSet.has('flush')) {
    if (
      resolvedRankGroups.length > 0 ||
      keywordSet.has('pair') ||
      keywordSet.has('pairs') ||
      keywordSet.has('twopair') ||
      keywordSet.has('trips') ||
      keywordSet.has('triple') ||
      keywordSet.has('set') ||
      keywordSet.has('quad') ||
      keywordSet.has('quads') ||
      keywordSet.has('full') ||
      keywordSet.has('house') ||
      keywordSet.has('boat') ||
      keywordSet.has('straight')
    ) {
      return { ok: false, error: 'Unexplained tokens with flush', hint: 'Say Flush of Hearts' };
    }
    if (recognizedSuits.length > 0) {
      const hand: Hand = { kind: 'flush', suit: recognizedSuits[0] };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    return { ok: false, error: 'Flush needs a suit', hint: 'Name a suit, e.g. Flush of Hearts' };
  }

  // 4. Full house: full house, boat, X full of Y, X over Y, or trips descriptor + pair descriptor
  const hasFullHouseKeyword =
    keywordSet.has('full') || keywordSet.has('house') || keywordSet.has('boat');
  const hasOverKeyword = keywordSet.has('over');

  const count3 = resolvedRankGroups.find((g) => g.count === 3);
  const count2 = resolvedRankGroups.find((g) => g.count === 2);

  let tripsRank: Rank | null = count3 ? count3.rank : null;
  let pairRank: Rank | null = count2 ? count2.rank : null;

  const FILLERS = new Set(['of', 'a', 'the', 'and', 'with', 'in', 'on', 'o']);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'rank') {
      const r = (t.data as RankInfo).rank;

      let prevKw: string | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (FILLERS.has(tokens[j].matched)) continue;
        if (tokens[j].kind === 'keyword') {
          prevKw = tokens[j].matched;
        }
        break;
      }

      let nextKw: string | null = null;
      for (let j = i + 1; j < tokens.length; j++) {
        if (FILLERS.has(tokens[j].matched)) continue;
        if (tokens[j].kind === 'keyword') {
          nextKw = tokens[j].matched;
        }
        break;
      }

      const isTrips =
        prevKw === 'trips' || prevKw === 'triple' || prevKw === 'set' ||
        nextKw === 'trips' || nextKw === 'triple' || nextKw === 'set';

      const isPair =
        prevKw === 'pair' || prevKw === 'pairs' ||
        nextKw === 'pair' || nextKw === 'pairs';

      if (isTrips && tripsRank === null) {
        tripsRank = r;
      }
      if (isPair && pairRank === null && r !== tripsRank) {
        pairRank = r;
      }
    }
  }

  // "Two pair, Kings over Nines" is two pair, not a full house.
  const isNamedTwoPair = isTwoPairContext && !hasFullHouseKeyword;

  if (!isNamedTwoPair && tripsRank !== null && pairRank !== null) {
    if (tripsRank === pairRank) {
      return { ok: false, error: 'Invalid full house', hint: 'Trips and pair ranks must be different' };
    }
    if (resolvedRankGroups.length > 2) {
      return { ok: false, error: 'Too many ranks for full house', hint: 'Full house needs exactly two ranks' };
    }
    const hand: Hand = { kind: 'fullHouse', trips: tripsRank, pair: pairRank };
    return { ok: true, hand, normal: normalForm(hand) };
  }

  if (hasFullHouseKeyword || (hasOverKeyword && !isNamedTwoPair)) {
    const ranks = resolvedRankGroups.map((g) => g.rank);
    if (ranks.length === 2) {
      if (ranks[0] === ranks[1]) {
        return { ok: false, error: 'Invalid full house', hint: 'Trips and pair ranks must be different' };
      }
      const hand: Hand = { kind: 'fullHouse', trips: ranks[0], pair: ranks[1] };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    if (ranks.length > 2) {
      return { ok: false, error: 'Too many ranks for full house', hint: 'Full house needs exactly two ranks' };
    }
    return {
      ok: false,
      error: 'Incomplete full house',
      hint: 'Full house needs both ranks, e.g. Nines full of Aces',
    };
  }

  // 5. Straight alone
  if (keywordSet.has('straight') || keywordSet.has('broadway') || keywordSet.has('wheel') || resolvedRankGroups.length === 5) {
    if (
      keywordSet.has('pair') ||
      keywordSet.has('pairs') ||
      keywordSet.has('twopair') ||
      keywordSet.has('trips') ||
      keywordSet.has('triple') ||
      keywordSet.has('set') ||
      keywordSet.has('quad') ||
      keywordSet.has('quads') ||
      keywordSet.has('full') ||
      keywordSet.has('house') ||
      keywordSet.has('boat')
    ) {
      return { ok: false, error: 'Conflicting keywords with straight', hint: 'Say Straight, 5 to 9' };
    }
    const sResult = extractStraight();
    if (!sResult.ok) {
      return sResult;
    }
    const hand: Hand = { kind: 'straight', top: sResult.top };
    return { ok: true, hand, normal: normalForm(hand) };
  }

  // 6. four / quad / quads + rank -> Quads
  const hasQuadsKeyword =
    keywordSet.has('four') ||
    keywordSet.has('quad') ||
    keywordSet.has('quads') ||
    resolvedRankGroups.some((g) => g.count === 4);

  if (hasQuadsKeyword) {
    if (
      keywordSet.has('pair') ||
      keywordSet.has('pairs') ||
      keywordSet.has('twopair') ||
      keywordSet.has('trips') ||
      keywordSet.has('triple') ||
      keywordSet.has('set') ||
      keywordSet.has('full') ||
      keywordSet.has('house') ||
      keywordSet.has('boat')
    ) {
      return { ok: false, error: 'Conflicting keywords with four of a kind', hint: 'Say Four Kings' };
    }
    if (resolvedRankGroups.length > 1) {
      return { ok: false, error: 'Unexplained extra ranks with four of a kind', hint: 'Say Four Kings' };
    }
    const targetGroup = resolvedRankGroups.find((g) => g.count === 4) || resolvedRankGroups[0];
    if (targetGroup) {
      const hand: Hand = { kind: 'quads', rank: targetGroup.rank };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    return { ok: false, error: 'Incomplete four of a kind', hint: 'Name a rank, e.g. Four Kings' };
  }

  // 7. three / trips / triple / set + rank -> Trips
  const hasTripsKeyword =
    keywordSet.has('trips') ||
    keywordSet.has('triple') ||
    keywordSet.has('set') ||
    resolvedRankGroups.some((g) => g.count === 3);

  if (hasTripsKeyword) {
    if (
      keywordSet.has('pair') ||
      keywordSet.has('pairs') ||
      keywordSet.has('twopair') ||
      keywordSet.has('full') ||
      keywordSet.has('house') ||
      keywordSet.has('boat')
    ) {
      return { ok: false, error: 'Conflicting keywords with three of a kind', hint: 'Say Three Queens' };
    }
    if (resolvedRankGroups.length > 1) {
      return { ok: false, error: 'Unexplained extra ranks with three of a kind', hint: 'Say Three Queens' };
    }
    const targetGroup = resolvedRankGroups.find((g) => g.count === 3) || resolvedRankGroups[0];
    if (targetGroup) {
      const hand: Hand = { kind: 'trips', rank: targetGroup.rank };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    return { ok: false, error: 'Incomplete three of a kind', hint: 'Name a rank, e.g. Three Queens' };
  }

  // 8. Two pair: two pair X Y, two pair X and Y, X and Y (two distinct plural ranks), two X two Y
  const hasTwoPairKeyword = isTwoPairContext;
  const countsOfTwo = resolvedRankGroups.filter((g) => g.count === 2);
  const pairWordCount = tokens.filter((t) => t.matched === 'pair' || t.matched === 'pairs').length;

  // "Aces and Kings", "pair of Aces and Kings", "pair of Aces and pair of Kings".
  const isTwoDistinctPluralRanks =
    resolvedRankGroups.length === 2 &&
    (pairWordCount >= 2 || (resolvedRankGroups[0].plural && resolvedRankGroups[1].plural));

  if (hasTwoPairKeyword || countsOfTwo.length >= 2 || isTwoDistinctPluralRanks) {
    const ranks = resolvedRankGroups.map((g) => g.rank);
    if (ranks.length === 2) {
      if (ranks[0] === ranks[1]) {
        return { ok: false, error: 'Duplicate rank in two pair', hint: 'Two pair must have two distinct ranks' };
      }
      const high = Math.max(ranks[0], ranks[1]) as Rank;
      const low = Math.min(ranks[0], ranks[1]) as Rank;
      const hand: Hand = { kind: 'twoPair', high, low };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    if (ranks.length > 2) {
      return { ok: false, error: 'Too many ranks for two pair', hint: 'Two pair must have two distinct ranks' };
    }
    if (hasTwoPairKeyword && ranks.length < 2) {
      return { ok: false, error: 'Incomplete two pair', hint: 'Two pair needs two ranks, e.g. Aces and Kings' };
    }
  }

  // 9. Pair: pair of X, pair X, X pair, two X, a single plural rank alone (9s, nines). high pair -> Pair of Aces, low pair -> Pair of Twos
  const hasPairKeyword =
    keywordSet.has('pair') ||
    keywordSet.has('pairs') ||
    countsOfTwo.length === 1;

  const isSinglePluralRank =
    resolvedRankGroups.length === 1 && resolvedRankGroups[0].plural;

  if (hasPairKeyword || isSinglePluralRank) {
    if (keywordSet.has('high') && resolvedRankGroups.length === 0) {
      const hand: Hand = { kind: 'pair', rank: 14 };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    if (keywordSet.has('low') && resolvedRankGroups.length === 0) {
      const hand: Hand = { kind: 'pair', rank: 2 };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    if (resolvedRankGroups.length > 1) {
      return { ok: false, error: 'Unexplained extra ranks for pair', hint: 'Say Pair of Queens or Two Pair' };
    }
    const target = resolvedRankGroups[0];
    if (target) {
      const hand: Hand = { kind: 'pair', rank: target.rank };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    return { ok: false, error: 'Incomplete pair', hint: 'Say Pair of Queens' };
  }

  // 10. High card: X high, high card X, a single singular rank alone (ace, king)
  const hasHighKeyword = keywordSet.has('high') || keywordSet.has('card');
  const isSingleSingularRank =
    resolvedRankGroups.length === 1 && !resolvedRankGroups[0].plural;

  if (hasHighKeyword || isSingleSingularRank) {
    if (resolvedRankGroups.length > 1) {
      return { ok: false, error: 'Unexplained extra ranks for high card', hint: 'Say Ace High' };
    }
    const target = resolvedRankGroups[0];
    if (target) {
      const hand: Hand = { kind: 'high', rank: target.rank };
      return { ok: true, hand, normal: normalForm(hand) };
    }
    return { ok: false, error: 'Incomplete high card', hint: 'Say Ace High' };
  }

  return { ok: false, error: DEFAULT_ERROR, hint: DEFAULT_HINT };
}
