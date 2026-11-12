import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The cloudflared program: on PATH, or in a standard install location. A
 * fresh install (for example with winget) is not on the PATH of terminals
 * that were already open, so look there too.
 */
export function findCloudflared(): string {
  const env = process.env;
  const candidates =
    process.platform === 'win32'
      ? [
          join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe'),
          join(env.ProgramFiles ?? 'C:\\Program Files', 'cloudflared', 'cloudflared.exe'),
          join(env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
        ]
      : ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared'];
  return candidates.find((p) => p && existsSync(p)) ?? 'cloudflared';
}

export interface Tunnel {
  /** Public https address that forwards to the local server. */
  url: string;
  stop(): void;
}

export class TunnelUnavailableError extends Error {}

const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/**
 * Starts a Cloudflare quick tunnel (no account needed) to the local server.
 * Requires the `cloudflared` program on PATH. Rejects with
 * TunnelUnavailableError when it is missing or does not produce an address.
 */
export function startTunnel(port: number, timeoutMs = 30000): Promise<Tunnel> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(findCloudflared(), ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      reject(new TunnelUnavailableError('cloudflared is not installed'));
      return;
    }

    let settled = false;
    const finish = (err: Error | null, url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        child.kill();
        reject(err);
      } else {
        resolve({ url: url as string, stop: () => child.kill() });
      }
    };
    const timer = setTimeout(
      () => finish(new TunnelUnavailableError('cloudflared did not report a tunnel address in time')),
      timeoutMs,
    );

    // cloudflared prints the quick-tunnel address to stderr.
    const scan = (chunk: Buffer) => {
      const match = chunk.toString().match(URL_PATTERN);
      if (match) finish(null, match[0]);
    };
    child.stdout?.on('data', scan);
    child.stderr?.on('data', scan);
    child.on('error', (err: NodeJS.ErrnoException) => {
      finish(
        new TunnelUnavailableError(
          err.code === 'ENOENT' ? 'cloudflared is not installed' : `cloudflared failed: ${err.message}`,
        ),
      );
    });
    child.on('exit', (code) => finish(new TunnelUnavailableError(`cloudflared exited (code ${code})`)));
  });
}
