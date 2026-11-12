/**
 * Maps a 4-letter host code to the host's current server address.
 *
 * `npm run host` publishes its public tunnel address to an ntfy.sh topic named
 * after the code, and the GitHub Pages site reads the newest message back.
 * ntfy.sh keeps messages for 12 hours, needs no account, and allows reads from
 * any origin. It only stores the address: game traffic goes straight to the
 * host's server.
 */
export const DIRECTORY_BASE = 'https://ntfy.sh';
const TOPIC_PREFIX = 'bspoker-v1-';

export function directoryTopic(code: string): string {
  return TOPIC_PREFIX + code.toUpperCase();
}

/** Turns a server page address (https://host/ or http://host:port/) into its WebSocket address. */
export function toWebSocketUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : url.protocol === 'http:' ? 'ws:' : url.protocol;
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

/** True for addresses a page may connect to: https everywhere, http only on http pages (local dev). */
export function isUsableServerUrl(value: string, pageProtocol: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && pageProtocol === 'http:';
  } catch {
    return false;
  }
}

/** Published by the host when it shuts down, so the code stops pointing at a dead address. */
export const CLOSED_MARKER = 'closed';

export type DirectoryEntry = { kind: 'server'; url: string } | { kind: 'closed' };

/**
 * Parses ntfy's newline-delimited JSON poll response. The newest message wins:
 * a server address, or the closed marker. Anything else is ignored.
 */
export function parseDirectoryResponse(body: string, pageProtocol: string): DirectoryEntry | null {
  let newest: { time: number; entry: DirectoryEntry } | null = null;
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    let event: { event?: string; time?: number; message?: string };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.event !== 'message' || typeof event.message !== 'string') continue;
    const message = event.message.trim();
    let entry: DirectoryEntry;
    if (message === CLOSED_MARKER) entry = { kind: 'closed' };
    else if (isUsableServerUrl(message, pageProtocol)) entry = { kind: 'server', url: message };
    else continue;
    const time = typeof event.time === 'number' ? event.time : 0;
    if (!newest || time >= newest.time) newest = { time, entry };
  }
  return newest ? newest.entry : null;
}

export async function fetchDirectory(code: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`${DIRECTORY_BASE}/${directoryTopic(code)}/json?poll=1&since=12h`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Looks up the server address for a host code. Throws a player-facing error when it cannot. */
export async function lookupHost(code: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const pageProtocol = typeof location !== 'undefined' ? location.protocol : 'https:';
  let body: string;
  try {
    body = await fetchDirectory(code, fetchImpl);
  } catch {
    throw new Error("Couldn't look up that code. Check your connection, or ask the host for their direct link.");
  }
  const entry = parseDirectoryResponse(body, pageProtocol);
  if (!entry) throw new Error('No game found for that code. Check the code with your host.');
  if (entry.kind === 'closed') throw new Error('That game has ended. Ask your host for a new code.');
  return entry.url;
}
