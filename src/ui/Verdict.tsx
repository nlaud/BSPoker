import React from 'react';
import { RevealViewData } from '../engine/protocol';
import { normalForm } from '../engine/hands';
import { VERDICT_HAD_IT, VERDICT_BS } from '../engine/game';

export interface VerdictProps {
  revealData: RevealViewData | null;
  players: { id: string; name: string }[];
}

export const Verdict: React.FC<VerdictProps> = ({ revealData, players }) => {
  if (!revealData || !revealData.verdictActive) return null;

  const { exists, calledHand, loserId, loserEliminated } = revealData;
  const loser = players.find((p) => p.id === loserId);
  const loserName = loser ? loser.name : 'Unknown';
  const handStr = normalForm(calledHand);

  const mainTitle = exists ? VERDICT_HAD_IT : VERDICT_BS;
  const titleColor = exists ? 'var(--mint)' : 'var(--coral)';

  let subline: string;
  if (exists) {
    if (loserEliminated) {
      subline = `${handStr} was there · ${loserName} is out`;
    } else {
      subline = `${handStr} was there · ${loserName} gets a card`;
    }
  } else {
    if (loserEliminated) {
      subline = `No ${handStr} · ${loserName} is out`;
    } else {
      subline = `No ${handStr} · ${loserName} gets a card`;
    }
  }

  return (
    <div className="verdict-overlay">
      <div className="verdict-modal">
        <h1 className="verdict-title" style={{ color: titleColor }}>
          {mainTitle}
        </h1>
        <p className="verdict-subline">{subline}</p>
      </div>
    </div>
  );
};
