import { GameState, PlayerState, DEFAULT_SETTINGS } from './game';
import { PlayerView, PlayerPublic, RevealViewData } from './protocol';
import { Card } from './cards';

function toPublic(p: PlayerState): PlayerPublic {
  return {
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex,
    cardCount: p.cardCount,
    eliminated: p.eliminated,
    connected: p.connected,
    ready: p.ready,
    peeking: p.peeking,
    isSpectator: p.isSpectator,
  };
}

export function redact(state: GameState, viewerId: string | null): PlayerView {
  const isHost = viewerId === state.hostPlayerId;
  const isRevealOrOver = state.phase === 'reveal' || state.phase === 'gameOver';

  const seatedPlayers = state.players.filter((p) => !p.isSpectator);
  const spectators = state.players.filter((p) => p.isSpectator);

  const cardCounts: Record<string, number> = {};
  for (const p of state.players) {
    cardCounts[p.id] = p.cardCount;
  }

  const myCards = viewerId && state.hands[viewerId] ? [...state.hands[viewerId]] : [];

  // During the reveal, hands are exposed one at a time in revealOrder (the BS
  // caller first, then clockwise). revealIndex is advanced by the host every
  // 600 ms; the hand at revealOrder[0] is visible from the moment BS is called.
  const revealedPlayerIds: string[] =
    state.phase === 'gameOver'
      ? Object.keys(state.hands)
      : state.phase === 'reveal' && state.revealData
        ? state.revealData.revealOrder.slice(0, state.revealData.revealIndex + 1)
        : [];
  const allRevealed =
    state.phase === 'gameOver' ||
    (state.revealData !== null &&
      state.revealData.revealIndex + 1 >= state.revealData.revealOrder.length);

  const visibleHands: Record<string, Card[]> = {};
  if (isRevealOrOver) {
    for (const pId of revealedPlayerIds) {
      if (state.hands[pId]) visibleHands[pId] = [...state.hands[pId]];
    }
    if (viewerId && state.hands[viewerId] && !visibleHands[viewerId]) {
      visibleHands[viewerId] = [...state.hands[viewerId]];
    }
  } else if (viewerId && state.hands[viewerId]) {
    visibleHands[viewerId] = [...state.hands[viewerId]];
  }


  let revealData: RevealViewData | null = null;
  if (state.revealData) {
    revealData = {
      callerId: state.revealData.callerId,
      calledHand: state.revealData.calledHand,
      claimedByPlayerId: state.revealData.claimedByPlayerId,
      exists: state.revealData.exists,
      matchingCards: isRevealOrOver && allRevealed ? state.revealData.matchingCards : [],
      revealedPlayerIds,
      loserId: state.revealData.loserId,
      loserEliminated: state.revealData.loserEliminated,
      revealOrder: state.revealData.revealOrder,
      verdictActive: state.revealData.verdictActive,
    };
  }

  return {
    lobbyCode: state.lobbyCode,
    viewerId: viewerId || '',
    isHost,
    hostPlayerId: state.hostPlayerId,
    phase: state.phase,
    round: state.round,
    dealSeq: state.dealSeq ?? 0,
    players: seatedPlayers.map(toPublic),
    spectators: spectators.map(toPublic),
    myCards,
    communityCards: [...state.communityCards],
    hands: visibleHands,
    cardCounts,
    turnPlayerId: state.turnPlayerId,
    currentCall: state.currentCall ? { ...state.currentCall } : null,
    lastBsCallerId: state.lastBsCallerId,
    revealData,
    winnerId: state.winnerId,
    countdownRemainingMs:
      state.countdownDeadline !== null ? Math.max(0, state.countdownDeadline - Date.now()) : null,
    turnRemainingMs:
      state.phase === 'bidding' && state.turnDeadline != null
        ? Math.max(0, state.turnDeadline - Date.now())
        : null,
    log: [...state.log],
    settings: { ...DEFAULT_SETTINGS, ...state.settings },
  };
}
