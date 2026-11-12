import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { PlayerView } from '../engine/protocol';
import { Hand, normalForm } from '../engine/hands';
import { Card as CardComponent } from './Card';
import { Seat } from './Seat';
import { BSButton } from './BSButton';
import { HandDialog } from './HandDialog';
import { LogDrawer } from './LogDrawer';
import { Verdict } from './Verdict';
import { GameOver } from './GameOver';
import { useHoldToPeek } from './useHoldToPeek';
import { getOpponentEdgePositions } from './seatLayout';
import { getSeenDealSeq, setSeenDealSeq } from './dealMemory';
import { playTurnChime, getMuted, setMuted } from './sound';
import {
  playShuffle,
  playDealCard,
  playCommunityFlip,
  playRevealCard,
  playVerdictHadIt,
  playVerdictBS,
  playElimination,
} from './cardSounds';

/** Whole deal (all flights launched) fits in about this budget, even with 42 cards. */
const DEAL_BUDGET_MS = 2200;
const FLIGHT_MS = 300;
const COMMUNITY_FLIP_DELAY_MS = 120;
/** The shuffle plays first; the first card leaves the deck this long after it starts. */
const SHUFFLE_LEAD_MS = 450;
const ELIMINATION_SOUND_DELAY_MS = 450;

type DealTarget =
  | { kind: 'player'; playerId: string; index: number }
  | { kind: 'community'; index: number };

interface Flight {
  id: number;
  /** Top-left corner of the card box at the deck and at the target slot (viewport px). */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  width: number;
  height: number;
  rotation: number;
  size: 'player' | 'community' | 'opponent';
}

function dealTargetSelector(target: DealTarget): string {
  return target.kind === 'player'
    ? `[data-deal-target="${target.playerId}:${target.index}"]`
    : `[data-deal-target="community:${target.index}"]`;
}

/**
 * Measures where a card must fly: from the deck center to the center of its
 * (still invisible) slot. Width and height are the card's unrotated size;
 * the flight rotates to the slot's rotation so it lands exactly in place.
 */
function measureFlight(deck: HTMLElement | null, target: DealTarget, id: number): Flight | null {
  if (!deck || typeof document === 'undefined') return null;
  const slot = document.querySelector<HTMLElement>(dealTargetSelector(target));
  const card = slot?.querySelector<HTMLElement>('.card-wrapper');
  if (!slot || !card) return null;
  const deckBox = deck.getBoundingClientRect();
  const slotBox = slot.getBoundingClientRect();
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const size = card.classList.contains('card-size-opponent')
    ? 'opponent'
    : card.classList.contains('card-size-community')
      ? 'community'
      : 'player';
  return {
    id,
    fromX: deckBox.left + deckBox.width / 2 - width / 2,
    fromY: deckBox.top + deckBox.height / 2 - height / 2,
    toX: slotBox.left + slotBox.width / 2 - width / 2,
    toY: slotBox.top + slotBox.height / 2 - height / 2,
    width,
    height,
    rotation: Number(slot.dataset.dealRotation || 0),
    size,
  };
}

const FlyingCard: React.FC<{ flight: Flight }> = ({ flight }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const { fromX, fromY, toX, toY, rotation } = flight;
    const animation = el.animate(
      [
        { transform: `translate(${fromX}px, ${fromY}px) rotate(0deg)` },
        { transform: `translate(${toX}px, ${toY}px) rotate(${rotation}deg)` },
      ],
      { duration: FLIGHT_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'forwards' },
    );
    return () => animation.cancel();
  }, [flight]);
  return (
    <div
      ref={ref}
      className="deal-flight"
      style={{
        width: flight.width,
        height: flight.height,
        transform: `translate(${flight.fromX}px, ${flight.fromY}px)`,
      }}
    >
      <CardComponent faceDown size={flight.size} />
    </div>
  );
};

export interface TableProps {
  view: PlayerView;
  onCallHand: (hand: Hand) => void;
  onCallBs: () => void;
  onPeekChange: (peeking: boolean) => void;
  onKick: (playerId: string) => void;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export const Table: React.FC<TableProps> = ({
  view,
  onCallHand,
  onCallBs,
  onPeekChange,
  onKick,
  onPlayAgain,
  onLeave,
}) => {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [muted, setMutedState] = useState(getMuted());
  const [copiedCode, setCopiedCode] = useState(false);

  const [isDealing, setIsDealing] = useState(false);
  const [dealtCardCounts, setDealtCardCounts] = useState<Record<string, number>>({});
  const [communityDealtCount, setCommunityDealtCount] = useState<number>(2);
  const [communityFaceUpCount, setCommunityFaceUpCount] = useState<number>(2);
  const [flights, setFlights] = useState<Flight[]>([]);

  const prevTurnRef = useRef<string | null>(null);
  const dealTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const flightIdRef = useRef(0);

  // Deal animation every round: card backs fly one at a time from the deck at
  // the table center to each seat (round-robin, clockwise from the starter),
  // then the two community cards fly in face down and flip face up.
  useEffect(() => {
    const clearDeal = () => {
      dealTimeoutsRef.current.forEach(clearTimeout);
      dealTimeoutsRef.current = [];
      setFlights([]);
    };

    if (view.phase !== 'bidding') {
      clearDeal();
      setIsDealing(false);
      setCommunityDealtCount(2);
      setCommunityFaceUpCount(2);
      return;
    }

    // Animate only a deal this tab has not seen yet. A tab that came from the
    // lobby has recorded the previous dealSeq; a refresh or a mid-round join
    // (nothing recorded, or already this deal) shows the cards in place.
    const seen = getSeenDealSeq(view.lobbyCode);
    setSeenDealSeq(view.lobbyCode, view.dealSeq);
    if (seen === null || view.dealSeq <= seen) return;
    clearDeal();

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setIsDealing(false);
      setCommunityDealtCount(2);
      setCommunityFaceUpCount(2);
      return;
    }

    const starter = view.players.find((p) => p.id === view.turnPlayerId) || view.players[0];
    const startSeat = starter ? starter.seatIndex : 0;
    const alive = view.players
      .filter((p) => !p.eliminated && !p.isSpectator)
      .sort(
        (a, b) => ((a.seatIndex - startSeat + 8) % 8) - ((b.seatIndex - startSeat + 8) % 8),
      );

    const queue: DealTarget[] = [];
    const maxCards = Math.max(0, ...alive.map((p) => p.cardCount));
    for (let pass = 0; pass < maxCards; pass++) {
      for (const p of alive) {
        if (pass < p.cardCount) queue.push({ kind: 'player', playerId: p.id, index: pass });
      }
    }
    queue.push({ kind: 'community', index: 0 }, { kind: 'community', index: 1 });

    const stagger = Math.min(90, Math.floor(DEAL_BUDGET_MS / queue.length));

    setIsDealing(true);
    setCommunityDealtCount(0);
    setCommunityFaceUpCount(0);
    const initialCounts: Record<string, number> = {};
    for (const p of view.players) initialCounts[p.id] = 0;
    setDealtCardCounts(initialCounts);

    const land = (target: DealTarget) => {
      if (target.kind === 'player') {
        setDealtCardCounts((prev) => ({
          ...prev,
          [target.playerId]: Math.max(prev[target.playerId] || 0, target.index + 1),
        }));
      } else {
        setCommunityDealtCount((c) => Math.max(c, target.index + 1));
        const flip = setTimeout(() => {
          playCommunityFlip();
          setCommunityFaceUpCount((c) => Math.max(c, target.index + 1));
        }, COMMUNITY_FLIP_DELAY_MS);
        dealTimeoutsRef.current.push(flip);
      }
    };

    playShuffle();
    queue.forEach((target, idx) => {
      const t = setTimeout(() => {
        const flight = measureFlight(deckRef.current, target, flightIdRef.current++);
        playDealCard(idx, queue.length);
        if (!flight) {
          land(target);
          return;
        }
        setFlights((prev) => [...prev, flight]);
        const done = setTimeout(() => {
          setFlights((prev) => prev.filter((f) => f.id !== flight.id));
          land(target);
        }, FLIGHT_MS);
        dealTimeoutsRef.current.push(done);
      }, SHUFFLE_LEAD_MS + idx * stagger);
      dealTimeoutsRef.current.push(t);
    });

    const endDealTime =
      SHUFFLE_LEAD_MS + (queue.length - 1) * stagger + FLIGHT_MS + COMMUNITY_FLIP_DELAY_MS + 280;
    const tEnd = setTimeout(() => setIsDealing(false), endDealTime);
    dealTimeoutsRef.current.push(tEnd);
    // Only a new round may start a deal; other view changes must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.dealSeq, view.phase]);

  useEffect(() => {
    return () => {
      dealTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const me = view.players.find((p) => p.id === view.viewerId);
  const isSpectator = !me || me.isSpectator;
  const isEliminated = me ? me.eliminated : false;
  const canPeek = !isSpectator && !isEliminated && !isDealing;

  const isMyTurn = !isSpectator && !isEliminated && view.turnPlayerId === view.viewerId;

  // Sound chime when it becomes my turn
  useEffect(() => {
    if (view.turnPlayerId && view.turnPlayerId !== prevTurnRef.current) {
      if (view.turnPlayerId === view.viewerId) {
        playTurnChime();
      }
    }
    prevTurnRef.current = view.turnPlayerId;
  }, [view.turnPlayerId, view.viewerId]);

  // One flip sound each time another hand is turned over during the reveal,
  // rising in pitch through the reveal order.
  const revealedCount = view.phase === 'reveal' ? view.revealData?.revealedPlayerIds?.length ?? 0 : 0;
  const revealTotal = view.revealData?.revealOrder.length ?? 0;
  const prevRevealedCountRef = useRef(0);
  useEffect(() => {
    if (revealedCount > prevRevealedCountRef.current) playRevealCard(revealedCount - 1, revealTotal);
    prevRevealedCountRef.current = revealedCount;
  }, [revealedCount, revealTotal]);

  // Verdict sting when the verdict appears, plus a tone if the loser is knocked out.
  const verdictActive = view.phase === 'reveal' && !!view.revealData?.verdictActive;
  const verdictExists = !!view.revealData?.exists;
  const verdictEliminates = !!view.revealData?.loserEliminated;
  useEffect(() => {
    if (!verdictActive) return;
    if (verdictExists) playVerdictHadIt();
    else playVerdictBS();
    if (!verdictEliminates) return;
    const t = setTimeout(playElimination, ELIMINATION_SOUND_DELAY_MS);
    return () => clearTimeout(t);
  }, [verdictActive, verdictExists, verdictEliminates]);

  // Peeking hook
  const { isPeeking, onTablePointerDown } = useHoldToPeek({
    enabled: canPeek,
    onPeekChange,
  });

  // Enter shortcut to open Call a hand dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isMyTurn && !isDialogOpen && !isLogOpen) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        if (view.currentCall?.hand.kind !== 'royalFlush') {
          setIsDialogOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMyTurn, isDialogOpen, isLogOpen, view.currentCall]);

  const handleToggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  };

  const handleCopyCode = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}${window.location.pathname}?lobby=${view.lobbyCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    });
  };

  // Determine opponent ordering clockwise starting from your left
  const mySeat = me ? me.seatIndex : 0;
  const opponents = view.players
    .filter((p) => p.id !== view.viewerId)
    .sort((a, b) => {
      const distA = (a.seatIndex - mySeat + 8) % 8;
      const distB = (b.seatIndex - mySeat + 8) % 8;
      return distA - distB;
    });

  const edgePositions = getOpponentEdgePositions(opponents.length);

  // Turn player info
  const turnPlayer = view.players.find((p) => p.id === view.turnPlayerId);
  const turnPlayerName = turnPlayer ? turnPlayer.name : 'Unknown';

  // Current call display
  const currentCaller = view.currentCall
    ? view.players.find((p) => p.id === view.currentCall?.byPlayerId)
    : null;
  const currentCallerName = currentCaller ? currentCaller.name : '';

  // Starter info before any call
  const roundStarter = view.players.find((p) => p.id === view.turnPlayerId);
  const starterName = roundStarter ? roundStarter.name : 'Starter';

  // Reveal: hands turn over one at a time (BS caller first). Play a flip per hand.
  const revealedIds = view.phase === 'reveal' ? view.revealData?.revealedPlayerIds ?? [] : [];
  const myHandRevealed = revealedIds.includes(view.viewerId);

  // Matching cards set
  const matchingCardIds = new Set(view.revealData?.matchingCards.map((c) => c.id) || []);

  const isRoyalFlush = view.currentCall?.hand.kind === 'royalFlush';

  return (
    <div className="table-viewport" onPointerDown={onTablePointerDown}>
      {/* Your Turn Border Glow (Fixed overlay) */}
      {isMyTurn && <div className="your-turn-overlay" aria-hidden="true" />}

      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar-left">
          <button
            type="button"
            className="btn-icon hamburger-btn"
            onClick={() => setIsLogOpen(true)}
            aria-label="Open game log"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <div className="top-bar-right">
          {view.settings?.straightBeatsFlush && (
            <span className="chip rule-chip" title="Straights rank above flushes this game">
              Straight &gt; Flush
            </span>
          )}
          <button
            type="button"
            className="chip code-chip"
            onClick={handleCopyCode}
            aria-label="Copy lobby link"
          >
            <span>{view.lobbyCode}</span>
            {copiedCode && <span className="chip-toast">Copied</span>}
          </button>

          <button
            type="button"
            className="btn-icon mute-btn"
            onClick={handleToggleMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Opponents edge seating */}
      <div className="opponents-layer" aria-label="Opponents">
        {opponents.map((opp, idx) => {
          const edgePos = edgePositions[idx];
          if (!edgePos) return null;
          const oppCards = view.hands[opp.id];
          const isOppTurn = view.turnPlayerId === opp.id;
          const visibleCount = isDealing
            ? (dealtCardCounts[opp.id] ?? 0)
            : opp.cardCount;

          return (
            <Seat
              key={opp.id}
              player={opp}
              position={edgePos}
              isTurn={isOppTurn}
              isHost={view.isHost}
              cards={oppCards}
              matchingCardIds={matchingCardIds}
              visibleCount={visibleCount}
              onKick={onKick}
            />
          );
        })}
      </div>

      {/* Table Felt Center */}
      <main className="table-center">
        {/* 2 Community Cards (slots stay laid out during the deal; the deck sits on top) */}
        <div className="community-cards-row">
          {view.communityCards.map((card, idx) => {
            const isHighlighted = matchingCardIds.has(card.id);
            const dealt = !isDealing || idx < communityDealtCount;
            const faceUp = !isDealing || idx < communityFaceUpCount;
            return (
              <div
                key={card.id}
                className="deal-slot"
                data-deal-target={`community:${idx}`}
                style={dealt ? undefined : { visibility: 'hidden' }}
              >
                <CardComponent
                  card={card}
                  faceDown={!faceUp}
                  isHighlighted={isHighlighted}
                  size="community"
                />
              </div>
            );
          })}
          {isDealing && (
            <div className="deal-deck" ref={deckRef} aria-hidden="true">
              <CardComponent faceDown size="community" />
              <CardComponent faceDown size="community" />
              <CardComponent faceDown size="community" />
            </div>
          )}
        </div>

        {/* Current Call Display */}
        <div
          className="current-call-box"
          style={view.revealData?.verdictActive ? { visibility: 'hidden' } : undefined}
        >
          {view.currentCall ? (
            <>
              <div className="call-by-line">{currentCallerName} called</div>
              <div className="call-hand-name">{normalForm(view.currentCall.hand)}</div>
            </>
          ) : (
            <div className="call-start-line">{starterName} starts</div>
          )}
        </div>
      </main>

      {/* Bottom Area: Your Cards, Hint, Action Area */}
      <footer className="player-bottom-area">
        {!isSpectator && !isEliminated && (
          <div className="player-cards-row">
            {view.myCards.map((card, idx) => {
              const isHighlighted = matchingCardIds.has(card.id);
              const dealt = !isDealing || idx < (dealtCardCounts[view.viewerId] ?? 0);
              // Face up while peeking, once my hand is turned over in the reveal, or at game over.
              const isFaceUp = isPeeking || myHandRevealed || view.phase === 'gameOver';
              return (
                <div
                  key={card.id || idx}
                  className="deal-slot"
                  data-deal-target={`${view.viewerId}:${idx}`}
                  style={dealt ? undefined : { visibility: 'hidden' }}
                >
                  <CardComponent
                    card={card}
                    faceDown={!isFaceUp}
                    isHighlighted={isHighlighted}
                    size="player"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Hint text */}
        {!isSpectator && !isEliminated && view.phase === 'bidding' && (
          <div className="peek-hint-text">
            <span className="hint-fine">Hold space to look at your cards</span>
            <span className="hint-coarse">Press anywhere to look at your cards</span>
          </div>
        )}

        {/* Action area */}
        <div className="action-area">
          {isDealing ? (
            <div className="waiting-status-line">Dealing cards...</div>
          ) : isMyTurn && view.phase === 'bidding' ? (
            <div className="action-buttons-group">
              <BSButton
                disabled={view.currentCall === null}
                onCallBs={onCallBs}
              />

              <button
                type="button"
                className="btn btn-call-hand"
                disabled={isRoyalFlush}
                title={isRoyalFlush ? 'Nothing beats Royal Flush' : undefined}
                onClick={() => setIsDialogOpen(true)}
              >
                Call a hand
              </button>
            </div>
          ) : (
            <div className="waiting-status-line">
              {isSpectator
                ? 'Spectating'
                : isEliminated
                ? 'Eliminated · Spectating'
                : `Waiting for ${turnPlayerName}...`}
            </div>
          )}
        </div>
      </footer>

      {/* Cards in flight during the deal */}
      {flights.length > 0 && (
        <div className="deal-flight-layer" aria-hidden="true">
          {flights.map((f) => (
            <FlyingCard key={f.id} flight={f} />
          ))}
        </div>
      )}

      {/* Call a Hand Dialog */}
      <HandDialog
        isOpen={isDialogOpen}
        currentCall={view.currentCall}
        onCallHand={onCallHand}
        onClose={() => setIsDialogOpen(false)}
        rules={view.settings}
      />

      {/* Log Drawer */}
      <LogDrawer
        isOpen={isLogOpen}
        entries={view.log}
        onClose={() => setIsLogOpen(false)}
      />

      {/* Verdict Overlay */}
      <Verdict
        revealData={view.revealData}
        players={view.players}
      />

      {/* Game Over Overlay */}
      {view.phase === 'gameOver' && (
        <GameOver
          winnerName={
            view.players.find((p) => p.id === view.winnerId)?.name || 'Someone'
          }
          onPlayAgain={onPlayAgain}
          onLeave={onLeave}
        />
      )}
    </div>
  );
};
