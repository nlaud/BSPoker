/**
 * Per-tab memory of the last deal this tab has seen, so a deal animates only
 * when it is new to this tab: a tab that was in the lobby animates the first
 * deal, while a refresh or a mid-round join shows the cards already in place.
 */
function key(code: string): string {
  return `bspoker:dealSeq:${code.toUpperCase()}`;
}

export function getSeenDealSeq(code: string): number | null {
  try {
    const raw = sessionStorage.getItem(key(code));
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

export function setSeenDealSeq(code: string, seq: number): void {
  try {
    sessionStorage.setItem(key(code), String(seq));
  } catch {
    // Storage unavailable (private mode or blocked): deals simply never replay-protect.
  }
}
