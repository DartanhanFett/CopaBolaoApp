export interface Team {
  name: string;
  code: string; // ISO-like or short abbreviation
  flagUrl: string; // Emoji or SVG proxy
}

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  date: string; // ISO string
  status: 'upcoming' | 'live' | 'completed';
  homeScore?: number;
  awayScore?: number;
  scorers?: string[];
  league: string;
}

export interface Prediction {
  id: string;
  userId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  pointsEarned?: number;
  groupId?: string;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  email?: string;
  isAdmin?: boolean; // Set by the server on authentication
  // IANA timezone string ("America/Sao_Paulo") or "auto" to follow the device.
  // When undefined the UI falls back to "auto".
  timezone?: string;
}

export interface CommentReaction {
  emoji: string;
  count: number;
  users: string[]; // List of userIds who reacted
}

export interface Comment {
  id: string;
  matchId: string;
  // Scopes the comment to a specific bolão. Optional because legacy rows
  // (created before the scoping feature) come back as null and are shown in
  // every group as a "shared past" — we don't want to lose chat history.
  groupId?: string | null;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: string; // ISO string
  reactions: CommentReaction[];
}

export interface Group {
  id: string;
  name: string;
  description: string;
  league: string;
  entryFee: number; // Stated value for betting
  creatorId: string;
  code: string; // Shareable link/code to join
  members: string[]; // User IDs
  isPrivate?: boolean;
}

/**
 * Activity feed event. The server writes one row per "interesting thing"
 * (comment, prediction, match status change, ranking shuffle, etc.).
 * The client renders events with the same `type` using a rotating set of
 * playful Brazilian-Portuguese phrases — see utils/eventMessages.ts.
 *
 * payload is shape-dependent per type. Kept loose on purpose because we
 * iterate fast on copy without touching the schema.
 */
export type AppEventType =
  | 'comment.new'         // someone wrote a chat comment
  | 'prediction.new'      // someone saved a prediction (chat-style auto post)
  | 'group.member.joined' // someone joined a bolão
  | 'match.live'          // admin / sync flipped a match to live
  | 'match.completed'     // match has a final score
  | 'rank.passed'         // user A passed user B in the standings
  | 'rank.podium'         // user reached the top 3 for the first time
  | 'rank.exact'          // user nailed an exact score (5pts)
  | 'rank.zeroed';        // user got 0 pts on a finished match they predicted

export interface AppEvent {
  id: string;
  type: AppEventType;
  groupId?: string | null;
  actorId?: string | null;     // who did the thing
  targetId?: string | null;    // who got affected (optional)
  matchId?: string | null;
  payload: Record<string, any>;
  createdAt: string;            // ISO
}
