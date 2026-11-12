import type { PeerOptions } from 'peerjs';

export function getPeerConfig(): PeerOptions {
  const options: PeerOptions = {
    config: {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    },
  };

  // 1. URL query: ?peer=host:port
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const peerParam = params.get('peer');
    if (peerParam) {
      const parts = peerParam.split(':');
      const host = parts[0] || 'localhost';
      const port = parts[1] ? parseInt(parts[1], 10) : 9000;
      const isLocal = host === 'localhost' || host === '127.0.0.1';
      return {
        ...options,
        host,
        port,
        path: '/',
        secure: !isLocal,
      };
    }
  }

  // 2. Vite environment variables
  const envHost = import.meta.env?.VITE_PEER_HOST;
  const envPort = import.meta.env?.VITE_PEER_PORT;
  const envPath = import.meta.env?.VITE_PEER_PATH;
  const envSecure = import.meta.env?.VITE_PEER_SECURE;

  if (envHost) {
    return {
      ...options,
      host: envHost,
      port: envPort ? parseInt(envPort, 10) : undefined,
      path: envPath || '/',
      secure: envSecure === 'true' || envSecure === '1',
    };
  }

  // 3. Default PeerJS cloud broker
  return options;
}
