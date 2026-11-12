import React from 'react';
import { PlayerPublic } from '../engine/protocol';
import { Card as CardType } from '../engine/cards';
import { Card } from './Card';
import { SeatEdgePosition, getRotationForPosition } from './seatLayout';

export interface SeatProps {
  player: PlayerPublic;
  position: SeatEdgePosition;
  isTurn: boolean;
  isHost: boolean;
  cards?: CardType[];
  matchingCardIds?: Set<string>;
  visibleCount?: number;
  onKick?: (playerId: string) => void;
}

export const Seat: React.FC<SeatProps> = ({
  player,
  position,
  isTurn,
  isHost,
  cards,
  matchingCardIds,
  visibleCount,
  onKick,
}) => {
  const rotation = getRotationForPosition(position);
  const isSide = position.startsWith('L') || position.startsWith('R');
  const isEliminated = player.eliminated;
  const cardCount = player.cardCount;
  // Slots for every card are always laid out so the seat never shifts while
  // cards are dealt; slots that have not been dealt yet are just invisible.
  const shownCount = visibleCount !== undefined ? visibleCount : cardCount;

  return (
    <div className={`seat-container seat-pos-${position} ${isTurn ? 'is-turn' : ''} ${isEliminated ? 'is-eliminated' : ''}`}>
      {/* Upright Label */}
      <div className="seat-label">
        <div className="seat-name-row">
          <span className={`seat-name ${isTurn ? 'seat-name-active' : ''}`}>
            {player.name}
          </span>
          {!player.connected && (
            <span className="badge-offline">offline</span>
          )}
          {/* Only a seat still in the hand can be removed; afterwards it just reads "out". */}
          {isHost && !player.connected && !isEliminated && !player.isSpectator && onKick && (
            <button
              type="button"
              className="btn-kick"
              onClick={() => onKick(player.id)}
              aria-label={`Remove ${player.name}`}
            >
              Remove
            </button>
          )}
        </div>
        <div className="seat-subline">
          {isEliminated ? (
            <span className="seat-out">out</span>
          ) : (
            <span className="seat-count">{cardCount} {cardCount === 1 ? 'card' : 'cards'}</span>
          )}
        </div>
      </div>

      {/* Cards stack facing its edge */}
      {!isEliminated && cardCount > 0 && (
        <div
          className={`seat-cards-wrapper ${isSide ? 'is-side' : ''} ${isTurn ? 'seat-cards-active' : ''}`}
        >
          {Array.from({ length: cardCount }).map((_, idx) => {
            const cardObj = cards && cards[idx];
            const isHighlighted = cardObj ? matchingCardIds?.has(cardObj.id) : false;
            return (
              <div
                key={cardObj ? cardObj.id : idx}
                className="seat-card-slot"
                data-deal-target={`${player.id}:${idx}`}
                data-deal-rotation={rotation}
                style={idx < shownCount ? undefined : { visibility: 'hidden' }}
              >
                <div className="seat-card-rot" style={{ transform: `rotate(${rotation}deg)` }}>
                  <Card
                    card={cardObj}
                    faceDown={!cardObj}
                    isHighlighted={isHighlighted}
                    size="opponent"
                  />
                </div>
              </div>
            );
          })}

          {/* Peeking eye icon */}
          {player.peeking && (
            <div className="seat-peeking-eye" aria-label="Peeking">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
