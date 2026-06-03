import React, { useState } from 'react';
import { Camera, Shield, Award, Trophy, Key, LogOut, Check, ChevronRight, Coins, Zap, HelpCircle } from 'lucide-react';
import { User, Prediction, Match, Group } from '../types';
import { calculatePredictionPoints } from '../utils/rules';
import { motion, AnimatePresence } from 'motion/react';

interface UserProfileProps {
  currentUser: User;
  onUpdateProfile: (name: string, avatar: string) => void;
  onLogout: () => void;
  onDeleteAccount?: () => void;
  predictions: Prediction[];
  matches: Match[];
  groups: Group[];
}

const PROFILE_AVATARS = [
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Sophia',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Jack',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Dusty',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Toby',
];

export default function UserProfile({
  currentUser,
  onUpdateProfile,
  onLogout,
  onDeleteAccount,
  predictions,
  matches,
  groups,
}: UserProfileProps) {
  const [name, setName] = useState(currentUser.name);
  const [selectedAvatar, setSelectedAvatar] = useState(currentUser.avatar);
  const [isEditingAvatars, setIsEditingAvatars] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Compute stats on fly
  const myPredictions = predictions.filter((p) => p.userId === currentUser.id);
  const totalGuesses = myPredictions.length;

  let totalPoints = 0;
  let exactCount = 0; // 5 pts
  let diffCount = 0; // 3 pts
  let winnerCount = 0; // 2 pts

  myPredictions.forEach((p) => {
    const match = matches.find((m) => m.id === p.matchId);
    if (match && match.status === 'completed') {
      const pts = calculatePredictionPoints(p, match);
      totalPoints += pts;
      if (pts === 5) exactCount++;
      else if (pts === 3) diffCount++;
      else if (pts === 2) winnerCount++;
    }
  });

  const myGroupsCount = groups.filter((g) => g.members.includes(currentUser.id)).length;

  const handleSave = () => {
    if (!name.trim()) return;
    onUpdateProfile(name.trim(), selectedAvatar);
    setSaveIndicator(true);
    setTimeout(() => {
      setSaveIndicator(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Configurações do Perfil</span>
        </h3>
        {saveIndicator && (
          <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Salvo com sucesso!
          </span>
        )}
      </div>

      {/* Main Profile Edit Module Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-xl">
        {/* Background glow decoration */}
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />

        <div className="flex flex-col items-center justify-center space-y-4">
          
          {/* Avatar Container with change circle launcher */}
          <div className="relative group">
            <img
              src={selectedAvatar}
              alt={currentUser.name}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-slate-950 shadow-2xl transition border-2 border-slate-700"
              referrerPolicy="no-referrer"
            />
            <button
              onClick={() => setIsEditingAvatars(!isEditingAvatars)}
              className="absolute bottom-0 right-0 p-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-full shadow-lg transition active:scale-90"
              title="Mudar foto do perfil"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick inline avatars selector drawer */}
          <AnimatePresence>
            {isEditingAvatars && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full bg-slate-950 p-3 rounded-xl border border-slate-850 flex items-center justify-around gap-2"
              >
                {PROFILE_AVATARS.map((url) => (
                  <button
                    key={url}
                    onClick={() => {
                      setSelectedAvatar(url);
                      setIsEditingAvatars(false);
                    }}
                    className={`relative rounded-full transition-all hover:scale-105 active:scale-95 shrink-0 ${
                      selectedAvatar === url ? 'ring-2 ring-emerald-400' : 'opacity-70'
                    }`}
                  >
                    <img src={url} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Name Info form */}
          <div className="w-full space-y-1.5 pt-1">
            <label className="block text-xs font-semibold text-slate-400">
              Nome de Exibição / Apelido
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.6 py-2.2 bg-slate-950 border border-slate-800 focus:border-emerald-500 text-sm rounded-xl text-slate-100 outline-none transition font-semibold"
              placeholder="Digite seu nome ou apelido"
            />
          </div>

          {/* Actions line */}
          <div className="w-full pt-1 flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 py-2 px-4 bg-emerald-400 hover:bg-emerald-300 font-bold text-slate-950 text-xs rounded-xl shadow-lg shadow-emerald-500/5 transition duration-150 active:scale-95"
            >
              Salvar Alterações
            </button>
            <button
              onClick={onLogout}
              className="py-2 px-3 bg-slate-950 hover:bg-slate-850 hover:text-rose-400 text-slate-400 font-bold text-xs rounded-xl border border-slate-800 transition flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-500" /> Sair
            </button>
          </div>

          {onDeleteAccount && (
            <div className="w-full pt-1 flex flex-col items-end">
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-[10px] text-zinc-500 hover:text-rose-450 hover:underline font-semibold transition"
                >
                  ⚠️ Desativar / Excluir Minha Conta
                </button>
              ) : (
                <div className="w-full text-left bg-slate-950/90 border border-rose-500/30 rounded-xl p-3.5 mt-2.5 text-xs space-y-2 select-none">
                  <p className="text-rose-400 font-extrabold flex items-center gap-1.5">
                    ⚠️ Atenção: Excluir Conta Permanentemente
                  </p>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Você realmente deseja excluir sua conta do Copa Bolão? Isto desativará seu perfil no ranking geral e nos grupos de forma permanente. Esta ação não poderá ser desfeita.
                  </p>
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded font-semibold text-[10px] hover:bg-slate-755 transition border border-slate-700/50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        onDeleteAccount();
                      }}
                      className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-slate-950 font-black rounded text-[10px] transition"
                    >
                      Confirmar Exclusão
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Stats Dashboard Grid */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
           📈 Minhas Estatísticas de Jogador
        </h4>

        <div className="grid grid-cols-2 gap-3">
          
          {/* Stat 1 */}
          <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] text-zinc-500 font-medium block">BOLÕES ATIVOS</span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-xl font-bold font-mono text-white">{myGroupsCount}</span>
              <span className="text-[9px] text-slate-400">grupos</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Concorrendo em ligas com amigos</p>
          </div>

          {/* Stat 2 */}
          <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] text-emerald-400 font-medium block flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500" /> TOTAL PONTUADO
            </span>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-xl font-bold font-mono text-emerald-400">{totalPoints}</span>
              <span className="text-[9px] text-slate-400">pontos</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Soma geral de todos os palpites</p>
          </div>

          {/* Stat 3 */}
          <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-2xl flex flex-col justify-between col-span-2">
            <span className="text-[10px] text-slate-400 font-medium block uppercase tracking-wider mb-2">Desempenho de Palpites</span>
            
            <div className="grid grid-cols-3 gap-1 divide-x divide-slate-800 text-center">
              <div className="px-1.5">
                <span className="text-base font-extrabold font-mono text-amber-500 block">{exactCount}</span>
                <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">Placar Exato (5)</span>
              </div>
              <div className="px-1.5">
                <span className="text-base font-extrabold font-mono text-slate-300 block">{diffCount}</span>
                <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">Saldo Gols (3)</span>
              </div>
              <div className="px-1.5">
                <span className="text-base font-extrabold font-mono text-slate-400 block">{winnerCount}</span>
                <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold font-semibold">Vencedor (2)</span>
              </div>
            </div>

            <div className="mt-3 text-[10px] text-slate-500 text-center border-t border-slate-800/60 pt-2 flex justify-between items-center px-1.5">
              <span>Total Lançado: <strong>{totalGuesses} palpites</strong></span>
              <span>Aproveitamento Geral: <strong>{totalGuesses > 0 ? Math.round(((exactCount + diffCount + winnerCount) / totalGuesses) * 100) : 0}%</strong></span>
            </div>
          </div>

        </div>
      </div>

      {/* Rules Expandable Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <button
          onClick={() => setShowRules(!showRules)}
          type="button"
          className="w-full p-4 flex items-center justify-between hover:bg-slate-850/30 transition text-left outline-none"
        >
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                📋 Regras Oficiais do Bolão
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Saiba como funciona o sistema de pontuação e classificação.
              </p>
            </div>
          </div>
          <ChevronRight className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${showRules ? 'rotate-95 text-emerald-400' : ''}`} />
        </button>

        <AnimatePresence>
          {showRules && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-4 border-t border-slate-850/60 divide-y divide-slate-850 text-xs overflow-hidden"
            >
              <div className="space-y-2 py-3">
                <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest block">Distribuição de Pontos</span>
                <div className="space-y-3 text-slate-300 text-[11px]">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 bg-amber-500/15 border border-amber-500/25 rounded-md text-amber-400 inline-flex items-center justify-center font-bold font-mono shrink-0 mt-0.5 text-xs">5</span>
                    <div>
                      <strong className="text-slate-200">Placar Exato:</strong> Você acertou em cheio o resultado final da partida.
                      <p className="text-[10px] text-slate-500 italic mt-0.5">Ex: Palpite: 2x1 • Placar final: 2x1</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 bg-teal-500/15 border border-teal-500/25 rounded-md text-teal-400 inline-flex items-center justify-center font-bold font-mono shrink-0 mt-0.5 text-xs">3</span>
                    <div>
                      <strong className="text-slate-200">Saldo de Gols ou Empate Diferente:</strong> Você acertou o vencedor e o saldo de gols, ou o empate com placar alternativo.
                      <p className="text-[10px] text-slate-500 italic mt-0.5">Ex: Palpite: 3x1 • Placar final: 2x0 (+2 gols). Ou Palpite: 1x1 • Placar final: 2x2.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 bg-blue-500/15 border border-blue-500/25 rounded-md text-blue-400 inline-flex items-center justify-center font-bold font-mono shrink-0 mt-0.5 text-xs">2</span>
                    <div>
                      <strong className="text-slate-200">Apenas o Vencedor:</strong> Você acertou qual time venceu, mas errou o saldo de gols e o placar.
                      <p className="text-[10px] text-slate-500 italic mt-0.5">Ex: Palpite: 2x1 • Placar final: 1x0. Ou Palpite: 3x0 • Placar final: 4x2.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 bg-slate-850 border border-slate-750 rounded-md text-slate-400 inline-flex items-center justify-center font-bold font-mono shrink-0 mt-0.5 text-xs">0</span>
                    <div>
                      <strong className="text-slate-200">Erro total:</strong> Errou o resultado final (vencedor ou empate).
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 py-3 text-[11px] text-slate-300">
                <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest block">Critérios de Desempate</span>
                <p className="leading-relaxed">
                  Havendo igualdade na pontuação total entre os participantes de um grupo, o ranking do app ordena automaticamente por:
                </p>
                <ol className="list-decimal pl-4 space-y-1 mt-1 text-slate-400 text-[10.5px]">
                  <li>Maior número de palpites com <strong className="text-slate-200">Placar Exato (5 pts)</strong>.</li>
                  <li>Maior número de palpites com <strong className="text-slate-200">Saldo de Gols correto (3 pts)</strong>.</li>
                  <li>Maior número de palpites com <strong className="text-slate-200">Vencedor correto (2 pts)</strong>.</li>
                </ol>
              </div>

              <div className="space-y-1 py-2 text-[10px] text-slate-500 leading-relaxed">
                <span>⏱️ <strong>Fechamento dos Palpites:</strong> Os palpites expiram automaticamente de forma justa <strong>15 minutos antes</strong> de cada partida começar. Não se atrase para lançar seus chutes!</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Beta Notice Info box */}
      <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl flex items-start gap-3">
        <Award className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h5 className="text-xs font-bold text-slate-200">Versão de Testes Beta (v1.0)</h5>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Estamos na fase de funcionalidade em grupo! O controle financeiro (pagamento de entradas e distribuição de prêmios) está sendo mantido manualmente por você no WhatsApp para segurança jurídica. A futura versão 2.0 integrará carteiras automatizadas e taxas de serviço!
          </p>
        </div>
      </div>

      {/* Security Warning box */}
      <div className="p-4 bg-slate-950/60 border border-slate-850 rounded-2xl flex items-start gap-3">
        <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <h5 className="text-xs font-bold text-slate-300">Autenticação & Sincronização</h5>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Sua sessão está conectada de forma segura e seus dados estão totalmente sincronizados com o banco de dados em nuvem do Supabase. Todos os seus palpites, grupos e comentários no chat são persistidos em tempo real.
          </p>
        </div>
      </div>

    </div>
  );
}
