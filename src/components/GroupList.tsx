import React from 'react';
import { Users, Plus, Star, Award, TrendingUp, Sparkles, Copy, Check, Share2, Compass } from 'lucide-react';
import { Group, User } from '../types';
import { motion } from 'motion/react';
import { toast } from 'react-hot-toast';
import { DEFAULT_GROUP } from '../data/constants';

interface GroupListProps {
  groups: Group[];
  users: User[];
  currentUserId: string;
  onSelectGroup: (groupId: string) => void;
  onOpenCreateModal: (initialTab?: 'create' | 'join') => void;
  onDeleteGroup?: (groupId: string) => void;
  onJoinGroup?: (code: string) => Promise<boolean> | boolean;
}

export default function GroupList({
  groups,
  users,
  currentUserId,
  onSelectGroup,
  onOpenCreateModal,
  onDeleteGroup,
  onJoinGroup,
}: GroupListProps) {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
  const [subTab, setSubTab] = React.useState<'my_groups' | 'explore'>('my_groups');

  const copyCode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Filter groups:
  // 1. My Groups: those where current user is a member
  const joinedGroups = groups.filter((g) => g.members.includes(currentUserId));

  // 2. Public Explore Groups: groups that are public and current user is NOT a member.
  // The official default group is always pinned first when present, so newcomers find it
  // without scrolling through community-created public bolões.
  const publicExploreGroups = groups
    .filter((g) => !g.members.includes(currentUserId) && g.isPrivate !== true)
    .sort((a, b) => {
      if (a.id === DEFAULT_GROUP.id) return -1;
      if (b.id === DEFAULT_GROUP.id) return 1;
      return 0;
    });

  return (
    <div className="space-y-6">
      {/* Premium Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950/80 border border-emerald-500/20 p-5 shadow-lg">
        {/* Decorative ambient radial reflection */}
        <div className="absolute top-0 right-0 -mr-6 -mt-8 w-36 h-36 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-8 -mb-10 w-32 h-32 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Copa do Mundo de Futebol</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 tracking-tight">
              Seu App de Bolão com Galera
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-sm">
              Monte seu grupo de amigos, defina um valor de aposta, lance palpites e cornete no chat em tempo real de cada partida!
            </p>
          </div>
          <button
            onClick={() => onOpenCreateModal('create')}
            className="flex items-center gap-1 py-1.5 px-3 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/10 transition active:scale-95 whitespace-nowrap self-center"
          >
            <Plus className="w-4 h-4" /> Novo Bolão
          </button>
        </div>
      </div>

      {/* Main Groups Feed */}
      <div className="space-y-4">
        {/* Sub-tabs for separating joined groups vs exploring public ones */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-900/60 mb-3">
          <button
            onClick={() => setSubTab('my_groups')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              subTab === 'my_groups'
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Meus Bolões ({joinedGroups.length})</span>
          </button>
          <button
            onClick={() => setSubTab('explore')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              subTab === 'explore'
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Explorar Públicos ({publicExploreGroups.length})</span>
          </button>
        </div>

        {subTab === 'my_groups' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Meus Bolões Ativos ({joinedGroups.length})</span>
              </h3>
              <button
                onClick={() => onOpenCreateModal('join')}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition"
              >
                Entrar com código
              </button>
            </div>

            {joinedGroups.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center space-y-3 bg-slate-900/40">
                <Users className="w-10 h-10 text-slate-600" />
                <p className="text-slate-300 font-semibold text-sm">Você não está em nenhum bolão ainda.</p>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                  Crie seu próprio bolão para convidar amigos, participe de um bolão público na aba "Explorar Públicos", ou use um código de acesso recebido!
                </p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setSubTab('explore')}
                    className="py-1.5 px-3 bg-slate-800 hover:bg-slate-750 text-emerald-400 border border-slate-700 font-bold text-xs rounded-xl transition-all"
                  >
                    Explorar Públicos 🌍
                  </button>
                  <button
                    onClick={() => onOpenCreateModal('join')}
                    className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-bold text-xs rounded-xl transition-all"
                  >
                    Digitar Código 🔑
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {joinedGroups.map((group, index) => {
                  const groupMembers = users.filter((u) => group.members.includes(u.id));

                  return (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => onSelectGroup(group.id)}
                      className="p-4 bg-slate-900 border border-slate-800/80 hover:border-slate-750 rounded-2xl cursor-pointer hover:shadow-xl hover:shadow-emerald-950/5 transition duration-200 group relative flex flex-col justify-between"
                    >
                      <div>
                        {/* Top line info */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-slate-850 rounded text-[10px] font-bold text-emerald-400 border border-slate-700/50">
                              {group.league}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              group.isPrivate 
                                ? 'bg-amber-950/50 text-amber-400 border-amber-900/40' 
                                : 'bg-blue-950/50 text-blue-400 border-blue-900/40'
                            }`}>
                              {group.isPrivate ? 'Privado 🔒' : 'Público 🔓'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-slate-950/40 px-1.5 py-0.5 rounded-lg border border-slate-800/30">
                            <button
                              onClick={(e) => copyCode(e, group.code)}
                              className="px-2 py-0.5 bg-slate-950 text-slate-300 hover:text-white rounded border border-slate-800 flex items-center gap-1 text-[10px] font-mono hover:bg-slate-850"
                              title="Clique para copiar o código"
                            >
                              {group.code}
                              {copiedCode === group.code ? (
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 text-slate-500 hover:text-slate-300" />
                              )}
                            </button>

                            <a
                              href={(() => {
                                const inviteUrl = `${window.location.origin}/?invite=${group.code}`;
                                const feeValue = group.entryFee > 0 ? `R$ ${group.entryFee.toFixed(2)}` : 'Grátis';
                                const textPrerendered = `🏆 *COPA BOLÃO* 🏆\n` +
                                  `Você foi convidado para o bolão *${group.name}*!\n\n` +
                                  `⚽ *Liga:* ${group.league}\n` +
                                  `💰 *Aposta:* ${feeValue}\n` +
                                  `🔑 *Código de acesso:* ${group.code}\n\n` +
                                  `Clique no link abaixo para entrar no grupo automaticamente e lançar seus palpites:\n` +
                                  `👉 ${inviteUrl}\n\n` +
                                  `Bora palpitar! ⚽💥`;
                                return `https://api.whatsapp.com/send?text=${encodeURIComponent(textPrerendered)}`;
                              })()}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-2 py-0.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800/40 text-emerald-400 hover:text-emerald-300 rounded flex items-center gap-1 text-[10px] font-bold"
                              title="Convidar via WhatsApp"
                            >
                              <Share2 className="w-2.5 h-2.5" />
                              <span>Convidar</span>
                            </a>
                          </div>
                        </div>

                        {/* Group Name & Descr */}
                        <h4 className="text-base font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {group.name}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {group.description || 'Nenhuma descrição fornecida.'}
                        </p>
                      </div>

                      {/* Footers stats */}
                      <div className="flex items-center justify-between border-t border-slate-800/50 mt-4 pt-3 text-xs">
                        {/* Entry fee info */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500">Aposta por amigo:</span>
                          <span className="text-emerald-400 font-bold uppercase text-xs tracking-tight">
                            {group.entryFee > 0 ? `R$ ${group.entryFee.toFixed(2)}` : 'Grátis'}
                          </span>
                        </div>

                        {/* Avatar members stack */}
                        <div className="flex items-center -space-x-1.5 overflow-hidden">
                          {groupMembers.slice(0, 4).map((member) => (
                            <img
                              key={member.id}
                              className="inline-block h-5 w-5 rounded-full ring-2 ring-slate-900 object-cover"
                              src={member.avatar}
                              alt={member.name}
                              title={member.name}
                              referrerPolicy="no-referrer"
                            />
                          ))}
                          {groupMembers.length > 4 && (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-800 ring-2 ring-slate-900 text-[9px] font-bold text-slate-300">
                              +{groupMembers.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Explorar Públicos Tab */
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-emerald-400" />
              <span>Bolões Públicos Disponíveis ({publicExploreGroups.length})</span>
            </h3>

            {publicExploreGroups.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center space-y-3 bg-slate-900/40">
                <Compass className="w-10 h-10 text-slate-650" />
                <p className="text-slate-300 font-semibold text-sm">Nenhum outro bolão público lançado.</p>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                  Todos os bolões existentes ou são privados ou você já faz parte deles como participante ativo de palpites!
                </p>
                <button
                  onClick={() => onOpenCreateModal('create')}
                  className="mt-2 py-1.5 px-3 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg"
                >
                  Criar Novo Bolão 🚀
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {publicExploreGroups.map((group, index) => {
                  const groupMembers = users.filter((u) => group.members.includes(u.id));
                  const isOfficial = group.id === DEFAULT_GROUP.id;

                  return (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`p-4 rounded-2xl transition duration-200 relative flex flex-col justify-between ${
                        isOfficial
                          ? 'bg-gradient-to-br from-emerald-950/60 to-slate-900 border-2 border-emerald-500/40 hover:border-emerald-500/60 shadow-lg shadow-emerald-950/10'
                          : 'bg-slate-900 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        {/* Top line info */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-slate-850 rounded text-[10px] font-bold text-emerald-400 border border-slate-700/50">
                              {group.league}
                            </span>
                            {isOfficial && (
                              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-extrabold border border-emerald-500/30 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5" />
                                Oficial
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">
                            Cod: {group.code}
                          </span>
                        </div>

                        {/* Group Name & Descr */}
                        <h4 className="text-base font-bold text-slate-100">
                          {group.name}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {group.description || 'Nenhuma descrição fornecida.'}
                        </p>
                      </div>

                      {/* Entry fee, members & Direct Participate action */}
                      <div className="flex items-center justify-between border-t border-slate-800/50 mt-4 pt-3 text-xs gap-4">
                        {/* Entry fee and member count */}
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500">Aposta por amigo:</span>
                            <span className="text-emerald-400 font-bold text-xs">
                              {group.entryFee > 0 ? `R$ ${group.entryFee.toFixed(2)}` : 'Grátis'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {groupMembers.length} amigo(s) participando
                          </div>
                        </div>

                        {/* Direct Participate button */}
                        <button
                          onClick={async () => {
                            if (onJoinGroup) {
                              const success = await onJoinGroup(group.code);
                              if (success) {
                                toast.success("Você entrou no bolão com sucesso!");
                              } else {
                                toast.error("Não foi possível entrar. Talvez você já participe deste bolão.");
                              }
                            }
                          }}
                          className="py-1.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer active:scale-95 flex items-center gap-1 shadow-md shadow-emerald-500/10"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Participar</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
