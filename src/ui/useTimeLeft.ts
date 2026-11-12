import { useEffect, useRef, useState } from 'react';

/**
 * Turns a "time left" the host sent into a local deadline on this device's
 * clock, so a clock that is off between devices does not matter. Every new
 * value from the host moves the deadline to match it.
 */
export function useLocalDeadline(remainingMs: number | null): number | null {
  const sync = useRef<{ remainingMs: number | null; deadline: number | null }>({
    remainingMs: null,
    deadline: null,
  });
  if (sync.current.remainingMs !== remainingMs) {
    sync.current = { remainingMs, deadline: remainingMs === null ? null : Date.now() + remainingMs };
  }
  return sync.current.deadline;
}

/**
 * The local deadline and the milliseconds left until it, re-rendering every
 * tickMs while it runs. Both are null when the host sent no deadline.
 */
export function useTimeLeft(
  remainingMs: number | null,
  tickMs = 200,
): { deadline: number | null; msLeft: number | null } {
  const deadline = useLocalDeadline(remainingMs);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setTick((t) => t + 1), tickMs);
    return () => clearInterval(id);
  }, [deadline, tickMs]);
  return { deadline, msLeft: deadline === null ? null : Math.max(0, deadline - Date.now()) };
}
