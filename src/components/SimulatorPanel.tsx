import React, { useState } from 'react';
import { Play, RotateCcw, AlertTriangle, Zap, RefreshCw } from 'lucide-react';
import { Match } from '../types';
import { apiJson } from '../lib/api';
import { toast } from 'react-hot-toast';

interface SimulatorPanelProps {
  matches: Match[];
  onCompleteMatch: (matchId: string, homeScore: number, awayScore: number, scorers?: string[]) => void;
  onSetMatchLive: (matchId: string) => void;
  onResetSimulator: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

/**
 * One row of the simulator — controls a single match.
 * Either kicks it off (upcoming → live) or finishes it (live → completed).
 * Score inputs are local state so admins can tweak before submitting.
 */
function MatchRow({
  match,
  onSetMatchLive,
  onCompleteMatch,
}: {
  match: Match;
  onSetMatchLive: (matchId: string) => void;
  onCompleteMatch: (matchId: string, h: number, a: number) => void;
}) {
  const [home, setHome] = useState<number>(match.homeScore ?? 0);
  const [away, setAway] = useState<number>(match.awayScore ?? 0);

  const isUpcoming = match.status === 'upcoming';
  const isLive = match.status === 'live';

  return (
    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
          isLive ? 'text-rose-400' : 'text-emerald-400'
        }`}>
          {isLive ? (
            <>
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
              Ao vivo
            </>
          ) : (
            <>📅 Próximo</>
          )}
        </span>
        <span className="text-[10px] text-slate-500">
          {new Date(match.date).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <p className="text-xs font-semibold text-slate-200 leading-tight">
        {match.homeTeam.name} <span className="text-slate-500">x</span> {match.awayTeam.name}
      </p>

      {isLive && (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="number"
            min="0"
            value={home}
            onChange={(e) => setHome(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-12 text-center py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm font-bold"
          />
          <span className="text-slate-500 font-bold">x</span>
          <input
            type="number"
            min="0"
            value={away}
            onChange={(e) => setAway(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-12 text-center py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm font-bold"
          />
        </div>
      )}

      {isUpcoming && (
        <button
          onClick={() => onSetMatchLive(match.id)}
          className="w-full py-1.5 px-3 bg-rose-600 hover:bg-rose-500 rounded-lg text-xs font-bold text-white transition flex items-center justify-center gap-1 shadow-md"
        >
          <Play className="w-3.5 h-3.5 fill-white" /> Iniciar (tranca palpites)
        </button>
      )}

      {isLive && (
        <button
          onClick={() => onCompleteMatch(match.id, home, away)}
          className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white transition flex items-center justify-center gap-1 shadow-md"
        >
          <Play className="w-3.5 h-3.5 fill-white" /> Encerrar e pontuar
        </button>
      )}
    </div>
  );
}

export default function SimulatorPanel({
  matches,
  onCompleteMatch,
  onSetMatchLive,
  onResetSimulator,
  isOpen,
}: SimulatorPanelProps) {
  // Confirmation flag for the destructive reset action
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  if (!isOpen) return null;

  // Live first (most urgent), then upcoming sorted by date. Cap at ~6 each so
  // the panel stays scannable when 100+ matches exist.
  const liveMatches = matches.filter((m) => m.status === 'live').slice(0, 6);
  const upcomingMatches = matches
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 6);

  const handleSyncWorldCup = async () => {
    setIsSyncing(true);
    try {
      const data = await apiJson<{ success: boolean; synced: number; message: string }>(
        '/api/football/sync',
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (data.success) {
        toast.success(`✅ ${data.message}`);
      } else {
        toast.error(data.message || 'Falha ao sincronizar.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro de rede ao sincronizar.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-4 shadow-xl mb-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-2 bg-amber-500/10 rounded-bl-xl text-[10px] text-amber-400 font-bold tracking-wider uppercase flex items-center gap-1">
        <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
        Painel Admin
      </div>

      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-1">
        <span>🎮 Simulador de Partidas</span>
      </h3>
      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        Inicie partidas (tranca palpites), atualize placares ao vivo, e encerre
        para distribuir pontos no ranking. Os {matches.length} jogos da Copa são
        sincronizados automaticamente do calendário OpenFootball.
      </p>

      {/* Live games */}
      {liveMatches.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] uppercase tracking-wider font-bold text-rose-400 mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
            Ao vivo agora ({liveMatches.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {liveMatches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                onSetMatchLive={onSetMatchLive}
                onCompleteMatch={onCompleteMatch}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming games */}
      {upcomingMatches.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 mb-2">
            Próximos jogos
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {upcomingMatches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                onSetMatchLive={onSetMatchLive}
                onCompleteMatch={onCompleteMatch}
              />
            ))}
          </div>
        </div>
      )}

      {liveMatches.length === 0 && upcomingMatches.length === 0 && (
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-400 mb-4">
          Nenhuma partida ativa ou pendente. Use o botão abaixo para sincronizar o calendário.
        </div>
      )}

      {/* Admin tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-800/60">
        {/* Sync calendar */}
        <button
          onClick={handleSyncWorldCup}
          disabled={isSyncing}
          className="py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-xs font-bold text-emerald-400 hover:text-emerald-300 transition flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar calendário (OpenFootball)'}
        </button>

        {/* Reset */}
        {confirmingReset ? (
          <div className="flex items-center gap-2 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] text-amber-300 font-bold">Resetar?</span>
            <button
              onClick={() => setConfirmingReset(false)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded text-[10px] font-bold text-slate-300 transition"
            >
              Não
            </button>
            <button
              onClick={() => { setConfirmingReset(false); onResetSimulator(); }}
              className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 rounded text-[10px] font-bold text-slate-950 transition"
            >
              Sim
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingReset(true)}
            className="py-2 px-3 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-amber-400 hover:text-amber-300 transition flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Resetar palpites + status das partidas
          </button>
        )}
      </div>
    </div>
  );
}
