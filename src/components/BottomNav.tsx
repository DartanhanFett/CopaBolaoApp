import React from 'react';
import { Users, Trophy, Flame, User, Bell } from 'lucide-react';
import { motion } from 'motion/react';

interface BottomNavProps {
  activeTab: 'groups' | 'matches' | 'ranking' | 'profile' | 'news';
  setActiveTab: (tab: 'groups' | 'matches' | 'ranking' | 'profile' | 'news') => void;
  /** Total unread feed events on the Novidades tab. All notification surfaces
   *  (comments, predictions, ranking shuffles, match transitions) funnel here
   *  so users have one canonical "go look" cue instead of duplicate badges. */
  unreadNewsCount?: number;
}

export default function BottomNav({
  activeTab,
  setActiveTab,
  unreadNewsCount = 0,
}: BottomNavProps) {
  const tabs = [
    { id: 'groups', label: 'Bolões', icon: Users },
    { id: 'matches', label: 'Jogos', icon: Flame },
    { id: 'news', label: 'Novidades', icon: Bell },
    { id: 'ranking', label: 'Ranking', icon: Trophy },
    { id: 'profile', label: 'Perfil', icon: User },
  ] as const;

  // Only the Novidades tab gets a badge — and only when the user is not
  // currently looking at it. Single source of truth for "something happened".
  const badgeCountFor = (id: string): number => {
    if (id === activeTab) return 0;
    if (id === 'news') return unreadNewsCount;
    return 0;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 pb-safe shadow-xl">
      <div className="max-w-md mx-auto px-2 h-16 flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badgeCount = badgeCountFor(tab.id);
          const showBadge = badgeCount > 0;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative flex flex-col items-center justify-center py-1 px-2 text-[10px] font-medium transition-colors focus:outline-none flex-1"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="absolute -top-1 w-10 h-[2px] bg-gradient-to-r from-emerald-400 to-lime-400 rounded-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <div className="relative mb-1">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive
                      ? 'text-emerald-400 scale-110'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                />
                {showBadge && (
                  // Numeric pill anchored to the icon's top-right, capped at "9+".
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-slate-50 text-[9px] font-extrabold rounded-full border border-slate-900 leading-none flex items-center justify-center animate-pulse">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </div>
              <span
                className={`transition-colors duration-200 truncate ${
                  isActive ? 'text-slate-100 font-semibold' : 'text-slate-400'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
