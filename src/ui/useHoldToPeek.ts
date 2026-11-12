import { useState, useEffect, useRef, useCallback } from 'react';
import { playFlipUp, playFlipDown } from './sound';

interface UseHoldToPeekOptions {
  enabled: boolean;
  onPeekChange?: (peeking: boolean) => void;
}

export function useHoldToPeek({ enabled, onPeekChange }: UseHoldToPeekOptions) {
  const [isPeeking, setIsPeeking] = useState(false);
  const peekingRef = useRef(false);
  const onPeekChangeRef = useRef(onPeekChange);
  onPeekChangeRef.current = onPeekChange;

  const setPeek = useCallback(
    (peeking: boolean) => {
      if (!enabled && peeking) return;
      if (peekingRef.current === peeking) return;

      peekingRef.current = peeking;
      setIsPeeking(peeking);

      if (peeking) {
        playFlipUp();
      } else {
        playFlipDown();
      }

      if (onPeekChangeRef.current) {
        onPeekChangeRef.current(peeking);
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) {
      if (peekingRef.current) {
        setPeek(false);
      }
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        if (e.repeat) return;
        e.preventDefault();
        setPeek(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setPeek(false);
      }
    };

    const handleEndPeek = () => {
      setPeek(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleEndPeek);
    window.addEventListener('pointerup', handleEndPeek);
    window.addEventListener('pointercancel', handleEndPeek);
    document.addEventListener('visibilitychange', handleEndPeek);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleEndPeek);
      window.removeEventListener('pointerup', handleEndPeek);
      window.removeEventListener('pointercancel', handleEndPeek);
      document.removeEventListener('visibilitychange', handleEndPeek);
    };
  }, [enabled, setPeek]);

  const onTablePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Don't peek if clicking on interactive elements or modal/dialog/top-bar/log
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('dialog') ||
        target.closest('.modal') ||
        target.closest('.log-drawer') ||
        target.closest('.top-bar') ||
        target.closest('.action-area')
      ) {
        return;
      }

      setPeek(true);
    },
    [enabled, setPeek]
  );

  return {
    isPeeking,
    setPeek,
    onTablePointerDown,
  };
}
