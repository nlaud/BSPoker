import { Connection, Unsub } from './transport';

/** A Connection over a browser (or Node 22+) WebSocket carrying JSON messages. */
class WebSocketConnection implements Connection {
  private messageListeners = new Set<(msg: unknown) => void>();
  private closeListeners = new Set<() => void>();
  private closed = false;

  constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      for (const cb of this.messageListeners) cb(msg);
    });
    socket.addEventListener('close', () => this.markClosed());
    socket.addEventListener('error', () => this.markClosed());
  }

  private markClosed(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cb of this.closeListeners) cb();
  }

  send(msg: unknown): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
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
    try {
      this.socket.close();
    } catch {
      // already closed
    }
    this.markClosed();
  }
}

/** Opens a WebSocket to the host's server; rejects if it does not open in time. */
export function connectWebSocket(url: string, timeoutMs = 10000): Promise<Connection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      reject(new Error("Couldn't reach the host's game server"));
      return;
    }
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // ignore
      }
      reject(new Error("Couldn't reach the host's game server. Is npm run host still running?"));
    };
    const timer = setTimeout(fail, timeoutMs);
    socket.addEventListener('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(new WebSocketConnection(socket));
    });
    socket.addEventListener('error', fail);
    socket.addEventListener('close', fail);
  });
}
