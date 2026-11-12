import React, { useState, useEffect } from 'react';
import { getSavedPlayerName, savePlayerName } from '../net/client';
import { hostingHelpUrl } from './connection';

export interface LandingProps {
  /** True on the GitHub Pages site, where players enter the host's code. */
  needsCode: boolean;
  initialCode?: string;
  errorMessage?: string | null;
  onJoin: (name: string, code: string) => void;
}

/**
 * Join screen. Games are hosted with `npm run host` from a clone of the repo,
 * never from this page, so the only action here is joining.
 */
export const Landing: React.FC<LandingProps> = ({ needsCode, initialCode = '', errorMessage = null, onJoin }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode.toUpperCase());
  const helpUrl = hostingHelpUrl();

  useEffect(() => {
    setName(getSavedPlayerName());
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.slice(0, 16);
    setName(val);
    savePlayerName(val);
  };

  const canJoin = !needsCode || code.length === 4;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canJoin) onJoin(name.trim() || 'Player', code);
  };

  return (
    <div className="landing-screen">
      <form className="landing-card" onSubmit={handleSubmit}>
        <h1 className="landing-title">BSPoker</h1>

        {errorMessage && (
          <div className="error-banner" role="alert">
            {errorMessage}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="player-name" className="form-label">
            Your name
          </label>
          <input
            id="player-name"
            type="text"
            className="input-text"
            value={name}
            onChange={handleNameChange}
            placeholder="Enter name (max 16 chars)"
            maxLength={16}
          />
        </div>

        {needsCode && (
          <div className="form-group">
            <label htmlFor="game-code" className="form-label">
              Game code
            </label>
            <input
              id="game-code"
              type="text"
              className="input-text input-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
              placeholder="CODE"
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck="false"
            />
          </div>
        )}

        <div className="landing-section">
          <button type="submit" className="btn btn-primary btn-block" disabled={!canJoin}>
            Join game
          </button>
        </div>

        {needsCode && helpUrl && (
          <div className="landing-host-section">
            <a className="btn btn-outline btn-block" href={helpUrl} target="_blank" rel="noopener noreferrer">
              Host a game
            </a>
            <p className="landing-host-note">Hosting runs on your computer. The guide shows how.</p>
          </div>
        )}
      </form>
    </div>
  );
};
