/**
 * Predictions posted automatically into the match chat use a stable text prefix
 * so the renderer can pick them out without a schema migration. Format:
 *
 *   __prediction__:<homeScore>x<awayScore>:<groupId>
 *
 * Examples:
 *   __prediction__:2x1:g_abc       → user predicted 2-1 in group g_abc
 *   __prediction__:0x0:g_default_copa2026
 *
 * groupId is included so admins / future filters can scope per-bolão; today
 * the chat is shared across the match (not per-group), so we don't filter on it
 * yet, but storing it now is cheap.
 */

const PREDICTION_PREFIX = "__prediction__:";

export interface PredictionMessage {
  homeScore: number;
  awayScore: number;
  groupId: string;
}

/** Encodes a prediction into the comment.text format. */
export function encodePredictionMessage(p: PredictionMessage): string {
  return `${PREDICTION_PREFIX}${p.homeScore}x${p.awayScore}:${p.groupId}`;
}

/**
 * Returns the parsed prediction if `text` is one of our auto-posted prediction
 * messages, else `null` (regular human comment).
 */
export function parsePredictionMessage(text: string): PredictionMessage | null {
  if (!text || !text.startsWith(PREDICTION_PREFIX)) return null;
  const rest = text.slice(PREDICTION_PREFIX.length);
  const parts = rest.split(":");
  if (parts.length < 1) return null;
  const score = parts[0];
  const groupId = parts[1] || "";
  const m = score.match(/^(\d+)x(\d+)$/);
  if (!m) return null;
  return {
    homeScore: parseInt(m[1], 10),
    awayScore: parseInt(m[2], 10),
    groupId,
  };
}
