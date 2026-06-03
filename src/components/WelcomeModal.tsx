import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Trophy, Users, X } from 'lucide-react';

interface WelcomeModalProps {
  onAccept: () => void;
  onDecline: () => void;
  isLoading?: boolean;
}

/**
 * Shown to a freshly authenticated user who has no group memberships yet.
 * Offers a one-click join into the public default group ("Geral Copa 2026"),
 * so first-time users don't land on an empty list.
 */
export default function WelcomeModal({ onAccept, onDecline, isLoading }: WelcomeModalProps) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900 border border-emerald-500/30 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
      >
        <div className="relative p-6 bg-gradient-to-br from-emerald-950/60 to-slate-900">
          <button
            onClick={onDecline}
            disabled={isLoading}
            className="absolute top-3 right-3 p-1 rounded-full text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition disabled:opacity-50"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-14 h-14 mx-auto bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center mb-3">
            <Trophy className="w-7 h-7 text-emerald-400" />
          </div>

          <h2 className="text-center text-lg font-black text-white mb-1.5 flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 text-lime-400" />
            Bem-vindo ao CopaBolão!
          </h2>
          <p className="text-center text-xs text-slate-400 leading-relaxed mb-5">
            Você ainda não está em nenhum bolão. Quer entrar no nosso bolão público
            para palpitar nos jogos da Copa do Mundo 2026 com a galera?
          </p>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-500/15 border border-emerald-500/20 rounded-lg flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Geral Copa 2026</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Aberto a qualquer um · Sem taxa de entrada · Bolão oficial da galera
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onDecline}
              disabled={isLoading}
              className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl border border-slate-700/60 transition disabled:opacity-50"
            >
              Agora não
            </button>
            <button
              onClick={onAccept}
              disabled={isLoading}
              className="flex-1 py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-lime-400 hover:from-emerald-400 hover:to-lime-300 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/10 transition active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            >
              {isLoading ? 'Entrando...' : 'Entrar no bolão ⚽'}
            </button>
          </div>

          <p className="text-center text-[10px] text-slate-500 mt-3">
            Você sempre pode entrar/sair de bolões depois pela aba "Bolões".
          </p>
        </div>
      </motion.div>
    </div>
  );
}
