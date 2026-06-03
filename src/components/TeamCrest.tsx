import React, { useState } from 'react';

interface TeamCrestProps {
  flagUrl: string;
  name: string;
  code: string;
  size?: 'sm' | 'md' | 'lg';
}

// Extensive dictionary of major European and Brazilian club team crests/shields
const CLUB_CRESTS: { [key: string]: string } = {
  // Champions League and major European teams
  'real madrid': 'https://media.api-sports.io/football/teams/541.png',
  'madrid': 'https://media.api-sports.io/football/teams/541.png',
  'barcelona': 'https://media.api-sports.io/football/teams/529.png',
  'manc': 'https://media.api-sports.io/football/teams/50.png',
  'manchester': 'https://media.api-sports.io/football/teams/33.png', // Fallback to United, City is explicitly handled below
  'manchester united': 'https://media.api-sports.io/football/teams/33.png',
  'manchester city': 'https://media.api-sports.io/football/teams/50.png',
  'man. united': 'https://media.api-sports.io/football/teams/33.png',
  'man. city': 'https://media.api-sports.io/football/teams/50.png',
  'bayern': 'https://media.api-sports.io/football/teams/157.png',
  'bayern munique': 'https://media.api-sports.io/football/teams/157.png',
  'bayern munich': 'https://media.api-sports.io/football/teams/157.png',
  'psg': 'https://media.api-sports.io/football/teams/85.png',
  'paris saint germain': 'https://media.api-sports.io/football/teams/85.png',
  'paris saint-germain': 'https://media.api-sports.io/football/teams/85.png',
  'arsenal': 'https://media.api-sports.io/football/teams/42.png',
  'liverpool': 'https://media.api-sports.io/football/teams/40.png',
  'chelsea': 'https://media.api-sports.io/football/teams/49.png',
  'juventus': 'https://media.api-sports.io/football/teams/496.png',
  'juve': 'https://media.api-sports.io/football/teams/496.png',
  'inter milan': 'https://media.api-sports.io/football/teams/505.png',
  'internazionale': 'https://media.api-sports.io/football/teams/505.png',
  'ac milan': 'https://media.api-sports.io/football/teams/489.png',
  'milan': 'https://media.api-sports.io/football/teams/489.png',
  'borussia': 'https://media.api-sports.io/football/teams/165.png',
  'dortmund': 'https://media.api-sports.io/football/teams/165.png',
  'atletico de madrid': 'https://media.api-sports.io/football/teams/530.png',
  'atlético de madrid': 'https://media.api-sports.io/football/teams/530.png',
  'atletico madrid': 'https://media.api-sports.io/football/teams/530.png',
  'atlético madrid': 'https://media.api-sports.io/football/teams/530.png',
  'porto': 'https://media.api-sports.io/football/teams/97.png',
  'benfica': 'https://media.api-sports.io/football/teams/197.png',
  'sporting': 'https://media.api-sports.io/football/teams/228.png',
  'napoli': 'https://media.api-sports.io/football/teams/492.png',
  'lazio': 'https://media.api-sports.io/football/teams/487.png',
  'roma': 'https://media.api-sports.io/football/teams/497.png',
  'tottenham': 'https://media.api-sports.io/football/teams/47.png',
  'spurs': 'https://media.api-sports.io/football/teams/47.png',
  'ajax': 'https://media.api-sports.io/football/teams/194.png',
  'psv': 'https://media.api-sports.io/football/teams/195.png',
  'leverkusen': 'https://media.api-sports.io/football/teams/168.png',
  'bayer leverkusen': 'https://media.api-sports.io/football/teams/168.png',

  // Brasileirão Ligas
  'flamengo': 'https://media.api-sports.io/football/teams/127.png',
  'palmeiras': 'https://media.api-sports.io/football/teams/121.png',
  'são paulo': 'https://media.api-sports.io/football/teams/126.png',
  'sao paulo': 'https://media.api-sports.io/football/teams/126.png',
  'corinthians': 'https://media.api-sports.io/football/teams/131.png',
  'grêmio': 'https://media.api-sports.io/football/teams/130.png',
  'gremio': 'https://media.api-sports.io/football/teams/130.png',
  'internacional': 'https://media.api-sports.io/football/teams/119.png',
  'atlético mineiro': 'https://media.api-sports.io/football/teams/118.png',
  'atletico mineiro': 'https://media.api-sports.io/football/teams/118.png',
  'atletico-mg': 'https://media.api-sports.io/football/teams/118.png',
  'atlético-mg': 'https://media.api-sports.io/football/teams/118.png',
  'cruzeiro': 'https://media.api-sports.io/football/teams/120.png',
  'vasco': 'https://media.api-sports.io/football/teams/133.png',
  'vasco da gama': 'https://media.api-sports.io/football/teams/133.png',
  'fluminense': 'https://media.api-sports.io/football/teams/124.png',
  'botafogo': 'https://media.api-sports.io/football/teams/134.png',
  'santos': 'https://media.api-sports.io/football/teams/128.png',
  'bahia': 'https://media.api-sports.io/football/teams/122.png',
  'athletico-pr': 'https://media.api-sports.io/football/teams/135.png',
  'athletico paranaense': 'https://media.api-sports.io/football/teams/135.png',
  'fortaleza': 'https://media.api-sports.io/football/teams/137.png',
  'goiás': 'https://media.api-sports.io/football/teams/129.png',
  'goias': 'https://media.api-sports.io/football/teams/129.png',
  'coritiba': 'https://media.api-sports.io/football/teams/132.png',
  'cuiabá': 'https://media.api-sports.io/football/teams/1183.png',
  'cuiaba': 'https://media.api-sports.io/football/teams/1183.png',
  'bragantino': 'https://media.api-sports.io/football/teams/125.png',
  'red bull bragantino': 'https://media.api-sports.io/football/teams/125.png',
  'américa-mg': 'https://media.api-sports.io/football/teams/123.png',
  'america mineiro': 'https://media.api-sports.io/football/teams/123.png',
  'vitória': 'https://media.api-sports.io/football/teams/1284.png',
  'vitoria': 'https://media.api-sports.io/football/teams/1284.png',
  'juventude': 'https://media.api-sports.io/football/teams/138.png',
  'criciúma': 'https://media.api-sports.io/football/teams/141.png',
  'criciuma': 'https://media.api-sports.io/football/teams/141.png',
  'atlético goianiense': 'https://media.api-sports.io/football/teams/136.png',
  'atletico goianiense': 'https://media.api-sports.io/football/teams/136.png',
  'atlético-go': 'https://media.api-sports.io/football/teams/136.png',
  'atletico-go': 'https://media.api-sports.io/football/teams/136.png',
};

const CLUB_CODES: { [key: string]: string } = {
  'RMA': 'https://media.api-sports.io/football/teams/541.png',
  'BAR': 'https://media.api-sports.io/football/teams/529.png',
  'MCY': 'https://media.api-sports.io/football/teams/50.png',
  'MUN': 'https://media.api-sports.io/football/teams/33.png',
  'MCI': 'https://media.api-sports.io/football/teams/50.png',
  'FCB': 'https://media.api-sports.io/football/teams/529.png',
  'PSG': 'https://media.api-sports.io/football/teams/85.png',
  'ARS': 'https://media.api-sports.io/football/teams/42.png',
  'LIV': 'https://media.api-sports.io/football/teams/40.png',
  'CHE': 'https://media.api-sports.io/football/teams/49.png',
  'JUV': 'https://media.api-sports.io/football/teams/496.png',
  'INT': 'https://media.api-sports.io/football/teams/505.png',
  'MIL': 'https://media.api-sports.io/football/teams/489.png',
  'BVB': 'https://media.api-sports.io/football/teams/165.png',
  'ATM': 'https://media.api-sports.io/football/teams/530.png',
  'FLA': 'https://media.api-sports.io/football/teams/127.png',
  'PAL': 'https://media.api-sports.io/football/teams/121.png',
  'SAO': 'https://media.api-sports.io/football/teams/126.png',
  'COR': 'https://media.api-sports.io/football/teams/131.png',
  'GRE': 'https://media.api-sports.io/football/teams/130.png',
  'SCI': 'https://media.api-sports.io/football/teams/119.png',
  'CAM': 'https://media.api-sports.io/football/teams/118.png',
  'CRU': 'https://media.api-sports.io/football/teams/120.png',
  'VAS': 'https://media.api-sports.io/football/teams/133.png',
  'FLU': 'https://media.api-sports.io/football/teams/124.png',
  'BOT': 'https://media.api-sports.io/football/teams/134.png',
  'SAN': 'https://media.api-sports.io/football/teams/128.png',
  'BAH': 'https://media.api-sports.io/football/teams/122.png',
  'CAP': 'https://media.api-sports.io/football/teams/135.png',
  'FOR': 'https://media.api-sports.io/football/teams/137.png',
  'VIT': 'https://media.api-sports.io/football/teams/1284.png',
  'JVT': 'https://media.api-sports.io/football/teams/138.png',
  'CRI': 'https://media.api-sports.io/football/teams/141.png',
  'ACG': 'https://media.api-sports.io/football/teams/136.png',
  'RBB': 'https://media.api-sports.io/football/teams/125.png',
  'BGT': 'https://media.api-sports.io/football/teams/125.png',
};

// Returns overridden high-quality club shield URL if the team is recognized as a club
function getClubCrest(name: string, code: string): string | null {
  const normName = (name || '').toLowerCase().trim();
  const normCode = (code || '').toUpperCase().trim();

  // Try exact code match
  if (CLUB_CODES[normCode]) {
    return CLUB_CODES[normCode];
  }

  // Try exact name match
  if (CLUB_CRESTS[normName]) {
    return CLUB_CRESTS[normName];
  }

  // Try substring checks
  for (const [key, value] of Object.entries(CLUB_CRESTS)) {
    if (normName.includes(key)) {
      return value;
    }
  }

  return null;
}

export default function TeamCrest({ flagUrl, name, code, size = 'md' }: TeamCrestProps) {
  const [useFallback, setUseFallback] = useState(false);

  const sizeClasses = {
    sm: 'w-7 h-7 text-lg rounded-md',
    md: 'w-11 h-11 text-2xl rounded-lg',
    lg: 'w-14 h-14 text-3xl rounded-xl',
  };

  // Check if team is recognized as a club and override flag URL with club's shield
  const clubCrestUrl = getClubCrest(name, code);
  const activeFlagUrl = clubCrestUrl || flagUrl;

  const isUrl = !!activeFlagUrl && (activeFlagUrl.startsWith('http') || activeFlagUrl.startsWith('/'));

  if (isUrl && !useFallback) {
    return (
      <img
        src={activeFlagUrl}
        alt={name}
        onError={() => setUseFallback(true)}
        className={`${sizeClasses[size]} object-cover border border-slate-700/60 bg-slate-950 shadow-md mb-1.5 transition-transform hover:scale-105 pointer-events-none select-none`}
        referrerPolicy="no-referrer"
      />
    );
  }

  // If using fallback or isUrl (safety net)
  if (useFallback || isUrl) {
    const backupUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${code || name}&backgroundColor=1e293b,0f172a,334155&textColor=10b981,a3e635&fontSize=42&bold=true`;
    return (
      <img
        src={backupUrl}
        alt={name}
        className={`${sizeClasses[size]} object-cover border border-slate-700/60 bg-slate-950 shadow-md mb-1.5 transition-transform hover:scale-105 pointer-events-none select-none`}
      />
    );
  }

  // Plain emoji or text string style
  return (
    <div
      className={`${sizeClasses[size]} flex items-center justify-center select-none mb-1.5 drop-shadow-md`}
    >
      <span>{activeFlagUrl}</span>
    </div>
  );
}
