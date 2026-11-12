import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HostSession, loadHostState, clearHostState, generateLobbyCode } from '../net/host';
import { ClientSession, getSavedPlayerName, getOrCreateTabToken } from '../net/client';
import { PlayerView } from '../engine/protocol';
import { Hand } from '../engine/hands';
import { Landing } from './Landing';
import { Lobby } from './Lobby';
import { Table } from './Table';
import { initSound } from './sound';
import { isHostOfCurrentTab } from './storage';

export const App: React.FC = () => {
  const [clientSession, setClientSession] = useState<ClientSession | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [clientStatus, setClientStatus] = useState<string>('idle');
  const [clientError, setClientError] = useState<string | null>(null);
  const [initialLobbyCode, setInitialLobbyCode] = useState<string>('');

  const hostSessionRef = useRef<HostSession | null>(null);
  const clientSessionRef = useRef<ClientSession | null>(null);

  // Initialize sound on mount
  useEffect(() => {
    initSound();
  }, []);

  const cleanupSessions = useCallback(() => {
    if (clientSessionRef.current) {
      clientSessionRef.current.destroy();
      clientSessionRef.current = null;
    }
    if (hostSessionRef.current) {
      hostSessionRef.current.destroy();
      hostSessionRef.current = null;
    }
    setClientSession(null);
    setView(null);
    setClientStatus('idle');
    setClientError(null);
  }, []);

  const resumeHosting = useCallback((code: string) => {
    cleanupSessions();

    const saved = loadHostState(code);
    if (!saved) return;

    const token = getOrCreateTabToken(code);
    const hostPlayer = saved.state.players.find((p) => p.seatIndex === 0) || saved.state.players[0];
    const hostPlayerId = hostPlayer ? hostPlayer.id : 'host-1';
    const hostName = hostPlayer ? hostPlayer.name : (getSavedPlayerName() || 'Host');

    const host = new HostSession(code, hostPlayerId, saved.state, true);
    hostSessionRef.current = host;

    const clientConn = host.memoryTransport.connectClient();
    const client = new ClientSession(code, hostName, clientConn, token);
    clientSessionRef.current = client;
    setClientSession(client);

    client.onView((newView) => setView(newView));
    client.onStatus((status) => {
      setClientStatus(status);
      if (client.errorMessage) {
        setClientError(client.errorMessage);
      }
    });
  }, [cleanupSessions]);

  const joinExistingLobby = useCallback((code: string, playerName: string, customToken?: string) => {
    cleanupSessions();

    const cleanCode = code.toUpperCase();
    const client = new ClientSession(cleanCode, playerName, undefined, customToken);
    clientSessionRef.current = client;
    setClientSession(client);

    // Update URL
    if (typeof window !== 'undefined' && window.history) {
      const url = new URL(window.location.href);
      url.searchParams.set('lobby', cleanCode);
      window.history.replaceState({}, '', url.toString());
    }

    client.onView((newView) => setView(newView));
    client.onStatus((status) => {
      setClientStatus(status);
      if (client.errorMessage) {
        setClientError(client.errorMessage);
      }
    });
  }, [cleanupSessions]);

  // Check URL and resume conditions on initial mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const lobbyParam = params.get('lobby')?.toUpperCase() || '';
    if (lobbyParam) {
      setInitialLobbyCode(lobbyParam);
    }

    // Check if we should resume hosting
    if (lobbyParam && isHostOfCurrentTab(lobbyParam)) {
      const savedHost = loadHostState(lobbyParam);
      if (savedHost) {
        resumeHosting(lobbyParam);
        return;
      }
    }

    // Auto-rejoin as client if token exists for this lobby
    if (lobbyParam) {
      const tokenKey = `bspoker:token:${lobbyParam}`;
      const savedToken = sessionStorage.getItem(tokenKey);
      if (savedToken) {
        const playerName = getSavedPlayerName() || 'Player';
        joinExistingLobby(lobbyParam, playerName, savedToken);
      }
    }
  }, [resumeHosting, joinExistingLobby]);

  const createLobby = (hostName: string) => {
    cleanupSessions();

    const code = generateLobbyCode();
    const token = getOrCreateTabToken(code);
    const hostPlayerId = `p-${Math.random().toString(36).slice(2, 9)}`;

    const host = new HostSession(code, hostPlayerId, undefined, true);
    hostSessionRef.current = host;

    // Host's UI connects through host.memoryTransport
    const clientConn = host.memoryTransport.connectClient();
    const client = new ClientSession(code, hostName, clientConn, token);
    clientSessionRef.current = client;
    setClientSession(client);

    client.onView((newView) => setView(newView));
    client.onStatus((status) => {
      setClientStatus(status);
      if (client.errorMessage) {
        setClientError(client.errorMessage);
      }
    });
  };

  const handleLeave = () => {
    if (clientSessionRef.current) {
      clientSessionRef.current.leave();
    }
    if (hostSessionRef.current) {
      clearHostState(hostSessionRef.current.lobbyCode);
    }
    cleanupSessions();

    // Clean URL
    if (typeof window !== 'undefined' && window.history) {
      const url = new URL(window.location.href);
      url.searchParams.delete('lobby');
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Reconnecting banner / Host disconnected screen
  if (clientStatus === 'disconnected') {
    return (
      <div className="center-screen">
        <div className="landing-card text-center">
          <h2 className="landing-title">Host disconnected</h2>
          <p className="status-subtext">The game session has ended.</p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleLeave}
          >
            Back to start
          </button>
        </div>
      </div>
    );
  }

  // Active view exists
  if (view && clientStatus !== 'error') {
    if (view.phase === 'lobby') {
      return (
        <>
          {clientStatus === 'reconnecting' && (
            <div className="reconnecting-banner">Reconnecting to host...</div>
          )}
          <Lobby
            view={view}
            onSetReady={(ready) => clientSession?.setReady(ready)}
            onLeave={handleLeave}
            onSetRule={(rule, value) => clientSession?.setRule(rule, value)}
          />
        </>
      );
    }

    return (
      <>
        {clientStatus === 'reconnecting' && (
          <div className="reconnecting-banner">Reconnecting to host...</div>
        )}
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

  // Connecting spinner
  if (clientStatus === 'connecting') {
    return (
      <div className="center-screen">
        <div className="landing-card text-center">
          <h2 className="landing-title">Connecting...</h2>
          <p className="status-subtext">Reaching table {initialLobbyCode}</p>
        </div>
      </div>
    );
  }

  // Landing screen
  return (
    <Landing
      initialCode={initialLobbyCode}
      errorMessage={clientError}
      onCreateLobby={createLobby}
      onJoinLobby={(c, n) => joinExistingLobby(c, n)}
      onResumeHosting={(c) => resumeHosting(c)}
    />
  );
};
