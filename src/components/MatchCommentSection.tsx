import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, ChevronLeft, Heart, Flame, ShieldAlert } from 'lucide-react';
import { Match, Comment, User, CommentReaction } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import TeamCrest from './TeamCrest';

interface MatchCommentSectionProps {
  match: Match;
  comments: Comment[];
  currentUser: User;
  onAddComment: (matchId: string, text: string) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onClose: () => void;
}

const AVAILABLE_EMOJIS = ['👍', '🔥', '😂', '😮', '😢', '❤️'];

export default function MatchCommentSection({
  match,
  comments,
  currentUser,
  onAddComment,
  onToggleReaction,
  onClose,
}: MatchCommentSectionProps) {
  const [newComment, setNewComment] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when comments list updates
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    onAddComment(match.id, newComment.trim());
    setNewComment('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Target header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 font-medium transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Voltar</span>
        </button>
        <div className="text-center font-semibold text-sm">
          <span>Chat da Partida</span>
        </div>
        <div className="w-16" /> {/* Balance spacer */}
      </div>

      {/* Match Context Card */}
      <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TeamCrest flagUrl={match.homeTeam.flagUrl} name={match.homeTeam.name} code={match.homeTeam.code} size="sm" />
          <span className="font-bold text-xs text-slate-100 leading-none">{match.homeTeam.name}</span>
        </div>
        <div className="px-3 py-1 bg-slate-800 rounded-full text-xs font-semibold text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 select-none shrink-0">
          {match.status === 'live' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="font-mono text-xs">{match.homeScore ?? 0} - {match.awayScore ?? 0} Ao Vivo</span>
            </>
          ) : match.status === 'completed' ? (
            <span className="font-mono text-xs">{match.homeScore} - {match.awayScore} Fim</span>
          ) : (
            <span className="text-[10px]">Próximo</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs text-slate-100 leading-none text-right">{match.awayTeam.name}</span>
          <TeamCrest flagUrl={match.awayTeam.flagUrl} name={match.awayTeam.name} code={match.awayTeam.code} size="sm" />
        </div>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {comments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-2">
            <MessageSquare className="w-10 h-10 text-slate-600 animate-bounce" />
            <p className="text-slate-400 font-medium">Nenhum comentário ainda nesta partida.</p>
            <p className="text-xs text-slate-500">Seja o primeiro a mandar o palpite ou corneta aqui!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {comments.map((comment) => {
              const isMe = comment.userId === currentUser.id;
              return (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className={`flex flex-col space-y-1.5 max-w-[85%] ${
                    isMe ? 'ml-auto items-end' : 'mr-auto items-start'
                  }`}
                >
                  {/* User info */}
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {!isMe && (
                      <img
                        src={comment.userAvatar}
                        alt={comment.userName}
                        className="w-5 h-5 rounded-full object-cover border border-slate-700"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span className="font-medium">{comment.userName}</span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(comment.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Comment bubble */}
                  <div
                    className={`p-3 rounded-2xl text-sm leading-relaxed ${
                      isMe
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-tr-none shadow-md shadow-emerald-950/20'
                        : 'bg-slate-800 text-slate-100 rounded-tl-none shadow-md shadow-slate-950/40 border border-slate-700/50'
                    }`}
                  >
                    {comment.text}
                  </div>

                  {/* Reaction bar */}
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {/* Active reactions list */}
                    {comment.reactions.map((react) => {
                      if (react.count === 0) return null;
                      const hasUserReacted = react.users.includes(currentUser.id);
                      return (
                        <button
                          key={react.emoji}
                          onClick={() => onToggleReaction(comment.id, react.emoji)}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs transition border ${
                            hasUserReacted
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                          }`}
                        >
                          <span>{react.emoji}</span>
                          <span className="font-bold">{react.count}</span>
                        </button>
                      );
                    })}

                    {/* Quick Add Popover inline */}
                    <div className="relative group/emoji">
                      <button className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition text-[11px]">
                        +
                      </button>
                      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-full py-1 px-2 shadow-xl opacity-0 scale-75 group-hover/emoji:opacity-100 group-hover/emoji:scale-100 pointer-events-none group-hover/emoji:pointer-events-auto transition-all duration-150 flex gap-1 z-20">
                        {AVAILABLE_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => onToggleReaction(comment.id, emoji)}
                            className="hover:scale-125 hover:rotate-6 transition active:scale-95 px-1 py-0.5 text-base"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Input section */}
      <form
        onSubmit={handleSubmit}
        className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Deixe um comentário ou palpite..."
          className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-full px-4 py-2.5 text-sm outline-none transition text-slate-100 placeholder-slate-500"
        />
        <button
          type="submit"
          disabled={!newComment.trim()}
          className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 inline-flex items-center justify-center transition-colors shadow-lg active:scale-95"
        >
          <Send className="w-4 h-4 text-slate-950" />
        </button>
      </form>
    </div>
  );
}
