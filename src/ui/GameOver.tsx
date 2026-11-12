import React from 'react';

export interface GameOverProps {
  winnerName: string;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export const GameOver: React.FC<GameOverProps> = ({
  winnerName,
  onPlayAgain,
  onLeave,
}) => {
  return (
    <div className="game-over-overlay">
      <div className="game-over-card">
        <h1 className="game-over-title">{winnerName} wins</h1>
        <div className="game-over-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onPlayAgain}
          >
            Play again
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLeave}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
};
