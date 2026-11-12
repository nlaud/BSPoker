import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, type RunningServer } from '../server/server';
import { ClientSession } from '../src/net/client';
import { PROTOCOL_VERSION } from '../src/engine/protocol';
import type { PlayerView } from '../src/engine/protocol';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bspoker-dist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><title>BSPoker</title></head><body></body></html>');
  mkdirSync(join(dir, 'sounds'));
  writeFileSync(join(dir, 'sounds', 'deal-1.mp3'), 'mp3');
  return dir;
}

async function waitFor<T>(get: () => T | null | undefined, ms = 3000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = get();
    if (v) return v;
    await sleep(20);
  }
  throw new Error('timed out');
}

let server: RunningServer | null = null;
const clients: ClientSession[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  await server?.close();
  server = null;
});

function join_(name: string, opts: { hostKey?: string; token?: string } = {}) {
  const url = `ws://localhost:${server!.port}/ws`;
  const c = new ClientSession(url, name, { token: opts.token ?? `tok-${name}-${Math.random()}`, hostKey: opts.hostKey });
  let view: PlayerView | null = null;
  c.onView((v) => (view = v));
  clients.push(c);
  return { client: c, view: () => view };
}

describe('host server', () => {
  it('serves the client with the server marker and invite link, and the sound files', async () => {
    server = await startServer({ code: 'ABCD', port: 0, staticDir: fakeDist(), inviteUrl: () => 'https://x.github.io/BSPoker/?code=ABCD' });
    const html = await (await fetch(`http://localhost:${server.port}/`)).text();
    expect(html).toContain('<meta name="bspoker-server" content="self" />');
    expect(html).toContain('<meta name="bspoker-invite" content="https://x.github.io/BSPoker/?code=ABCD" />');
    const mp3 = await fetch(`http://localhost:${server.port}/sounds/deal-1.mp3`);
    expect(mp3.status).toBe(200);
    expect(mp3.headers.get('content-type')).toBe('audio/mpeg');
    expect((await fetch(`http://localhost:${server.port}/missing.js`)).status).toBe(404);
    expect((await fetch(`http://localhost:${server.port}/..%2f..%2fpackage.json`)).status).not.toBe(200);
  });

  it('gives the host seat only to the host key, even if a friend joins first', async () => {
    server = await startServer({ code: 'ABCD', port: 0, staticDir: fakeDist(), hostKey: 'secret' });
    const friend = join_('Friend');
    await waitFor(() => friend.view());
    expect(friend.view()!.isHost).toBe(false);

    const host = join_('Host', { hostKey: 'secret' });
    const hostView = await waitFor(() => host.view());
    expect(hostView.isHost).toBe(true);
    expect(hostView.hostPlayerId).toBe('host');

    const wrong = join_('Sneaky', { hostKey: 'guess' });
    await waitFor(() => wrong.view());
    expect(wrong.view()!.isHost).toBe(false);

    // The host can come back from a new tab (new token) with the key and keep the seat.
    host.client.destroy();
    const again = join_('Host', { hostKey: 'secret' });
    await waitFor(() => again.view());
    expect(again.view()!.isHost).toBe(true);
    const names = again.view()!.players.map((p) => p.name);
    expect(names.filter((n) => n === 'Host')).toHaveLength(1);
  });

  it('plays a round over real WebSockets: ready, call, BS, reveal', async () => {
    server = await startServer({ code: 'ABCD', port: 0, staticDir: fakeDist(), hostKey: 'k' });
    const a = join_('Alice', { hostKey: 'k' });
    const b = join_('Bob');
    await waitFor(() => a.view()?.players.length === 2 && b.view()?.players.length === 2);
    a.client.setReady(true);
    b.client.setReady(true);
    const start = await waitFor(() => (a.view()?.phase === 'bidding' ? a.view() : null), 6000);
    const first = start.turnPlayerId === a.client.playerId ? a : b;
    const second = first === a ? b : a;
    first.client.call({ kind: 'royalFlush' });
    await waitFor(() => second.view()?.currentCall);
    second.client.bs();
    const reveal = await waitFor(() => (a.view()?.phase === 'reveal' ? a.view() : null));
    expect(reveal.revealData?.exists).toBe(false);
    // Hidden cards are never sent during bidding: each client only saw its own hand.
    expect(Object.keys(start.hands)).toEqual([a.client.playerId]);
  });

  it('rejects a client from a different protocol version with a clear message', async () => {
    server = await startServer({ code: 'ABCD', port: 0, staticDir: fakeDist() });
    const ws = new WebSocket(`ws://localhost:${server.port}/ws`);
    const reply = await new Promise<{ type: string; message?: string }>((resolve) => {
      ws.addEventListener('open', () =>
        ws.send(JSON.stringify({ type: 'join', token: 't', name: 'Old', protocolVersion: PROTOCOL_VERSION - 1 })),
      );
      ws.addEventListener('message', (e) => resolve(JSON.parse(String(e.data))));
    });
    expect(reply.type).toBe('error');
    expect(reply.message).toContain('different version');
  });
});

describe('lobby grace period', () => {
  it('frees the seat of a player who stays offline in the lobby, but keeps a quick refresh', async () => {
    const { HostSession, LOBBY_GRACE_MS } = await import('../src/net/host');
    vi.useFakeTimers();
    try {
      const host = new HostSession('ABCD', 'h');
      const a = new ClientSession('memory', 'Alice', { conn: host.memoryTransport.connectClient(), token: 'ta' });
      const bConn = host.memoryTransport.connectClient();
      const b = new ClientSession('memory', 'Bob', { conn: bConn, token: 'tb' });
      await vi.advanceTimersByTimeAsync(10);
      expect(host.state.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);

      // Bob closes the tab, then refreshes within the grace period: he keeps his seat.
      b.destroy();
      await vi.advanceTimersByTimeAsync(LOBBY_GRACE_MS - 1000);
      const b2 = new ClientSession('memory', 'Bob', { conn: host.memoryTransport.connectClient(), token: 'tb' });
      await vi.advanceTimersByTimeAsync(LOBBY_GRACE_MS + 1000);
      expect(host.state.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);

      // Bob leaves for good: after the grace period the seat is freed.
      b2.destroy();
      await vi.advanceTimersByTimeAsync(LOBBY_GRACE_MS + 100);
      expect(host.state.players.map((p) => p.name)).toEqual(['Alice']);
      a.destroy();
      host.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('server restarts', () => {
  it('a tab from before a restart gets a clear error instead of a ghost seat', async () => {
    const dist = fakeDist();
    server = await startServer({ code: 'AAAA', port: 0, staticDir: dist, hostKey: 'k' });
    const port = server.port;
    const tab = join_('Mia');
    await waitFor(() => tab.view());
    let lastStatus = '';
    tab.client.onStatus((s) => (lastStatus = s));
    await server.close();
    server = await startServer({ code: 'BBBB', port, staticDir: dist, hostKey: 'k2' });
    await waitFor(() => (lastStatus === 'error' ? true : null), 8000);
    expect(tab.client.errorMessage).toContain('The host restarted the game');
    expect(server.session.state.players).toHaveLength(0);
  });
});

describe('host Remove', () => {
  it('removes an offline player mid-game and restarts the round without them', async () => {
    const { HostSession } = await import('../src/net/host');
    const host = new HostSession('ABCD', 'h');
    const conns = ['Host', 'Ann', 'Zed'].map((name, i) => {
      const c = new ClientSession('memory', name, { conn: host.memoryTransport.connectClient(), token: `t${i}` });
      clients.push(c);
      return c;
    });
    await sleep(20);
    for (const c of conns) c.setReady(true);
    await waitFor(() => (host.state.phase === 'bidding' ? true : null), 5000);
    const zed = host.state.players.find((p) => p.name === 'Zed')!;
    const dealSeq = host.state.dealSeq;
    conns[2].destroy();
    await waitFor(() => (host.state.players.find((p) => p.id === zed.id)?.connected === false ? true : null));
    conns[0].kick(zed.id);
    await waitFor(() => (host.state.players.find((p) => p.id === zed.id)?.eliminated ? true : null));
    // The voided round is dealt again without Zed.
    expect(host.state.dealSeq).toBe(dealSeq + 1);
    expect(Object.keys(host.state.hands)).not.toContain(zed.id);
    expect(host.state.log.some((l) => l.includes('Zed') && l.includes('removed'))).toBe(true);
    host.destroy();
  });
});
