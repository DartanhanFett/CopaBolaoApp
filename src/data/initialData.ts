import { Match, Group, User, Comment } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'dartanhan.fett@gmail.com',
    name: 'Dartanhan Fett',
    avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Dartanhan',
    email: 'dartanhan.fett@gmail.com'
  }
];

export const INITIAL_MATCHES: Match[] = [
  {
    id: 'm1',
    homeTeam: { name: 'Brasil', code: 'BRA', flagUrl: 'https://flagcdn.com/w160/br.png' },
    awayTeam: { name: 'Argentina', code: 'ARG', flagUrl: 'https://flagcdn.com/w160/ar.png' },
    date: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // Starts in 6 hours
    status: 'upcoming',
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm2',
    homeTeam: { name: 'França', code: 'FRA', flagUrl: 'https://flagcdn.com/w160/fr.png' },
    awayTeam: { name: 'Inglaterra', code: 'ENG', flagUrl: 'https://flagcdn.com/w160/gb-eng.png' },
    date: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // Starts in 12 hours
    status: 'upcoming',
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm3',
    homeTeam: { name: 'Estados Unidos', code: 'USA', flagUrl: 'https://flagcdn.com/w160/us.png' },
    awayTeam: { name: 'México', code: 'MEX', flagUrl: 'https://flagcdn.com/w160/mx.png' },
    date: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(), // Starts in 18 hours
    status: 'upcoming',
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm4',
    homeTeam: { name: 'Portugal', code: 'POR', flagUrl: 'https://flagcdn.com/w160/pt.png' },
    awayTeam: { name: 'Espanha', code: 'ESP', flagUrl: 'https://flagcdn.com/w160/es.png' },
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Starts in 1 day
    status: 'upcoming',
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm5',
    homeTeam: { name: 'Alemanha', code: 'GER', flagUrl: 'https://flagcdn.com/w160/de.png' },
    awayTeam: { name: 'Itália', code: 'ITA', flagUrl: 'https://flagcdn.com/w160/it.png' },
    date: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(), // Starts in 36 hours
    status: 'upcoming',
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm6',
    homeTeam: { name: 'Japão', code: 'JPN', flagUrl: 'https://flagcdn.com/w160/jp.png' },
    awayTeam: { name: 'Croácia', code: 'CRO', flagUrl: 'https://flagcdn.com/w160/hr.png' },
    date: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // Starts in 2 days
    status: 'upcoming',
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm7',
    homeTeam: { name: 'Uruguai', code: 'URU', flagUrl: 'https://flagcdn.com/w160/uy.png' },
    awayTeam: { name: 'Colômbia', code: 'COL', flagUrl: 'https://flagcdn.com/w160/co.png' },
    date: new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString(), // Starts in 2.5 days
    status: 'upcoming',
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm8',
    homeTeam: { name: 'Holanda', code: 'NED', flagUrl: 'https://flagcdn.com/w160/nl.png' },
    awayTeam: { name: 'Bélgica', code: 'BEL', flagUrl: 'https://flagcdn.com/w160/be.png' },
    date: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // Starts in 3 days
    status: 'upcoming',
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm9',
    homeTeam: { name: 'Canadá', code: 'CAN', flagUrl: 'https://flagcdn.com/w160/ca.png' },
    awayTeam: { name: 'Marrocos', code: 'MAR', flagUrl: 'https://flagcdn.com/w160/ma.png' },
    date: new Date(Date.now() - 40 * 60 * 1000).toISOString(), // Started 40 mins ago (LIVE)
    status: 'live',
    homeScore: 1,
    awayScore: 1,
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm10',
    homeTeam: { name: 'Senegal', code: 'SEN', flagUrl: 'https://flagcdn.com/w160/sn.png' },
    awayTeam: { name: 'Equador', code: 'ECU', flagUrl: 'https://flagcdn.com/w160/ec.png' },
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Completed 2 days ago
    status: 'completed',
    homeScore: 2,
    awayScore: 1,
    scorers: ['Sarr (44\')', 'Caicedo (67\')', 'Koulibaly (70\')'],
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm11',
    homeTeam: { name: 'Suíça', code: 'SUI', flagUrl: 'https://flagcdn.com/w160/ch.png' },
    awayTeam: { name: 'Camarões', code: 'CMR', flagUrl: 'https://flagcdn.com/w160/cm.png' },
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // Completed 3 days ago
    status: 'completed',
    homeScore: 1,
    awayScore: 0,
    scorers: ['Embolo (48\')'],
    league: 'Copa do Mundo 2026',
  },
  {
    id: 'm12',
    homeTeam: { name: 'Gana', code: 'GHA', flagUrl: 'https://flagcdn.com/w160/gh.png' },
    awayTeam: { name: 'Coreia do Sul', code: 'KOR', flagUrl: 'https://flagcdn.com/w160/kr.png' },
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // Completed 5 days ago
    status: 'completed',
    homeScore: 3,
    awayScore: 2,
    scorers: ['Salisu (24\')', 'Kudos (34\', 68\')', 'Cho Gue-sung (58\', 61\')'],
    league: 'Copa do Mundo 2026',
  },
  // --- UEFA Champions League ---
  {
    id: 'cl1',
    homeTeam: { name: 'Real Madrid', code: 'RMA', flagUrl: '⚽' },
    awayTeam: { name: 'Manchester City', code: 'MCI', flagUrl: '⚽' },
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Starts in 1 day
    status: 'upcoming',
    league: 'Champions League',
  },
  {
    id: 'cl2',
    homeTeam: { name: 'Paris Saint-Germain', code: 'PSG', flagUrl: '⚽' },
    awayTeam: { name: 'Bayern de Munique', code: 'BAY', flagUrl: '⚽' },
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Starts in 2 days
    status: 'upcoming',
    league: 'Champions League',
  },
  {
    id: 'cl3',
    homeTeam: { name: 'Arsenal', code: 'ARS', flagUrl: '⚽' },
    awayTeam: { name: 'Barcelona', code: 'BAR', flagUrl: '⚽' },
    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // Starts in 3 days
    status: 'upcoming',
    league: 'Champions League',
  },
  {
    id: 'cl4',
    homeTeam: { name: 'Borussia Dortmund', code: 'BVB', flagUrl: '⚽' },
    awayTeam: { name: 'AC Milan', code: 'MIL', flagUrl: '⚽' },
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Completed 1 day ago
    status: 'completed',
    homeScore: 2,
    awayScore: 1,
    scorers: ['Reus (12\')', 'Giroud (34\')', 'Brandt (72\')'],
    league: 'Champions League',
  },
  {
    id: 'cl5',
    homeTeam: { name: 'Internazionale', code: 'INT', flagUrl: '⚽' },
    awayTeam: { name: 'Atlético de Madrid', code: 'ATM', flagUrl: '⚽' },
    date: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // Live
    status: 'live',
    homeScore: 1,
    awayScore: 1,
    league: 'Champions League',
  },
  // --- Brasileirão Série A ---
  {
    id: 'br1',
    homeTeam: { name: 'Flamengo', code: 'FLA', flagUrl: '⚽' },
    awayTeam: { name: 'Palmeiras', code: 'PAL', flagUrl: '⚽' },
    date: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(), // Starts in 1.5 days
    status: 'upcoming',
    league: 'Brasileirão Série A',
  },
  {
    id: 'br2',
    homeTeam: { name: 'São Paulo', code: 'SAO', flagUrl: '⚽' },
    awayTeam: { name: 'Corinthians', code: 'COR', flagUrl: '⚽' },
    date: new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString(), // Starts in 2.5 days
    status: 'upcoming',
    league: 'Brasileirão Série A',
  },
  {
    id: 'br3',
    homeTeam: { name: 'Grêmio', code: 'GRE', flagUrl: '⚽' },
    awayTeam: { name: 'Internacional', code: 'SCI', flagUrl: '⚽' },
    date: new Date(Date.now() + 84 * 60 * 60 * 1000).toISOString(), // Starts in 3.5 days
    status: 'upcoming',
    league: 'Brasileirão Série A',
  },
  {
    id: 'br4',
    homeTeam: { name: 'Atlético Mineiro', code: 'CAM', flagUrl: '⚽' },
    awayTeam: { name: 'Cruzeiro', code: 'CRU', flagUrl: '⚽' },
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Completed 2 days ago
    status: 'completed',
    homeScore: 3,
    awayScore: 1,
    scorers: ['Hulk (15\', 80\')', 'Matheus Pereira (60\')', 'Paulinho (88\')'],
    league: 'Brasileirão Série A',
  },
  {
    id: 'br5',
    homeTeam: { name: 'Botafogo', code: 'BOT', flagUrl: '⚽' },
    awayTeam: { name: 'Fluminense', code: 'FLU', flagUrl: '⚽' },
    date: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // Live
    status: 'live',
    homeScore: 2,
    awayScore: 1,
    league: 'Brasileirão Série A',
  }
];

export const INITIAL_GROUPS: Group[] = [
  {
    id: 'g1',
    name: 'Geral Copa 2026 🏆',
    description: 'Deixe seus palpites para todos os jogos da Copa do Mundo 2026 e dispute o topo do ranking!',
    league: 'Copa do Mundo 2026',
    entryFee: 0,
    creatorId: 'dartanhan.fett@gmail.com',
    code: 'COPA2026',
    members: ['dartanhan.fett@gmail.com'],
    isPrivate: false,
  }
];

export const INITIAL_COMMENTS: Comment[] = [];
