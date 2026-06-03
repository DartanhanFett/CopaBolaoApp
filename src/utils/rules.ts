import { Match, Prediction } from '../types';

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
