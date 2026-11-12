import React, { useEffect, useState } from 'react';
import { PlayerView } from '../engine/protocol';
import { setSeenDealSeq } from './dealMemory';
import { preloadCardSounds } from './cardSounds';

export interface LobbyProps {
  view: PlayerView;
  onSetReady: (ready: boolean) => void;
  onLeave: () => void;
  onSetRule?: (rule: 'straightBeatsFlush', value: boolean) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  view,
  onSetReady,
  onLeave,
  onSetRule,
}) => {
  const [copied, setCopied] = useState(false);

  // Decode the card sounds while waiting, so the first deal's shuffle is ready
  // even for a player who joined by link without tapping anything yet.
  useEffect(() => {
    preloadCardSounds();
  }, []);

  // Remember the latest deal while waiting in the lobby, so the next deal
  // (the start of the match) animates in this tab.
  useEffect(() => {
    setSeenDealSeq(view.lobbyCode, view.dealSeq);
  }, [view.lobbyCode, view.dealSeq]);

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}${window.location.pathname}?lobby=${view.lobbyCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const me = view.players.find((p) => p.id === view.viewerId);
  const isReady = me?.ready || false;

  const seated = view.players.filter((p) => !p.isSpectator);
  const notReady = seated.filter((p) => !p.ready);

  return (
    <div className="lobby-screen">
      <div className="lobby-card">
        <div className="lobby-header">
          <span className="lobby-subtitle">Lobby code</span>
          <h1 className="lobby-code-display">{view.lobbyCode}</h1>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleCopyLink}
          >
            {copied ? 'Copied link!' : 'Copy invite link'}
          </button>
        </div>

        {view.countdownSeconds !== null ? (
          <div className="countdown-banner" role="status">
            Starting in {view.countdownSeconds}...
          </div>
        ) : seated.length >= 2 && notReady.length > 0 ? (
          <div className="waiting-ready-banner" role="status">
            Waiting for {notReady.length} {notReady.length === 1 ? 'player' : 'players'} to ready up
          </div>
        ) : seated.length < 2 ? (
          <div className="waiting-ready-banner" role="status">
            Waiting for more players to join
          </div>
        ) : null}

        <div className="lobby-section lobby-rule-section">
          <label className={`rule-toggle-row ${!view.isHost ? 'is-disabled' : ''}`}>
            <div className="rule-toggle-text">
              <span className="rule-toggle-label">Straight beats flush</span>
              <span className="rule-toggle-subline">Straights rank above flushes this game</span>
            </div>
            <input
              type="checkbox"
              className="rule-checkbox"
              aria-label="Straight beats flush"
              checked={view.settings?.straightBeatsFlush || false}
              disabled={!view.isHost}
              onChange={(e) => onSetRule?.('straightBeatsFlush', e.target.checked)}
            />
          </label>
        </div>

        <div className="lobby-section">
          <h3 className="section-title">Players ({view.players.length}/8)</h3>
          <div className="player-list">
            {view.players.map((p) => {
              const isHostPlayer = p.id === view.hostPlayerId;
              const isMe = p.id === view.viewerId;
              return (
                <div key={p.id} className={`player-row ${isMe ? 'is-me' : ''}`}>
                  <div className="player-info">
                    <span className="player-name">{p.name}</span>
                    {isHostPlayer && <span className="host-badge">Host</span>}
                    {isMe && <span className="me-badge">You</span>}
                    {!p.connected && <span className="badge-offline">offline</span>}
                  </div>
                  <div className="player-status">
                    <span className={`status-pill ${p.ready ? 'is-ready' : 'not-ready'}`}>
                      {p.ready ? 'Ready' : 'Not ready'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {view.spectators.length > 0 && (
          <div className="lobby-section">
            <h3 className="section-title">Spectators ({view.spectators.length})</h3>
            <div className="spectator-list">
              {view.spectators.map((s) => (
                <div key={s.id} className="spectator-row">
                  <span>{s.name}</span>
                  {s.id === view.viewerId && <span className="me-badge">You</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="lobby-actions">
          {me && (
            <button
              type="button"
              className={`btn btn-lg ${isReady ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => onSetReady(!isReady)}
            >
              {isReady ? 'Unready' : 'Ready'}
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline"
            onClick={onLeave}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
};
