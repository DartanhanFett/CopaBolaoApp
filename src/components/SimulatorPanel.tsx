import React, { useState } from 'react';
import { Play, RotateCcw, AlertTriangle, ShieldCheck, Zap, Coins } from 'lucide-react';
import { Match } from '../types';

interface SimulatorPanelProps {
  matches: Match[];
  onCompleteMatch: (matchId: string, homeScore: number, awayScore: number, scorers?: string[]) => void;
  onSetMatchLive: (matchId: string) => void;
  onResetSimulator: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function SimulatorPanel({
  matches,
  onCompleteMatch,
  onSetMatchLive,
  onResetSimulator,
  isOpen,
  setIsOpen,
}: SimulatorPanelProps) {
  const liveGermanySpain = matches.find((m) => m.id === 'm3');
  const soonBrazilArg = matches.find((m) => m.id === 'm1');

  // Input states
  const [germanyScore, setGermanyScore] = useState(2);
  const [spainScore, setSpainScore] = useState(1);

  const [brazilScore, setBrazilScore] = useState(2);
  const [argentinaScore, setArgentinaScore] = useState(1);

  // Confirmation flag for the destructive reset action
  const [confirmingReset, setConfirmingReset] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-4 shadow-xl mb-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 p-2 bg-amber-500/10 rounded-bl-xl text-[10px] text-amber-400 font-bold tracking-wider uppercase flex items-center gap-1">
        <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
        Painel de Testes do Desenvolvedor
      </div>

      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-3">
        <span>🎮 Simulador de Partidas (A Copa em Tempo Real!)</span>
      </h3>
      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        Como desenvolvedor sênior, preparei este painel interativo. Teste como o app
        bloqueia apostas antes das partidas, atualiza resultados de gols e calcula os
        pontos do Ranking automaticamente em tempo real!
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Match 1 Sim (Germany vs Spain) */}
        {liveGermanySpain && liveGermanySpain.status === 'live' && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                Jogo Ao Vivo Ativo
              </span>
              <p className="text-xs font-semibold text-slate-200">
                Alemanha x Espanha
              </p>
              <p className="text-[11px] text-slate-400 mb-3">
                Apostas do grupo estão trancadas! Simule o apito final:
              </p>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-bold text-xs">ALE:</span>
                <input
                  type="number"
                  min="0"
                  value={germanyScore}
                  onChange={(e) => setGermanyScore(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-10 text-center py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm font-bold"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-bold text-xs">ESP:</span>
                <input
                  type="number"
                  min="0"
                  value={spainScore}
                  onChange={(e) => setSpainScore(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-10 text-center py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm font-bold"
                />
              </div>
            </div>

            <button
              onClick={() => onCompleteMatch('m3', germanyScore, spainScore, ['Müller (23\')', 'Morata (67\')'])}
              className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white transition flex items-center justify-center gap-1 shadow-md"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Encerra Partida e Distribui Pontos
            </button>
          </div>
        )}

        {/* Match 2 Sim (Brazil vs Argentina) */}
        {soonBrazilArg && soonBrazilArg.status === 'upcoming' && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
                📅 Próximo Jogo (Em Breve)
              </span>
              <p className="text-xs font-semibold text-slate-200">
                Brasil x Argentina
              </p>
              <p className="text-[11px] text-slate-400 mb-3">
                Faça seus palpites na aba "Jogos", depois inicie o jogo para simular o bloqueio de apostas:
              </p>
            </div>

            <button
              onClick={() => onSetMatchLive('m1')}
              className="w-full mt-auto py-1.5 px-3 bg-rose-600 hover:bg-rose-500 rounded-lg text-xs font-bold text-white transition flex items-center justify-center gap-1 shadow-md"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Iniciar Jogo (Tranca Palpites!)
            </button>
          </div>
        )}

        {/* Live Brazil vs Argentina */}
        {soonBrazilArg && soonBrazilArg.status === 'live' && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
                🇧🇷 Jogo do Brasil Ao Vivo
              </span>
              <p className="text-xs font-semibold text-slate-200">
                Brasil x Argentina
              </p>
              <p className="text-[11px] text-slate-400 mb-3">
                Apostas trancadas! Simule o resultado final do clássico nacional:
              </p>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-bold text-xs">BRA:</span>
                <input
                  type="number"
                  min="0"
                  value={brazilScore}
                  onChange={(e) => setBrazilScore(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-10 text-center py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm font-bold"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-bold text-xs">ARG:</span>
                <input
                  type="number"
                  min="0"
                  value={argentinaScore}
                  onChange={(e) => setArgentinaScore(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-10 text-center py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-100 text-sm font-bold"
                />
              </div>
            </div>

            <button
              onClick={() => onCompleteMatch('m1', brazilScore, argentinaScore, ['Neymar (12\')', 'Messi (89\')'])}
              className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white transition flex items-center justify-center gap-1 shadow-md"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> Encerra Clássico e Pontua
            </button>
          </div>
        )}

        {/* Global info or Reset */}
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
              ⚙️ Opções Globais
            </span>
            <p className="text-xs font-semibold text-slate-200">
              Resetar Partidas
            </p>
            <p className="text-[11px] text-slate-400 mb-4">
              Volta as partidas ao estado inicial e apaga todos os palpites. <strong className="text-amber-300">Bolões e usuários NÃO são afetados.</strong>
            </p>
          </div>

          {confirmingReset ? (
            <div className="space-y-2">
              <p className="text-[11px] text-amber-300 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Confirmar reset das partidas?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingReset(false)}
                  className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg text-[11px] font-bold text-slate-300 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { setConfirmingReset(false); onResetSimulator(); }}
                  className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-400 rounded-lg text-[11px] font-bold text-slate-950 transition"
                >
                  Sim, resetar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingReset(true)}
              className="w-full py-1.5 px-3 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-amber-400 hover:text-amber-300 transition flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Resetar Partidas
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
