import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createInitialState,
  gameReducer,
  GameState,
  dealGraceMs,
  TIMEOUT_OPENING_HAND,
} from '../src/engine/game';
import { redact } from '../src/engine/view';
import { HostSession } from '../src/net/host';
import { dealDurationMs } from '../src/engine/dealTiming';

const T0 = 1_000_000;

function lobby(seconds: number): GameState {
  let s = createInitialState('ABCD', 'p1');
  s = gameReducer(s, { type: 'join', token: 't1', name: 'Ann', playerId: 'p1' });
  s = gameReducer(s, { type: 'join', token: 't2', name: 'Bob', playerId: 'p2' });
  s = gameReducer(s, { type: 'join', token: 't3', name: 'Cat', playerId: 'p3' });
  s = gameReducer(s, { type: 'setTurnTimer', playerId: 'p1', seconds });
  for (const id of ['p1', 'p2', 'p3']) s = gameReducer(s, { type: 'setReady', playerId: id, ready: true, now: T0 });
  return s;
}

function started(seconds: number): GameState {
  return gameReducer(lobby(seconds), { type: 'startGame', rng: () => 0 });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('turn timer setting', () => {
  it('only the host can set it, only in the lobby, and only to a listed value', () => {
    let s = createInitialState('ABCD', 'p1');
    s = gameReducer(s, { type: 'join', token: 't1', name: 'Ann', playerId: 'p1' });
    s = gameReducer(s, { type: 'join', token: 't2', name: 'Bob', playerId: 'p2' });
    expect(s.settings.turnSeconds).toBe(0);

    expect(gameReducer(s, { type: 'setTurnTimer', playerId: 'p2', seconds: 30 }).settings.turnSeconds).toBe(0);
    expect(gameReducer(s, { type: 'setTurnTimer', playerId: 'p1', seconds: 7 }).settings.turnSeconds).toBe(0);
    s = gameReducer(s, { type: 'setTurnTimer', playerId: 'p1', seconds: 30 });
    expect(s.settings.turnSeconds).toBe(30);
    expect(s.log.at(-1)).toBe('Turn timer: 30 seconds');
    expect(redact(s, 'p2').settings.turnSeconds).toBe(30);

    s = gameReducer(s, { type: 'setTurnTimer', playerId: 'p1', seconds: 0 });
    expect(s.log.at(-1)).toBe('Turn timer: off');

    const playing = started(15);
    expect(gameReducer(playing, { type: 'setTurnTimer', playerId: 'p1', seconds: 60 }).settings.turnSeconds).toBe(15);
  });

  it('a change makes everyone ready up again, but re-sending the same value does not', () => {
    let s = createInitialState('ABCD', 'p1');
    s = gameReducer(s, { type: 'join', token: 't1', name: 'Ann', playerId: 'p1' });
    s = gameReducer(s, { type: 'join', token: 't2', name: 'Bob', playerId: 'p2' });
    s = gameReducer(s, { type: 'setReady', playerId: 'p2', ready: true, now: T0 });
    expect(gameReducer(s, { type: 'setTurnTimer', playerId: 'p1', seconds: 0 }).players[1].ready).toBe(true);
    expect(gameReducer(s, { type: 'setTurnTimer', playerId: 'p1', seconds: 60 }).players[1].ready).toBe(false);
  });
});

describe('turn deadline', () => {
  it('covers the whole deal animation, which grows with the cards dealt', () => {
    expect(dealGraceMs(4)).toBeGreaterThan(dealDurationMs(4));
    expect(dealGraceMs(40)).toBeGreaterThan(dealGraceMs(4));
    // The deal stays inside its budget even with every seat full of cards.
    expect(dealDurationMs(40)).toBeLessThan(4500);
  });

  it('has no deadline without a timer', () => {
    const s = started(0);
    expect(s.turnDeadline).toBeNull();
    expect(redact(s, 'p1').turnRemainingMs).toBeNull();
  });

  it('gives the first turn of a round the deal grace, then a full turn after each call', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    let s = started(15);
    // Three players with two cards each: six cards dealt.
    expect(s.turnDeadline).toBe(T0 + dealGraceMs(6) + 15000);
    expect(redact(s, 'p2').turnRemainingMs).toBe(dealGraceMs(6) + 15000);

    vi.setSystemTime(T0 + 6000);
    s = gameReducer(s, { type: 'call', playerId: s.turnPlayerId!, hand: { kind: 'pair', rank: 9 } });
    expect(s.turnDeadline).toBe(T0 + 6000 + 15000);

    vi.setSystemTime(T0 + 9000);
    expect(redact(s, 'p1').turnRemainingMs).toBe(12000);

    s = gameReducer(s, { type: 'bs', playerId: s.turnPlayerId! });
    expect(s.phase).toBe('reveal');
    expect(s.turnDeadline).toBeNull();
    expect(redact(s, 'p1').turnRemainingMs).toBeNull();
  });

  it('opens with the lowest hand for a player who runs out of time on the first turn', () => {
    const s = started(15);
    const starter = s.turnPlayerId!;
    const next = gameReducer(s, { type: 'turnTimeout', playerId: starter, deadline: s.turnDeadline! });
    expect(next.currentCall).toEqual({ hand: TIMEOUT_OPENING_HAND, byPlayerId: starter });
    expect(next.turnPlayerId).not.toBe(starter);
    expect(next.phase).toBe('bidding');
    const name = s.players.find((p) => p.id === starter)!.name;
    expect(next.log.slice(-2)).toEqual([`${name} ran out of time`, `${name}: Two High`]);
  });

  it('calls BS for a player who runs out of time when there is a call to challenge', () => {
    let s = started(15);
    s = gameReducer(s, { type: 'call', playerId: s.turnPlayerId!, hand: { kind: 'pair', rank: 9 } });
    const late = s.turnPlayerId!;
    s = gameReducer(s, { type: 'turnTimeout', playerId: late, deadline: s.turnDeadline! });
    expect(s.phase).toBe('reveal');
    expect(s.revealData?.callerId).toBe(late);
  });

  it('ignores a timeout from an older turn', () => {
    let s = started(15);
    const firstDeadline = s.turnDeadline!;
    const first = s.turnPlayerId!;
    s = gameReducer(s, { type: 'call', playerId: first, hand: { kind: 'pair', rank: 9 } });
    // The old turn's deadline no longer applies, even for the right player.
    expect(gameReducer(s, { type: 'turnTimeout', playerId: s.turnPlayerId!, deadline: firstDeadline })).toEqual(s);
    expect(gameReducer(s, { type: 'turnTimeout', playerId: first, deadline: s.turnDeadline! })).toEqual(s);
  });

  it('clears the deadline on play again', () => {
    let s = started(15);
    s = gameReducer(s, { type: 'leave', playerId: 'p2' });
    s = gameReducer(s, { type: 'leave', playerId: 'p3' });
    expect(s.phase).toBe('gameOver');
    expect(s.turnDeadline).toBeNull();
    s = gameReducer(s, { type: 'playAgain' });
    expect(s.turnDeadline).toBeNull();
    expect(s.settings.turnSeconds).toBe(15);
  });
});

describe('host turn timer', () => {
  it('acts for an idle player when time runs out, then plays out the reveal', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const host = new HostSession('ABCD', 'p1');
    try {
      host.dispatch({ type: 'join', token: 't1', name: 'Ann', playerId: 'p1' });
      host.dispatch({ type: 'join', token: 't2', name: 'Bob', playerId: 'p2' });
      host.dispatch({ type: 'setTurnTimer', playerId: 'p1', seconds: 15 });
      host.dispatch({ type: 'setReady', playerId: 'p1', ready: true });
      host.dispatch({ type: 'setReady', playerId: 'p2', ready: true });
      vi.advanceTimersByTime(3000);
      expect(host.state.phase).toBe('bidding');
      const round = host.state.round;

      // Nobody acts: the starter opens with the lowest hand.
      vi.advanceTimersByTime(dealGraceMs(4) + 15000 - 1);
      expect(host.state.currentCall).toBeNull();
      vi.advanceTimersByTime(1);
      expect(host.state.currentCall?.hand).toEqual(TIMEOUT_OPENING_HAND);

      // The next player also waits: the game calls BS for them and reveals.
      vi.advanceTimersByTime(15000);
      expect(host.state.phase).toBe('reveal');
      vi.advanceTimersByTime(10000);
      expect(host.state.phase).toBe('bidding');
      expect(host.state.round).toBe(round + 1);
    } finally {
      host.destroy();
    }
  });

  it('never fires without a timer', () => {
    vi.useFakeTimers();
    const host = new HostSession('ABCD', 'p1');
    try {
      host.dispatch({ type: 'join', token: 't1', name: 'Ann', playerId: 'p1' });
      host.dispatch({ type: 'join', token: 't2', name: 'Bob', playerId: 'p2' });
      host.dispatch({ type: 'setReady', playerId: 'p1', ready: true });
      host.dispatch({ type: 'setReady', playerId: 'p2', ready: true });
      vi.advanceTimersByTime(3000);
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(host.state.phase).toBe('bidding');
      expect(host.state.currentCall).toBeNull();
    } finally {
      host.destroy();
    }
  });
});

describe('lobby countdown view', () => {
  it('sends the time left, so every device can count 3, 2, 1 on its own clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const s = lobby(0);
    expect(s.countdownDeadline).toBe(T0 + 3000);
    expect(redact(s, 'p1').countdownRemainingMs).toBe(3000);
    vi.setSystemTime(T0 + 1250);
    expect(redact(s, 'p1').countdownRemainingMs).toBe(1750);
    expect(redact(gameReducer(s, { type: 'setReady', playerId: 'p2', ready: false }), 'p1').countdownRemainingMs).toBeNull();
  });
});
