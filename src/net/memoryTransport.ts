import { Connection, HostTransport, Unsub } from './transport';

export class MemoryConnection implements Connection {
  private peerConn: MemoryConnection | null = null;
  private messageListeners = new Set<(msg: unknown) => void>();
  private closeListeners = new Set<() => void>();
  private closed = false;

  setPeer(peer: MemoryConnection): void {
    this.peerConn = peer;
  }

  send(msg: unknown): void {
    if (this.closed || !this.peerConn || this.peerConn.closed) return;
    // Deep clone message so sender and receiver don't share object mutations
    const cloned = JSON.parse(JSON.stringify(msg));
    queueMicrotask(() => {
      if (this.peerConn && !this.peerConn.closed) {
        this.peerConn.deliverMessage(cloned);
      }
    });
  }

  deliverMessage(msg: unknown): void {
    if (this.closed) return;
    for (const listener of this.messageListeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error('Error in message listener:', err);
      }
    }
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
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.closeListeners) {
      try {
        listener();
      } catch (err) {
        console.error('Error in close listener:', err);
      }
    }
    if (this.peerConn && !this.peerConn.closed) {
      this.peerConn.close();
    }
  }
}

export function createMemoryPair(): [Connection, Connection] {
  const c1 = new MemoryConnection();
  const c2 = new MemoryConnection();
  c1.setPeer(c2);
  c2.setPeer(c1);
  return [c1, c2];
}

export class MemoryHostTransport implements HostTransport {
  private listeners = new Set<(c: Connection) => void>();
  private closed = false;

  onConnection(cb: (c: Connection) => void): Unsub {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  connectClient(): Connection {
    if (this.closed) {
      throw new Error('Host transport is closed');
    }
    const [clientConn, hostConn] = createMemoryPair();
    for (const listener of this.listeners) {
      listener(hostConn);
    }
    return clientConn;
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}
