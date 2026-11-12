import { PlayerView, ClientMessage, HostMessage } from '../engine/protocol';
import { Hand } from '../engine/hands';
import { Connection, Unsub } from './transport';
import { connectToHost } from './peerTransport';
import Peer from 'peerjs';

export type ClientStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export function getOrCreateTabToken(code: string): string {
  const key = `bspoker:token:${code.toUpperCase()}`;
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

export class ClientSession {
  public lobbyCode: string;
  public token: string;
  public name: string;
  public playerId: string | null = null;
  public view: PlayerView | null = null;
  public status: ClientStatus = 'connecting';
  public errorMessage: string | null = null;

  private conn: Connection | null = null;
  private peer: Peer | null = null;
  private isUsingMemoryConn = false;

  private viewListeners = new Set<(view: PlayerView) => void>();
  private statusListeners = new Set<(status: ClientStatus) => void>();

  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  constructor(
    code: string,
    name: string,
    customConn?: Connection,
    customToken?: string
  ) {
    this.lobbyCode = code.toUpperCase();
    this.token = customToken || getOrCreateTabToken(this.lobbyCode);
    this.name = name.trim().slice(0, 16) || 'Player';
    savePlayerName(this.name);

    if (customConn) {
      this.isUsingMemoryConn = true;
      this.attachConnection(customConn);
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
      const { conn, peer } = await connectToHost(this.lobbyCode);
      if (this.isDestroyed) {
        conn.close();
        peer.destroy();
        return;
      }
      this.peer = peer;
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

    // Attempt reconnect every 2s for up to 60s
    let elapsed = 0;
    if (this.reconnectInterval) clearInterval(this.reconnectInterval);

    this.reconnectInterval = setInterval(async () => {
      if (this.isDestroyed) return;
      elapsed += 2000;
      if (elapsed >= 60000) {
        if (this.reconnectInterval) clearInterval(this.reconnectInterval);
        this.setStatus('disconnected', 'Host disconnected');
        return;
      }

      try {
        const { conn, peer } = await connectToHost(this.lobbyCode);
        if (this.isDestroyed) {
          conn.close();
          peer.destroy();
          return;
        }
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
        if (this.peer) this.peer.destroy();
        this.peer = peer;
        this.attachConnection(conn);
      } catch {
        // Continue retrying
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
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    this.viewListeners.clear();
    this.statusListeners.clear();
  }
}
