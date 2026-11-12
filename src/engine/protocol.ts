import { Hand } from './hands';
import type { GameSettings } from './game';
import { Card } from './cards';

export interface PlayerPublic {
  id: string;
  name: string;
  seatIndex: number;
  cardCount: number;
  eliminated: boolean;
  connected: boolean;
  ready: boolean;
  peeking: boolean;
  isSpectator: boolean;
}

export interface RevealViewData {
  callerId: string;
  calledHand: Hand;
  claimedByPlayerId: string;
  exists: boolean;
  matchingCards: Card[];
  loserId: string;
  loserEliminated: boolean;
  revealOrder: string[];
  /** Players whose hands are face up so far (revealOrder prefix during the reveal). */
  revealedPlayerIds: string[];
  revealedSeats?: number[];
  verdictActive?: boolean;
}

export interface PlayerView {
  lobbyCode: string;
  viewerId: string;
  isHost: boolean;
  /** Player id of the lobby host (for the HOST badge). */
  hostPlayerId: string;
  phase: 'lobby' | 'bidding' | 'reveal' | 'gameOver';
  round: number;
  /** Increments on every deal; see GameState.dealSeq. */
  dealSeq: number;
  players: PlayerPublic[];
  spectators: PlayerPublic[];
  myCards: Card[];
  communityCards: Card[];
  hands: Record<string, Card[]>; // Revealed hands in reveal/gameOver; empty/omitted for hidden
  cardCounts: Record<string, number>;
  turnPlayerId: string | null;
  currentCall: { hand: Hand; byPlayerId: string } | null;
  lastBsCallerId: string | null;
  revealData: RevealViewData | null;
  winnerId: string | null;
  /** Time left in the lobby countdown when the host sent this view; clients count down from it. */
  countdownRemainingMs: number | null;
  /**
   * Time the turn player has left when the host sent this view, or null without
   * a turn timer. Clients count down from it on their own clock, so a skewed
   * clock between devices does not matter.
   */
  turnRemainingMs: number | null;
  log: string[];
  settings: GameSettings;
}

// Client -> Host messages
/**
 * Bumped whenever host and client messages change incompatibly. The page on
 * GitHub Pages and a host's cloned server must agree on it.
 */
export const PROTOCOL_VERSION = 3;

export type ClientMessage =
  /** hostKey is only sent by the host's own page; it claims the host seat. */
  | {
      type: 'join';
      token: string;
      name: string;
      hostKey?: string;
      protocolVersion: number;
      /** Server run this tab joined before; a different run means the host restarted. */
      serverId?: string;
    }
  | { type: 'setReady'; ready: boolean }
  | { type: 'peek'; peeking: boolean }
  | { type: 'call'; hand: Hand }
  | { type: 'bs' }
  | { type: 'playAgain' }
  | { type: 'leave' }
  | { type: 'kick'; playerId: string }
  | { type: 'setRule'; rule: 'straightBeatsFlush'; value: boolean }
  | { type: 'setTurnTimer'; seconds: number }
  | { type: 'ping' };

// Host -> Client messages
export type HostMessage =
  /** serverId changes on every server start, so a tab can tell a restart from a reconnect. */
  | { type: 'welcome'; playerId: string; protocolVersion: number; serverId?: string }
  | { type: 'view'; view: PlayerView }
  /** fatal: the server closes the connection and the tab must not retry. */
  | { type: 'error'; message: string; fatal?: boolean }
  | { type: 'pong' };
