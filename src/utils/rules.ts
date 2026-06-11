import { Match, Prediction } from '../types';
import { DEFAULT_GROUP } from '../data/constants';

/**
 * Does a prediction belong to the bolão the user is currently looking at?
 *
 * Three cases the call sites have to handle (and, until this helper existed,
 * each kept duplicating with subtle drift):
 *
 *   1. No active bolão (`activeGroupId` null) — show everything; the caller is
 *      in a "global" view (e.g. the standalone matches tab pre-bolão).
 *   2. Prediction has a `groupId` — must equal the active one.
 *   3. Legacy prediction (no `groupId`) — predates the per-bolão schema and
 *      counts as belonging to the canonical default group. Without this rule
 *      old palpites would silently disappear from the leaderboard the moment
 *      the user opened the default group.
 *
 * Centralizing the logic also means flipping the default group constant in
 * one place instead of grepping for the magic 'g1'/`DEFAULT_GROUP.id` string.
 */
export function isPredictionInActiveGroup(
  pred: { groupId?: string | null },
  activeGroupId: string | null,
): boolean {
  if (!activeGroupId) return true;
  if (pred.groupId === activeGroupId) return true;
  if (!pred.groupId && activeGroupId === DEFAULT_GROUP.id) return true;
  return false;
}

/**
 * Calculates current points earned for a prediction compared to match results.
 * Rules:
 * - 5 points: Exact score (e.g. pred 2x1, ended 2x1)
 * - 3 points: Correct outcome and correct goal difference (or correct draw score if not exact)
 *             For example, pred 3x1 and ended 2x0 (+2 difference). Or pred 1x1 and ended 2x2.
 * - 2 points: Correct outcome only (e.g. pred 2x1 and ended 1x0, or pred 3x0 and ended 4x2)
 * - 0 points: Incorrect winner/outcome or mismatch
 */
export function calculatePredictionPoints(pred: Prediction, match: Match): number {
  if (match.status !== 'completed' || match.homeScore === undefined || match.awayScore === undefined) {
    return 0; // Match not finished yet
  }

  const pHome = pred.homeScore;
  const pAway = pred.awayScore;
  const mHome = match.homeScore;
  const mAway = match.awayScore;

  // 1. Exact match
  if (pHome === mHome && pAway === mAway) {
    return 5;
  }

  const predictedOutcome = Math.sign(pHome - pAway); // 1 for Home win, -1 for Away win, 0 for Draw
  const actualOutcome = Math.sign(mHome - mAway);

  // If predicted wrong winner / outcome, 0 points
  if (predictedOutcome !== actualOutcome) {
    return 0;
  }

  // 2. Correct goal difference (and correct winner/draw)
  const predictedDiff = pHome - pAway;
  const actualDiff = mHome - mAway;

  if (predictedDiff === actualDiff) {
    return 3;
  }

  // 3. Regular correct winner
  return 2;
}

/**
 * Checks if bets are locked for a match.
 * Default rule: bets lock 15 minutes before match start time.
 */
export function isMatchLocked(match: Match): boolean {
  if (match.status === 'live' || match.status === 'completed') {
    return true;
  }
  const matchTime = new Date(match.date).getTime();
  const fifteenMinutes = 15 * 60 * 1000;
  return Date.now() >= matchTime - fifteenMinutes;
}
