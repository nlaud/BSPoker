import React from 'react';
import { Card as CardType, SUIT_SYMBOLS } from '../engine/cards';
import { playCardHover } from './sound';

export interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  isHighlighted?: boolean;
  size?: 'player' | 'community' | 'opponent';
  className?: string;
}

function getRankDisplay(rank: number): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

export const Card: React.FC<CardProps> = ({
  card,
  faceDown = false,
  isHighlighted = false,
  size = 'player',
  className = '',
}) => {
  const isRed = card?.suit === 'h' || card?.suit === 'd';
  const symbol = card ? SUIT_SYMBOLS[card.suit] : '';
  const rankStr = card ? getRankDisplay(card.rank) : '';

  const handlePointerEnter = (e: React.PointerEvent) => {
    playCardHover(e.pointerType);
  };

  return (
    <div
      className={`card-wrapper card-size-${size} ${isHighlighted ? 'highlighted' : ''} ${className}`}
      onPointerEnter={handlePointerEnter}
    >
      <div className={`card-inner ${faceDown ? 'is-facedown' : 'is-faceup'}`}>
        {/* Card Face */}
        <div className={`card-side card-front ${isRed ? 'card-red' : 'card-black'}`}>
          {card && (
            <>
              <div className="card-corner card-top-left">
                <span className="card-rank">{rankStr}</span>
                <span className="card-suit">{symbol}</span>
              </div>
              <div className="card-center-suit">{symbol}</div>
              <div className="card-corner card-bottom-right">
                <span className="card-rank">{rankStr}</span>
                <span className="card-suit">{symbol}</span>
              </div>
            </>
          )}
        </div>

        {/* Card Back */}
        <div className="card-side card-back">
          <div className="card-back-pattern" />
        </div>
      </div>
    </div>
  );
};
