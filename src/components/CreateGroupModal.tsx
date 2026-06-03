import React, { useState } from 'react';
import { X, Plus, LogIn, Trophy, HelpCircle, ShieldCheck, Search, Sparkles, Settings } from 'lucide-react';
import { motion } from 'motion/react';

// Popular teams list from Serie A, Champions, and World Cup with their correct abbreviations
const POPULAR_TEAMS = [
  // Clubes Brasileiros (Série A)
  { name: 'Flamengo', code: 'FLA' },
  { name: 'Palmeiras', code: 'PAL' },
  { name: 'São Paulo', code: 'SAO' },
  { name: 'Corinthians', code: 'COR' },
  { name: 'Grêmio', code: 'GRE' },
  { name: 'Internacional', code: 'SCI' },
  { name: 'Atlético Mineiro', code: 'CAM' },
  { name: 'Cruzeiro', code: 'CRU' },
  { name: 'Vasco da Gama', code: 'VAS' },
  { name: 'Fluminense', code: 'FLU' },
  { name: 'Botafogo', code: 'BOT' },
  { name: 'Santos', code: 'SAN' },
  { name: 'Bahia', code: 'BAH' },
  { name: 'Athletico Paranaense', code: 'CAP' },
  { name: 'Fortaleza', code: 'FOR' },
  { name: 'Vitória', code: 'VIT' },
  { name: 'Juventude', code: 'JVT' },
  { name: 'Criciúma', code: 'CRI' },
  { name: 'Atlético Goianiense', code: 'ACG' },
  { name: 'Red Bull Bragantino', code: 'RBB' },
  // UEFA Champions League
  { name: 'Real Madrid', code: 'RMA' },
  { name: 'Barcelona', code: 'BAR' },
  { name: 'Manchester City', code: 'MCI' },
  { name: 'Manchester United', code: 'MUN' },
  { name: 'Bayern de Munique', code: 'BAY' },
  { name: 'Paris Saint-Germain', code: 'PSG' },
  { name: 'Arsenal', code: 'ARS' },
  { name: 'Liverpool', code: 'LIV' },
  { name: 'Chelsea', code: 'CHE' },
  { name: 'Juventus', code: 'JUV' },
  { name: 'Internazionale', code: 'INT' },
  { name: 'AC Milan', code: 'MIL' },
  { name: 'Borussia Dortmund', code: 'BVB' },
  { name: 'Atlético de Madrid', code: 'ATM' },
  { name: 'Aston Villa', code: 'AVL' },
  { name: 'Bayer Leverkusen', code: 'LEV' },
  { name: 'Benfica', code: 'SLB' },
  { name: 'Feyenoord', code: 'FEY' },
  { name: 'Girona', code: 'GIR' },
  { name: 'Lazio', code: 'LAZ' },
  { name: 'Monaco', code: 'ASM' },
  { name: 'Porto', code: 'FCP' },
  { name: 'PSV Eindhoven', code: 'PSV' },
  { name: 'Shakhtar Donetsk', code: 'SHK' },
  { name: 'Sporting CP', code: 'SCP' },
  // Seleções da Copa
  { name: 'Brasil', code: 'BRA' },
  { name: 'Argentina', code: 'ARG' },
  { name: 'França', code: 'FRA' },
  { name: 'Inglaterra', code: 'ENG' },
  { name: 'Estados Unidos', code: 'USA' },
  { name: 'México', code: 'MEX' },
  { name: 'Portugal', code: 'POR' },
  { name: 'Espanha', code: 'ESP' },
  { name: 'Alemanha', code: 'GER' },
  { name: 'Itália', code: 'ITA' },
  { name: 'Japão', code: 'JPN' },
  { name: 'Croácia', code: 'CRO' },
  { name: 'Uruguai', code: 'URU' },
  { name: 'Colômbia', code: 'COL' },
  { name: 'Holanda', code: 'NED' },
  { name: 'Bélgica', code: 'BEL' },
  { name: 'Canadá', code: 'CAN' },
  { name: 'Marrocos', code: 'MAR' },
  { name: 'Senegal', code: 'SEN' },
  { name: 'Equador', code: 'ECU' },
  { name: 'Suíça', code: 'SUI' },
  { name: 'Camarões', code: 'CMR' },
  { name: 'Gana', code: 'GHA' },
  { name: 'Coreia do Sul', code: 'KOR' }
];

// Dynamically generate a reasonable abbreviation from a full name description
const generateSigla = (name: string): string => {
  const clean = name.replace(/[^a-zA-ZáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  } else if (words.length === 2) {
    const w1 = words[0];
    const w2 = words[1];
    return (w1[0] + w1[1] + w2[0]).toUpperCase();
  } else if (words.length === 1) {
    const w = words[0];
    if (w.length >= 3) {
      return w.substring(0, 3).toUpperCase();
    }
    return w.toUpperCase().padEnd(3, 'X');
  }
  return 'TMP';
};

interface CreateGroupModalProps {
  onClose: () => void;
  onCreateGroup: (
    name: string,
    description: string,
    league: string,
    entryFee: number,
    isPrivate: boolean,
    customMatch?: {
      homeName: string;
      homeCode: string;
      awayName: string;
      awayCode: string;
      date: string;
    }
  ) => void;
  onJoinGroup: (code: string) => boolean; // returns true if success
  initialTab?: 'create' | 'join';
}

export default function CreateGroupModal({
  onClose,
  onCreateGroup,
  onJoinGroup,
  initialTab = 'create',
}: CreateGroupModalProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>(initialTab);

  // Create state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [league, setLeague] = useState('Copa do Mundo 2026');
  const [entryFee, setEntryFee] = useState(20);
  const [isPrivate, setIsPrivate] = useState(false);

  // Custom match states if "Customizado" is selected
  const [customHomeName, setCustomHomeName] = useState('');
  const [customHomeCode, setCustomHomeCode] = useState('');
  const [customAwayName, setCustomAwayName] = useState('');
  const [customAwayCode, setCustomAwayCode] = useState('');
  const [customDate, setCustomDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(16, 0, 0, 0); // Default to tomorrow at 16:00
    const tzOffset = tomorrow.getTimezoneOffset() * 60000;
    return new Date(tomorrow.getTime() - tzOffset).toISOString().slice(0, 16);
  });

  // Autocomplete and Override locks
  const [homeSuggestions, setHomeSuggestions] = useState<{ name: string; code: string }[]>([]);
  const [awaySuggestions, setAwaySuggestions] = useState<{ name: string; code: string }[]>([]);
  const [showHomeSuggestions, setShowHomeSuggestions] = useState(false);
  const [showAwaySuggestions, setShowAwaySuggestions] = useState(false);
  
  const [isHomeCodeManual, setIsHomeCodeManual] = useState(false);
  const [isAwayCodeManual, setIsAwayCodeManual] = useState(false);

  // Toggle for showing advanced abbreviation settings
  const [showAdvancedCodes, setShowAdvancedCodes] = useState(false);

  // Helper change handlers
  const handleHomeNameChange = (val: string) => {
    setCustomHomeName(val);
    
    // Auto-code generation if not customized manually
    if (!isHomeCodeManual) {
      setCustomHomeCode(generateSigla(val));
    }

    // Filter autocomplete recommendations
    if (val.trim().length > 0) {
      const match = POPULAR_TEAMS.filter(t => 
        t.name.toLowerCase().includes(val.toLowerCase()) || 
        t.code.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 5);
      setHomeSuggestions(match);
      setShowHomeSuggestions(match.length > 0);
    } else {
      setHomeSuggestions([]);
      setShowHomeSuggestions(false);
    }
  };

  const handleAwayNameChange = (val: string) => {
    setCustomAwayName(val);

    // Auto-code generation if not customized manually
    if (!isAwayCodeManual) {
      setCustomAwayCode(generateSigla(val));
    }

    // Filter autocomplete recommendations
    if (val.trim().length > 0) {
      const match = POPULAR_TEAMS.filter(t => 
        t.name.toLowerCase().includes(val.toLowerCase()) || 
        t.code.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 5);
      setAwaySuggestions(match);
      setShowAwaySuggestions(match.length > 0);
    } else {
      setAwaySuggestions([]);
      setShowAwaySuggestions(false);
    }
  };

  const selectHomeSuggestion = (team: { name: string; code: string }) => {
    setCustomHomeName(team.name);
    setCustomHomeCode(team.code);
    setIsHomeCodeManual(true); // lock from auto-regeneration
    setShowHomeSuggestions(false);
  };

  const selectAwaySuggestion = (team: { name: string; code: string }) => {
    setCustomAwayName(team.name);
    setCustomAwayCode(team.code);
    setIsAwayCodeManual(true); // lock from auto-regeneration
    setShowAwaySuggestions(false);
  };

  // Join state
  const [joinCode, setJoinCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (league === 'Customizado') {
      const hName = customHomeName.trim() || 'Mandante';
      const hCode = (customHomeCode.trim() || hName.substring(0, 3)).toUpperCase();
      const aName = customAwayName.trim() || 'Visitante';
      const aCode = (customAwayCode.trim() || aName.substring(0, 3)).toUpperCase();
      const finalLeagueName = `Custom: ${hName} x ${aName}`;

      onCreateGroup(
        name.trim(),
        description.trim(),
        finalLeagueName,
        entryFee,
        isPrivate,
        {
          homeName: hName,
          homeCode: hCode,
          awayName: aName,
          awayCode: aCode,
          date: customDate ? new Date(customDate).toISOString() : new Date().toISOString()
        }
      );
    } else {
      onCreateGroup(name.trim(), description.trim(), league, entryFee, isPrivate);
    }
    onClose();
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!joinCode.trim()) return;

    const success = onJoinGroup(joinCode.trim().toUpperCase());
    if (success) {
      setSuccessMsg('Grupo adicionado com sucesso!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setErrorMsg('Código do grupo inválido ou você já está neste grupo!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-850">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
            <Trophy className="w-5 h-5 text-emerald-400" />
            <span>Participar de um Bolão</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Selector */}
        <div className="flex border-b border-slate-800 p-1 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'create'
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" /> Criar Novo Grupo
          </button>
          <button
            onClick={() => setActiveTab('join')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'join'
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-4 h-4" /> Entrar com Código
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {activeTab === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Nome do Bolão *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Galera da Firma 🇩🇪, Família Silva 🇧🇷"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.6 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-100 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Descrição do Grupo
                </label>
                <textarea
                  placeholder="Defina regras de bônus, zoeira ou recados..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-18 px-3.6 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-100 outline-none resize-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Selecione a Liga / Copa
                  </label>
                  <select
                    value={league}
                    onChange={(e) => setLeague(e.target.value)}
                    className="w-full px-3.6 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-100 outline-none transition"
                  >
                    <option value="Copa do Mundo 2026">Copa do Mundo 2026</option>
                    <option value="Champions League">Champions League</option>
                    <option value="Brasileirão Série A">Brasileirão Série A</option>
                    <option value="Customizado">Customizado (Adicionar Jogo)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                    Taxa de Entrada (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500 text-sm font-semibold">
                      R$
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      value={entryFee}
                      onChange={(e) => setEntryFee(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-sm text-slate-100 outline-none transition font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Privacy block integration */}
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/85 space-y-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center justify-between">
                  <span>Privacidade do Bolão</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isPrivate ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'}`}>
                    {isPrivate ? 'Privativo (Código)' : 'Público/Aberto'}
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-1 border transition cursor-pointer ${
                      !isPrivate
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-extrabold'
                        : 'bg-slate-950/45 border-slate-850 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <span className="text-[11px]">🔓 Aberto</span>
                    <span className="text-[9px] text-slate-500 text-center font-normal">Qualquer um pode ver e entrar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-1 border transition cursor-pointer ${
                      isPrivate
                        ? 'bg-amber-500/10 border-amber-500 text-amber-400 font-extrabold'
                        : 'bg-slate-950/45 border-slate-850 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <span className="text-[11px]">🔒 Privativo</span>
                    <span className="text-[9px] text-slate-500 text-center font-normal">Disponível via código/convite</span>
                  </button>
                </div>
              </div>

              {league === 'Customizado' && (
                <div
                  className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-4"
                >
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                    ⚽ Configurar Partida Única do Bolão
                  </span>
                  
                  {/* Home Team Section */}
                  <div className="relative">
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1 flex justify-between items-center">
                      <span>Time Mandante *</span>
                      {!isHomeCodeManual && customHomeName.trim() && (
                        <span className="text-[9px] text-emerald-400 font-mono">
                          Sigla automática: {customHomeCode}
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2.5 text-slate-500">
                        <Search className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="Pesquise ou digite o Time Mandante... (Ex: Flamengo)"
                        value={customHomeName}
                        onChange={(e) => handleHomeNameChange(e.target.value)}
                        onBlur={() => {
                          // Allow click on suggestion before closing
                          setTimeout(() => setShowHomeSuggestions(false), 200);
                        }}
                        onFocus={() => {
                          if (customHomeName.trim().length > 0 && homeSuggestions.length > 0) {
                            setShowHomeSuggestions(true);
                          }
                        }}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-850 focus:border-emerald-500 rounded-lg text-xs text-slate-100 outline-none"
                      />
                    </div>
                    
                    {/* Home Suggestions Dropdown */}
                    {showHomeSuggestions && homeSuggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-slate-850 border border-slate-750 rounded-lg shadow-xl divide-y divide-slate-800 scrollbar-thin">
                        {homeSuggestions.map((team) => (
                          <button
                            key={team.name}
                            type="button"
                            onMouseDown={() => selectHomeSuggestion(team)}
                            className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center justify-between text-slate-200 transition"
                          >
                            <span className="font-semibold">{team.name}</span>
                            <span className="px-1.5 py-0.5 bg-slate-900 text-emerald-400 text-[10px] font-mono rounded border border-slate-800 font-bold">
                              {team.code}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Away Team Section */}
                  <div className="relative">
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1 flex justify-between items-center">
                      <span>Time Visitante *</span>
                      {!isAwayCodeManual && customAwayName.trim() && (
                        <span className="text-[9px] text-emerald-400 font-mono">
                          Sigla automática: {customAwayCode}
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2.5 text-slate-500">
                        <Search className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="Pesquise ou digite o Time Visitante... (Ex: Real Madrid)"
                        value={customAwayName}
                        onChange={(e) => handleAwayNameChange(e.target.value)}
                        onBlur={() => {
                          // Allow click on suggestion before closing
                          setTimeout(() => setShowAwaySuggestions(false), 200);
                        }}
                        onFocus={() => {
                          if (customAwayName.trim().length > 0 && awaySuggestions.length > 0) {
                            setShowAwaySuggestions(true);
                          }
                        }}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-850 focus:border-emerald-500 rounded-lg text-xs text-slate-100 outline-none"
                      />
                    </div>
                    
                    {/* Away Suggestions Dropdown */}
                    {showAwaySuggestions && awaySuggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-slate-850 border border-slate-750 rounded-lg shadow-xl divide-y divide-slate-800 scrollbar-thin">
                        {awaySuggestions.map((team) => (
                          <button
                            key={team.name}
                            type="button"
                            onMouseDown={() => selectAwaySuggestion(team)}
                            className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center justify-between text-slate-200 transition"
                          >
                            <span className="font-semibold">{team.name}</span>
                            <span className="px-1.5 py-0.5 bg-slate-900 text-emerald-400 text-[10px] font-mono rounded border border-slate-800 font-bold">
                              {team.code}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Advanced Toggle for manual abbreviations override */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedCodes(!showAdvancedCodes)}
                      className="text-[10px] text-slate-500 hover:text-emerald-400 flex items-center gap-1 font-bold underline cursor-pointer outline-none transition"
                    >
                      <Settings className="w-3 h-3" />
                      {showAdvancedCodes ? 'Ocultar ajuste de siglas' : 'Personalizar siglas dos times'}
                    </button>

                    {showAdvancedCodes && (
                      <div className="grid grid-cols-2 gap-2 mt-2 p-2 bg-slate-950 rounded-lg border border-slate-850">
                        <div>
                          <label className="block text-[9px] font-semibold text-slate-400 mb-1">
                            Sigla Mandante:
                          </label>
                          <input
                            type="text"
                            maxLength={3}
                            placeholder="Ex: RQA"
                            value={customHomeCode}
                            onChange={(e) => {
                              setCustomHomeCode(e.target.value.toUpperCase());
                              setIsHomeCodeManual(true);
                            }}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-center font-mono focus:border-emerald-500 text-slate-100 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-semibold text-slate-400 mb-1">
                            Sigla Visitante:
                          </label>
                          <input
                            type="text"
                            maxLength={3}
                            placeholder="Ex: UDF"
                            value={customAwayCode}
                            onChange={(e) => {
                              setCustomAwayCode(e.target.value.toUpperCase());
                              setIsAwayCodeManual(true);
                            }}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-center font-mono focus:border-emerald-500 text-slate-100 outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Date Input */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Data e Horário da Partida
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-850 focus:border-emerald-500 rounded-lg text-xs text-slate-100 outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-lg font-bold text-slate-950 text-sm shadow-lg shadow-emerald-950/20 active:scale-95 transition"
                >
                  Criar Bolão Oficial
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                Insira o código enviado pelo criador do grupo (ex: <code className="text-emerald-400 font-mono">COPA26</code>) para entrar no bolão e começar a palpitar!
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Código de Convite
                </label>
                <input
                  type="text"
                  required
                  placeholder="Digite o código (ex: CHAMPS)"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value);
                    setErrorMsg('');
                  }}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg text-base font-mono text-center font-bold tracking-widest text-emerald-400 uppercase outline-none transition"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs font-semibold text-rose-400 text-center animate-pulse">
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs font-semibold text-emerald-400 text-center flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  {successMsg}
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-lg font-bold text-slate-950 text-sm shadow-lg shadow-emerald-950/20 active:scale-95 transition"
                >
                  Entrar no Bolão
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
