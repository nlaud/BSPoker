import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { HostSession } from '../src/net/host';
import { WsHostTransport } from './wsHostTransport';
import type { GameState } from '../src/engine/game';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Tells the page it is served by a BSPoker host server, so it connects to this origin. */
const SERVER_MARKER = '<meta name="bspoker-server" content="self" />';

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export interface StartServerOptions {
  code: string;
  port: number;
  /** Built client (vite build output). */
  staticDir: string;
  hostKey?: string;
  onChange?: (state: GameState) => void;
  /** Link that players should send friends, once known (shown by "Copy invite link"). */
  inviteUrl?: () => string | null;
}

export interface RunningServer {
  port: number;
  hostKey: string;
  session: HostSession;
  http: Server;
  close(): Promise<void>;
}

async function serveStatic(
  staticDir: string,
  inviteUrl: string | null,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const root = resolve(staticDir);
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let filePath = normalize(join(root, urlPath));
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    // Unknown paths without an extension fall back to the app shell.
    if (extname(filePath)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    filePath = join(root, 'index.html');
  }
  let body: Buffer;
  try {
    body = await readFile(filePath);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  if (filePath.endsWith('index.html')) {
    const invite = inviteUrl ? `\n    <meta name="bspoker-invite" content="${escapeAttr(inviteUrl)}" />` : '';
    const html = body.toString('utf8').replace('</head>', `    ${SERVER_MARKER}${invite}\n  </head>`);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }).end(html);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=3600' }).end(body);
}

/**
 * Starts the authoritative game server: one lobby (HostSession), its
 * WebSocket endpoint at /ws, and the built client on every other path.
 */
export function startServer(options: StartServerOptions): Promise<RunningServer> {
  const hostKey = options.hostKey ?? randomBytes(12).toString('base64url');
  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    serveStatic(options.staticDir, options.inviteUrl?.() ?? null, req, res).catch(() =>
      res.writeHead(500).end(),
    );
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  http.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const session = new HostSession(options.code, 'host', {
    transports: [new WsHostTransport(wss)],
    hostKey,
    onChange: options.onChange,
  });

  return new Promise((resolvePromise, reject) => {
    http.once('error', reject);
    http.listen(options.port, () => {
      const address = http.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      resolvePromise({
        port,
        hostKey,
        session,
        http,
        close: () =>
          new Promise<void>((done) => {
            session.destroy();
            http.close(() => done());
          }),
      });
    });
  });
}
