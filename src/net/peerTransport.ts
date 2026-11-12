import Peer, { DataConnection } from 'peerjs';
import { Connection, HostTransport, Unsub } from './transport';
import { getPeerConfig } from './config';

export class PeerDataConnection implements Connection {
  private messageListeners = new Set<(msg: unknown) => void>();
  private closeListeners = new Set<() => void>();
  private isClosed = false;

  constructor(private conn: DataConnection) {
    conn.on('data', (data: unknown) => {
      for (const l of this.messageListeners) {
        try {
          l(data);
        } catch (err) {
          console.error('Error handling peer message:', err);
        }
      }
    });

    const handleClose = () => {
      if (this.isClosed) return;
      this.isClosed = true;
      for (const l of this.closeListeners) {
        try {
          l();
        } catch (err) {
          console.error('Error handling peer close:', err);
        }
      }
    };

    conn.on('close', handleClose);
    conn.on('error', handleClose);
  }

  send(msg: unknown): void {
    if (this.isClosed || !this.conn.open) return;
    this.conn.send(msg);
  }

  onMessage(cb: (msg: unknown) => void): Unsub {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  onClose(cb: () => void): Unsub {
    this.closeListeners.add(cb);
    return () => this.closeListeners.delete(cb);
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      this.conn.close();
    } catch {
      // ignore
    }
  }
}

export function hostPeerId(code: string): string {
  return `bspoker-${code.toLowerCase()}`;
}

export class PeerHostTransport implements HostTransport {
  private peer: Peer;
  private connectionListeners = new Set<(c: Connection) => void>();
  private isClosed = false;

  constructor(code: string, onUnavailableId?: () => void) {
    const config = getPeerConfig();
    this.peer = new Peer(hostPeerId(code), config);

    this.peer.on('connection', (conn: DataConnection) => {
      if (this.isClosed) {
        conn.close();
        return;
      }
      conn.on('open', () => {
        const peerConn = new PeerDataConnection(conn);
        for (const l of this.connectionListeners) {
          l(peerConn);
        }
      });
    });

    this.peer.on('error', (err: { type?: string }) => {
      if (err?.type === 'unavailable-id') {
        if (onUnavailableId) {
          onUnavailableId();
        }
      }
    });
  }

  onConnection(cb: (c: Connection) => void): Unsub {
    this.connectionListeners.add(cb);
    return () => this.connectionListeners.delete(cb);
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.connectionListeners.clear();
    try {
      this.peer.destroy();
    } catch {
      // ignore
    }
  }
}

export async function connectToHost(lobbyCode: string): Promise<{ conn: Connection; peer: Peer }> {
  const config = getPeerConfig();
  const peer = new Peer(config);
  const targetId = hostPeerId(lobbyCode);

  return new Promise<{ conn: Connection; peer: Peer }>((resolve, reject) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        peer.destroy();
        reject(new Error('Connection timed out'));
      }
    }, 15000);

    peer.on('open', () => {
      const conn = peer.connect(targetId, {
        reliable: true,
        serialization: 'json',
      });

      conn.on('open', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ conn: new PeerDataConnection(conn), peer });
        }
      });

      conn.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          peer.destroy();
          reject(err);
        }
      });
    });

    peer.on('error', (err: { type?: string; message?: string }) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        peer.destroy();
        if (err.type === 'peer-unavailable') {
          reject(new Error('Lobby not found'));
        } else {
          reject(new Error(err.message || 'Failed to connect to lobby'));
        }
      }
    });
  });
}
