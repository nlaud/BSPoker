import { PlayerView, ClientMessage, HostMessage, PROTOCOL_VERSION } from '../engine/protocol';
import { Hand } from '../engine/hands';
import { Connection, Unsub } from './transport';
import { connectWebSocket } from './wsTransport';

export type ClientStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

/** Per-tab player token for one server, so a refresh rejoins the same seat. */
export function getOrCreateTabToken(serverKey: string): string {
  const key = `bspoker:token:${serverKey}`;
  try {
    if (typeof sessionStorage === 'undefined') {
      return `tok-${Math.random().toString(36).slice(2, 10)}`;
    }
    let tok = sessionStorage.getItem(key);
    if (!tok) {
      tok = `tok-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
      sessionStorage.setItem(key, tok);
    }
    return tok;
  } catch {
    return `tok-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getSavedPlayerName(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('bspoker:name') || '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('bspoker:name', name.trim().slice(0, 16));
  } catch {
    // ignore
  }
}

export interface ClientSessionOptions {
  /** Existing connection (tests and in-memory games) instead of dialing a server. */
  conn?: Connection;
  token?: string;
  /** Claims the host seat; only the host's own page has it. */
  hostKey?: string;
}

export class ClientSession {
  /** WebSocket address of the host's server, or 'memory' for an in-memory connection. */
  public readonly serverUrl: string;
  public token: string;
  public name: string;
  public playerId: string | null = null;
  public view: PlayerView | null = null;
  public status: ClientStatus = 'connecting';
  public errorMessage: string | null = null;

  private conn: Connection | null = null;
  private readonly hostKey: string | undefined;
  private isUsingMemoryConn = false;

  private viewListeners = new Set<(view: PlayerView) => void>();
  private statusListeners = new Set<(status: ClientStatus) => void>();

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;

  constructor(serverUrl: string, name: string, options: ClientSessionOptions = {}) {
    this.serverUrl = options.conn ? 'memory' : serverUrl;
    this.token = options.token || getOrCreateTabToken(this.serverUrl);
    this.hostKey = options.hostKey;
    this.name = name.trim().slice(0, 16) || 'Player';
    savePlayerName(this.name);

    if (options.conn) {
      this.isUsingMemoryConn = true;
      this.attachConnection(options.conn);
    } else {
      this.initiateConnection();
    }
  }

  private setStatus(status: ClientStatus, errorMsg?: string): void {
    this.status = status;
    if (errorMsg !== undefined) {
      this.errorMessage = errorMsg;
    }
    for (const l of this.statusListeners) {
      try {
        l(status);
      } catch (err) {
        console.error('Error in status listener:', err);
      }
    }
  }

  private async initiateConnection(): Promise<void> {
    if (this.isDestroyed) return;
    this.setStatus('connecting');

    try {
      const conn = await connectWebSocket(this.serverUrl);
      if (this.isDestroyed) {
        conn.close();
        return;
      }
      this.attachConnection(conn);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      this.setStatus('error', message);
    }
  }

  public attachConnection(conn: Connection): void {
    this.conn = conn;

    conn.onMessage((raw) => {
      this.handleHostMessage(raw as HostMessage);
    });

    conn.onClose(() => {
      this.handleConnectionLost();
    });

    // Send join message
    this.send({
      type: 'join',
      token: this.token,
      name: this.name,
      hostKey: this.hostKey,
      protocolVersion: PROTOCOL_VERSION,
    });

    // Start 5s ping
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.conn) {
        this.send({ type: 'ping' });
      }
    }, 5000);
  }

  private handleHostMessage(msg: HostMessage): void {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'welcome') {
      if (msg.protocolVersion !== PROTOCOL_VERSION) {
        this.setStatus(
          'error',
          'The host is running a different version of BSPoker. Ask them to update it (git pull) and restart npm run host.',
        );
        this.destroy();
        return;
      }
      this.playerId = msg.playerId;
      this.setStatus('connected');
      return;
    }

    if (msg.type === 'view') {
      this.view = msg.view;
      this.setStatus('connected');
      for (const l of this.viewListeners) {
        try {
          l(msg.view);
        } catch (err) {
          console.error('Error in view listener:', err);
        }
      }
      return;
    }

    if (msg.type === 'error') {
      this.setStatus('error', msg.message);
      return;
    }

    if (msg.type === 'pong') {
      // heartbeat response
      return;
    }
  }

  private handleConnectionLost(): void {
    if (this.isDestroyed) return;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.isUsingMemoryConn) {
      this.setStatus('disconnected', 'Host disconnected');
      return;
    }

    this.setStatus('reconnecting', 'Reconnecting to host...');

    // Attempt reconnect every 2s for up to 60s, one attempt at a time.
    const startedAt = Date.now();
    let attemptInFlight = false;
    if (this.reconnectInterval) clearInterval(this.reconnectInterval);

    this.reconnectInterval = setInterval(async () => {
      if (this.isDestroyed || attemptInFlight) return;
      if (Date.now() - startedAt >= 60000) {
        if (this.reconnectInterval) clearInterval(this.reconnectInterval);
        this.setStatus('disconnected', 'Host disconnected');
        return;
      }

      attemptInFlight = true;
      try {
        const conn = await connectWebSocket(this.serverUrl, 4000);
        if (this.isDestroyed) {
          conn.close();
          return;
        }
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
        this.attachConnection(conn);
      } catch {
        // Continue retrying
      } finally {
        attemptInFlight = false;
      }
    }, 2000);
  }

  public send(msg: ClientMessage): void {
    if (this.conn) {
      this.conn.send(msg);
    }
  }

  public setReady(ready: boolean): void {
    this.send({ type: 'setReady', ready });
  }

  public peek(peeking: boolean): void {
    this.send({ type: 'peek', peeking });
  }

  public call(hand: Hand): void {
    this.send({ type: 'call', hand });
  }

  public bs(): void {
    this.send({ type: 'bs' });
  }

  public playAgain(): void {
    this.send({ type: 'playAgain' });
  }

  public leave(): void {
    this.send({ type: 'leave' });
  }

  public kick(playerId: string): void {
    this.send({ type: 'kick', playerId });
  }

  public setRule(rule: 'straightBeatsFlush', value: boolean): void {
    this.send({ type: 'setRule', rule, value });
  }

  public onView(cb: (view: PlayerView) => void): Unsub {
    this.viewListeners.add(cb);
    if (this.view) {
      cb(this.view);
    }
    return () => this.viewListeners.delete(cb);
  }

  public onStatus(cb: (status: ClientStatus) => void): Unsub {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }

    this.viewListeners.clear();
    this.statusListeners.clear();
  }
}
