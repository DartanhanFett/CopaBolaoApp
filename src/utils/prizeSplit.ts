/**
 * Prize split calculation.
 *
 * The app does NOT collect or distribute money. Entry fees are an offline
 * agreement between members (paid via PIX between them). This helper exists
 * only to *display* the suggested split on the Leaderboard so the organizer
 * doesn't have to do the math by hand.
 *
 * Default split is 70 / 20 / 10 (top 3) — a common amateur-tournament shape
 * that rewards finishing close without making a single mistake at the end
 * cost the leader everything.
 */

export interface PrizeShare {
  rank: 1 | 2 | 3;
  pct: number;       // percentage of the pool (0-100)
  amount: number;    // R$ value, rounded to 2 decimals
  label: string;     // "1º lugar", "2º lugar", "3º lugar"
  emoji: string;     // "🥇", "🥈", "🥉"
}

export interface PrizePool {
  totalPool: number;            // entryFee × members
  entryFee: number;
  membersCount: number;
  shares: PrizeShare[];         // up to 3 entries, fewer if pool is too small
}

const TOP_3_70_20_10: { rank: 1 | 2 | 3; pct: number; label: string; emoji: string }[] = [
  { rank: 1, pct: 70, label: "1º lugar", emoji: "🥇" },
  { rank: 2, pct: 20, label: "2º lugar", emoji: "🥈" },
  { rank: 3, pct: 10, label: "3º lugar", emoji: "🥉" },
];

/**
 * Computes the suggested prize pool and per-rank shares. Returns null when the
 * bolão has no real entry fee — there's nothing meaningful to display in that
 * case and the UI should hide the section entirely.
 *
 * Rounding: each share is rounded to 2 decimals independently. With small
 * pools the rounded sum can be off by ±R$0.01 from the total, which is fine
 * for an offline-paid bolão (people round up the cents anyway).
 */
export function calculatePrizePool(entryFee: number, membersCount: number): PrizePool | null {
  if (!entryFee || entryFee <= 0) return null;
  if (!membersCount || membersCount <= 0) return null;

  const totalPool = entryFee * membersCount;
  const shares: PrizeShare[] = TOP_3_70_20_10.map((s) => ({
    ...s,
    amount: Math.round((totalPool * s.pct) / 100 * 100) / 100,
  }));

  return { totalPool, entryFee, membersCount, shares };
}
