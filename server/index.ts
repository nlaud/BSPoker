/**
 * `npm run host`: runs the BSPoker game server on this computer and makes it
 * reachable from any network, so friends can join from the GitHub Pages site
 * with a 4-letter code.
 *
 * Flags:
 *   --name <n>    your player name (default: the name this browser last used)
 *   --port <n>    local port (default 8787)
 *   --no-tunnel   same-wifi play only (no public address, no code lookup)
 *   --no-open     do not open the host page in a browser
 */
import { spawn, execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { startServer } from './server';
import { startTunnel, TunnelUnavailableError, type Tunnel } from './tunnel';
import { generateLobbyCode } from '../src/net/host';
import {
  CLOSED_MARKER,
  DIRECTORY_BASE,
  directoryTopic,
  fetchDirectory,
  parseDirectoryResponse,
} from '../src/net/directory';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** The GitHub Pages address of this repo, from the git remote (works for forks). */
function pagesUrl(): string | null {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
    return match ? `https://${match[1].toLowerCase()}.github.io/${match[2]}/` : null;
  } catch {
    return null;
  }
}

/** VPN and virtual adapters: friends on the same wifi cannot use these addresses. */
const VIRTUAL_ADAPTER = /tailscale|zerotier|wireguard|vethernet|wsl|hyper-v|docker|vmware|virtualbox|vbox|^utun|^tun|^tap/i;

function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
        urls.push(`http://${a.address}:${port}/`);
      }
    }
  }
  return urls;
}

function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // The host can open the printed link instead.
  }
}

async function publish(code: string, message: string): Promise<void> {
  const res = await fetch(`${DIRECTORY_BASE}/${directoryTopic(code)}`, {
    method: 'POST',
    body: message,
    headers: { Title: 'BSPoker host', Tags: 'spades' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** A code whose directory topic has no live game in it. */
async function pickFreeCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = generateLobbyCode();
    try {
      const entry = parseDirectoryResponse(await fetchDirectory(code), 'https:');
      if (!entry || entry.kind === 'closed') return code;
    } catch {
      return code; // Directory unreachable: any code is as good as another.
    }
  }
  return generateLobbyCode();
}

async function main(): Promise<void> {
  if (!existsSync(resolve(DIST, 'index.html'))) {
    console.error('The client is not built. Run "npm run host" (it builds first) or "npm run build".');
    process.exit(1);
  }
  const port = Number(option('port', '8787'));
  const useTunnel = !flag('no-tunnel');
  const code = useTunnel ? await pickFreeCode() : generateLobbyCode();

  let lastSummary = '';
  let invite: string | null = null;
  const server = await startServer({
    code,
    port,
    staticDir: DIST,
    inviteUrl: () => invite,
    onChange: (state) => {
      const seated = state.players.filter((p) => !p.isSpectator);
      const summary = `${state.phase} · ${seated.map((p) => `${p.name}${p.connected ? '' : ' (offline)'}`).join(', ') || 'no players'}`;
      if (summary !== lastSummary) {
        lastSummary = summary;
        console.log(`  [${new Date().toLocaleTimeString()}] ${summary}`);
      }
    },
  });

  const local = `http://localhost:${server.port}/`;
  const hostName = option('name', '').trim().slice(0, 16);
  const hostLink = `${local}?host=${server.hostKey}${hostName ? `&name=${encodeURIComponent(hostName)}` : ''}`;
  const pages = pagesUrl();

  let tunnel: Tunnel | null = null;
  let codeWorks = false;
  if (useTunnel) {
    try {
      tunnel = await startTunnel(server.port);
      try {
        await publish(code, tunnel.url);
        codeWorks = true;
      } catch {
        console.warn('  Could not publish the code (ntfy.sh unreachable). Share the direct link instead.');
      }
    } catch (err) {
      if (err instanceof TunnelUnavailableError) {
        console.warn(`\n  No public tunnel: ${err.message}.`);
        console.warn('  Install cloudflared so friends on other networks (school wifi, cellular) can join:');
        console.warn('    Windows: winget install --id Cloudflare.cloudflared');
        console.warn('    macOS:   brew install cloudflared');
        console.warn('    Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
        console.warn('  Continuing with same-wifi play only.');
      } else {
        throw err;
      }
    }
  }

  invite = codeWorks && pages ? `${pages}?code=${code}` : tunnel ? `${tunnel.url}/` : null;

  console.log('\n  BSPoker host is running.\n');
  if (codeWorks) {
    console.log(`  Game code:   ${code}`);
    console.log(`  Friends:     open ${pages ?? 'the BSPoker site'} and enter ${code}`);
    if (pages) console.log(`               or open ${pages}?code=${code}`);
  }
  if (tunnel) console.log(`  Direct link: ${tunnel.url}/`);
  const lan = lanUrls(server.port);
  if (lan.length) console.log(`  Same wifi:   ${lan.join('  ')}`);
  console.log(`\n  You (host):  ${hostLink}`);
  console.log('  Keep this window open while you play. Press Ctrl+C to stop.\n');

  if (!flag('no-open')) openInBrowser(hostLink);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log('\n  Stopping...');
    if (codeWorks) await publish(code, CLOSED_MARKER).catch(() => {});
    tunnel?.stop();
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err: NodeJS.ErrnoException) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${option('port', '8787')} is already in use. Is another "npm run host" still running?`);
    console.error('  Stop it, or pick another port: npm run host -- --port 8788\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});
