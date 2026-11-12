import { describe, it, expect } from 'vitest';
import { createInitialState, gameReducer, GameState } from '../src/engine/game';
import { redact } from '../src/engine/view';
import { compareHands, DEFAULT_RULES, Hand } from '../src/engine/hands';

const STRAIGHT: Hand = { kind: 'straight', top: 9 };
const FLUSH: Hand = { kind: 'flush', suit: 'h' };

function lobbyWithThree(): GameState {
  let s = createInitialState('ABCD', 'p1');
  s = gameReducer(s, { type: 'join', token: 't1', name: 'Alice', playerId: 'p1' });
  s = gameReducer(s, { type: 'join', token: 't2', name: 'Bob', playerId: 'p2' });
  s = gameReducer(s, { type: 'join', token: 't3', name: 'Cara', playerId: 'p3' });
  return s;
}

function allReady(s: GameState): GameState {
  for (const id of ['p1', 'p2', 'p3']) s = gameReducer(s, { type: 'setReady', playerId: id, ready: true, now: 0 });
  return s;
}

describe('Straight beats flush rule', () => {
  it('is off by default and swaps only straight and flush when on', () => {
    expect(DEFAULT_RULES.straightBeatsFlush).toBe(false);
    expect(compareHands(FLUSH, STRAIGHT)).toBeGreaterThan(0);
    expect(compareHands(STRAIGHT, FLUSH, { straightBeatsFlush: true })).toBeGreaterThan(0);
    // Neighbours are unchanged either way.
    const trips: Hand = { kind: 'trips', rank: 14 };
    const boat: Hand = { kind: 'fullHouse', trips: 2, pair: 3 };
    for (const rules of [{ straightBeatsFlush: false }, { straightBeatsFlush: true }]) {
      expect(compareHands(STRAIGHT, trips, rules)).toBeGreaterThan(0);
      expect(compareHands(FLUSH, trips, rules)).toBeGreaterThan(0);
      expect(compareHands(boat, STRAIGHT, rules)).toBeGreaterThan(0);
      expect(compareHands(boat, FLUSH, rules)).toBeGreaterThan(0);
      // Flushes stay equal to each other.
      expect(compareHands({ kind: 'flush', suit: 's' }, FLUSH, rules)).toBe(0);
    }
  });

  it('only the host can change it, and only in the lobby', () => {
    let s = lobbyWithThree();
    s = gameReducer(s, { type: 'setRule', playerId: 'p2', rule: 'straightBeatsFlush', value: true });
    expect(s.settings.straightBeatsFlush).toBe(false);
    s = gameReducer(s, { type: 'setRule', playerId: 'p1', rule: 'straightBeatsFlush', value: true });
    expect(s.settings.straightBeatsFlush).toBe(true);
    expect(s.log).toContain('Rule: Straight beats flush on');
    expect(redact(s, 'p3').settings.straightBeatsFlush).toBe(true);

    s = allReady(s);
    s = gameReducer(s, { type: 'startGame', rng: () => 0 });
    expect(s.phase).toBe('bidding');
    s = gameReducer(s, { type: 'setRule', playerId: 'p1', rule: 'straightBeatsFlush', value: false });
    expect(s.settings.straightBeatsFlush).toBe(true);
  });

  it('un-readies everyone and cancels the countdown when changed, but not when re-sent unchanged', () => {
    let s = allReady(lobbyWithThree());
    expect(s.countdownDeadline).not.toBeNull();
    s = gameReducer(s, { type: 'setRule', playerId: 'p1', rule: 'straightBeatsFlush', value: false });
    expect(s.players.every((p) => p.ready)).toBe(true);
    expect(s.countdownDeadline).not.toBeNull();
    s = gameReducer(s, { type: 'setRule', playerId: 'p1', rule: 'straightBeatsFlush', value: true });
    expect(s.players.some((p) => p.ready)).toBe(false);
    expect(s.countdownDeadline).toBeNull();
  });

  it('decides which calls are legal during play', () => {
    const play = (on: boolean, first: Hand, second: Hand) => {
      let s = lobbyWithThree();
      if (on) s = gameReducer(s, { type: 'setRule', playerId: 'p1', rule: 'straightBeatsFlush', value: true });
      s = gameReducer(allReady(s), { type: 'startGame', rng: () => 0 });
      const starter = s.turnPlayerId!;
      s = gameReducer(s, { type: 'call', playerId: starter, hand: first });
      const next = s.turnPlayerId!;
      const after = gameReducer(s, { type: 'call', playerId: next, hand: second });
      return after.currentCall?.byPlayerId === next;
    };
    expect(play(false, STRAIGHT, FLUSH)).toBe(true);
    expect(play(false, FLUSH, STRAIGHT)).toBe(false);
    expect(play(true, FLUSH, STRAIGHT)).toBe(true);
    expect(play(true, STRAIGHT, FLUSH)).toBe(false);
  });

  it('survives Play again', () => {
    let s = lobbyWithThree();
    s = gameReducer(s, { type: 'setRule', playerId: 'p1', rule: 'straightBeatsFlush', value: true });
    s = gameReducer(allReady(s), { type: 'startGame', rng: () => 0 });
    s = { ...s, phase: 'gameOver', winnerId: 'p1' };
    s = gameReducer(s, { type: 'playAgain' });
    expect(s.phase).toBe('lobby');
    expect(s.settings.straightBeatsFlush).toBe(true);
  });

  it('exposes the host id so the lobby can badge the real host', () => {
    const s = lobbyWithThree();
    expect(redact(s, 'p2').hostPlayerId).toBe('p1');
  });
});
