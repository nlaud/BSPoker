import React, { useEffect, useRef, useState } from 'react';
import { Hand, Rules, handKindsHighToLow } from '../engine/hands';

const HAND_INFO: Record<Hand['kind'], { name: string; example: string; detail: string }> = {
  royalFlush: { name: 'Royal Flush', example: 'Royal Flush', detail: '10 to Ace, one suit' },
  straightFlush: { name: 'Straight Flush', example: 'Straight Flush, 5 to 9', detail: 'Five in a row, one suit' },
  quads: { name: 'Four of a Kind', example: 'Four Kings', detail: 'Four of one rank' },
  fullHouse: { name: 'Full House', example: 'Full House, Three Nines and Two Aces', detail: 'Three of one rank, two of another' },
  flush: { name: 'Flush', example: 'Flush of Hearts', detail: 'Five of one suit. All flushes tie' },
  straight: { name: 'Straight', example: 'Straight, 5 to 9', detail: 'Five ranks in a row. Ace is high or low' },
  trips: { name: 'Three of a Kind', example: 'Three Queens', detail: 'Three of one rank' },
  twoPair: { name: 'Two Pair', example: 'Two Pair, Aces and Kings', detail: 'Two of one rank, two of another' },
  pair: { name: 'Pair', example: 'Pair of Nines', detail: 'Two of one rank' },
  high: { name: 'High Card', example: 'Ace High', detail: 'One card of that rank' },
};

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
                <li key={kind} className="hand-rank-row">
                  <span className="hand-rank-index">{i + 1}</span>
                  <div className="hand-rank-text">
                    <span className="hand-rank-name">
                      {info.name}
                      {moved && <span className="hand-rank-rule">house rule</span>}
                    </span>
                    <span className="hand-rank-detail">{info.detail}</span>
                    <span className="hand-rank-example">{info.example}</span>
                  </div>
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
