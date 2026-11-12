import { describe, it, expect } from 'vitest';
import { HostSession } from '../src/net/host';
import { ClientSession } from '../src/net/client';
import { Hand, compareHands } from '../src/engine/hands';
import { Card, Rank } from '../src/engine/cards';

// Simple deterministic PRNG (Linear Congruential Generator)
function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('HostSession and ClientSession integration over memoryTransport', () => {
  it('plays full multiplayer games to completion with invariant checks', async () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rng = createRng(seed * 9999);
      const code = `TST${seed}`;
      const host = new HostSession(code, 'host-id');

      // Connect 3 clients
      const clients: ClientSession[] = [];
      for (let i = 1; i <= 3; i++) {
        const memConn = host.memoryTransport.connectClient();
        const client = new ClientSession('memory', `Player ${i}`, { conn: memConn, token: `token-${seed}-${i}` });
        clients.push(client);
      }

      // Wait for all clients to join and receive initial views
      await new Promise((r) => setTimeout(r, 20));

      // Ready up all players
      for (const c of clients) {
        c.setReady(true);
      }
      await new Promise((r) => setTimeout(r, 20));

      // Start game
      host.dispatch({ type: 'startGame', rng });
      await new Promise((r) => setTimeout(r, 20));

      let safetyLimit = 300;
      while (host.state.phase !== 'gameOver' && safetyLimit-- > 0) {
        // INVARIANTS:
        // 1. Community cards always length 2
        expect(host.state.communityCards).toHaveLength(2);

        // 2. No duplicate cards among dealt hands + community
        const allCards: Card[] = [
          ...host.state.communityCards,
          ...Object.values(host.state.hands).flat(),
        ];
        const cardIds = new Set(allCards.map((c) => c.id));
        expect(cardIds.size).toBe(allCards.length);

        // 3. Alive players card counts between 2 and 5
        for (const p of host.state.players) {
          if (!p.eliminated && !p.isSpectator) {
            expect(p.cardCount).toBeGreaterThanOrEqual(2);
            expect(p.cardCount).toBeLessThanOrEqual(5);
          } else {
            expect(p.cardCount).toBe(0);
          }
        }

        if (host.state.phase === 'bidding') {
          const turnPlayerId = host.state.turnPlayerId;
          expect(turnPlayerId).not.toBeNull();
          const client = clients.find((c) => c.playerId === turnPlayerId);
          expect(client).toBeDefined();

          // Decide whether to call BS or call a higher hand
          const currentCall = host.state.currentCall;
          const shouldCallBs = currentCall !== null && (rng() < 0.35 || currentCall.hand.kind === 'royalFlush');

          if (shouldCallBs) {
            client?.bs();
            await new Promise((r) => setTimeout(r, 10));
          } else {
            // Find a valid higher call
            let candidateHand: Hand;
            if (!currentCall) {
              candidateHand = { kind: 'high', rank: 2 };
            } else {
              // Raise hand
              if (currentCall.hand.kind === 'high') {
                if (currentCall.hand.rank < 14) {
                  candidateHand = { kind: 'high', rank: (currentCall.hand.rank + 1) as Rank };
                } else {
                  candidateHand = { kind: 'pair', rank: 2 };
                }
              } else if (currentCall.hand.kind === 'pair') {
                if (currentCall.hand.rank < 14) {
                  candidateHand = { kind: 'pair', rank: (currentCall.hand.rank + 1) as Rank };
                } else {
                  candidateHand = { kind: 'trips', rank: 2 };
                }
              } else if (currentCall.hand.kind === 'trips') {
                candidateHand = { kind: 'straight', top: 5 };
              } else if (currentCall.hand.kind === 'straight') {
                candidateHand = { kind: 'flush', suit: 'h' };
              } else {
                candidateHand = { kind: 'royalFlush' };
              }
            }

            if (currentCall && compareHands(candidateHand, currentCall.hand) <= 0) {
              client?.bs();
            } else {
              client?.call(candidateHand);
            }
            await new Promise((r) => setTimeout(r, 10));
          }
        } else if (host.state.phase === 'reveal') {
          // Advance reveal directly in test
          host.dispatch({ type: 'resolveReveal', rng });
          await new Promise((r) => setTimeout(r, 10));
        }
      }

      // Check game over invariants
      expect(host.state.phase).toBe('gameOver');
      expect(host.state.winnerId).not.toBeNull();
      const alive = host.state.players.filter((p) => !p.eliminated && !p.isSpectator);
      expect(alive).toHaveLength(1);
      expect(alive[0].id).toBe(host.state.winnerId);

      // Cleanup
      for (const c of clients) c.destroy();
      host.destroy();
    }
  });
});
