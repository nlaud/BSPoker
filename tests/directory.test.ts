import { describe, it, expect } from 'vitest';
import {
  CLOSED_MARKER,
  directoryTopic,
  isUsableServerUrl,
  lookupHost,
  parseDirectoryResponse,
  toWebSocketUrl,
} from '../src/net/directory';

const line = (time: number, message: string) => JSON.stringify({ id: String(time), time, event: 'message', topic: 't', message });

describe('host code directory', () => {
  it('names topics by code', () => {
    expect(directoryTopic('abcd')).toBe('bspoker-v1-ABCD');
  });

  it('turns server pages into WebSocket addresses', () => {
    expect(toWebSocketUrl('https://quiet-river.trycloudflare.com')).toBe('wss://quiet-river.trycloudflare.com/ws');
    expect(toWebSocketUrl('https://quiet-river.trycloudflare.com/?host=x#y')).toBe('wss://quiet-river.trycloudflare.com/ws');
    expect(toWebSocketUrl('http://192.168.1.20:8787/')).toBe('ws://192.168.1.20:8787/ws');
  });

  it('only accepts https, except http on an http page', () => {
    expect(isUsableServerUrl('https://a.trycloudflare.com', 'https:')).toBe(true);
    expect(isUsableServerUrl('http://192.168.1.20:8787', 'https:')).toBe(false);
    expect(isUsableServerUrl('http://localhost:8787', 'http:')).toBe(true);
    expect(isUsableServerUrl('javascript:alert(1)', 'https:')).toBe(false);
    expect(isUsableServerUrl('not a url', 'https:')).toBe(false);
  });

  it('uses the newest message, and ignores junk and keepalives', () => {
    const body = [
      line(100, 'https://old.trycloudflare.com'),
      JSON.stringify({ event: 'keepalive', time: 300 }),
      line(200, 'https://new.trycloudflare.com'),
      line(250, 'hello there'),
      'not json',
    ].join('\n');
    expect(parseDirectoryResponse(body, 'https:')).toEqual({ kind: 'server', url: 'https://new.trycloudflare.com' });
  });

  it('reports a closed game when the newest message is the closed marker', () => {
    const body = [line(100, 'https://a.trycloudflare.com'), line(200, CLOSED_MARKER)].join('\n');
    expect(parseDirectoryResponse(body, 'https:')).toEqual({ kind: 'closed' });
    // A restarted host publishes again and wins.
    const restarted = body + '\n' + line(300, 'https://b.trycloudflare.com');
    expect(parseDirectoryResponse(restarted, 'https:')).toEqual({ kind: 'server', url: 'https://b.trycloudflare.com' });
  });

  it('gives players clear errors', async () => {
    const respond = (text: string, ok = true) =>
      (async () => ({ ok, status: ok ? 200 : 500, text: async () => text })) as unknown as typeof fetch;
    await expect(lookupHost('ABCD', respond(line(1, 'https://x.trycloudflare.com')))).resolves.toBe('https://x.trycloudflare.com');
    await expect(lookupHost('ABCD', respond(''))).rejects.toThrow('No game found for that code');
    await expect(lookupHost('ABCD', respond(line(1, CLOSED_MARKER)))).rejects.toThrow('That game has ended');
    await expect(lookupHost('ABCD', respond('', false))).rejects.toThrow("Couldn't look up that code");
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(lookupHost('ABCD', offline)).rejects.toThrow("Couldn't look up that code");
  });
});
