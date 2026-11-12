import { GameState, createInitialState, gameReducer, GameAction } from '../engine/game';
import { redact } from '../engine/view';
import { ClientMessage, HostMessage, PROTOCOL_VERSION } from '../engine/protocol';
import { Connection, HostTransport, Unsub } from './transport';
import { MemoryHostTransport } from './memoryTransport';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

/** A player who leaves the lobby (tab closed) keeps their seat this long for a refresh. */
export const LOBBY_GRACE_MS = 15000;

export function generateLobbyCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

export interface HostSessionOptions {
  /** Extra transports to accept players on (for example the server's WebSocket transport). */
  transports?: HostTransport[];
  /**
   * When set, only a join that presents this key takes the host seat. Without
   * it (tests, in-memory games) the first player to join becomes the host.
   */
  hostKey?: string;
  /** Called after every state change, for logging. */
  onChange?: (state: GameState) => void;
  /** Identifies this server run; defaults to a random id. */
  serverId?: string;
}

/**
 * The authoritative game: owns the GameState, applies client intents through
 * the pure reducer, drives the timers, and sends every connection its own
 * redacted view after each change. It runs inside the host's server.
 */
export class HostSession {
  public state: GameState;
  public readonly lobbyCode: string;
  public readonly memoryTransport: MemoryHostTransport;

  private readonly hostKey: string | undefined;
  public readonly serverId: string;
  private readonly onChange: ((state: GameState) => void) | undefined;
  private readonly transports: HostTransport[];
  private connections = new Map<string, Connection>();
  private connToPlayer = new Map<string, string>();
  private lastPing = new Map<string, number>();

  private unsubs: Unsub[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  /** The countdown deadline the running timer was set for. */
  private countdownTimerDeadline: number | null = null;
  private revealTimeouts: ReturnType<typeof setTimeout>[] = [];
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  /** The turn deadline the running turn timer was set for. */
  private turnTimerDeadline: number | null = null;
  private lobbyGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private isDestroyed = false;

  constructor(code: string, hostPlayerId: string, options: HostSessionOptions = {}) {
    this.lobbyCode = code.toUpperCase();
    this.hostKey = options.hostKey;
    this.serverId = options.serverId ?? `s-${Math.random().toString(36).slice(2, 10)}`;
    this.onChange = options.onChange;
    this.state = createInitialState(this.lobbyCode, hostPlayerId);
    this.memoryTransport = new MemoryHostTransport();
    this.transports = [this.memoryTransport, ...(options.transports ?? [])];

    for (const transport of this.transports) {
      this.unsubs.push(transport.onConnection((conn) => this.handleNewConnection(conn)));
    }

    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 5000);
  }

  public get connectionCount(): number {
    return this.connections.size;
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
    // Another connection may already serve this player (for example a refresh
    // that reconnected before the old socket closed).
    if ([...this.connToPlayer.values()].includes(playerId)) return;
    this.dispatch({ type: 'setConnected', playerId, connected: false });
    this.scheduleLobbyRemoval(playerId);
  }

  /**
   * In the lobby, an offline player would block "everyone ready" forever, so
   * their seat is freed after a short grace period unless they come back.
   */
  private scheduleLobbyRemoval(playerId: string): void {
    if (this.state.phase !== 'lobby') return;
    this.cancelLobbyRemoval(playerId);
    this.lobbyGraceTimers.set(
      playerId,
      setTimeout(() => {
        this.lobbyGraceTimers.delete(playerId);
        const p = this.state.players.find((player) => player.id === playerId);
        if (this.state.phase === 'lobby' && p && !p.connected) {
          this.dispatch({ type: 'cleanDisconnectedInLobby', playerId });
        }
      }, LOBBY_GRACE_MS),
    );
  }

  private cancelLobbyRemoval(playerId: string): void {
    const t = this.lobbyGraceTimers.get(playerId);
    if (t) clearTimeout(t);
    this.lobbyGraceTimers.delete(playerId);
  }

  /** Player id for a join, honoring the host key when one is configured. */
  private resolveJoin(msg: Extract<ClientMessage, { type: 'join' }>): { playerId: string; token: string } {
    const hostId = this.state.hostPlayerId;
    const claimsHost = this.hostKey !== undefined && msg.hostKey === this.hostKey;

    if (claimsHost) {
      // The host may come back from a new tab or device: reuse the host seat.
      const hostPlayer = this.state.players.find((p) => p.id === hostId);
      return { playerId: hostId, token: hostPlayer ? hostPlayer.token : msg.token };
    }

    const existing = this.state.players.find((p) => p.token === msg.token);
    if (existing) return { playerId: existing.id, token: msg.token };

    const firstJoinBecomesHost = this.hostKey === undefined && this.state.players.length === 0;
    return {
      playerId: firstJoinBecomesHost ? hostId : `p-${Math.random().toString(36).slice(2, 9)}`,
      token: msg.token,
    };
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
      if (msg.protocolVersion !== PROTOCOL_VERSION) {
        conn.send({
          type: 'error',
          message:
            'The host is running a different version of BSPoker. Ask them to update it (git pull) and restart npm run host.',
          fatal: true,
        } satisfies HostMessage);
        conn.close();
        return;
      }
      if (msg.serverId && msg.serverId !== this.serverId) {
        // A tab from before a restart: do not turn it into a ghost seat.
        conn.send({
          type: 'error',
          message: 'The host restarted the game. Join again with the new code.',
          fatal: true,
        } satisfies HostMessage);
        conn.close();
        return;
      }
      const { playerId, token } = this.resolveJoin(msg);
      this.cancelLobbyRemoval(playerId);
      this.dispatch({ type: 'join', token, name: msg.name, playerId });
      this.connToPlayer.set(connId, playerId);
      this.lastPing.set(playerId, Date.now());
      conn.send({
        type: 'welcome',
        playerId,
        protocolVersion: PROTOCOL_VERSION,
        serverId: this.serverId,
      } satisfies HostMessage);
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
        break;
      }
      case 'setTurnTimer': {
        this.dispatch({ type: 'setTurnTimer', playerId, seconds: msg.seconds });
        break;
      }
    }
  }

  public dispatch(action: GameAction): void {
    if (this.isDestroyed) return;
    const prevPhase = this.state.phase;
    this.state = gameReducer(this.state, action);
    this.onChange?.(this.state);
    this.broadcast();
    // Any change can start, move or cancel the lobby countdown (ready, join,
    // leave, Remove, a timed-out seat), so keep the timer in step with it.
    this.checkCountdown();
    this.checkTurnTimer();
    // A BS call, typed or forced by the turn timer, starts the reveal.
    if (prevPhase !== 'reveal' && this.state.phase === 'reveal') this.startRevealSequence();
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnTimerDeadline = null;
  }

  /** Keeps one timer armed for the current turn deadline; it acts for the player when it fires. */
  private checkTurnTimer(): void {
    const deadline = this.state.phase === 'bidding' ? this.state.turnDeadline : null;
    const playerId = this.state.turnPlayerId;
    if (deadline === null || playerId === null) {
      this.clearTurnTimer();
      return;
    }
    if (this.turnTimer && this.turnTimerDeadline === deadline) return;
    this.clearTurnTimer();
    this.turnTimerDeadline = deadline;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      this.turnTimerDeadline = null;
      this.dispatch({ type: 'turnTimeout', playerId, deadline });
    }, Math.max(0, deadline - Date.now()));
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
    this.countdownTimerDeadline = null;
  }

  private checkCountdown(): void {
    const deadline = this.state.phase === 'lobby' ? this.state.countdownDeadline : null;
    if (deadline === null) {
      this.clearCountdownTimer();
      return;
    }
    if (this.countdownTimer && this.countdownTimerDeadline === deadline) return;
    this.clearCountdownTimer();
    this.countdownTimerDeadline = deadline;
    this.countdownTimer = setTimeout(() => {
      this.countdownTimer = null;
      this.countdownTimerDeadline = null;
      if (this.state.phase !== 'lobby' || this.state.countdownDeadline === null) return;
      const seated = this.state.players.filter((p) => !p.isSpectator);
      if (seated.length >= 2 && seated.every((p) => p.ready)) {
        this.dispatch({ type: 'startGame' });
      } else {
        this.dispatch({ type: 'cancelCountdown' });
      }
    }, Math.max(0, deadline - Date.now()));
  }

  private startRevealSequence(): void {
    for (const t of this.revealTimeouts) clearTimeout(t);
    this.revealTimeouts = [];

    const order = this.state.revealData?.revealOrder || [];
    // 600 ms per hand flip in revealOrder
    for (let i = 1; i <= order.length; i++) {
      this.revealTimeouts.push(
        setTimeout(() => {
          if (this.state.phase === 'reveal') this.dispatch({ type: 'revealStep' });
        }, i * 600),
      );
    }

    // After all flips, show the verdict, hold it 3.5 s, then resolve.
    const flipsDoneTime = order.length * 600;
    this.revealTimeouts.push(
      setTimeout(() => {
        if (this.state.phase === 'reveal') this.dispatch({ type: 'showVerdict' });
      }, flipsDoneTime),
      setTimeout(() => {
        if (this.state.phase === 'reveal') this.dispatch({ type: 'resolveReveal' });
      }, flipsDoneTime + 3500),
    );
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
        this.scheduleLobbyRemoval(p.id);
      }
    }
    if (changed) this.broadcast();
  }

  public broadcast(): void {
    if (this.isDestroyed) return;
    for (const [connId, conn] of this.connections.entries()) {
      const playerId = this.connToPlayer.get(connId) || null;
      conn.send({ type: 'view', view: redact(this.state, playerId) } satisfies HostMessage);
    }
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.clearCountdownTimer();
    this.clearTurnTimer();
    for (const t of this.revealTimeouts) clearTimeout(t);
    this.revealTimeouts = [];
    for (const t of this.lobbyGraceTimers.values()) clearTimeout(t);
    this.lobbyGraceTimers.clear();
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    for (const conn of this.connections.values()) conn.close();
    this.connections.clear();
    for (const transport of this.transports) transport.close();
  }
}
