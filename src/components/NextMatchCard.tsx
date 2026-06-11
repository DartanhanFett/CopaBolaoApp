import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, ChevronRight, Lock, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import type { Match } from '../types';
import TeamCrest from './TeamCrest';
import { isMatchLocked } from '../utils/rules';
import { formatMatchTime } from '../utils/time';

interface NextMatchCardProps {
  matches: Match[];
  /** When set, restrict the lookup to this league. Lets the card stay tied
   *  to the bolão the user is browsing instead of jumping across leagues. */
  league?: string;
  /** Tap handler — typically jumps the user into the matches tab so they can
   *  drop a palpite while the countdown is still warm. */
  onJumpToMatches?: () => void;
}

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

function diffToParts(targetMs: number): Countdown {
  const now = Date.now();
  const totalMs = Math.max(0, targetMs - now);
  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, totalMs };
}

/**
 * Hero-style card pinned to the top of the Bolões tab. Surfaces the next
 * upcoming match (filtered by league when applicable) with a live ticking
 * countdown so the app feels "alive" the second the user opens it.
 *
 * Three visual states, picked off the same data:
 *   - upcoming: green ring + countdown
 *   - locked   (within the 15-min bet-lock window): amber ring + "trancado"
 *   - live     (status === 'live'): red ring + pulse
 */
export default function NextMatchCard({ matches, league, onJumpToMatches }: NextMatchCardProps) {
  // Pick the soonest upcoming match (ignoring completed). Live matches are
  // surfaced first because "happening right now" beats "happening later".
  const featured = useMemo(() => {
    const candidates = matches.filter((m) => {
      if (league && m.league !== league) return false;
      return m.status === 'upcoming' || m.status === 'live';
    });
    if (candidates.length === 0) return null;
    // Live first, then earliest upcoming.
    const live = candidates.find((m) => m.status === 'live');
    if (live) return live;
    return [...candidates]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  }, [matches, league]);

  // Tick once a second while the card is mounted. Cheap — a single setInterval
  // and the parent only re-renders if `matches` changes; the countdown state
  // change is local.
  const [countdown, setCountdown] = useState<Countdown>(() =>
    featured ? diffToParts(new Date(featured.date).getTime()) : diffToParts(Date.now()),
  );
  useEffect(() => {
    if (!featured) return;
    const targetMs = new Date(featured.date).getTime();
    setCountdown(diffToParts(targetMs));
    const id = setInterval(() => setCountdown(diffToParts(targetMs)), 1000);
    return () => clearInterval(id);
  }, [featured]);

  if (!featured) return null;

  const isLive = featured.status === 'live';
  const isLocked = !isLive && isMatchLocked(featured);
  const ringClass = isLive
    ? 'border-rose-500/60 shadow-rose-500/20'
    : isLocked
      ? 'border-amber-500/60 shadow-amber-500/20'
      : 'border-emerald-500/40 shadow-emerald-500/10';
  const accentText = isLive ? 'text-rose-400' : isLocked ? 'text-amber-400' : 'text-emerald-400';

  return (
    <motion.button
      type="button"
      onClick={onJumpToMatches}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`w-full text-left bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/80 border ${ringClass} shadow-xl rounded-2xl p-4 mb-4 active:scale-[0.99] transition focus:outline-none`}
    >
      {/* Header strip */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1 ${accentText}`}>
          {isLive ? (
            <>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              Ao vivo
            </>
          ) : isLocked ? (
            <>
              <Lock className="w-3 h-3" />
              Palpites trancados
            </>
          ) : (
            <>
              <Zap className="w-3 h-3" />
              Próximo jogo
            </>
          )}
        </span>
        <ChevronRight className="w-4 h-4 text-slate-500" />
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <TeamCrest flagUrl={featured.homeTeam.flagUrl} name={featured.homeTeam.name} code={featured.homeTeam.code} size="md" />
          <span className="text-[11px] font-bold text-slate-100 text-center leading-tight truncate w-full">
            {featured.homeTeam.name}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          {isLive ? (
            <span className="font-mono font-extrabold text-2xl text-slate-100">
              {featured.homeScore ?? 0}
              <span className="text-slate-500 mx-1">×</span>
              {featured.awayScore ?? 0}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">vs</span>
          )}
        </div>
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <TeamCrest flagUrl={featured.awayTeam.flagUrl} name={featured.awayTeam.name} code={featured.awayTeam.code} size="md" />
          <span className="text-[11px] font-bold text-slate-100 text-center leading-tight truncate w-full">
            {featured.awayTeam.name}
          </span>
        </div>
      </div>

      {/* Footer: countdown / kickoff time */}
      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {formatMatchTime(featured.date)}
        </span>
        {!isLive && countdown.totalMs > 0 && (
          <span className={`text-[11px] font-mono font-extrabold flex items-center gap-1 ${accentText}`}>
            <Clock className="w-3 h-3" />
            {countdown.days > 0 ? `${countdown.days}d ` : ''}
            {String(countdown.hours).padStart(2, '0')}:
            {String(countdown.minutes).padStart(2, '0')}:
            {String(countdown.seconds).padStart(2, '0')}
          </span>
        )}
      </div>
    </motion.button>
  );
}
