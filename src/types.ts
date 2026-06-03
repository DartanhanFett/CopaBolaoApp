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
}

export interface CommentReaction {
  emoji: string;
  count: number;
  users: string[]; // List of userIds who reacted
}

export interface Comment {
  id: string;
  matchId: string;
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
