import React, { useState } from 'react';
import { Clock, Lock, MessageSquare, Save, Eye, ShieldAlert, Sparkles, ChevronRight } from 'lucide-react';
import { Match, Prediction, User } from '../types';
import { isMatchLocked } from '../utils/rules';
import { motion, AnimatePresence } from 'motion/react';
import TeamCrest from './TeamCrest';
import { apiJson } from '../lib/api';

interface MatchListProps {
  matches: Match[];
  predictions: Prediction[];
  users: User[];
  currentUserId: string;
  onSavePrediction: (matchId: string, homeScore: number, awayScore: number) => void;
  onOpenComments: (match: Match) => void;
  activeLeague?: string;
  groupMembers?: string[]; // user IDs in active group
  unreadMatchIds?: string[]; // list of match IDs with unread comments
  onMarkAllCommentsAsRead?: () => void;
  activeGroupId?: string;
}

export default function MatchList({
  matches,
  predictions,
  users,
  currentUserId,
  onSavePrediction,
  onOpenComments,
  activeLeague,
  groupMembers,
  unreadMatchIds = [],
  onMarkAllCommentsAsRead,
  activeGroupId,
}: MatchListProps) {
  const [filterTab, setFilterTab] = useState<'upcoming' | 'live' | 'completed'>('upcoming');
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'not_predicted' | 'predicted'>('all');
  const [editingScores, setEditingScores] = useState<Record<string, { home: string; away: string }>>({});
  const [expandedPredictionsMatchId, setExpandedPredictionsMatchId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiAdvice, setAiAdvice] = useState<Record<string, string>>({});
  const [confirmingSaveMatchId, setConfirmingSaveMatchId] = useState<string | null>(null);

  // Filter matches based on league and status
  const filteredMatches = matches.filter((match) => {
    // League filtering
    if (activeLeague && match.league !== activeLeague) return false;

    // Status mapping for filter
    if (filterTab === 'upcoming') {
      if (match.status !== 'upcoming') return false;
      const userPred = predictions.find((p) => p.matchId === match.id && p.userId === currentUserId && (activeGroupId ? (p.groupId === activeGroupId || (!p.groupId && activeGroupId === 'g1')) : true));
      if (upcomingFilter === 'not_predicted') {
        return !userPred;
      }
      if (upcomingFilter === 'predicted') {
        return !!userPred;
      }
      return true;
    }
    if (filterTab === 'live') return match.status === 'live';
    if (filterTab === 'completed') return match.status === 'completed';
    return true;
  });

  // Calculate unread items for active league/matches overall
  const totalUnreadInActiveLeague = matches.filter(m => {
    if (activeLeague && m.league !== activeLeague) return false;
    return unreadMatchIds.includes(m.id);
  }).length;

  // Setup initial inputs if not loaded
  const getPrediction = (matchId: string) => {
    return predictions.find((p) => p.matchId === matchId && p.userId === currentUserId && (activeGroupId ? (p.groupId === activeGroupId || (!p.groupId && activeGroupId === 'g1')) : true));
  };

  const handleScoreChange = (matchId: string, side: 'home' | 'away', val: string) => {
    // Only numeric entries
    const numVal = val.replace(/[^0-9]/g, '');
    const current = editingScores[matchId] || {
      home: getPrediction(matchId)?.homeScore?.toString() || '',
      away: getPrediction(matchId)?.awayScore?.toString() || '',
    };

    setEditingScores({
      ...editingScores,
      [matchId]: {
        ...current,
        [side]: numVal,
      },
    });
  };

  const handleSave = (matchId: string) => {
    const scores = editingScores[matchId];
    if (!scores) return;

    const homeNum = parseInt(scores.home);
    const awayNum = parseInt(scores.away);

    if (isNaN(homeNum) || isNaN(awayNum)) return;

    onSavePrediction(matchId, homeNum, awayNum);
    // Remove local edit state to trigger saved look
    const updated = { ...editingScores };
    delete updated[matchId];
    setEditingScores(updated);
  };

  // Check if saved prediction differs from local editing state
  const isDirty = (matchId: string) => {
    const edits = editingScores[matchId];
    if (!edits) return false;
    const pred = getPrediction(matchId);
    if (!pred) return edits.home !== '' && edits.away !== '';
    return edits.home !== pred.homeScore.toString() || edits.away !== pred.awayScore.toString();
  };

  // Asks the server to suggest a placar via Gemini. Public endpoint, no auth required.
  // Server falls back to a random score if GEMINI_API_KEY isn't configured.
  const handleAiSuggest = async (matchId: string, homeTeam: string, awayTeam: string) => {
    setAiLoading((prev) => ({ ...prev, [matchId]: true }));
    try {
      const data = await apiJson<{ homeScore?: number; awayScore?: number; reasoning?: string }>(
        '/api/ai/suggest-score',
        { method: 'POST', body: JSON.stringify({ homeTeam, awayTeam }) }
      );
      if (data.homeScore !== undefined && data.awayScore !== undefined) {
        setEditingScores((prev) => ({
          ...prev,
          [matchId]: { home: String(data.homeScore), away: String(data.awayScore) },
        }));
        setAiAdvice((prev) => ({ ...prev, [matchId]: data.reasoning || '' }));
      }
    } catch (e) {
      console.error('Erro ao solicitar sugestão de IA:', e);
    } finally {
      setAiLoading((prev) => ({ ...prev, [matchId]: false }));
    }
  };

  const formatMatchTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4">
      {/* Sub tabs filtering */}
      <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 shadow-sm">
        {(['upcoming', 'live', 'completed'] as const).map((tab) => {
          const count = matches.filter((m) => {
            if (activeLeague && m.league !== activeLeague) return false;
            return m.status === tab;
          }).length;

          const hasUnreadInTab = matches.some((m) => {
            if (activeLeague && m.league !== activeLeague) return false;
            if (m.status !== tab) return false;
            return unreadMatchIds.includes(m.id);
          });

          const label = tab === 'upcoming' ? 'Abertos' : tab === 'live' ? 'Ao Vivo' : 'Encerrados';
          const activeStyle = filterTab === tab
            ? 'bg-emerald-500 text-slate-950 font-bold shadow-md'
            : 'text-slate-400 hover:text-slate-200';

          return (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 relative ${activeStyle}`}
            >
              <span className="flex items-center gap-1">
                {label}
                {hasUnreadInTab && (
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                )}
              </span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
                filterTab === tab ? 'bg-slate-950 text-emerald-400 font-bold' : 'bg-slate-950 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Secondary filter for upcoming (Abertos) matches */}
      {filterTab === 'upcoming' && (
        <div className="flex bg-slate-950/40 border border-slate-900/80 rounded-xl p-2 items-center justify-between gap-1.5 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full">
            <span className="text-[10px] uppercase font-bold text-slate-500 mr-1 shrink-0">Palpites:</span>
            
            <button
              onClick={() => setUpcomingFilter('all')}
              className={`px-2.5 py-1 text-[11px] rounded-full transition font-semibold flex items-center gap-1 shrink-0 ${
                upcomingFilter === 'all'
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/20 font-bold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-850/60'
              }`}
            >
              <span>Todos os Jogos</span>
              <span className="text-[9px] px-1 bg-slate-950 text-slate-500 rounded font-mono font-bold leading-none py-0.5">
                {matches.filter(m => {
                  if (activeLeague && m.league !== activeLeague) return false;
                  return m.status === 'upcoming';
                }).length}
              </span>
            </button>

            <button
              onClick={() => setUpcomingFilter('not_predicted')}
              className={`px-2.5 py-1 text-[11px] rounded-full transition font-semibold flex items-center gap-1 shrink-0 ${
                upcomingFilter === 'not_predicted'
                  ? 'bg-amber-400/10 text-amber-400 border border-amber-400/25 font-bold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-850/60'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Não Palpitados</span>
              <span className={`text-[9px] px-1 bg-slate-950 rounded font-mono font-bold leading-none py-0.5 ${
                matches.filter(m => {
                  if (activeLeague && m.league !== activeLeague) return false;
                  if (m.status !== 'upcoming') return false;
                  const hasPred = predictions.some(p => p.matchId === m.id && p.userId === currentUserId && (activeGroupId ? (p.groupId === activeGroupId || (!p.groupId && activeGroupId === 'g1')) : true));
                  return !hasPred;
                }).length > 0 ? 'text-amber-400 font-black' : 'text-slate-500'
              }`}>
                {matches.filter(m => {
                  if (activeLeague && m.league !== activeLeague) return false;
                  if (m.status !== 'upcoming') return false;
                  const hasPred = predictions.some(p => p.matchId === m.id && p.userId === currentUserId && (activeGroupId ? (p.groupId === activeGroupId || (!p.groupId && activeGroupId === 'g1')) : true));
                  return !hasPred;
                }).length}
              </span>
            </button>

            <button
              onClick={() => setUpcomingFilter('predicted')}
              className={`px-2.5 py-1 text-[11px] rounded-full transition font-semibold flex items-center gap-1 shrink-0 ${
                upcomingFilter === 'predicted'
                  ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/25 font-bold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-850/60'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Palpitados</span>
              <span className="text-[9px] px-1 bg-slate-950 text-slate-500 rounded font-mono font-bold leading-none py-0.5">
                {matches.filter(m => {
                  if (activeLeague && m.league !== activeLeague) return false;
                  if (m.status !== 'upcoming') return false;
                  const hasPred = predictions.some(p => p.matchId === m.id && p.userId === currentUserId && (activeGroupId ? (p.groupId === activeGroupId || (!p.groupId && activeGroupId === 'g1')) : true));
                  return hasPred;
                }).length}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Clear Unread Badge Action */}
      {totalUnreadInActiveLeague > 0 && onMarkAllCommentsAsRead && (
        <div className="flex justify-end pr-1">
          <button
            onClick={onMarkAllCommentsAsRead}
            className="text-[10px] text-slate-400 hover:text-rose-400 font-bold transition flex items-center gap-1 bg-slate-900/60 hover:bg-slate-900/95 py-1 px-2.5 rounded-lg border border-slate-800/80 active:scale-95"
          >
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
            <span>Marcar tudo como lido em "{activeLeague || 'Geral'}"</span>
          </button>
        </div>
      )}

      {/* Matches Loop */}
      <div className="space-y-4">
        {filteredMatches.length === 0 ? (
          <div className="p-10 text-center border border-slate-800 rounded-2xl bg-slate-900/40">
            {filterTab === 'upcoming' && upcomingFilter === 'not_predicted' && matches.some(m => (!activeLeague || m.league === activeLeague) && m.status === 'upcoming') ? (
              <>
                <span className="text-3xl block mb-2">🎉</span>
                <p className="text-emerald-400 font-bold text-sm">Você palpitou em tudo!</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Excelente trabalho! Todos os seus palpites de partidas abertas estão registrados e salvos com segurança.
                </p>
              </>
            ) : filterTab === 'upcoming' && upcomingFilter === 'predicted' ? (
              <>
                <Clock className="w-8 h-8 text-amber-500/85 mx-auto mb-2" />
                <p className="text-amber-400 font-bold text-sm">Nenhum palpite registrado ainda!</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Utilize o filtro de <span className="text-amber-500 font-black">"Não Palpitados"</span> para encontrar os jogos abertos e lançar sua aposta.
                </p>
              </>
            ) : (
              <>
                <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400 font-medium text-sm">Nenhuma partida encontrada nesta aba.</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Simule o avanço de rodadas no painel do desenvolvedor no topo para reabrir ou encerrar palpites!
                </p>
              </>
            )}
          </div>
        ) : (
          filteredMatches.map((match) => {
            const myPred = getPrediction(match.id);
            const isLocked = isMatchLocked(match);

            // Fetch input values favoring typing states
            const homeInputVal = editingScores[match.id]?.home !== undefined
              ? editingScores[match.id].home
              : myPred?.homeScore?.toString() || '';

            const awayInputVal = editingScores[match.id]?.away !== undefined
              ? editingScores[match.id].away
              : myPred?.awayScore?.toString() || '';

            return (
              <div
                key={match.id}
                className={`p-4 bg-slate-900 border rounded-2xl transition duration-150 relative overflow-hidden ${
                  match.status === 'live'
                    ? 'border-rose-500/40 shadow-lg shadow-rose-950/5'
                    : 'border-slate-800'
                }`}
              >
                {/* Match card header */}
                <div className="flex items-center justify-between text-xs mb-3 pb-2 border-b border-slate-850">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    {formatMatchTime(match.date)}
                  </span>
                  
                  {isLocked ? (
                    <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-bold text-[10px] flex items-center gap-1 border border-rose-500/20">
                      <Lock className="w-2.5 h-2.5" />
                      Palpites Fechados
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold text-[10px] flex items-center gap-1 border border-emerald-500/20">
                      <Clock className="w-2.5 h-2.5 animate-pulse" />
                      Disponível para Apostas
                    </span>
                  )}
                </div>

                {/* Score / Teams Body */}
                <div className="flex items-center justify-between py-2 text-slate-100">
                  {/* Home Team */}
                  <div className="flex flex-col items-center justify-center flex-1 text-center font-sans">
                    <TeamCrest flagUrl={match.homeTeam.flagUrl} name={match.homeTeam.name} code={match.homeTeam.code} />
                    <span className="font-bold text-xs truncate max-w-[95px]">{match.homeTeam.name}</span>
                    <span className="text-[10px] font-mono text-slate-500">{match.homeTeam.code}</span>
                  </div>

                  {/* Real-world/Live goals indicators */}
                  <div className="flex flex-col items-center justify-center px-4">
                    {match.status !== 'upcoming' ? (
                      <div className="flex items-center justify-center gap-3">
                        <span className="text-2xl font-black font-mono tracking-tight text-white">{match.homeScore}</span>
                        <span className="text-slate-600 font-bold">-</span>
                        <span className="text-2xl font-black font-mono tracking-tight text-white">{match.awayScore}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">VS</span>
                    )}

                    {match.status === 'live' && (
                      <span className="mt-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-slate-100 text-[9px] font-bold animate-pulse uppercase tracking-wider flex items-center gap-1">
                        ● AO VIVO
                      </span>
                    )}
                    {match.status === 'completed' && (
                      <span className="mt-1 text-[9px] font-semibold text-slate-500 uppercase">
                        Encerrado
                      </span>
                    )}
                  </div>

                  {/* Away Team */}
                  <div className="flex flex-col items-center justify-center flex-1 text-center font-sans">
                    <TeamCrest flagUrl={match.awayTeam.flagUrl} name={match.awayTeam.name} code={match.awayTeam.code} />
                    <span className="font-bold text-xs truncate max-w-[95px]">{match.awayTeam.name}</span>
                    <span className="text-[10px] font-mono text-slate-500">{match.awayTeam.code}</span>
                  </div>
                </div>

                {/* Scorers display if completed */}
                {match.status === 'completed' && match.scorers && match.scorers.length > 0 && (
                  <div className="mt-2 text-[10px] text-slate-400 text-center bg-slate-950/40 p-2 rounded-lg font-mono">
                    ⚽️ Gols: {match.scorers.join(', ')}
                  </div>
                )}

                {/* Predict control form panel */}
                <div className="mt-4 pt-3 border-t border-slate-850 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  {/* Left prediction status */}
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-semibold">Seu Palpite:</span>
                    {myPred ? (
                      <span className="px-2 py-0.5 bg-slate-800 text-emerald-400 rounded-full font-bold font-mono">
                        {myPred.homeScore} x {myPred.awayScore}
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium italic">Sem palpite lançado</span>
                    )}
                  </div>

                  {/* Prediction inputs (only if not locked and not predicted yet) */}
                  {!isLocked ? (
                    myPred ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold self-end text-xs shadow-inner">
                        <Lock className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Confirmado! 🔒</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 self-end">
                        {/* AI Suggest Score button — pre-fills the placar inputs with a Gemini guess */}
                        <button
                          onClick={() => handleAiSuggest(match.id, match.homeTeam.name, match.awayTeam.name)}
                          disabled={aiLoading[match.id]}
                          title="Pedir sugestão de placar com IA"
                          className={`py-2 px-2.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 disabled:bg-slate-800 disabled:text-slate-500 text-teal-400 hover:text-teal-300 font-bold text-xs flex items-center justify-center gap-1 border border-teal-500/25 transition active:scale-95 shrink-0 ${
                            aiLoading[match.id] ? 'animate-pulse cursor-wait' : ''
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{aiLoading[match.id] ? 'Pensando...' : 'IA'}</span>
                        </button>

                        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                          <input
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            placeholder="0"
                            value={homeInputVal}
                            onChange={(e) => handleScoreChange(match.id, 'home', e.target.value)}
                            className="w-8 text-center bg-transparent border-none text-slate-100 font-bold font-mono text-sm outline-none"
                          />
                          <span className="text-slate-600 font-bold">x</span>
                          <input
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            placeholder="0"
                            value={awayInputVal}
                            onChange={(e) => handleScoreChange(match.id, 'away', e.target.value)}
                            className="w-8 text-center bg-transparent border-none text-slate-100 font-bold font-mono text-sm outline-none"
                          />
                        </div>

                        <button
                          onClick={() => {
                            const scores = editingScores[match.id];
                            if (!scores) return;
                            const homeNum = parseInt(scores.home);
                            const awayNum = parseInt(scores.away);
                            if (isNaN(homeNum) || isNaN(awayNum)) return;
                            setConfirmingSaveMatchId(match.id);
                          }}
                          disabled={!isDirty(match.id)}
                          className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 ${
                            isDirty(match.id)
                              ? 'bg-emerald-400 text-slate-950 shadow-md shadow-emerald-950/10 cursor-pointer'
                              : 'bg-slate-850 text-slate-500 cursor-not-allowed border border-slate-800'
                          }`}
                        >
                          <Save className="w-3.5 h-3.5" />
                          Salvar
                        </button>
                      </div>
                    )
                  ) : (
                    // Locked message or see everyone's guesses list toggle
                    <div className="flex items-center gap-2 self-end">
                      <button
                        onClick={() => setExpandedPredictionsMatchId(
                          expandedPredictionsMatchId === match.id ? null : match.id
                        )}
                        className="py-1.5 px-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg flex items-center gap-1 border border-slate-800 font-semibold transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver Palpites do Grupo
                      </button>
                    </div>
                  )}

                  {/* Chat Icon launcher */}
                  {(() => {
                    const hasUnread = unreadMatchIds.includes(match.id);
                    return (
                      <button
                        onClick={() => onOpenComments(match)}
                        className={`flex items-center gap-1.5 self-start px-2 py-1.5 rounded-lg transition border font-semibold relative ${
                          hasUnread
                            ? 'bg-slate-950 hover:bg-slate-850 text-emerald-450 border-rose-500/40 text-emerald-400'
                            : 'bg-slate-950 hover:bg-slate-850 text-slate-300 hover:text-emerald-400 border-slate-850'
                        }`}
                      >
                        <div className="relative">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {hasUnread && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                          )}
                        </div>
                        <span>Resenha / Chat</span>
                        {hasUnread && (
                          <span className="text-[9px] bg-rose-500 text-slate-100 font-bold px-1.5 py-0.5 rounded-full leading-none animate-pulse">
                            Novo
                          </span>
                        )}
                      </button>
                    );
                  })()}
                </div>

                {/* Save Confirmation Dialog */}
                {confirmingSaveMatchId === match.id && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-slate-250 text-xs flex flex-col gap-2.5 shadow-inner"
                  >
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <span className="font-extrabold text-amber-450 text-amber-400">Eita! Atenção:</span>
                        {' '}Você está prestes a salvar o palpite de{' '}
                        <span className="font-extrabold font-mono text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-850 inline-block align-middle">
                          {editingScores[match.id]?.home} x {editingScores[match.id]?.away}
                        </span>
                        . O palpite é <span className="font-bold underline text-amber-300">definitivo</span> e não poderá ser alterado depois. Confirma a aposta?
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2.5 mt-1">
                      <button
                        onClick={() => setConfirmingSaveMatchId(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 font-bold transition text-[11px]"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          handleSave(match.id);
                          setConfirmingSaveMatchId(null);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black transition text-[11px] shadow-sm shadow-emerald-950/20"
                      >
                        Sim, Confirmar!
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* AI advice (only when the user pre-filled via IA button and hasn't saved yet) */}
                {aiAdvice[match.id] && !isLocked && !myPred && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-teal-500/10 text-teal-300/90 text-xs flex items-start gap-2.5 leading-relaxed shadow-inner"
                  >
                    <Sparkles className="w-4 h-4 text-teal-400 shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <span className="font-extrabold text-teal-400">Sugestão da IA: </span>
                      {aiAdvice[match.id]}
                      <p className="text-[9px] text-slate-500 mt-1 font-sans">
                        Clique em <span className="font-bold text-emerald-400">"Salvar"</span> se concordar com a sugestão.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Expandable predictions list of everyone in this group */}
                {expandedPredictionsMatchId === match.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 pt-3 border-t border-slate-850 bg-slate-950/30 rounded-xl p-3 space-y-2.5"
                  >
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                      Apostas da Galera do Bolão:
                    </div>
                    {users
                      .filter((u) => !groupMembers || groupMembers.includes(u.id))
                      .map((member) => {
                        const mPred = predictions.find(
                          (p) => p.matchId === match.id && p.userId === member.id && (activeGroupId ? (p.groupId === activeGroupId || (!p.groupId && activeGroupId === 'g1')) : true)
                        );

                        return (
                          <div
                            key={member.id}
                            className="flex items-center justify-between text-xs p-1.5 rounded bg-slate-900/60 border border-slate-850/55"
                          >
                            <div className="flex items-center gap-2">
                              <img
                                src={member.avatar}
                                alt={member.name}
                                className="w-5 h-5 rounded-full object-cover border border-slate-800"
                                referrerPolicy="no-referrer"
                              />
                              <span className="font-medium text-slate-300">
                                {member.id === currentUserId ? 'Você' : member.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {mPred ? (
                                <span className="font-bold font-mono text-slate-100 bg-slate-950 px-2 py-0.5 rounded">
                                  {mPred.homeScore} x {mPred.awayScore}
                                </span>
                              ) : (
                                <span className="text-slate-600 italic">Não palpitou</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </motion.div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
