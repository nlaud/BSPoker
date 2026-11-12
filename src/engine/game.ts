import { Card, createDeck, shuffleDeck, defaultRng } from './cards';
import { Hand, compareHands, normalForm, Rules, DEFAULT_RULES } from './hands';
import { handExists } from './exists';

export interface PlayerState {
  id: string;
  token: string;
  name: string;
  seatIndex: number;
  cardCount: number;
  eliminated: boolean;
  connected: boolean;
  ready: boolean;
  peeking: boolean;
  isSpectator: boolean;
}

export interface RevealState {
  callerId: string;
  calledHand: Hand;
  claimedByPlayerId: string;
  exists: boolean;
  matchingCards: Card[];
  loserId: string;
  loserEliminated: boolean;
  revealOrder: string[];
  revealIndex: number;
  verdictActive: boolean;
}

export interface GameState {
  lobbyCode: string;
  hostPlayerId: string;
  players: PlayerState[];
  phase: 'lobby' | 'bidding' | 'reveal' | 'gameOver';
  round: number;
  /** Increments on every deal for the lifetime of the lobby (never resets), so clients can tell a fresh deal from a reconnect. */
  dealSeq: number;
  hands: Record<string, Card[]>;
  communityCards: Card[];
  turnPlayerId: string | null;
  currentCall: { hand: Hand; byPlayerId: string } | null;
  lastBsCallerId: string | null;
  revealData: RevealState | null;
  roundStarterId: string | null;
  winnerId: string | null;
  countdownDeadline: number | null;
  log: string[];
  settings: Rules;
}

export type GameAction =
  | { type: 'join'; token: string; name: string; playerId?: string }
  | { type: 'setReady'; playerId: string; ready: boolean; now?: number }
  | { type: 'startCountdown'; deadline: number }
  | { type: 'cancelCountdown' }
  | { type: 'startGame'; rng?: () => number }
  | { type: 'call'; playerId: string; hand: Hand }
  | { type: 'bs'; playerId: string }
  | { type: 'revealStep' }
  | { type: 'showVerdict' }
  | { type: 'resolveReveal'; rng?: () => number }
  | { type: 'peek'; playerId: string; peeking: boolean }
  | { type: 'leave'; playerId: string; rng?: () => number }
  | { type: 'kick'; playerId: string; rng?: () => number }
  | { type: 'setConnected'; playerId: string; connected: boolean }
  | { type: 'cleanDisconnectedInLobby'; playerId: string }
  | { type: 'playAgain' }
  | { type: 'setRule'; playerId: string; rule: 'straightBeatsFlush'; value: boolean };

export function createInitialState(lobbyCode: string, hostPlayerId: string): GameState {
  return {
    lobbyCode: lobbyCode.toUpperCase(),
    hostPlayerId,
    players: [],
    phase: 'lobby',
    round: 0,
    dealSeq: 0,
    hands: {},
    communityCards: [],
    turnPlayerId: null,
    currentCall: null,
    lastBsCallerId: null,
    revealData: null,
    roundStarterId: null,
    winnerId: null,
    countdownDeadline: null,
    log: [],
    settings: { ...DEFAULT_RULES },
  };
}

function appendLog(state: GameState, entry: string): void {
  state.log.push(entry);
  if (state.log.length > 300) {
    state.log = state.log.slice(state.log.length - 300);
  }
}

function normalizePlayerName(name: string, existingNames: string[]): string {
  let clean = name.trim().slice(0, 16);
  if (!clean) clean = 'Player';

  if (!existingNames.includes(clean)) {
    return clean;
  }

  let counter = 2;
  while (existingNames.includes(`${clean} ${counter}`)) {
    counter++;
  }
  return `${clean} ${counter}`;
}

export function getAlivePlayers(state: GameState): PlayerState[] {
  return state.players
    .filter((p) => !p.eliminated && !p.isSpectator)
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

function findNextAlivePlayer(state: GameState, fromSeatIndex: number): PlayerState | null {
  const alive = getAlivePlayers(state);
  if (alive.length === 0) return null;

  for (let i = 1; i <= 8; i++) {
    const nextSeat = (fromSeatIndex + i) % 8;
    const match = alive.find((p) => p.seatIndex === nextSeat);
    if (match) return match;
  }
  return alive[0];
}

/** Verdict headings, shared by the log and the full-screen verdict. */
export const VERDICT_HAD_IT = "Never didn't have it";
export const VERDICT_BS = 'BS!';

export function dealRound(
  state: GameState,
  starterId: string,
  rng: () => number = defaultRng
): void {
  const alive = getAlivePlayers(state);
  const deck = shuffleDeck(createDeck(), rng);
  state.dealSeq = (state.dealSeq ?? 0) + 1;

  let deckIdx = 0;
  const newHands: Record<string, Card[]> = {};

  for (const p of alive) {
    const count = p.cardCount;
    const cards = deck.slice(deckIdx, deckIdx + count);
    deckIdx += count;
    newHands[p.id] = cards;
  }

  const community = deck.slice(deckIdx, deckIdx + 2);
  deckIdx += 2;

  state.hands = newHands;
  state.communityCards = community;
  state.turnPlayerId = starterId;
  state.roundStarterId = starterId;
  state.currentCall = null;
  state.lastBsCallerId = null;
  state.revealData = null;
  state.phase = 'bidding';

  const starter = state.players.find((p) => p.id === starterId);
  const starterName = starter ? starter.name : 'Unknown';
  appendLog(state, `Round ${state.round} · ${starterName} starts`);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  const nextState: GameState = {
    ...state,
    settings: state.settings ? { ...state.settings } : { ...DEFAULT_RULES },
    players: state.players.map((p) => ({ ...p })),
    hands: { ...state.hands },
    communityCards: [...state.communityCards],
    log: [...state.log],
    revealData: state.revealData
      ? {
          ...state.revealData,
          matchingCards: [...state.revealData.matchingCards],
          revealOrder: [...state.revealData.revealOrder],
        }
      : null,
  };

  switch (action.type) {
    case 'join': {
      const existing = nextState.players.find((p) => p.token === action.token);
      if (existing) {
        // Rejoin (refresh or reconnect): the seat keeps its original name. The
        // name a client remembers is shared by every tab of a browser, so it
        // must never rename an existing player (or bypass duplicate-name rules).
        existing.connected = true;
        return nextState;
      }

      const existingNames = nextState.players.map((p) => p.name);
      const name = normalizePlayerName(action.name, existingNames);
      const id = action.playerId || `p-${Math.random().toString(36).slice(2, 9)}`;

      const seated = nextState.players.filter((p) => !p.isSpectator);
      const canSeat = nextState.phase === 'lobby' && seated.length < 8;

      if (canSeat) {
        const takenSeats = new Set(seated.map((p) => p.seatIndex));
        let seat = 0;
        while (takenSeats.has(seat)) {
          seat++;
        }

        nextState.players.push({
          id,
          token: action.token,
          name,
          seatIndex: seat,
          cardCount: 2,
          eliminated: false,
          connected: true,
          ready: false,
          peeking: false,
          isSpectator: false,
        });

        // Any join cancels countdown
        nextState.countdownDeadline = null;
      } else {
        nextState.players.push({
          id,
          token: action.token,
          name,
          seatIndex: -1,
          cardCount: 0,
          eliminated: false,
          connected: true,
          ready: false,
          peeking: false,
          isSpectator: true,
        });
      }

      return nextState;
    }

    case 'setReady': {
      if (nextState.phase !== 'lobby') return nextState;
      const player = nextState.players.find((p) => p.id === action.playerId);
      if (!player || player.isSpectator) return nextState;

      player.ready = action.ready;

      const seated = nextState.players.filter((p) => !p.isSpectator);
      const allReady = seated.length >= 2 && seated.every((p) => p.ready);

      if (allReady) {
        const now = action.now ?? Date.now();
        nextState.countdownDeadline = now + 3000;
      } else {
        nextState.countdownDeadline = null;
      }

      return nextState;
    }

    case 'startCountdown': {
      nextState.countdownDeadline = action.deadline;
      return nextState;
    }

    case 'cancelCountdown': {
      nextState.countdownDeadline = null;
      return nextState;
    }

    case 'startGame': {
      if (nextState.phase !== 'lobby') return nextState;
      const seated = nextState.players.filter((p) => !p.isSpectator);
      if (seated.length < 2 || !seated.every((p) => p.ready)) return nextState;

      nextState.round = 1;
      nextState.countdownDeadline = null;

      // Pick starter randomly
      const rng = action.rng || defaultRng;
      const starterIdx = Math.floor(rng() * seated.length);
      const starter = seated[starterIdx];

      dealRound(nextState, starter.id, rng);
      return nextState;
    }

    case 'call': {
      if (nextState.phase !== 'bidding') return nextState;
      if (nextState.turnPlayerId !== action.playerId) return nextState;

      const caller = nextState.players.find((p) => p.id === action.playerId);
      if (!caller || caller.eliminated) return nextState;

      // Validate hand > currentCall
      if (nextState.currentCall) {
        if (compareHands(action.hand, nextState.currentCall.hand, nextState.settings) <= 0) {
          return nextState;
        }
      }

      nextState.currentCall = {
        hand: action.hand,
        byPlayerId: action.playerId,
      };

      appendLog(nextState, `${caller.name}: ${normalForm(action.hand)}`);

      // Advance turn clockwise
      const nextPlayer = findNextAlivePlayer(nextState, caller.seatIndex);
      if (nextPlayer) {
        nextState.turnPlayerId = nextPlayer.id;
      }

      return nextState;
    }

    case 'bs': {
      if (nextState.phase !== 'bidding') return nextState;
      if (nextState.turnPlayerId !== action.playerId) return nextState;
      if (!nextState.currentCall) return nextState;

      const bsCaller = nextState.players.find((p) => p.id === action.playerId);
      const claimer = nextState.players.find((p) => p.id === nextState.currentCall?.byPlayerId);
      if (!bsCaller || !claimer) return nextState;

      // Evaluate existence across all hands + community
      const allDealtCards: Card[] = [
        ...nextState.communityCards,
        ...Object.values(nextState.hands).flat(),
      ];

      const { exists, matchingCards } = handExists(nextState.currentCall.hand, allDealtCards);

      const loser = exists ? bsCaller : claimer;
      const loserEliminated = loser.cardCount >= 5;

      // Reveal order: bsCaller first, then clockwise through alive players
      const alive = getAlivePlayers(nextState);
      const revealOrder: string[] = [bsCaller.id];

      for (let i = 1; i <= 8; i++) {
        const nextSeat = (bsCaller.seatIndex + i) % 8;
        const p = alive.find((a) => a.seatIndex === nextSeat && a.id !== bsCaller.id);
        if (p) {
          revealOrder.push(p.id);
        }
      }

      appendLog(
        nextState,
        `${bsCaller.name} called BS on ${claimer.name}'s ${normalForm(nextState.currentCall.hand)}`
      );

      nextState.phase = 'reveal';
      nextState.lastBsCallerId = bsCaller.id;
      nextState.revealData = {
        callerId: bsCaller.id,
        calledHand: nextState.currentCall.hand,
        claimedByPlayerId: claimer.id,
        exists,
        matchingCards,
        loserId: loser.id,
        loserEliminated,
        revealOrder,
        revealIndex: 0,
        verdictActive: false,
      };

      return nextState;
    }

    case 'revealStep': {
      if (nextState.phase !== 'reveal' || !nextState.revealData) return nextState;
      nextState.revealData.revealIndex += 1;
      return nextState;
    }

    case 'showVerdict': {
      if (nextState.phase !== 'reveal' || !nextState.revealData) return nextState;
      nextState.revealData.verdictActive = true;
      return nextState;
    }

    case 'resolveReveal': {
      if (nextState.phase !== 'reveal' || !nextState.revealData) return nextState;
      const { exists, loserId } = nextState.revealData;
      const loser = nextState.players.find((p) => p.id === loserId);

      if (loser) {
        const verdict = exists ? VERDICT_HAD_IT : VERDICT_BS;
        if (loser.cardCount >= 5) {
          loser.eliminated = true;
          loser.cardCount = 0;
          appendLog(nextState, `${verdict} - ${loser.name} is out`);
        } else {
          loser.cardCount += 1;
          appendLog(nextState, `${verdict} - ${loser.name} gets a card (${loser.cardCount})`);
        }
      }

      // Check remaining alive players
      const alive = getAlivePlayers(nextState);
      if (alive.length === 1) {
        nextState.phase = 'gameOver';
        nextState.winnerId = alive[0].id;
        appendLog(nextState, `${alive[0].name} wins!`);
        return nextState;
      }

      // Next round starter:
      // "Every later round: whoever called BS in the previous round starts. If that player was just eliminated, the next alive player clockwise from them starts."
      const lastBsCaller = nextState.players.find((p) => p.id === nextState.lastBsCallerId);
      let starter: PlayerState | null = null;
      if (lastBsCaller && !lastBsCaller.eliminated && !lastBsCaller.isSpectator) {
        starter = lastBsCaller;
      } else if (lastBsCaller) {
        starter = findNextAlivePlayer(nextState, lastBsCaller.seatIndex);
      } else {
        starter = alive[0];
      }

      if (!starter) starter = alive[0];

      nextState.round += 1;
      dealRound(nextState, starter.id, action.rng || defaultRng);
      return nextState;
    }

    case 'peek': {
      const player = nextState.players.find((p) => p.id === action.playerId);
      if (player && !player.eliminated && !player.isSpectator) {
        player.peeking = action.peeking;
      }
      return nextState;
    }

    case 'leave':
    case 'kick': {
      const player = nextState.players.find((p) => p.id === action.playerId);
      if (!player) return nextState;

      const isKick = action.type === 'kick';
      const actionVerb = isKick ? 'removed' : 'left';

      if (nextState.phase === 'lobby') {
        nextState.players = nextState.players.filter((p) => p.id !== action.playerId);
        // Cancel countdown
        nextState.countdownDeadline = null;
        return nextState;
      }

      // Mid-game
      if (player.isSpectator || player.eliminated) {
        player.connected = false;
        return nextState;
      }

      // Player was alive
      player.eliminated = true;
      player.connected = false;

      const remainingAlive = getAlivePlayers(nextState);
      if (remainingAlive.length <= 1) {
        nextState.phase = 'gameOver';
        nextState.winnerId = remainingAlive[0] ? remainingAlive[0].id : null;
        if (remainingAlive[0]) {
          appendLog(nextState, `${remainingAlive[0].name} wins!`);
        }
        return nextState;
      }

      // Round voided and redealt
      appendLog(nextState, `${player.name} ${actionVerb} - round restarted`);

      // "new round starts with the original starter if still alive, else the next alive clockwise"
      const originalStarter = nextState.players.find((p) => p.id === nextState.roundStarterId);
      let starter: PlayerState | null = null;
      if (originalStarter && !originalStarter.eliminated && !originalStarter.isSpectator) {
        starter = originalStarter;
      } else if (originalStarter) {
        starter = findNextAlivePlayer(nextState, originalStarter.seatIndex);
      } else {
        starter = remainingAlive[0];
      }

      if (!starter) starter = remainingAlive[0];

      dealRound(nextState, starter.id, action.rng || defaultRng);
      return nextState;
    }

    case 'setConnected': {
      const player = nextState.players.find((p) => p.id === action.playerId);
      if (player) {
        player.connected = action.connected;
      }
      return nextState;
    }

    case 'cleanDisconnectedInLobby': {
      if (nextState.phase === 'lobby') {
        nextState.players = nextState.players.filter(
          (p) => p.id !== action.playerId || p.connected
        );
      }
      return nextState;
    }

    case 'setRule': {
      if (nextState.phase !== 'lobby') return nextState;
      if (action.playerId !== nextState.hostPlayerId) return nextState;

      if (action.rule === 'straightBeatsFlush') {
        // Re-sending the current value changes nothing (and must not un-ready anyone).
        if (nextState.settings.straightBeatsFlush === action.value) return nextState;
        nextState.settings.straightBeatsFlush = action.value;
        for (const p of nextState.players) {
          p.ready = false;
        }
        nextState.countdownDeadline = null;
        appendLog(nextState, `Rule: Straight beats flush ${action.value ? 'on' : 'off'}`);
      }
      return nextState;
    }

    case 'playAgain': {
      if (nextState.phase !== 'gameOver') return nextState;

      nextState.phase = 'lobby';
      nextState.round = 0;
      nextState.hands = {};
      nextState.communityCards = [];
      nextState.turnPlayerId = null;
      nextState.currentCall = null;
      nextState.lastBsCallerId = null;
      nextState.revealData = null;
      nextState.roundStarterId = null;
      nextState.winnerId = null;
      nextState.countdownDeadline = null;

      // Reset players
      for (const p of nextState.players) {
        p.ready = false;
        p.peeking = false;
        if (!p.isSpectator) {
          p.cardCount = 2;
          p.eliminated = false;
        }
      }

      // Waiting spectators get seated up to 8
      const seated = nextState.players.filter((p) => !p.isSpectator);
      const spectators = nextState.players.filter((p) => p.isSpectator);

      for (const spec of spectators) {
        if (seated.length < 8) {
          const takenSeats = new Set(seated.map((p) => p.seatIndex));
          let seat = 0;
          while (takenSeats.has(seat)) {
            seat++;
          }
          spec.isSpectator = false;
          spec.seatIndex = seat;
          spec.cardCount = 2;
          spec.eliminated = false;
          spec.ready = false;
          seated.push(spec);
        }
      }

      appendLog(nextState, 'New game ready');
      return nextState;
    }
  }
}
