import React from 'react';
import { Award, Trophy, Star, ShieldCheck, HelpCircle, Coins, Sparkles, TrendingUp } from 'lucide-react';
import { Group, Match, Prediction, User } from '../types';
import { calculatePredictionPoints, isPredictionInActiveGroup } from '../utils/rules';
import { calculatePrizePool } from '../utils/prizeSplit';
import { motion } from 'motion/react';

interface LeaderboardProps {
  activeGroup: Group | null;
  matches: Match[];
  predictions: Prediction[];
  users: User[];
  currentUserId: string;
}

interface RankedUser {
  user: User;
  totalPoints: number;
  exactScores: number; // 5 pts
  diffOutcome: number; // 3 pts
  correctWinner: number; // 2 pts
  totalGuessed: number;
}

export default function Leaderboard({
  activeGroup,
  matches,
  predictions,
  users,
  currentUserId,
}: LeaderboardProps) {

  // If no group is selected, we can compute a global/overall leaderboard of all registered groups
  const membersToRank = activeGroup
    ? users.filter((u) => activeGroup.members.includes(u.id))
    : users;

  const rankedUsers: RankedUser[] = membersToRank.map((user) => {
    // Check points matching active group league (or general if none)
    const activeLeague = activeGroup?.league;

    // Filter relevant predictions
    const userPreds = predictions.filter((p) => {
      if (p.userId !== user.id) return false;
      
      // Filter by group_id if sorting within an active group leaderboard
      if (activeGroup) {
        if (!isPredictionInActiveGroup(p, activeGroup.id)) return false;
      }
      
      if (activeLeague) {
        const match = matches.find((m) => m.id === p.matchId);
        return match?.league === activeLeague;
      }
      return true;
    });

    let totalPoints = 0;
    let exactScores = 0;
    let diffOutcome = 0;
    let correctWinner = 0;
    let totalGuessed = 0;

    userPreds.forEach((pred) => {
      const match = matches.find((m) => m.id === pred.matchId);
      if (match && match.status === 'completed') {
        const points = calculatePredictionPoints(pred, match);
        totalPoints += points;
        totalGuessed++;

        if (points === 5) exactScores++;
        else if (points === 3) diffOutcome++;
        else if (points === 2) correctWinner++;
      }
    });

    return {
      user,
      totalPoints,
      exactScores,
      diffOutcome,
      correctWinner,
      totalGuessed,
    };
  });

  // Sort: First by Total Points DESC, as tie-breaker by correct exact scores DESC, then by correct difference score DESC
  rankedUsers.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    if (b.exactScores !== a.exactScores) {
      return b.exactScores - a.exactScores;
    }
    return b.diffOutcome - a.diffOutcome;
  });

  const entryFee = activeGroup?.entryFee || 0;
  // Suggested split (70/20/10) for the top 3 — only meaningful when there's an
  // actual entry fee. Free bolões skip the prize card entirely.
  const prizePool = calculatePrizePool(entryFee, rankedUsers.length);

  return (
    <div className="space-y-6">
      {/* Prize pool with top-3 suggested split. Hidden for free bolões. */}
      {activeGroup && prizePool && (
        <div className="p-4 bg-gradient-to-br from-slate-900 to-teal-950/80 border border-teal-500/25 rounded-2xl shadow-xl space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-teal-400 font-bold uppercase tracking-widest block">
                💰 Prêmio sugerido do bolão
              </span>
              <p className="text-[11px] text-slate-400">
                {rankedUsers.length} participantes × R$ {entryFee.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wide">
                Pool total
              </span>
              <span className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                R$ {prizePool.totalPool.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Top 3 split (70/20/10). Each row maps to the rank with the same emoji
              shown in the leaderboard table below — visual continuity. */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {prizePool.shares.map((share) => (
              <div
                key={share.rank}
                className="bg-slate-950/60 border border-slate-800 rounded-xl p-2 text-center"
              >
                <div className="text-base">{share.emoji}</div>
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                  {share.label} · {share.pct}%
                </div>
                <div className="text-sm font-mono font-extrabold text-emerald-400 mt-0.5">
                  R$ {share.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Disclaimer: the app is just a calculator. Real money moves between
              members offline. Keeps us out of "facilitação de aposta" territory. */}
          <p className="text-[10px] text-slate-500 leading-snug pt-2 border-t border-slate-800/60">
            ℹ️ O app não recebe nem distribui prêmios — combinem o pagamento entre vocês
            via PIX. Esses valores são apenas uma sugestão de divisão.
          </p>
        </div>
      )}

      {/* Leaderboard Table Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-850/50 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-emerald-400" />
            <span>Tabela de Classificação {activeGroup ? `- ${activeGroup.name}` : '(Geral)'}</span>
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">
            {activeGroup?.league || 'Todas as ligas'}
          </span>
        </div>

        {/* Legend block */}
        <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between font-medium">
          <span>Regras de Pontuação:</span>
          <div className="flex gap-2.5">
            <span>🎯 Placar Exato: 5pts</span>
            <span>⚖️ Saldo/Empate: 3pts</span>
            <span>Winner: 2pts</span>
          </div>
        </div>

        {/* Players List */}
         <div className="divide-y divide-slate-800 bg-slate-900">
           {rankedUsers.map((item, index) => {
             const isCurrentUser = item.user.id === currentUserId;
             const isPodium = index < 3;
             const position = index + 1;

             // Unique ribbon/medal style matching physical reward feel
             const podiumStyles = [
               'text-amber-400 bg-amber-500/10 border border-amber-500/20 ring-2 ring-amber-500/25', // 1st
               'text-slate-300 bg-slate-300/10 border border-slate-300/20', // 2nd
               'text-amber-700 bg-amber-700/10 border border-amber-700/20', // 3rd
             ];

             return (
               <motion.div
                 key={item.user.id}
                 initial={{ opacity: 0, x: -10 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: index * 0.05 }}
                 className={`p-4 flex items-center justify-between transition-colors ${
                   isCurrentUser ? 'bg-emerald-500/5' : 'hover:bg-slate-850/20'
                 }`}
               >
                 {/* Position + Avatar + Name */}
                 <div className="flex items-center gap-3">
                   {/* Rank Badge */}
                   <div
                     className={`w-6 h-6 rounded-full flex items-center justify-center font-bold font-mono text-xs ${
                       isPodium
                         ? podiumStyles[index]
                         : 'text-slate-500 bg-slate-950 border border-slate-800'
                     }`}
                   >
                     {position}
                   </div>

                   {/* Avatar with dynamic outline */}
                   <div className="relative">
                     <img
                       src={item.user.avatar}
                       alt={item.user.name}
                       className={`w-10 h-10 rounded-full object-cover ${
                         isCurrentUser ? 'ring-2 ring-emerald-400' : 'border border-slate-700'
                       }`}
                       referrerPolicy="no-referrer"
                     />
                     {index === 0 && (
                       <span className="absolute -top-1.5 -right-1 text-xs text-amber-400 animate-bounce select-none">👑</span>
                     )}
                   </div>

                   {/* Name and count guesses */}
                   <div>
                     <div className="flex items-center gap-1.5">
                       <span className={`text-sm font-bold ${isCurrentUser ? 'text-emerald-400' : 'text-slate-100'}`}>
                         {item.user.name}
                       </span>
                       {isCurrentUser && (
                         <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.2 rounded">Meu</span>
                       )}
                     </div>
                     <span className="text-[10px] text-slate-500 block font-medium">
                       {item.totalGuessed} palpites computados
                     </span>
                   </div>
                 </div>

                 {/* Scores display details block */}
                 <div className="flex items-center gap-4 text-right">
                   <div className="hidden xs:flex items-center gap-2 text-[10px] text-slate-500 pr-1 border-r border-slate-800/80">
                     <div className="flex flex-col items-center">
                       <span className="font-bold text-amber-400">{item.exactScores}</span>
                       <span>Placar</span>
                     </div>
                     <div className="flex flex-col items-center">
                       <span className="font-bold text-slate-300">{item.diffOutcome}</span>
                       <span>Saldo</span>
                     </div>
                     <div className="flex flex-col items-center">
                       <span className="font-bold text-slate-400">{item.correctWinner}</span>
                       <span>Win</span>
                     </div>
                   </div>

                   <div className="min-w-12">
                     <span className="text-xl font-extrabold font-mono text-slate-100 block">
                       {item.totalPoints}
                     </span>
                     <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider">PONTOS</span>
                   </div>
                 </div>
               </motion.div>
             );
           })}
         </div>
       </div>

       {/* Detailed explanation footer */}
       <div className="bg-slate-950/45 border border-slate-850 p-4 rounded-xl flex items-start gap-3">
         <Star className="w-5 h-5 text-amber-500 fill-amber-500 shrink-0 mt-0.5" />
         <div className="space-y-1">
           <h5 className="text-xs font-bold text-slate-300">Critério de Desempate Sênior</h5>
           <p className="text-[11px] text-slate-400 leading-relaxed">
             Caso dois ou mais amigos empatem em pontos, a liderança é decidida pelo maior número de <strong>Placares Exatos (5 pts)</strong>. Persistindo empate, vencerá quem tiver mais <strong>Saldos Corretos (3 pts)</strong>.
           </p>
         </div>
       </div>
    </div>
  );
}
