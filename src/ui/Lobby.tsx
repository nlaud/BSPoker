import React, { useEffect, useState } from 'react';
import { PlayerView } from '../engine/protocol';
import { TURN_TIMER_OPTIONS } from '../engine/game';
import { inviteLink } from './connection';
import { setSeenDealSeq } from './dealMemory';
import { preloadCardSounds } from './cardSounds';
import { useTimeLeft } from './useTimeLeft';

export interface LobbyProps {
  view: PlayerView;
  onSetReady: (ready: boolean) => void;
  onLeave: () => void;
  onSetRule?: (rule: 'straightBeatsFlush', value: boolean) => void;
  onSetTurnTimer?: (seconds: number) => void;
  /** Host only: free an offline player's seat right away. */
  onKick?: (playerId: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  view,
  onSetReady,
  onLeave,
  onSetRule,
  onSetTurnTimer,
  onKick,
}) => {
  const [copied, setCopied] = useState(false);
  const { msLeft: countdownMsLeft } = useTimeLeft(view.countdownRemainingMs, 100);
  const countdown = countdownMsLeft === null ? null : Math.max(1, Math.ceil(countdownMsLeft / 1000));

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
    const url = inviteLink(view.lobbyCode);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const me = view.players.find((p) => p.id === view.viewerId);
  const isReady = me?.ready || false;

  const turnSeconds = view.settings?.turnSeconds ?? 0;
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

        {countdown !== null ? (
          <div className="countdown-banner" role="status" aria-label={`Starting in ${countdown}`}>
            Starting in{' '}
            {/* A new key per second replays the pop for each number. */}
            <span key={countdown} className="countdown-number">
              {countdown}
            </span>
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
          <div className={`rule-toggle-row rule-timer-row ${!view.isHost ? 'is-disabled' : ''}`}>
            <div className="rule-toggle-text">
              <span className="rule-toggle-label" id="turn-timer-label">Turn timer</span>
              <span className="rule-toggle-subline">
                {turnSeconds > 0 ? 'Out of time: BS, or the lowest opening call' : 'Players take as long as they like'}
              </span>
            </div>
            <div className="segmented" role="radiogroup" aria-labelledby="turn-timer-label">
              {TURN_TIMER_OPTIONS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  role="radio"
                  aria-checked={turnSeconds === seconds}
                  className={`segmented-option ${turnSeconds === seconds ? 'is-selected' : ''}`}
                  disabled={!view.isHost}
                  onClick={() => onSetTurnTimer?.(seconds)}
                >
                  {seconds > 0 ? `${seconds}s` : 'Off'}
                </button>
              ))}
            </div>
          </div>
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
                    {view.isHost && !p.connected && !isMe && onKick && (
                      <button
                        type="button"
                        className="btn-kick"
                        onClick={() => onKick(p.id)}
                        aria-label={`Remove ${p.name}`}
                      >
                        Remove
                      </button>
                    )}
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
