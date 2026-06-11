import React, { useMemo } from 'react';
import { Bell, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { AppEvent, User, Group } from '../types';
import { renderEvent } from '../utils/eventMessages';

interface NewsTabProps {
  events: AppEvent[];
  users: User[];
  /** When set, the feed is filtered to events from this bolão only. */
  activeGroup: Group | null;
  currentUserId: string;
  /** ISO timestamp of the user's last visit to this tab. Used to highlight
   *  brand-new events with a subtle "novo" pill. */
  lastReadAt?: string | null;
}

const CATEGORY_STYLES: Record<string, string> = {
  comment: 'border-slate-700 bg-slate-900/60',
  prediction: 'border-amber-500/30 bg-amber-500/5',
  member: 'border-emerald-500/25 bg-emerald-500/5',
  match: 'border-rose-500/25 bg-rose-500/5',
  rank: 'border-yellow-500/30 bg-yellow-500/5',
};

/**
 * Activity feed. Reads pre-computed events from copabolao_events (via /api/db/sync)
 * and renders each one with a rotating Brazilian-Portuguese phrase from
 * utils/eventMessages.ts. Filters the list to:
 *   - events scoped to the current bolão (or unscoped global ones)
 *   - last 7 days (older stuff stops being interesting)
 */
export default function NewsTab({ events, users, activeGroup, currentUserId, lastReadAt }: NewsTabProps) {
  // Build a quick id → name lookup so eventMessages can swap in display names
  // without each render walking the full users list.
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, u.name);
    return m;
  }, [users]);

  const resolveName = (id?: string | null): string => {
    if (!id) return 'alguém';
    if (id === currentUserId) return 'você';
    return nameById.get(id) || id.split('@')[0] || 'alguém';
  };

  // Filter + sort. Events newer than 7 days, scoped to the active bolão (or
  // global, when groupId is null). Newest first.
  const visible = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return events
      .filter((e) => {
        const t = new Date(e.createdAt).getTime();
        if (Number.isFinite(t) && t < cutoff) return false;
        // Scope to active bolão. Events without a groupId are "global" and show
        // everywhere (e.g. match.live / match.completed apply to every bolão).
        if (activeGroup && e.groupId && e.groupId !== activeGroup.id) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [events, activeGroup]);

  const lastReadMs = lastReadAt ? new Date(lastReadAt).getTime() : 0;

  if (visible.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto bg-slate-850 rounded-full flex items-center justify-center">
            <Bell className="w-6 h-6 text-slate-500" />
          </div>
          <h3 className="text-sm font-bold text-slate-200">Sem novidades por aqui</h3>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
            Quando alguém palpitar, comentar ou um jogo acontecer no bolão, vai aparecer aqui com toda a zoeira.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-emerald-400" />
          <span>Novidades do bolão</span>
        </h3>
        <span className="text-[10px] text-slate-500 font-mono">
          {visible.length} {visible.length === 1 ? 'evento' : 'eventos'}
        </span>
      </div>

      {/* Feed list */}
      <div className="space-y-2">
        {visible.map((event, idx) => {
          const rendered = renderEvent({ event, resolveName });
          const isNew = new Date(event.createdAt).getTime() > lastReadMs;
          const styleKey = rendered.category;

          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              className={`p-3 rounded-xl border ${CATEGORY_STYLES[styleKey] || CATEGORY_STYLES.comment} relative`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-slate-200 leading-relaxed flex-1">{rendered.text}</p>
                {isNew && (
                  <span className="text-[8px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 shrink-0 flex items-center gap-0.5">
                    <Sparkles className="w-2 h-2" />
                    novo
                  </span>
                )}
              </div>
              <p className="text-[9px] text-slate-500 font-mono mt-1.5">
                {formatRelativeTime(event.createdAt)}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "há 5 min", "há 2h", "ontem", "há 3 dias". Avoids importing a date library
 * just for this one helper. Resolution is intentionally coarse — exact seconds
 * would feel surveillance-y in a friendly chat app.
 */
function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}
