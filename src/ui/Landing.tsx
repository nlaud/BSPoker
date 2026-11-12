import React, { useState, useEffect } from 'react';
import { getSavedPlayerName, savePlayerName } from '../net/client';
import { getSavedHostCode } from './storage';

export interface LandingProps {
  initialCode?: string;
  errorMessage?: string | null;
  onCreateLobby: (name: string) => void;
  onJoinLobby: (code: string, name: string) => void;
  onResumeHosting?: (code: string) => void;
}

export const Landing: React.FC<LandingProps> = ({
  initialCode = '',
  errorMessage = null,
  onCreateLobby,
  onJoinLobby,
  onResumeHosting,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode);
  const [resumeCode, setResumeCode] = useState<string | null>(null);

  useEffect(() => {
    setName(getSavedPlayerName());
    const saved = getSavedHostCode();
    if (saved) {
      setResumeCode(saved);
    }
  }, []);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode.toUpperCase());
    }
  }, [initialCode]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.slice(0, 16);
    setName(val);
    savePlayerName(val);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().slice(0, 4);
    setCode(val);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateLobby(name.trim() || 'Host');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 4) {
      onJoinLobby(code, name.trim() || 'Player');
    }
  };

  return (
    <div className="landing-screen">
      <div className="landing-card">
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

        <div className="landing-section">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleCreate}
          >
            Create lobby
          </button>
        </div>

        <div className="landing-divider">
          <span>or join existing</span>
        </div>

        <form onSubmit={handleJoin} className="landing-join-form">
          <input
            type="text"
            className="input-text input-code"
            value={code}
            onChange={handleCodeChange}
            placeholder="CODE"
            maxLength={4}
            autoCapitalize="characters"
            spellCheck="false"
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={code.length !== 4}
          >
            Join
          </button>
        </form>

        {resumeCode && onResumeHosting && (
          <div className="landing-resume-section">
            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={() => onResumeHosting(resumeCode)}
            >
              Resume hosting {resumeCode}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
