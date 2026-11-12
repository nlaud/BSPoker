import React, { useEffect, useRef, useState } from 'react';
import { Hand, Rules, handKindsHighToLow } from '../engine/hands';
import { Rank, Suit, SUIT_SYMBOLS } from '../engine/cards';

type MiniCard = [Rank, Suit];

/** Each hand's name, its normal form (for the tooltip) and the cards that make it, in groups. */
const HAND_INFO: Record<Hand['kind'], { name: string; example: string; groups: MiniCard[][] }> = {
  royalFlush: {
    name: 'Royal Flush',
    example: 'Royal Flush',
    groups: [[[10, 's'], [11, 's'], [12, 's'], [13, 's'], [14, 's']]],
  },
  straightFlush: {
    name: 'Straight Flush',
    example: 'Straight Flush, 5 to 9',
    groups: [[[5, 'h'], [6, 'h'], [7, 'h'], [8, 'h'], [9, 'h']]],
  },
  quads: { name: 'Four of a Kind', example: 'Four Kings', groups: [[[13, 's'], [13, 'h'], [13, 'd'], [13, 'c']]] },
  fullHouse: {
    name: 'Full House',
    example: 'Full House, Three Nines and Two Aces',
    groups: [[[9, 's'], [9, 'h'], [9, 'd']], [[14, 'c'], [14, 'h']]],
  },
  flush: {
    name: 'Flush',
    example: 'Flush of Hearts',
    groups: [[[2, 'h'], [6, 'h'], [9, 'h'], [11, 'h'], [13, 'h']]],
  },
  straight: {
    name: 'Straight',
    example: 'Straight, 5 to 9',
    groups: [[[5, 'c'], [6, 'd'], [7, 's'], [8, 'h'], [9, 'c']]],
  },
  trips: { name: 'Three of a Kind', example: 'Three Queens', groups: [[[12, 's'], [12, 'h'], [12, 'd']]] },
  twoPair: {
    name: 'Two Pair',
    example: 'Two Pair, Aces and Kings',
    groups: [[[14, 's'], [14, 'd']], [[13, 'c'], [13, 'h']]],
  },
  pair: { name: 'Pair', example: 'Pair of Nines', groups: [[[9, 's'], [9, 'h']]] },
  high: { name: 'High Card', example: 'Ace High', groups: [[[14, 's']]] },
};

const RANK_LABEL: Partial<Record<Rank, string>> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

const MiniCardFace: React.FC<{ card: MiniCard }> = ({ card: [rank, suit] }) => (
  <span className={`mini-card ${suit === 'h' || suit === 'd' ? 'card-red' : 'card-black'}`}>
    <span className="mini-card-rank">{RANK_LABEL[rank] ?? rank}</span>
    <span className="mini-card-suit">{SUIT_SYMBOLS[suit]}</span>
  </span>
);

export interface HandRankingsProps {
  rules: Rules;
}

/** The "i" button in the top bar and its panel: every hand, highest first, for this game's rules. */
export const HandRankings: React.FC<HandRankingsProps> = ({ rules }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const kinds = handKindsHighToLow(rules);

  return (
    <div className="hand-rankings" ref={rootRef}>
      <button
        type="button"
        className={`btn-icon info-btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Hand rankings"
        aria-expanded={open}
        aria-controls="hand-rankings-panel"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
          <circle cx="12" cy="12" r="9.5" />
          <line x1="12" y1="11" x2="12" y2="16.5" />
          <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="hand-rankings-panel" id="hand-rankings-panel" role="dialog" aria-label="Hand rankings">
          <div className="hand-rankings-header">
            <h2 className="hand-rankings-title">Hands, highest first</h2>
            <button
              type="button"
              className="dialog-close-btn hand-rankings-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <ol className="hand-rankings-list">
            {kinds.map((kind, i) => {
              const info = HAND_INFO[kind];
              const moved = rules.straightBeatsFlush && (kind === 'straight' || kind === 'flush');
              return (
                <li key={kind} className="hand-rank-row" title={info.example}>
                  <span className="hand-rank-index">{i + 1}</span>
                  <span className="hand-rank-name">
                    {info.name}
                    {moved && <span className="hand-rank-rule">house rule</span>}
                  </span>
                  <span className="hand-rank-cards" aria-label={`For example ${info.example}`}>
                    {info.groups.map((group, g) => (
                      <span key={g} className="hand-rank-group">
                        {group.map((card) => (
                          <MiniCardFace key={`${card[0]}${card[1]}`} card={card} />
                        ))}
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="hand-rankings-note">
            A hand counts if it can be made from every player's cards plus the two in the middle.
          </p>
        </div>
      )}
    </div>
  );
};
