import React, { useEffect, useRef } from 'react';
import { useTimeLeft } from './useTimeLeft';

/** The bar turns red for the last few seconds. */
const WARN_MS = 5000;

export interface TurnTimerProps {
  /** Time left when the latest view arrived (from the host), in ms. */
  remainingMs: number;
  /** The full turn length, in ms. The first turn of a round can have more left (the deal grace). */
  totalMs: number;
  isMine: boolean;
}

/** A draining bar plus seconds left for the current turn. */
export const TurnTimer: React.FC<TurnTimerProps> = ({ remainingMs, totalMs, isMine }) => {
  const { deadline, msLeft } = useTimeLeft(remainingMs);
  const left = msLeft ?? 0;
  const fillRef = useRef<HTMLDivElement | null>(null);

  // The bar is set from the clock on every frame, so it is right at once when
  // a background tab or a locked phone comes back. Time beyond a full turn
  // (the rest of the deal grace) keeps it full.
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const el = fillRef.current;
      if (el && deadline !== null && totalMs > 0) {
        const fraction = Math.min(1, Math.max(0, deadline - Date.now()) / totalMs);
        el.style.transform = `scaleX(${fraction})`;
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [deadline, totalMs]);

  const seconds = Math.ceil(Math.min(left, totalMs) / 1000);
  const warn = left <= WARN_MS;

  return (
    <div
      className={`turn-timer ${warn ? 'is-warn' : ''} ${isMine ? 'is-mine' : ''}`}
      role="timer"
      aria-label={`${seconds} seconds left`}
    >
      <div className="turn-timer-track">
        <div className="turn-timer-fill" ref={fillRef} />
      </div>
      <span className="turn-timer-seconds">{seconds}s</span>
    </div>
  );
};
