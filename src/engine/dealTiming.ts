/**
 * Timing of the deal animation. The table animates with these values, and the
 * host uses dealDurationMs to give the first turn of a round extra time, so the
 * turn timer only starts once everyone can see their cards.
 */

/** Whole deal (all flights launched) fits in about this budget, even with 42 cards. */
export const DEAL_BUDGET_MS = 2200;
export const FLIGHT_MS = 300;
export const COMMUNITY_FLIP_DELAY_MS = 120;
/** The shuffle plays first; the first card leaves the deck this long after it starts. */
export const SHUFFLE_LEAD_MS = 450;
/** The deck glides between the table center and its spot beside the community cards. */
export const DECK_MOVE_MS = 280;
export const COMMUNITY_GAP_MS = 160;
/** Time after the last flip before the table counts as dealt. */
export const DEAL_SETTLE_MS = 280;
export const COMMUNITY_CARD_COUNT = 2;

/** Time between two player cards leaving the deck. */
export function dealStaggerMs(playerCards: number): number {
  return Math.min(90, Math.floor(DEAL_BUDGET_MS / Math.max(1, playerCards)));
}

/** When the deck is back at the side and the community cards start, from the start of the deal. */
export function communityDealStartMs(playerCards: number): number {
  return SHUFFLE_LEAD_MS + playerCards * dealStaggerMs(playerCards) + DECK_MOVE_MS;
}

/** Length of the whole deal animation for this many player cards. */
export function dealDurationMs(playerCards: number): number {
  return (
    communityDealStartMs(playerCards) +
    (COMMUNITY_CARD_COUNT - 1) * COMMUNITY_GAP_MS +
    FLIGHT_MS +
    COMMUNITY_FLIP_DELAY_MS +
    DEAL_SETTLE_MS
  );
}
