import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  gameReducer,
  getAlivePlayers,
} from '../src/engine/game';
import { redact } from '../src/engine/view';
import { Hand } from '../src/engine/hands';

describe('gameReducer & redact', () => {
  it('rejoining with an existing token keeps the original name and seat', () => {
    let state = createInitialState('ABCD', 'host-1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
    // Bob refreshes in a tab whose browser remembered "Alice" as the last typed name.
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Alice', playerId: 'p2' });
    expect(state.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect(state.players.find((p) => p.token === 'tok-2')?.seatIndex).toBe(1);
  });

  it('increments dealSeq on every deal, including play again', () => {
    let state = createInitialState('ABCD', 'host-1');
    expect(state.dealSeq).toBe(0);
    state = gameReducer(state, { type: 'join', token: 't1', name: 'A', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 't2', name: 'B', playerId: 'p2' });
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true, now: 0 });
    state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true, now: 0 });
    state = gameReducer(state, { type: 'startGame', rng: () => 0 });
    expect(state.dealSeq).toBe(1);
    expect(redact(state, 'p1').dealSeq).toBe(1);
  });

  it('manages lobby joining, seating, and spectators', () => {
    let state = createInitialState('ABCD', 'host-1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });

    expect(state.players).toHaveLength(2);
    expect(state.players[0].seatIndex).toBe(0);
    expect(state.players[1].seatIndex).toBe(1);
    expect(state.players[0].isSpectator).toBe(false);

    // Fill to 8 players
    for (let i = 3; i <= 8; i++) {
      state = gameReducer(state, {
        type: 'join',
        token: `tok-${i}`,
        name: `Player ${i}`,
        playerId: `p${i}`,
      });
    }
    expect(state.players.filter((p) => !p.isSpectator)).toHaveLength(8);

    // 9th player joins as spectator
    state = gameReducer(state, {
      type: 'join',
      token: 'tok-9',
      name: 'Spectator Dan',
      playerId: 'p9',
    });
    expect(state.players[8].isSpectator).toBe(true);
    expect(state.players[8].seatIndex).toBe(-1);
  });

  it('handles ready toggle, countdown and start game', () => {
    let state = createInitialState('ABCD', 'p1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });

    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true, now: 1000 });
    expect(state.countdownDeadline).toBeNull();

    state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true, now: 1000 });
    expect(state.countdownDeadline).toBe(4000);

    // Unready cancels countdown
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: false });
    expect(state.countdownDeadline).toBeNull();

    // All players must ready up before match starts
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true, now: 2000 });
    state = gameReducer(state, { type: 'startGame', rng: () => 0 });
    expect(state.phase).toBe('bidding');
    expect(state.round).toBe(1);
    expect(state.communityCards).toHaveLength(2);
    expect(state.hands['p1']).toHaveLength(2);
    expect(state.hands['p2']).toHaveLength(2);
  });

  it('redaction never leaks hidden cards during bidding', () => {
    let state = createInitialState('ABCD', 'p1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
    state = gameReducer(state, { type: 'join', token: 'tok-3', name: 'Charlie', playerId: 'p3' });
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p3', ready: true });
    state = gameReducer(state, { type: 'startGame', rng: () => 0 });

    const viewAlice = redact(state, 'p1');
    expect(viewAlice.myCards).toHaveLength(2);
    expect(viewAlice.hands['p1']).toHaveLength(2);
    expect(viewAlice.hands['p2']).toBeUndefined();
    expect(viewAlice.hands['p3']).toBeUndefined();
    expect(viewAlice.communityCards).toHaveLength(2);

    const viewBob = redact(state, 'p2');
    expect(viewBob.myCards).toHaveLength(2);
    expect(viewBob.hands['p1']).toBeUndefined();
    expect(viewBob.hands['p2']).toHaveLength(2);
  });

  it('handles calling hands in turn order and validates higher hand', () => {
    let state = createInitialState('ABCD', 'p1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true });
    state = gameReducer(state, { type: 'startGame', rng: () => 0 });

    const starterId = state.turnPlayerId!;
    const otherId = starterId === 'p1' ? 'p2' : 'p1';

    // Calling out of turn does nothing
    const pairTwos: Hand = { kind: 'pair', rank: 2 };
    const invalidState = gameReducer(state, { type: 'call', playerId: otherId, hand: pairTwos });
    expect(invalidState.currentCall).toBeNull();

    // Valid call
    state = gameReducer(state, { type: 'call', playerId: starterId, hand: pairTwos });
    expect(state.currentCall?.hand).toEqual(pairTwos);
    expect(state.turnPlayerId).toBe(otherId);

    // Call lower or equal hand fails
    const lowCallState = gameReducer(state, { type: 'call', playerId: otherId, hand: pairTwos });
    expect(lowCallState.currentCall?.hand).toEqual(pairTwos);
    expect(lowCallState.turnPlayerId).toBe(otherId);

    // Higher call succeeds
    const pairThrees: Hand = { kind: 'pair', rank: 3 };
    state = gameReducer(state, { type: 'call', playerId: otherId, hand: pairThrees });
    expect(state.currentCall?.hand).toEqual(pairThrees);
    expect(state.turnPlayerId).toBe(starterId);
  });

  it('handles BS, reveals, applies loser +1 card and next round starter', () => {
    let state = createInitialState('ABCD', 'p1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true });
    state = gameReducer(state, { type: 'startGame', rng: () => 0 });

    const p1 = state.turnPlayerId!;
    const p2 = p1 === 'p1' ? 'p2' : 'p1';

    // p1 calls Royal Flush (almost impossible on round 1)
    state = gameReducer(state, { type: 'call', playerId: p1, hand: { kind: 'royalFlush' } });
    expect(state.turnPlayerId).toBe(p2);

    // p2 calls BS
    state = gameReducer(state, { type: 'bs', playerId: p2 });
    expect(state.phase).toBe('reveal');
    expect(state.revealData).not.toBeNull();
    expect(state.revealData?.callerId).toBe(p2);
    expect(state.revealData?.exists).toBe(false); // Royal flush doesn't exist in 6 cards

    // Loser should be p1
    expect(state.revealData?.loserId).toBe(p1);

    // Redaction in reveal exposes hands one at a time, BS caller first
    const order = state.revealData!.revealOrder;
    expect(order[0]).toBe(p2);
    const first = redact(state, p1);
    expect(first.revealData?.revealedPlayerIds).toEqual([p2]);
    expect(first.hands[p2]).toBeDefined();
    expect(first.hands[p1]).toBeDefined(); // a viewer always sees their own hand
    expect(Object.keys(first.hands).sort()).toEqual([p1, p2].sort());
    expect(first.revealData?.matchingCards).toEqual([]);
    let stepped = state;
    for (let i = 1; i < order.length; i++) {
      stepped = gameReducer(stepped, { type: 'revealStep' });
    }
    const view = redact(stepped, p2);
    expect(view.revealData?.revealedPlayerIds).toEqual(order);
    for (const id of order) expect(view.hands[id]).toBeDefined();

    // Resolve reveal
    state = gameReducer(state, { type: 'resolveReveal', rng: () => 0 });
    expect(state.phase).toBe('bidding');
    expect(state.round).toBe(2);

    // Loser p1 now has 3 cards
    const loser = state.players.find((p) => p.id === p1)!;
    expect(loser.cardCount).toBe(3);

    // BS caller p2 starts the next round!
    expect(state.turnPlayerId).toBe(p2);
  });

  it('eliminates player at 5 cards and declares winner when 1 remains', () => {
    let state = createInitialState('ABCD', 'p1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true });
    state = gameReducer(state, { type: 'startGame', rng: () => 0 });

    const p1 = state.players.find((p) => p.id === 'p1')!;
    p1.cardCount = 5; // next loss will eliminate p1

    state.turnPlayerId = 'p1';
    state = gameReducer(state, { type: 'call', playerId: 'p1', hand: { kind: 'royalFlush' } });
    state = gameReducer(state, { type: 'bs', playerId: 'p2' });
    expect(state.revealData?.loserEliminated).toBe(true);

    state = gameReducer(state, { type: 'resolveReveal', rng: () => 0 });
    const p1After = state.players.find((p) => p.id === 'p1')!;
    expect(p1After.eliminated).toBe(true);
    expect(state.phase).toBe('gameOver');
    expect(state.winnerId).toBe('p2');
    // A royal flush never exists here, so the claimer is called out and eliminated.
    expect(state.log).toContain('BS! - Alice is out');
    expect(state.log.some((l) => l.includes('gets a card'))).toBe(false);
    expect(state.log).toContain('Bob wins!');
  });

  it("logs the verdict as \"Never didn't have it\" when the called hand exists", () => {
    let state = createInitialState('ABCD', 'host-1');
    state = gameReducer(state, { type: 'join', token: 't1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 't2', name: 'Bob', playerId: 'p2' });
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true });
    state = gameReducer(state, { type: 'startGame', rng: () => 0 });
    // A high card of the rank of any dealt card always exists.
    const rank = state.communityCards[0].rank;
    state.turnPlayerId = 'p1';
    state = gameReducer(state, { type: 'call', playerId: 'p1', hand: { kind: 'high', rank } });
    state = gameReducer(state, { type: 'bs', playerId: 'p2' });
    expect(state.revealData?.exists).toBe(true);
    state = gameReducer(state, { type: 'resolveReveal', rng: () => 0 });
    expect(state.log).toContain("Never didn't have it - Bob gets a card (3)");
  });

  it('skips eliminated players in turn order and BS starter fallback works', () => {
    let state = createInitialState('ABCD', 'p1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
    state = gameReducer(state, { type: 'join', token: 'tok-3', name: 'Charlie', playerId: 'p3' });
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p3', ready: true });
    state = gameReducer(state, { type: 'startGame', rng: () => 0 });

    // Eliminate Bob (p2)
    state.players.find((p) => p.id === 'p2')!.eliminated = true;

    state.turnPlayerId = 'p1';
    state = gameReducer(state, {
      type: 'call',
      playerId: 'p1',
      hand: { kind: 'high', rank: 14 },
    });
    // Turn should skip p2 and go directly to p3!
    expect(state.turnPlayerId).toBe('p3');

    // Test fallback when BS caller is eliminated:
    // Suppose p3 calls BS on p1, but p3 loses and had 5 cards
    const p3 = state.players.find((p) => p.id === 'p3')!;
    p3.cardCount = 5;

    // Plant cards so the call exists: give community card an Ace
    state.communityCards[0] = { rank: 14, suit: 's', id: '14s' };

    state = gameReducer(state, { type: 'bs', playerId: 'p3' });
    expect(state.revealData?.exists).toBe(true);
    expect(state.revealData?.loserId).toBe('p3');

    // p3 is eliminated. Then next round starter should be next alive clockwise from p3
    // Alive players are p1 (seat 0). p2 (seat 1) is dead. p3 (seat 2) is dead.
    // Next alive from seat 2 wrapping is p1!
    state = gameReducer(state, { type: 'resolveReveal', rng: () => 0 });
    // Since only p1 is left, it transitions to gameOver!
    expect(state.phase).toBe('gameOver');
    expect(state.winnerId).toBe('p1');
  });

  it('mid-game leave voids and restarts round', () => {
    let state = createInitialState('ABCD', 'p1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
    state = gameReducer(state, { type: 'join', token: 'tok-3', name: 'Charlie', playerId: 'p3' });
    state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true });
    state = gameReducer(state, { type: 'setReady', playerId: 'p3', ready: true });
    state = gameReducer(state, { type: 'startGame', rng: () => 0 });

    expect(state.phase).toBe('bidding');

    // Bob leaves
    state = gameReducer(state, { type: 'leave', playerId: 'p2', rng: () => 0 });

    const bob = state.players.find((p) => p.id === 'p2')!;
    expect(bob.eliminated).toBe(true);
    expect(state.log).toContain('Bob left - round restarted');

    // Round was redealt
    const alive = getAlivePlayers(state);
    expect(alive).toHaveLength(2);
    expect(state.phase).toBe('bidding');
    expect(state.currentCall).toBeNull();
  });

  it('playAgain resets all seated players and seats waiting spectators', () => {
    let state = createInitialState('ABCD', 'p1');
    state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
    state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
    state = gameReducer(state, { type: 'join', token: 'tok-3', name: 'Spectator', playerId: 'p3' });
    state.players.find((p) => p.id === 'p3')!.isSpectator = true;

    state.phase = 'gameOver';
    state.winnerId = 'p1';
    state.players[1].cardCount = 5;
    state.players[1].eliminated = true;

    state = gameReducer(state, { type: 'playAgain' });

    expect(state.phase).toBe('lobby');
    expect(state.winnerId).toBeNull();
    expect(state.players[0].cardCount).toBe(2);
    expect(state.players[1].cardCount).toBe(2);
    expect(state.players[1].eliminated).toBe(false);

    // Waiting spectator p3 is now seated!
    const p3 = state.players.find((p) => p.id === 'p3')!;
    expect(p3.isSpectator).toBe(false);
    expect(p3.cardCount).toBe(2);
    expect(p3.seatIndex).toBeGreaterThanOrEqual(0);
  });

  describe('added requirements: all players must ready up & countdown tests', () => {
    it('no start with a single ready player alone', () => {
      let state = createInitialState('ABCD', 'p1');
      state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
      state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true });
      expect(state.countdownDeadline).toBeNull();

      state = gameReducer(state, { type: 'startGame' });
      expect(state.phase).toBe('lobby');
    });

    it('no start with 1 of 3 ready', () => {
      let state = createInitialState('ABCD', 'p1');
      state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
      state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
      state = gameReducer(state, { type: 'join', token: 'tok-3', name: 'Charlie', playerId: 'p3' });

      state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true });
      expect(state.countdownDeadline).toBeNull();

      state = gameReducer(state, { type: 'startGame' });
      expect(state.phase).toBe('lobby');

      // 2 of 3 ready still no start
      state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true });
      expect(state.countdownDeadline).toBeNull();
      state = gameReducer(state, { type: 'startGame' });
      expect(state.phase).toBe('lobby');
    });

    it('start only after the last player readies', () => {
      let state = createInitialState('ABCD', 'p1');
      state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
      state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
      state = gameReducer(state, { type: 'join', token: 'tok-3', name: 'Charlie', playerId: 'p3' });

      state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true, now: 1000 });
      state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true, now: 1000 });
      expect(state.countdownDeadline).toBeNull();

      // Third player readies -> countdown starts!
      state = gameReducer(state, { type: 'setReady', playerId: 'p3', ready: true, now: 1000 });
      expect(state.countdownDeadline).toBe(4000);

      // startGame succeeds
      state = gameReducer(state, { type: 'startGame', rng: () => 0 });
      expect(state.phase).toBe('bidding');
      expect(state.round).toBe(1);
    });

    it('countdown cancelled by an unready, a join or a leave', () => {
      // Unready
      let state = createInitialState('ABCD', 'p1');
      state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
      state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
      state = gameReducer(state, { type: 'setReady', playerId: 'p1', ready: true, now: 1000 });
      state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true, now: 1000 });
      expect(state.countdownDeadline).toBe(4000);

      state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: false });
      expect(state.countdownDeadline).toBeNull();

      // Join cancels
      state = gameReducer(state, { type: 'setReady', playerId: 'p2', ready: true, now: 1000 });
      expect(state.countdownDeadline).toBe(4000);
      state = gameReducer(state, { type: 'join', token: 'tok-3', name: 'Charlie', playerId: 'p3' });
      expect(state.countdownDeadline).toBeNull();

      // Leave cancels
      state = gameReducer(state, { type: 'setReady', playerId: 'p3', ready: true, now: 1000 });
      expect(state.countdownDeadline).toBe(4000);
      state = gameReducer(state, { type: 'leave', playerId: 'p3' });
      expect(state.countdownDeadline).toBeNull();
    });

    it('deadline re-check prevents start if a player is not ready', () => {
      let state = createInitialState('ABCD', 'p1');
      state = gameReducer(state, { type: 'join', token: 'tok-1', name: 'Alice', playerId: 'p1' });
      state = gameReducer(state, { type: 'join', token: 'tok-2', name: 'Bob', playerId: 'p2' });
      state.countdownDeadline = Date.now() - 100; // deadline reached

      // Bob is not ready
      state.players.find((p) => p.id === 'p1')!.ready = true;
      state.players.find((p) => p.id === 'p2')!.ready = false;

      state = gameReducer(state, { type: 'startGame' });
      expect(state.phase).toBe('lobby');
    });
  });
});
