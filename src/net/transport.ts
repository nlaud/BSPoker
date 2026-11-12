export type Unsub = () => void;

export interface Connection {
  send(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): Unsub;
  onClose(cb: () => void): Unsub;
  close(): void;
}

export interface HostTransport {
  onConnection(cb: (c: Connection) => void): Unsub;
  close(): void;
}

export interface ClientTransport {
  connect(lobbyCode: string): Promise<Connection>;
}
