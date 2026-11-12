import {
  GameState,
  createInitialState,
  gameReducer,
  GameAction,
} from '../engine/game';
import { redact } from '../engine/view';
import { ClientMessage, HostMessage } from '../engine/protocol';
import { Connection, Unsub } from './transport';
import { PeerHostTransport } from './peerTransport';
import { MemoryHostTransport } from './memoryTransport';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateLobbyCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

export interface SavedHostData {
  state: GameState;
  savedAt: number;
}

export function saveHostState(code: string, state: GameState): void {
  try {
    if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return;
    const data: SavedHostData = {
      state,
      savedAt: Date.now(),
    };
    localStorage.setItem(`bspoker:host:${code.toUpperCase()}`, JSON.stringify(data));
    sessionStorage.setItem('bspoker:hostOf', code.toUpperCase());
  } catch (err) {
    console.error('Failed to save host state:', err);
  }
}

export function loadHostState(code: string): SavedHostData | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(`bspoker:host:${code.toUpperCase()}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedHostData;
    // Less than 2 hours old
    const twoHours = 2 * 60 * 60 * 1000;
    if (Date.now() - data.savedAt > twoHours) {
      clearHostState(code);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Failed to load host state:', err);
    return null;
  }
}

export function clearHostState(code: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`bspoker:host:${code.toUpperCase()}`);
    }
    if (typeof sessionStorage !== 'undefined') {
      if (sessionStorage.getItem('bspoker:hostOf') === code.toUpperCase()) {
        sessionStorage.removeItem('bspoker:hostOf');
      }
    }
  } catch {
    // ignore
  }
}

export class HostSession {
  public state: GameState;
  public lobbyCode: string;
  private connections = new Map<string, Connection>();
  private connToPlayer = new Map<string, string>();
  private playerToConn = new Map<string, string>();
  private lastPing = new Map<string, number>();

  private peerTransport: PeerHostTransport | null = null;
  public memoryTransport: MemoryHostTransport;

  private unsubs: Unsub[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private revealTimeouts: NodeJS.Timeout[] = [];
  private isDestroyed = false;

  constructor(
    code: string,
    hostPlayerId: string,
    existingState?: GameState,
    usePeerTransport = true
  ) {
    this.lobbyCode = code.toUpperCase();
    this.state = existingState || createInitialState(this.lobbyCode, hostPlayerId);
    if (!this.state.settings) {
      this.state.settings = { straightBeatsFlush: false };
    }
    this.memoryTransport = new MemoryHostTransport();

    // Listen on memory transport
    this.unsubs.push(
      this.memoryTransport.onConnection((conn) => this.handleNewConnection(conn))
    );

    // Listen on PeerJS transport if enabled
    if (usePeerTransport && typeof window !== 'undefined') {
      this.peerTransport = new PeerHostTransport(this.lobbyCode, () => {
        console.warn('Peer ID collision on host transport');
      });
      this.unsubs.push(
        this.peerTransport.onConnection((conn) => this.handleNewConnection(conn))
      );
    }

    // Start heartbeat monitor
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 5000);

    // Save initial state
    saveHostState(this.lobbyCode, this.state);

    // Update URL query string
    if (typeof window !== 'undefined' && window.history) {
      const url = new URL(window.location.href);
      url.searchParams.set('lobby', this.lobbyCode);
      window.history.replaceState({}, '', url.toString());
    }
  }

  private handleNewConnection(conn: Connection): void {
    const connId = `c-${Math.random().toString(36).slice(2, 9)}`;
    this.connections.set(connId, conn);

    const unsubMsg = conn.onMessage((raw) => {
      this.handleClientMessage(connId, raw as ClientMessage);
    });

    const unsubClose = conn.onClose(() => {
      this.handleConnectionClose(connId);
      unsubMsg();
      unsubClose();
    });
  }

  private handleConnectionClose(connId: string): void {
    this.connections.delete(connId);
    const playerId = this.connToPlayer.get(connId);
    if (!playerId) return;

    this.connToPlayer.delete(connId);
    this.playerToConn.delete(playerId);

    if (this.state.phase === 'lobby') {
      // In lobby, mark disconnected. Grace period removes after 15s
      this.dispatch({ type: 'setConnected', playerId, connected: false });
    } else {
      this.dispatch({ type: 'setConnected', playerId, connected: false });
    }
  }

  private handleClientMessage(connId: string, msg: ClientMessage): void {
    const conn = this.connections.get(connId);
    if (!conn || !msg || typeof msg !== 'object') return;

    if (msg.type === 'ping') {
      const playerId = this.connToPlayer.get(connId);
      if (playerId) {
        this.lastPing.set(playerId, Date.now());
        const p = this.state.players.find((player) => player.id === playerId);
        if (p && !p.connected) {
          this.dispatch({ type: 'setConnected', playerId, connected: true });
        }
      }
      conn.send({ type: 'pong' } satisfies HostMessage);
      return;
    }

    if (msg.type === 'join') {
      const existing = this.state.players.find((p) => p.token === msg.token);
      let assignedId: string;

      if (existing) {
        assignedId = existing.id;
        this.dispatch({
          type: 'join',
          token: msg.token,
          name: msg.name,
          playerId: assignedId,
        });
      } else {
        assignedId =
          this.state.players.length === 0
            ? this.state.hostPlayerId
            : `p-${Math.random().toString(36).slice(2, 9)}`;
        this.dispatch({
          type: 'join',
          token: msg.token,
          name: msg.name,
          playerId: assignedId,
        });
      }

      this.connToPlayer.set(connId, assignedId);
      this.playerToConn.set(assignedId, connId);
      this.lastPing.set(assignedId, Date.now());

      conn.send({ type: 'welcome', playerId: assignedId } satisfies HostMessage);
      this.broadcast();
      return;
    }

    const playerId = this.connToPlayer.get(connId);
    if (!playerId) {
      conn.send({ type: 'error', message: 'Not joined' } satisfies HostMessage);
      return;
    }

    switch (msg.type) {
      case 'setReady': {
        this.dispatch({ type: 'setReady', playerId, ready: msg.ready, now: Date.now() });
        this.checkCountdown();
        break;
      }
      case 'peek': {
        this.dispatch({ type: 'peek', playerId, peeking: msg.peeking });
        break;
      }
      case 'call': {
        this.dispatch({ type: 'call', playerId, hand: msg.hand });
        break;
      }
      case 'bs': {
        this.dispatch({ type: 'bs', playerId });
        if (this.state.phase === 'reveal') {
          this.startRevealSequence();
        }
        break;
      }
      case 'playAgain': {
        this.dispatch({ type: 'playAgain' });
        break;
      }
      case 'leave': {
        this.dispatch({ type: 'leave', playerId });
        break;
      }
      case 'kick': {
        if (playerId === this.state.hostPlayerId) {
          this.dispatch({ type: 'kick', playerId: msg.playerId });
        }
        break;
      }
      case 'setRule': {
        this.dispatch({ type: 'setRule', playerId, rule: msg.rule, value: msg.value });
        this.checkCountdown();
        break;
      }
    }
  }

  public dispatch(action: GameAction): void {
    if (this.isDestroyed) return;
    this.state = gameReducer(this.state, action);
    saveHostState(this.lobbyCode, this.state);
    this.broadcast();
  }

  private checkCountdown(): void {
    if (this.state.phase !== 'lobby') {
      if (this.countdownTimer) {
        clearTimeout(this.countdownTimer);
        this.countdownTimer = null;
      }
      return;
    }

    if (this.state.countdownDeadline !== null) {
      if (!this.countdownTimer) {
        const remaining = Math.max(0, this.state.countdownDeadline - Date.now());
        this.countdownTimer = setTimeout(() => {
          this.countdownTimer = null;
          if (this.state.phase === 'lobby' && this.state.countdownDeadline !== null) {
            const seated = this.state.players.filter((p) => !p.isSpectator);
            if (seated.length >= 2 && seated.every((p) => p.ready)) {
              this.dispatch({ type: 'startGame' });
            } else {
              this.dispatch({ type: 'cancelCountdown' });
            }
          }
        }, remaining);
      }
    } else {
      if (this.countdownTimer) {
        clearTimeout(this.countdownTimer);
        this.countdownTimer = null;
      }
    }
  }

  private startRevealSequence(): void {
    for (const t of this.revealTimeouts) {
      clearTimeout(t);
    }
    this.revealTimeouts = [];

    const order = this.state.revealData?.revealOrder || [];
    // 600 ms per hand flip in revealOrder
    for (let i = 1; i <= order.length; i++) {
      const t = setTimeout(() => {
        if (this.state.phase === 'reveal') {
          this.dispatch({ type: 'revealStep' });
        }
      }, i * 600);
      this.revealTimeouts.push(t);
    }

    // After all flips, show verdict
    const flipsDoneTime = order.length * 600;
    const verdictTimeout = setTimeout(() => {
      if (this.state.phase === 'reveal') {
        this.dispatch({ type: 'showVerdict' });
      }
    }, flipsDoneTime);
    this.revealTimeouts.push(verdictTimeout);

    // Hold verdict for 3500 ms, then resolveReveal
    const resolveTimeout = setTimeout(() => {
      if (this.state.phase === 'reveal') {
        this.dispatch({ type: 'resolveReveal' });
      }
    }, flipsDoneTime + 3500);
    this.revealTimeouts.push(resolveTimeout);
  }

  private checkHeartbeats(): void {
    if (this.isDestroyed) return;
    const now = Date.now();
    let changed = false;

    for (const p of this.state.players) {
      const last = this.lastPing.get(p.id) || 0;
      if (now - last > 15000 && p.connected) {
        p.connected = false;
        changed = true;
      }
    }

    if (changed) {
      saveHostState(this.lobbyCode, this.state);
      this.broadcast();
    }
  }

  public broadcast(): void {
    if (this.isDestroyed) return;

    for (const [connId, conn] of this.connections.entries()) {
      const playerId = this.connToPlayer.get(connId) || null;
      const view = redact(this.state, playerId);
      conn.send({ type: 'view', view } satisfies HostMessage);
    }
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    for (const t of this.revealTimeouts) {
      clearTimeout(t);
    }
    this.revealTimeouts = [];

    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];

    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();

    if (this.peerTransport) {
      this.peerTransport.close();
      this.peerTransport = null;
    }
    this.memoryTransport.close();
  }
}
