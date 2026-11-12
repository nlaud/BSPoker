import type { WebSocket, WebSocketServer } from 'ws';
import type { Connection, HostTransport, Unsub } from '../src/net/transport';

class NodeSocketConnection implements Connection {
  private messageListeners = new Set<(msg: unknown) => void>();
  private closeListeners = new Set<() => void>();
  private closed = false;

  constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      for (const cb of this.messageListeners) cb(msg);
    });
    socket.on('close', () => this.markClosed());
    socket.on('error', () => this.markClosed());
  }

  private markClosed(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cb of this.closeListeners) cb();
  }

  send(msg: unknown): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(JSON.stringify(msg));
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
    this.socket.close();
    this.markClosed();
  }
}

/** Accepts every WebSocket on the server as a player connection for the HostSession. */
export class WsHostTransport implements HostTransport {
  private listeners = new Set<(c: Connection) => void>();

  constructor(private readonly wss: WebSocketServer) {
    wss.on('connection', (socket) => {
      const conn = new NodeSocketConnection(socket);
      for (const cb of this.listeners) cb(conn);
    });
  }

  onConnection(cb: (c: Connection) => void): Unsub {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  close(): void {
    for (const client of this.wss.clients) client.close();
    this.wss.close();
  }
}
