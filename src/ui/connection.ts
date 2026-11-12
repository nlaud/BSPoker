import { toWebSocketUrl } from '../net/directory';

/**
 * How this page reaches a game server:
 * - `served`: the page itself comes from a host's `npm run host` server.
 * - `explicit`: a `?server=` address in the URL (a direct link).
 * - `code`: the GitHub Pages site, where players type a host code.
 */
export type PageMode =
  | { kind: 'served'; wsUrl: string }
  | { kind: 'explicit'; wsUrl: string }
  | { kind: 'code' };

function meta(name: string): string | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
}

export function detectPageMode(): PageMode {
  if (meta('bspoker-server') === 'self') {
    return { kind: 'served', wsUrl: toWebSocketUrl(window.location.origin) };
  }
  const server = new URLSearchParams(window.location.search).get('server');
  if (server) {
    try {
      return { kind: 'explicit', wsUrl: toWebSocketUrl(server) };
    } catch {
      // fall through to code entry
    }
  }
  return { kind: 'code' };
}

/**
 * The link to send friends. A host server injects its public invite (the
 * GitHub Pages address with the code); otherwise the Pages address with the
 * code is built from this page.
 */
export function inviteLink(lobbyCode: string): string {
  const injected = meta('bspoker-invite');
  if (injected) return injected;
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  if (detectPageMode().kind === 'served') return url.origin + '/';
  url.searchParams.set('code', lobbyCode);
  return url.toString();
}

/** README hosting instructions for this site's repo, when the page is on GitHub Pages. */
export function hostingHelpUrl(): string | null {
  const { hostname, pathname } = window.location;
  if (!hostname.endsWith('.github.io')) return null;
  const owner = hostname.split('.')[0];
  const repo = pathname.split('/').filter(Boolean)[0];
  return repo ? `https://github.com/${owner}/${repo}#hosting-a-game` : `https://github.com/${owner}`;
}

/** Replaces the query string without reloading (drops one-time params such as host keys). */
export function setQuery(params: Record<string, string | null>): void {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState({}, '', url.toString());
}
