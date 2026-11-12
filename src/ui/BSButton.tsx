import React, { useState, useEffect, useRef, useCallback } from 'react';
import { playBsThud } from './sound';

export interface BSButtonProps {
  disabled: boolean;
  onCallBs: () => void;
}

const HOLD_MS = 1000;
const DRAIN_MS = 250;
const TRIGGER_ANIM_MS = 320;

/**
 * Hold for one second to call BS. A timer decides completion (so a throttled
 * or background tab still triggers on time); requestAnimationFrame only draws
 * the progress stroke that traces the button border. Releasing early drains
 * the stroke back. At zero progress the stroke is not rendered at all.
 */
export const BSButton: React.FC<BSButtonProps> = ({ disabled, onCallBs }) => {
  const [progress, setProgress] = useState(0); // 0 to 100
  const [isTriggered, setIsTriggered] = useState(false);
  const holdingRef = useRef(false);
  const triggeredRef = useRef(false);
  const progressRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCallBsRef = useRef(onCallBs);
  onCallBsRef.current = onCallBs;

  const setProg = (p: number) => {
    progressRef.current = p;
    setProgress(p);
  };

  const stopFrames = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const complete = useCallback(() => {
    if (triggeredRef.current) return;
    holdingRef.current = false;
    triggeredRef.current = true;
    clearHoldTimer();
    stopFrames();
    setProg(100);
    setIsTriggered(true);
    playBsThud();
    afterTimerRef.current = setTimeout(() => {
      onCallBsRef.current();
      triggeredRef.current = false;
      setIsTriggered(false);
      setProg(0);
    }, TRIGGER_ANIM_MS);
  }, []);

  const startHold = useCallback(() => {
    if (disabled || triggeredRef.current || holdingRef.current) return;
    holdingRef.current = true;
    stopFrames();
    // Resume from wherever a drain left the stroke.
    const startedAt = performance.now() - (progressRef.current / 100) * HOLD_MS;
    holdTimerRef.current = setTimeout(complete, HOLD_MS - (progressRef.current / 100) * HOLD_MS);
    const draw = (now: number) => {
      if (!holdingRef.current) return;
      setProg(Math.min(99, ((now - startedAt) / HOLD_MS) * 100));
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
  }, [disabled, complete]);

  const endHold = useCallback(() => {
    if (!holdingRef.current || triggeredRef.current) return;
    holdingRef.current = false;
    clearHoldTimer();
    stopFrames();
    const from = progressRef.current;
    if (from <= 0) {
      setProg(0);
      return;
    }
    const drainStart = performance.now();
    const drain = (now: number) => {
      if (holdingRef.current) return;
      const t = (now - drainStart) / DRAIN_MS;
      if (t >= 1) {
        setProg(0);
        frameRef.current = null;
        return;
      }
      setProg(from * (1 - t));
      frameRef.current = requestAnimationFrame(drain);
    };
    frameRef.current = requestAnimationFrame(drain);
  }, []);

  // Becoming disabled (turn passed) cancels any hold in progress.
  useEffect(() => {
    if (disabled && holdingRef.current) endHold();
  }, [disabled, endHold]);

  // Hold the B key as a keyboard alternative.
  useEffect(() => {
    if (disabled) return;
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'b' || e.key === 'B') && !e.repeat && !isTyping(e.target)) startHold();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') endHold();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', endHold);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', endHold);
    };
  }, [disabled, startHold, endHold]);

  useEffect(
    () => () => {
      stopFrames();
      clearHoldTimer();
      if (afterTimerRef.current !== null) clearTimeout(afterTimerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      className={`bs-button ${disabled ? 'is-disabled' : ''} ${isTriggered ? 'is-triggered' : ''}`}
      disabled={disabled}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Call BS"
    >
      <span className="bs-button-text">BS</span>
      {progress > 0 && !disabled && (
        <svg className="bs-progress-svg" aria-hidden="true">
          <rect
            className="bs-progress-rect"
            x="1"
            y="1"
            rx="7"
            ry="7"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - progress}
          />
        </svg>
      )}
    </button>
  );
};
