import React from 'react';
import { Users, Trophy, Flame, User } from 'lucide-react';
import { motion } from 'motion/react';

interface BottomNavProps {
  activeTab: 'groups' | 'matches' | 'ranking' | 'profile';
  setActiveTab: (tab: 'groups' | 'matches' | 'ranking' | 'profile') => void;
  /** Total unread comments across the active bolão. Drives the numeric badge on
   *  both the "Jogos" and "Meus Bolões" tabs. 0 hides the badge. */
  unreadCommentsCount?: number;
}

export default function BottomNav({ activeTab, setActiveTab, unreadCommentsCount = 0 }: BottomNavProps) {
  const tabs = [
    { id: 'groups', label: 'Meus Bolões', icon: Users },
    { id: 'matches', label: 'Jogos', icon: Flame },
    { id: 'ranking', label: 'Ranking', icon: Trophy },
    { id: 'profile', label: 'Meu Perfil', icon: User },
  ] as const;

  // Show the unread badge on whichever tab the user is NOT currently on, so it
  // serves as a real "go check this" cue. Showing it on the active tab would
  // be noise — they're already there.
  const showBadgeOn = (id: string) => {
    if (unreadCommentsCount <= 0) return false;
    if (id === activeTab) return false;
    return id === 'matches' || id === 'groups';
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 pb-safe shadow-xl">
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const showBadge = showBadgeOn(tab.id);

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative flex flex-col items-center justify-center py-1 px-3 text-xs font-medium transition-colors focus:outline-none"
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
                  // Numeric pill anchored to the icon's top-right. Capped at "9+"
                  // so it never grows wider than the tab cell. min-w keeps the
                  // single-digit "1" / "9" the same width as "9+" so the icon
                  // doesn't shift around as the count changes.
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-slate-50 text-[9px] font-extrabold rounded-full border border-slate-900 leading-none flex items-center justify-center animate-pulse">
                    {unreadCommentsCount > 9 ? '9+' : unreadCommentsCount}
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
