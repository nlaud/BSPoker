import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ClientSession, getSavedPlayerName } from '../net/client';
import { lookupHost, toWebSocketUrl } from '../net/directory';
import { PlayerView } from '../engine/protocol';
import { Hand } from '../engine/hands';
import { Landing } from './Landing';
import { Lobby } from './Lobby';
import { Table } from './Table';
import { initSound } from './sound';
import { detectPageMode, setQuery } from './connection';

const LAST_JOIN_KEY = 'bspoker:lastJoin';

interface LastJoin {
  code: string | null;
  wsUrl: string;
}

function readLastJoin(): LastJoin | null {
  try {
    const raw = sessionStorage.getItem(LAST_JOIN_KEY);
    return raw ? (JSON.parse(raw) as LastJoin) : null;
  } catch {
    return null;
  }
}

function writeLastJoin(value: LastJoin | null): void {
  try {
    if (value) sessionStorage.setItem(LAST_JOIN_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(LAST_JOIN_KEY);
  } catch {
    // Storage unavailable: a refresh just shows the join screen.
  }
}

export const App: React.FC = () => {
  const [mode] = useState(detectPageMode);
  const [clientSession, setClientSession] = useState<ClientSession | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [clientStatus, setClientStatus] = useState<string>('idle');
  const [clientError, setClientError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  /** Last code the player tried, so a failed lookup keeps it in the form for a quick fix. */
  const [attemptedCode, setAttemptedCode] = useState<string>('');
  const [initialCode] = useState(
    () => new URLSearchParams(window.location.search).get('code')?.toUpperCase().slice(0, 4) ?? '',
  );
  const hostKeyRef = useRef<string | null>(new URLSearchParams(window.location.search).get('host'));
  /** Name from `npm run host -- --name <n>`, carried in the host link. */
  const linkNameRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('name')?.trim().slice(0, 16) || null,
  );
  const clientSessionRef = useRef<ClientSession | null>(null);

  useEffect(() => {
    initSound();
  }, []);

  const cleanupSession = useCallback(() => {
    clientSessionRef.current?.destroy();
    clientSessionRef.current = null;
    setClientSession(null);
    setView(null);
    setClientStatus('idle');
  }, []);

  const startClient = useCallback(
    (wsUrl: string, playerName: string, code: string | null) => {
      cleanupSession();
      setClientError(null);
      const client = new ClientSession(wsUrl, playerName, { hostKey: hostKeyRef.current ?? undefined });
      clientSessionRef.current = client;
      setClientSession(client);
      writeLastJoin({ code, wsUrl });
      // The host key is only needed for the first join; keep it out of the address bar.
      if (hostKeyRef.current || linkNameRef.current) {
        hostKeyRef.current = null;
        linkNameRef.current = null;
        setQuery({ host: null, name: null });
      }
      client.onView((newView) => {
        setView(newView);
        if (code === null && mode.kind !== 'served') setQuery({ code: newView.lobbyCode });
      });
      client.onStatus((status) => {
        setClientStatus(status);
        if (status === 'error' && client.errorMessage) setClientError(client.errorMessage);
      });
    },
    [cleanupSession, mode.kind],
  );

  const joinByCode = useCallback(
    async (code: string, playerName: string) => {
      const clean = code.toUpperCase();
      setClientError(null);
      setAttemptedCode(clean);
      setLookingUp(clean);
      try {
        const serverUrl = await lookupHost(clean);
        setQuery({ code: clean });
        startClient(toWebSocketUrl(serverUrl), playerName, clean);
      } catch (err) {
        setClientError(err instanceof Error ? err.message : 'Could not join that game');
      } finally {
        setLookingUp(null);
      }
    },
    [startClient],
  );

  // A refresh rejoins the same seat; a host link joins straight away.
  useEffect(() => {
    const name = linkNameRef.current || getSavedPlayerName();
    const last = readLastJoin();
    if (mode.kind !== 'code') {
      if (hostKeyRef.current || (last && last.wsUrl === mode.wsUrl)) {
        startClient(mode.wsUrl, name || (hostKeyRef.current ? 'Host' : 'Player'), null);
      }
      return;
    }
    if (initialCode && last && last.code === initialCode) {
      startClient(last.wsUrl, name || 'Player', initialCode);
    }
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLeave = () => {
    clientSessionRef.current?.leave();
    cleanupSession();
    writeLastJoin(null);
    setQuery({ code: null });
  };

  if (clientStatus === 'disconnected') {
    return (
      <div className="center-screen">
        <div className="landing-card text-center">
          <h2 className="landing-title">Host disconnected</h2>
          <p className="status-subtext">The game server stopped or can no longer be reached.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={handleLeave}>
            Back to start
          </button>
        </div>
      </div>
    );
  }

  if (view && clientStatus !== 'error') {
    const banner =
      clientStatus === 'reconnecting' ? <div className="reconnecting-banner">Reconnecting to host...</div> : null;
    if (view.phase === 'lobby') {
      return (
        <>
          {banner}
          <Lobby
            view={view}
            onSetReady={(ready) => clientSession?.setReady(ready)}
            onLeave={handleLeave}
            onSetRule={(rule, value) => clientSession?.setRule(rule, value)}
            onSetTurnTimer={(seconds) => clientSession?.setTurnTimer(seconds)}
            onKick={(playerId) => clientSession?.kick(playerId)}
          />
        </>
      );
    }
    return (
      <>
        {banner}
        <Table
          view={view}
          onCallHand={(hand: Hand) => clientSession?.call(hand)}
          onCallBs={() => clientSession?.bs()}
          onPeekChange={(peeking: boolean) => clientSession?.peek(peeking)}
          onKick={(playerId: string) => clientSession?.kick(playerId)}
          onPlayAgain={() => clientSession?.playAgain()}
          onLeave={handleLeave}
        />
      </>
    );
  }

  if (lookingUp || clientStatus === 'connecting') {
    return (
      <div className="center-screen">
        <div className="landing-card text-center">
          <h2 className="landing-title">Connecting...</h2>
          <p className="status-subtext">{lookingUp ? `Finding game ${lookingUp}` : 'Reaching the game server'}</p>
        </div>
      </div>
    );
  }

  return (
    <Landing
      needsCode={mode.kind === 'code'}
      initialCode={attemptedCode || initialCode}
      errorMessage={clientError}
      onJoin={(name, code) => {
        if (mode.kind === 'code') void joinByCode(code, name);
        else startClient(mode.wsUrl, name, null);
      }}
    />
  );
};
