import React, { useState, useEffect } from 'react';
import { Trophy, Users, Star, MessageSquare, ChevronLeft, Calendar, HelpCircle, UserCheck, Plus, Sparkles, BookOpen, AlertCircle, Share2, Info, Copy, Trash2, LogOut, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'react-hot-toast';

// Data and components
import { INITIAL_USERS, INITIAL_MATCHES, INITIAL_GROUPS, INITIAL_COMMENTS } from './data/initialData';
import { INITIAL_PREDICTIONS } from './data/initialPredictions';
import { Group, Match, Prediction, User, Comment } from './types';
import BottomNav from './components/BottomNav';
import GroupList from './components/GroupList';
import MatchList from './components/MatchList';
import Leaderboard from './components/Leaderboard';
import MatchCommentSection from './components/MatchCommentSection';
import CreateGroupModal from './components/CreateGroupModal';
import SimulatorPanel from './components/SimulatorPanel';
import AuthScreen from './components/AuthScreen';
import UserProfile from './components/UserProfile';

export default function App() {
  // Configurable session user state
  const [sessionUser, setSessionUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('copabolao_session_user');
    return saved ? JSON.parse(saved) : null; // Defaults to null so users must register/login
  });

  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('copabolao_users_list');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  // Global States loaded with realistic presets
  const [groups, setGroups] = useState<Group[]>(() => {
    const saved = localStorage.getItem('copabolao_groups');
    return saved ? JSON.parse(saved) : INITIAL_GROUPS;
  });

  const [matches, setMatches] = useState<Match[]>(() => {
    const saved = localStorage.getItem('copabolao_matches');
    return saved ? JSON.parse(saved) : INITIAL_MATCHES;
  });

  const [predictions, setPredictions] = useState<Prediction[]>(() => {
    const saved = localStorage.getItem('copabolao_predictions');
    return saved ? JSON.parse(saved) : INITIAL_PREDICTIONS;
  });

  const [comments, setComments] = useState<Comment[]>(() => {
    const saved = localStorage.getItem('copabolao_comments');
    return saved ? JSON.parse(saved) : INITIAL_COMMENTS;
  });

  // Real Football API Integration states
  const [useRealFootball, setUseRealFootballState] = useState<boolean>(() => {
    const saved = localStorage.getItem('copabolao_use_real_football');
    return saved ? saved === 'true' : true;
  });
  const [realFootballMessage, setRealFootballMessage] = useState<string>('Buscando integratividades...');
  const [realFootballLoading, setRealFootballLoading] = useState<boolean>(false);

  // Supabase Connection Status
  const [dbStatusText, setDbStatusText] = useState<string>("Conectando...");

  const setUseRealFootball = (active: boolean) => {
    setUseRealFootballState(active);
    localStorage.setItem('copabolao_use_real_football', active ? 'true' : 'false');
  };

  const currentUser: User = sessionUser || INITIAL_USERS[0];

  // --- Supabase Persistence Helper Triggers (Proxy REST) ---
  const savePredictionToDb = (pred: Prediction) => {
    fetch("/api/db/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pred)
    }).catch(e => console.error("Falha ao salvar palpite no Supabase:", e));
  };

  const saveCommentToDb = (comment: Comment) => {
    fetch("/api/db/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(comment)
    }).catch(e => console.error("Falha ao salvar comentário no Supabase:", e));
  };

  const saveGroupToDb = (group: Group) => {
    fetch("/api/db/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(group)
    }).catch(e => console.error("Falha ao salvar grupo no Supabase:", e));
  };

  const deleteGroupFromDb = async (groupId: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/db/groups/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, userId: currentUser?.id })
      });
      const data = await response.json();
      return !!data.success;
    } catch (e) {
      console.error("Falha ao deletar grupo no Supabase:", e);
      return false;
    }
  };

  const deleteUserFromDb = async (targetUserId: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/db/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, requesterUserId: currentUser?.id })
      });
      const data = await response.json();
      return !!data.success;
    } catch (e) {
      console.error("Falha ao deletar usuário no Supabase:", e);
      return false;
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const response = await fetch("/api/db/groups/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, userId: currentUser?.id })
      });
      const data = await response.json();
      
      if (data.success) {
        setGroups(prev => {
          const updated = prev.filter(g => g.id !== groupId);
          localStorage.setItem('copabolao_groups', JSON.stringify(updated));
          return updated;
        });
        if (activeGroupId === groupId) {
          setActiveGroupId(null);
          setActiveTab('groups');
        }
        toast.success(data.message || "Bolão excluído com sucesso.");
      } else {
        toast.error("Não foi possível excluir o bolão: " + (data.message || "Erro desconhecido."));
      }
    } catch (e: any) {
      console.error("Falha ao deletar grupo no Supabase:", e);
      // Local fallback
      setGroups(prev => {
        const updated = prev.filter(g => g.id !== groupId);
        localStorage.setItem('copabolao_groups', JSON.stringify(updated));
        return updated;
      });
      if (activeGroupId === groupId) {
        setActiveGroupId(null);
        setActiveTab('groups');
      }
      toast.success("Excluído localmente com sucesso (offline).");
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    try {
      const matchGroup = groups.find(g => g.id === groupId);
      if (!matchGroup) return;

      const updatedMembers = matchGroup.members.filter(id => id !== currentUser?.id);
      const updatedGroup = {
        ...matchGroup,
        members: updatedMembers
      };

      setGroups(prev => {
        const updated = prev.map(g => g.id === groupId ? updatedGroup : g);
        localStorage.setItem('copabolao_groups', JSON.stringify(updated));
        return updated;
      });

      // Sync updated group members to cloud
      saveGroupToDb(updatedGroup);

      if (activeGroupId === groupId) {
        setActiveGroupId(null);
        setActiveTab('groups');
      }

      toast.success("Você saiu do bolão com sucesso.");
    } catch (e: any) {
      console.error("Falha ao sair do grupo:", e);
      toast.error("Erro de conexão ao processar sua saída do grupo.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    const targetId = currentUser.id;
    try {
      const response = await fetch("/api/db/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetId, requesterUserId: currentUser.id })
      });
      const data = await response.json();
      
      if (data.success) {
        toast.success(data.message || "Sua conta foi excluída com sucesso.");
        setUsers(prev => {
          const updated = prev.filter(u => u.id !== targetId);
          localStorage.setItem('copabolao_users_list', JSON.stringify(updated));
          return updated;
        });
        setSessionUser(null);
        localStorage.removeItem('copabolao_session_user');
      } else {
        toast.error("Não foi possível excluir sua conta: " + (data.message || "Erro desconhecido."));
      }
    } catch (e: any) {
      console.error("Falha ao deletar conta:", e);
      // Local fallback
      setUsers(prev => {
        const updated = prev.filter(u => u.id !== targetId);
        localStorage.setItem('copabolao_users_list', JSON.stringify(updated));
        return updated;
      });
      setSessionUser(null);
      localStorage.removeItem('copabolao_session_user');
      toast.success("Sua conta foi excluída localmente devido a problemas de rede.");
    }
  };

  const saveUserToDb = (user: User) => {
    fetch("/api/db/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user)
    }).catch(e => console.error("Falha ao salvar usuário no Supabase:", e));
  };

  const saveMatchToDb = (match: Match) => {
    fetch("/api/db/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(match)
    }).catch(e => console.error("Falha ao salvar partida no Supabase:", e));
  };

  // Active navigation states
  const [activeTab, setActiveTab] = useState<'groups' | 'matches' | 'ranking' | 'profile'>('groups');
  const [activeGroupId, setActiveGroupId] = useState<string | null>('g1'); // Default to Amigos da Copa to show dynamic live feel instantly!
  const [showGroupDeleteModal, setShowGroupDeleteModal] = useState(false);
  const [showGroupLeaveModal, setShowGroupLeaveModal] = useState(false);
  const [activeMatchForComments, setActiveMatchForComments] = useState<Match | null>(null);

  // User comments read tracking
  const [lastOpenedCommentsAt, setLastOpenedCommentsAt] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('copabolao_comments_read_timestamps');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleOpenComments = (match: Match) => {
    setActiveMatchForComments(match);
    const now = new Date().toISOString();
    setLastOpenedCommentsAt((prev) => {
      const next = { ...prev, [match.id]: now };
      localStorage.setItem('copabolao_comments_read_timestamps', JSON.stringify(next));
      return next;
    });
  };

  const handleMarkAllCommentsAsRead = () => {
    const now = new Date().toISOString();
    setLastOpenedCommentsAt((prev) => {
      const next = { ...prev };
      matches.forEach((m) => {
        if (!activeGroup || m.league === activeGroup.league) {
          next[m.id] = now;
        }
      });
      localStorage.setItem('copabolao_comments_read_timestamps', JSON.stringify(next));
      return next;
    });
  };

  // Auto Refresh Interval setup
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFirstSyncDone, setIsFirstSyncDone] = useState(false);
  const syncData = async (silent = true) => {
    try {
      if (!silent) setIsSyncing(true);
      const [matchesRes, usersRes, predictionsRes, commentsRes, groupsRes] = await Promise.all([
        fetch("/api/db/sync?table=copabolao_matches").then(res => res.json()),
        fetch("/api/db/sync?table=copabolao_users").then(res => res.json()),
        fetch("/api/db/sync?table=copabolao_predictions").then(res => res.json()),
        fetch("/api/db/sync?table=copabolao_comments").then(res => res.json()),
        fetch("/api/db/sync?table=copabolao_groups").then(res => res.json()),
      ]);

      if (matchesRes.success && matchesRes.data.length > 0) setMatches(matchesRes.data);
      if (usersRes.success && usersRes.data.length > 0) setUsers(usersRes.data);
      if (predictionsRes.success && predictionsRes.data.length > 0) setPredictions(predictionsRes.data);
      if (commentsRes.success && commentsRes.data.length > 0) setComments(commentsRes.data);
      if (groupsRes.success && groupsRes.data.length > 0) setGroups(groupsRes.data);
      
      if (!silent) toast.success("Sincronizado com os servidores!");
    } catch (e) {
      console.error("Error doing background sync:", e);
      if (!silent) toast.error("Falha de rede ao conectar no servidor.");
    } finally {
      setIsFirstSyncDone(true);
      if (!silent) setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    syncData(true);
    const interval = setInterval(() => {
      syncData(true);
    }, 25000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Invite & Sharing States
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('invite');
      return code ? code.trim().toUpperCase() : null;
    } catch {
      return null;
    }
  });
  const [copiedActiveCode, setCopiedActiveCode] = useState(false);

  const clearInviteQueryParam = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      console.error("Erro ao limpar convite da URL:", e);
    }
  };

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalInitialTab, setCreateModalInitialTab] = useState<'create' | 'join'>('create');
  
  const isAdmin = !!(
    sessionUser && (
      sessionUser.email?.toLowerCase() === 'dartanhan.fett@gmail.com' ||
      sessionUser.id?.toLowerCase() === 'dartanhan.fett@gmail.com'
    )
  );

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  const handleOpenCreateModal = (tab: 'create' | 'join' = 'create') => {
    setCreateModalInitialTab(tab);
    setIsCreateModalOpen(true);
  };

  // Sync state initially from database
  useEffect(() => {
    fetch("/api/db/sync")
      .then((res) => res.json())
      .then((data) => {
        if (data.connected) {
          setDbStatusText("Nuvem Ativa ☁️");
          if (data.users && data.users.length > 0) setUsers(data.users);
          if (data.groups && data.groups.length > 0) setGroups(data.groups);
          if (data.predictions) setPredictions(data.predictions);
          if (data.comments) setComments(data.comments);
          if (data.matches && data.matches.length > 0 && !useRealFootball) {
            setMatches(data.matches);
          }
        } else {
          setDbStatusText("Local 💾");
        }
      })
      .catch((err) => {
        setDbStatusText("Offline ⚠️");
        console.error("Falha de sincronização com Supabase:", err);
      });
  }, [useRealFootball]);

  // Fetch real football fixtures
  useEffect(() => {
    setRealFootballLoading(true);
    fetch("/api/football/fixtures")
      .then((res) => res.json())
      .then((data) => {
        setRealFootballLoading(false);
        if (data.useRealData && data.fixtures && data.fixtures.length > 0) {
          setRealFootballMessage("API-Football ativa 📡 Jogos oficiais carregados!");
          if (useRealFootball) {
            setMatches(data.fixtures);
          }
        } else {
          setRealFootballMessage(data.message || "Simulado 🎮 Toque para ativar.");
          if (useRealFootball) {
            setUseRealFootball(false);
            setMatches(INITIAL_MATCHES);
          }
        }
      })
      .catch((err) => {
        setRealFootballLoading(false);
        setRealFootballMessage("Servidor offline para API real.");
        if (useRealFootball) {
          setUseRealFootball(false);
          setMatches(INITIAL_MATCHES);
        }
      });
  }, [useRealFootball]);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('copabolao_groups', JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    // Only save matches to localStorage if NOT overrides with real-time api
    if (!useRealFootball) {
      localStorage.setItem('copabolao_matches', JSON.stringify(matches));
    }
  }, [matches, useRealFootball]);

  useEffect(() => {
    localStorage.setItem('copabolao_predictions', JSON.stringify(predictions));
  }, [predictions]);

  useEffect(() => {
    localStorage.setItem('copabolao_comments', JSON.stringify(comments));
  }, [comments]);

  // Active Group Helper
  const activeGroup = groups.find((g) => g.id === activeGroupId) || null;

  // State actions
  const handleSavePrediction = (matchId: string, homeScore: number, awayScore: number) => {
    let targetPred: Prediction;
    setPredictions((prev) => {
      // Check if already exists for this user, match AND current group
      const existingIdx = prev.findIndex(
        (p) => p.matchId === matchId && p.userId === currentUser.id && p.groupId === activeGroupId
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        targetPred = {
          ...copy[existingIdx],
          homeScore,
          awayScore,
          groupId: activeGroupId
        };
        copy[existingIdx] = targetPred;
        savePredictionToDb(targetPred);
        return copy;
      } else {
        targetPred = {
          id: `pred_${activeGroupId}_${currentUser.id}_${matchId}`, // Composite ID unique per group, user & match
          userId: currentUser.id,
          matchId,
          homeScore,
          awayScore,
          groupId: activeGroupId
        };
        savePredictionToDb(targetPred);
        return [...prev, targetPred];
      }
    });
  };

  const handleAddComment = (matchId: string, text: string) => {
    const newComment: Comment = {
      id: `c_${Date.now()}`,
      matchId,
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      text,
      timestamp: new Date().toISOString(),
      reactions: [],
    };
    setComments((prev) => [...prev, newComment]);
    saveCommentToDb(newComment);

    // Also mark as read instantly to keep sync
    const now = new Date().toISOString();
    setLastOpenedCommentsAt((prev) => {
      const next = { ...prev, [matchId]: now };
      localStorage.setItem('copabolao_comments_read_timestamps', JSON.stringify(next));
      return next;
    });

    // Find match for context
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    // Find prediction context
    const userPred = predictions.find((p) => p.matchId === matchId && p.userId === currentUser.id);
    const userPredictionStr = userPred ? `${userPred.homeScore} - ${userPred.awayScore}` : "";

    // List other group members to act as bot responder
    const otherMembers = users.filter((u) => u.id !== currentUser.id);

    // Call server-side Gemini API (Option B)
    fetch("/api/ai/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        homeTeam: match.homeTeam.name,
        awayTeam: match.awayTeam.name,
        userComment: text,
        userName: currentUser.name,
        userPrediction: userPredictionStr,
        otherMembers,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        const botComment: Comment = {
          id: `c_bot_${Date.now()}`,
          matchId,
          userId: data.author.id,
          userName: data.author.name,
          userAvatar: data.author.avatar,
          text: data.comment,
          timestamp: new Date().toISOString(),
          reactions: [{ emoji: "⚡", count: 1, users: [currentUser.id] }],
        };
        setComments((prev) => [...prev, botComment]);
        saveCommentToDb(botComment); // Save bot comment too
      })
      .catch((err) => {
        console.error("AI comment API error, falling back to simulated:", err);
        setTimeout(() => {
          const responseTexts = [
            "Rapaz, que palpite ousado! Eu apostei no empate em?! 🤔",
            "Estou achando que vai ser jogo duro, mas seu bolão está bem cotado!",
            "Vixi, se der esse placar eu subo pro primeiro lugar haha! 🚀🔥",
            "Gooool! Acabei de atualizar aqui. O clássico vai ferver!",
            "Concordo plenamente com o comentário de cima. Esse jogo promete!",
          ];
          const randomMember = otherMembers[Math.floor(Math.random() * otherMembers.length)] || INITIAL_USERS[1];
          const botComment: Comment = {
            id: `c_bot_${Date.now() + 1}`,
            matchId,
            userId: randomMember.id,
            userName: randomMember.name,
            userAvatar: randomMember.avatar,
            text: responseTexts[Math.floor(Math.random() * responseTexts.length)],
            timestamp: new Date().toISOString(),
            reactions: [{ emoji: "👍", count: 1, users: [currentUser.id] }],
          };
          setComments((prev) => [...prev, botComment]);
          saveCommentToDb(botComment); // Save visual trace response too
        }, 1500);
      });
  };

  const handleToggleReaction = (commentId: string, emoji: string) => {
    setComments((prev) =>
      prev.map((comment) => {
        if (comment.id !== commentId) return comment;

        // Check if emoji exists in reactions array
        const reactionsCopy = [...comment.reactions];
        const rcIndex = reactionsCopy.findIndex((r) => r.emoji === emoji);

        if (rcIndex >= 0) {
          const rx = reactionsCopy[rcIndex];
          const hasReacted = rx.users.includes(currentUser.id);

          if (hasReacted) {
            // Remove user
            const updatedUsers = rx.users.filter((id) => id !== currentUser.id);
            reactionsCopy[rcIndex] = {
              ...rx,
              count: rx.count - 1,
              users: updatedUsers,
            };
          } else {
            // Add user
            reactionsCopy[rcIndex] = {
              ...rx,
              count: rx.count + 1,
              users: [...rx.users, currentUser.id],
            };
          }
        } else {
          // Add new reaction object
          reactionsCopy.push({
            emoji,
            count: 1,
            users: [currentUser.id],
          });
        }

        const updatedComment = {
          ...comment,
          reactions: reactionsCopy.filter((r) => r.count > 0),
        };
        saveCommentToDb(updatedComment); // Sync updated reactions payload to Supabase
        return updatedComment;
      })
    );
  };

  const handleCreateGroup = (
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
  ) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newGroup: Group = {
      id: `g_${Date.now()}`,
      name,
      description,
      league,
      entryFee,
      creatorId: currentUser.id,
      code,
      members: [currentUser.id],
      isPrivate,
    };

    setGroups((prev) => [...prev, newGroup]);
    saveGroupToDb(newGroup); // Sync list additions to cloud

    if (customMatch) {
      const newMatch: Match = {
        id: `custom_match_${Date.now()}`,
        homeTeam: {
          name: customMatch.homeName,
          code: customMatch.homeCode,
          flagUrl: '⚽',
        },
        awayTeam: {
          name: customMatch.awayName,
          code: customMatch.awayCode,
          flagUrl: '⚽',
        },
        date: customMatch.date,
        status: 'upcoming',
        league: league,
      };

      setMatches((prev) => [newMatch, ...prev]);
      saveMatchToDb(newMatch); // Sync custom match addition to db/localStorage
    }

    setActiveGroupId(newGroup.id);
    setActiveTab('matches'); // open matches instantly for predictions
  };

  const handleJoinGroup = (code: string): boolean => {
    const cleanCode = code.trim().toUpperCase();
    const matched = groups.find((g) => g.code.trim().toUpperCase() === cleanCode);
    if (!matched) return false;

    // Check if progress contains user
    if (matched.members.includes(currentUser.id)) return false;

    const updatedGroup = {
      ...matched,
      members: [...matched.members, currentUser.id],
    };

    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === matched.id) {
          return updatedGroup;
        }
        return g;
      })
    );

    saveGroupToDb(updatedGroup); // Sync updated members parameters to cloud
    setActiveGroupId(matched.id);
    return true;
  };

  // --- Real-time Simulator Callbacks ---
  const handleCompleteMatch = (matchId: string, homeScore: number, awayScore: number, scorers?: string[]) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id === matchId) {
          const updatedMatch = {
            ...m,
            status: 'completed' as const,
            homeScore,
            awayScore,
            scorers,
          };
          saveMatchToDb(updatedMatch); // Sync to Supabase
          return updatedMatch;
        }
        return m;
      })
    );
  };

  const handleSetMatchLive = (matchId: string) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id === matchId) {
          const updatedMatch = {
            ...m,
            status: 'live' as const,
            homeScore: 0,
            awayScore: 0,
          };
          saveMatchToDb(updatedMatch); // Sync to Supabase
          return updatedMatch;
        }
        return m;
      })
    );
  };

  const handleResetSimulator = () => {
    // Sync-reset state of Supabase database in cloud
    fetch("/api/db/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
    .then((res) => res.json())
    .then((data) => {
      if (data.success && data.matches) {
        setMatches(data.matches);
      } else {
        setMatches(INITIAL_MATCHES);
      }
    })
    .catch((err) => {
      console.error("Falha ao resetar banco do Supabase:", err);
      setMatches(INITIAL_MATCHES);
    });

    setGroups(INITIAL_GROUPS);
    setPredictions([]); // Reset predictions to allow fresh guess testing
    setComments(INITIAL_COMMENTS);
    setUsers(INITIAL_USERS);
    setSessionUser(INITIAL_USERS[0]);
    setActiveGroupId('g1');
    setActiveTab('groups');
    localStorage.removeItem('copabolao_groups');
    localStorage.removeItem('copabolao_matches');
    localStorage.removeItem('copabolao_predictions');
    localStorage.removeItem('copabolao_comments');
    localStorage.removeItem('copabolao_users_list');
    localStorage.removeItem('copabolao_session_user');
  };

  if (!sessionUser) {
    return (
      <AuthScreen
        onLoginSuccess={(name, userId, avatarUrl) => {
          const registeredUser: User = {
            id: userId,
            name,
            avatar: avatarUrl,
            email: userId,
          };

          // Update users list in state with the newly authenticated user
          setUsers((prev) => {
            const existsIdx = prev.findIndex(u => u.id === userId);
            if (existsIdx >= 0) {
              const copy = [...prev];
              copy[existsIdx] = registeredUser;
              localStorage.setItem('copabolao_users_list', JSON.stringify(copy));
              return copy;
            } else {
              const list = [...prev, registeredUser];
              localStorage.setItem('copabolao_users_list', JSON.stringify(list));
              return list;
            }
          });

          // Set active session user
          setSessionUser(registeredUser);
          localStorage.setItem('copabolao_session_user', JSON.stringify(registeredUser));

          // Auto-join the default general group 'g1' if they are not already a member! This is extremely helpful.
          setGroups((prev) => {
            const updated = prev.map((g) => {
              if (g.id === 'g1' && !g.members.includes(userId)) {
                const updatedGroup = { ...g, members: [...g.members, userId] };
                saveGroupToDb(updatedGroup);
                return updatedGroup;
              }
              return g;
            });
            localStorage.setItem('copabolao_groups', JSON.stringify(updated));
            return updated;
          });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans mb-16 antialiased selection:bg-emerald-500 selection:text-slate-950">
      
      <Toaster 
        position="top-center" 
        toastOptions={{
          style: {
            background: '#0f172a',
            color: '#f8fafc',
            border: '1px solid #1e293b',
            fontSize: '14px',
            fontWeight: '600',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#0f172a' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#0f172a' },
          }
        }} 
      />

      {/* Top Banner & Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/40 relative overflow-hidden">
              <span className="text-base select-none filter drop-shadow-[0_2px_6px_rgba(16,185,129,0.3)]">⚽</span>
              <Sparkles className="absolute top-1 right-1 w-2.5 h-2.5 text-lime-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                CopaBolão <span className="text-[10px] bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-normal tracking-normal">{dbStatusText}</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-semibold font-mono tracking-wider">RESENHA & CHUTE CERTEIRO</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => syncData(false)}
              disabled={isSyncing}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition cursor-pointer disabled:opacity-50"
              title="Sincronizar tempo real"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* Simulator toggle button - restricted to admin only */}
            {isAdmin && (
              <button
                onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
                className={`text-xs font-bold py-1 px-2.5 rounded-lg border transition-colors flex items-center gap-1 ${
                  isSimulatorOpen
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                }`}
              >
                🎮 {isSimulatorOpen ? 'Ocultar Testes' : 'Simulador'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Core View Area with max-width phone wrapper for perfect desktop & mobile responsive alignment */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-12">
        <AnimatePresence mode="wait">
          {/* Active Simulator drawer at top - restricted to admin only */}
          {isAdmin && (
            <SimulatorPanel
              matches={matches}
              onCompleteMatch={handleCompleteMatch}
              onSetMatchLive={handleSetMatchLive}
              onResetSimulator={handleResetSimulator}
              isOpen={isSimulatorOpen}
              setIsOpen={setIsSimulatorOpen}
            />
          )}
        </AnimatePresence>

        {/* Dynamic Pending Invitation Handler */}
        {pendingInviteCode && (() => {
          const invitedGroup = groups.find((g) => g.code.trim().toUpperCase() === pendingInviteCode.trim().toUpperCase());
          
          if (!invitedGroup) {
            if (!isFirstSyncDone) {
              return (
                <div className="mb-5 p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between shadow-lg">
                  <span className="flex items-center gap-2 text-slate-455 text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Conectando e buscando convite do bolão no banco...</span>
                  </span>
                  <button 
                    onClick={() => {
                      setPendingInviteCode(null);
                      clearInviteQueryParam();
                    }}
                    className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1 font-bold transition"
                  >
                    Cancelar
                  </button>
                </div>
              );
            } else {
              return (
                <div className="mb-5 p-4 bg-slate-900 border border-amber-500/20 text-slate-300 text-xs rounded-2xl flex items-center justify-between shadow-md">
                  <span className="flex items-center gap-2">
                    <span className="text-amber-500 text-sm">⚠️</span>
                    <span>Código de convite inválido ou expirado (<strong>{pendingInviteCode}</strong>).</span>
                  </span>
                  <button 
                    onClick={() => {
                      setPendingInviteCode(null);
                      clearInviteQueryParam();
                    }}
                    className="text-[10px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 font-bold px-2.5 py-1.5 rounded-lg transition"
                  >
                    Fechar
                  </button>
                </div>
              );
            }
          }

          const isAlreadyMember = invitedGroup.members.includes(currentUser.id);
          
          if (isAlreadyMember) {
            return (
              <div className="mb-5 p-3 bg-slate-900 border border-emerald-500/20 text-emerald-405 text-xs rounded-2xl flex items-center justify-between shadow-md">
                <span className="flex items-center gap-1.5 leading-relaxed text-emerald-400">
                  <span className="text-sm">👋</span>
                  Você já participa do bolão <strong>{invitedGroup.name}</strong>!
                </span>
                <button 
                  onClick={() => {
                    setActiveGroupId(invitedGroup.id);
                    setPendingInviteCode(null);
                    clearInviteQueryParam();
                  }}
                  className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-2.5 py-1.5 rounded-lg active:scale-95 transition"
                >
                  Ver Jogos
                </button>
              </div>
            );
          }

          return (
            <div className="mb-5 p-4 bg-gradient-to-br from-emerald-950/90 to-slate-900 border border-emerald-500/30 rounded-2xl relative shadow-lg overflow-hidden">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1 text-[9px] bg-emerald-500/15 text-emerald-400 font-extrabold px-2 py-0.5 rounded-md tracking-wider uppercase border border-emerald-500/10">
                    <Sparkles className="w-3" />
                    <span>Convite Recebido</span>
                  </div>
                  <h3 className="text-sm font-black text-slate-100 mt-2 leading-tight">
                    Entrar no Bolão "{invitedGroup.name}"?
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Liga: <strong className="text-slate-300">{invitedGroup.league}</strong> • Aposta: <strong className="text-emerald-400">{invitedGroup.entryFee > 0 ? `R$ ${invitedGroup.entryFee.toFixed(2)}` : 'Grátis'}</strong>
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      const success = handleJoinGroup(pendingInviteCode);
                      if (success) {
                        toast.success(`Você entrou no bolão "${invitedGroup.name}"!`);
                      } else {
                        toast.error("Não foi possível entrar. Talvez você já participe deste bolão.");
                      }
                      setPendingInviteCode(null);
                      clearInviteQueryParam();
                    }}
                    className="text-xs bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold px-3.5 py-2 rounded-xl transition active:scale-95 shadow-md shadow-emerald-500/5"
                  >
                    Aceitar
                  </button>
                  <button
                    onClick={() => {
                      setPendingInviteCode(null);
                      clearInviteQueryParam();
                    }}
                    className="text-[10px] text-slate-500 hover:text-slate-300 text-center font-bold py-1 transition"
                  >
                    Ignorar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Selected Group Header Context Card if a group is open (Only visible on Matches and Ranking tabs as requested) */}
        {activeGroup && (activeTab === 'matches' || activeTab === 'ranking') ? (
          <div className="mb-5 p-4 bg-slate-900 border border-slate-800 rounded-2xl relative shadow-md">
            <button
              onClick={() => {
                setActiveGroupId(null);
                setActiveTab('groups');
              }}
              className="text-xs text-slate-400 hover:text-emerald-400 font-semibold flex items-center gap-1 mb-3 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Ver todos os bolões
            </button>

            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] bg-emerald-500/15 text-emerald-400 font-black px-2 py-0.5 rounded tracking-wide uppercase border border-emerald-500/10">
                    {activeGroup.league}
                  </span>

                  {((activeGroup.creatorId && currentUser.id && activeGroup.creatorId.toLowerCase() === currentUser.id.toLowerCase()) || 
                    (currentUser.id && currentUser.id.toLowerCase() === 'dartanhan.fett@gmail.com')) ? (
                    <button
                      onClick={() => setShowGroupDeleteModal(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-rose-950/50 text-rose-450 hover:bg-rose-900/60 hover:text-rose-100 rounded text-[9px] font-bold border border-rose-900/45 transition shadow-sm cursor-pointer"
                      title="Excluir este bolão permanentemente"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Excluir Bolão</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowGroupLeaveModal(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-950/50 text-amber-450 hover:bg-amber-900/60 hover:text-amber-100 rounded text-[9px] font-bold border border-amber-900/45 transition shadow-sm cursor-pointer whitespace-nowrap"
                      title="Sair deste bolão"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Sair do Bolão</span>
                    </button>
                  )}
                </div>
                <h2 className="text-lg font-extrabold text-slate-100 tracking-tight mt-1.5 leading-tight">
                  {activeGroup.name}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {activeGroup.description}
                </p>
              </div>

              {/* Box style showing entry fee details */}
              <div className="text-right shrink-0 bg-slate-950/65 py-1.5 px-3 rounded-xl border border-slate-800">
                <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Aposta</span>
                <span className="text-sm font-black text-emerald-400">
                  {activeGroup.entryFee > 0 ? `R$ ${activeGroup.entryFee.toFixed(2)}` : 'Grátis'}
                </span>
              </div>
            </div>

            {/* Elegant invite bar with code copy and WhatsApp share */}
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-3 bg-slate-950/30 p-2.5 rounded-xl border border-slate-850">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono">CONVITE:</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activeGroup.code);
                    setCopiedActiveCode(true);
                    setTimeout(() => setCopiedActiveCode(false), 2000);
                  }}
                  className="px-2 py-0.5 bg-slate-950 text-slate-200 hover:text-white rounded border border-slate-800 hover:bg-slate-850 transition flex items-center gap-1.5 text-xs font-mono"
                  title="Clique para copiar o código de acesso"
                >
                  <span className="text-emerald-400 font-semibold font-mono">{activeGroup.code}</span>
                  {copiedActiveCode ? (
                    <span className="text-[9px] text-emerald-400 font-bold">Copiado!</span>
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </button>
              </div>

              {/* WhatsApp instant invite link direct setup */}
              <a
                href={(() => {
                  const shareUrl = `${window.location.origin}/?invite=${activeGroup.code}`;
                  const valTxt = activeGroup.entryFee > 0 ? `R$ ${activeGroup.entryFee.toFixed(2)}` : 'Grátis';
                  const msgText = `🏆 *COPA BOLÃO* 🏆\n` +
                    `Você foi convidado para o bolão *${activeGroup.name}*!\n\n` +
                    `⚽ *Liga:* ${activeGroup.league}\n` +
                    `💰 *Aposta:* ${valTxt}\n` +
                    `🔑 *Código de acesso:* ${activeGroup.code}\n\n` +
                    `Clique no link abaixo para entrar no grupo automaticamente e lançar seus palpites:\n` +
                    `👉 ${shareUrl}\n\n` +
                    `Bora palpitar! ⚽💥`;
                  return `https://api.whatsapp.com/send?text=${encodeURIComponent(msgText)}`;
                })()}
                target="_blank"
                rel="noopener noreferrer"
                className="py-1 px-2.5 bg-emerald-500 hover:bg-emerald-405 text-slate-950 font-bold text-xs rounded-lg transition-transform active:scale-95 flex items-center gap-1"
              >
                <Share2 className="w-3 h-3 text-slate-950" />
                Convidar via WhatsApp
              </a>
            </div>

            {/* Quick Internal Nav for open group if on groups tab */}
            {activeTab === 'groups' && (
              <div className="mt-4 pt-3 border-t border-slate-800/60 flex gap-2">
                <button
                  onClick={() => setActiveTab('matches')}
                  className="flex-1 py-1 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-transform active:scale-95 text-center block"
                >
                  Lançar Palpites ⚽️
                </button>
                <button
                  onClick={() => setActiveTab('ranking')}
                  className="flex-1 py-1 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs rounded-lg border border-slate-700 transition"
                >
                  Ver Ranking 🏆
                </button>
              </div>
            )}
          </div>
        ) : (
          (activeTab === 'matches' || activeTab === 'ranking') && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center gap-2.5">
              <Info className="w-5 h-5 shrink-0" />
              <span>Por favor, escolha um dos bolões abaixo ou entre com um código para visualizar as partidas e classificação exclusivas daquela liga com seus amigos.</span>
            </div>
          )
        )}

        {/* Dynamic Route/Tab Component render */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + (activeGroupId || '')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'groups' ? (
              <GroupList
                groups={groups}
                users={users}
                currentUserId={currentUser.id}
                onSelectGroup={(id) => {
                  setActiveGroupId(id);
                  setActiveTab('matches'); // Go straight to their matches!
                }}
                onOpenCreateModal={handleOpenCreateModal}
                onDeleteGroup={handleDeleteGroup}
                onJoinGroup={handleJoinGroup}
              />
            ) : activeTab === 'matches' ? (
              <MatchList
                matches={matches}
                predictions={predictions}
                users={users}
                currentUserId={currentUser.id}
                onSavePrediction={handleSavePrediction}
                onOpenComments={handleOpenComments}
                activeLeague={activeGroup?.league}
                groupMembers={activeGroup?.members}
                activeGroupId={activeGroupId}
                unreadMatchIds={matches.filter(m => {
                  const matchComments = comments.filter(c => c.matchId === m.id);
                  if (matchComments.length === 0) return false;
                  const lastReadTime = lastOpenedCommentsAt[m.id];
                  if (!lastReadTime) return true;
                  return matchComments.some(c => new Date(c.timestamp).getTime() > new Date(lastReadTime).getTime());
                }).map(m => m.id)}
                onMarkAllCommentsAsRead={handleMarkAllCommentsAsRead}
              />
            ) : activeTab === 'ranking' ? (
              <Leaderboard
                activeGroup={activeGroup}
                matches={matches}
                predictions={predictions}
                users={users}
                currentUserId={currentUser.id}
              />
            ) : (
              <UserProfile
                currentUser={currentUser}
                onUpdateProfile={(updatedName, updatedAvatar) => {
                  const updatedUser = { ...currentUser, name: updatedName, avatar: updatedAvatar };
                  setSessionUser(updatedUser);
                  localStorage.setItem('copabolao_session_user', JSON.stringify(updatedUser));
                  
                  // Also update in users list so leaderboard/comments stay synced!
                  setUsers(prev => {
                    const next = prev.map(u => u.id === currentUser.id ? updatedUser : u);
                    localStorage.setItem('copabolao_users_list', JSON.stringify(next));
                    return next;
                  });

                  saveUserToDb(updatedUser); // Securely propagate changes to cloud
                }}
                onLogout={() => {
                  setSessionUser(null);
                  localStorage.removeItem('copabolao_session_user');
                }}
                onDeleteAccount={handleDeleteAccount}
                predictions={predictions}
                matches={matches}
                groups={groups}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Match Comments Overlay Panel (Chat) */}
      <AnimatePresence>
        {activeMatchForComments && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed inset-x-0 bottom-0 top-0 z-[100] bg-slate-950 max-w-md mx-auto flex flex-col h-full overflow-hidden"
          >
            <MatchCommentSection
              match={activeMatchForComments}
              comments={comments.filter((c) => c.matchId === activeMatchForComments.id)}
              currentUser={currentUser}
              onAddComment={handleAddComment}
              onToggleReaction={handleToggleReaction}
              onClose={() => setActiveMatchForComments(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group Create/Join Modal Overlay */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <CreateGroupModal
            onClose={() => setIsCreateModalOpen(false)}
            onCreateGroup={handleCreateGroup}
            onJoinGroup={handleJoinGroup}
            initialTab={createModalInitialTab}
          />
        )}
      </AnimatePresence>

      {/* Group Delete Confirm Modal Overlay */}
      <AnimatePresence>
        {showGroupDeleteModal && activeGroup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative space-y-4"
            >
              <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="text-center">
                <h3 className="text-base font-extrabold text-slate-100">Excluir Bolão Permanentemente?</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Você tem certeza de que deseja apagar o bolão <strong className="text-rose-300">"{activeGroup.name}"</strong>? Esta ação é irreversível e excluirá todos os palpites, comentários e o ranking dos membros do bolão.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowGroupDeleteModal(false)}
                  className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl border border-slate-700/50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    setShowGroupDeleteModal(false);
                    await handleDeleteGroup(activeGroup.id);
                  }}
                  className="flex-1 py-2 px-3 bg-rose-500 hover:bg-rose-600 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer"
                >
                  Excluir de Vez ⚽
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group Leave Confirm Modal Overlay */}
      <AnimatePresence>
        {showGroupLeaveModal && activeGroup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative space-y-4"
            >
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="text-center">
                <h3 className="text-base font-extrabold text-slate-100">Deseja Sair do Bolão?</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed text-left">
                  Você tem certeza de que deseja sair de <strong className="text-amber-300">"{activeGroup.name}"</strong>? 
                </p>
                <p className="text-xs font-bold text-rose-455 mt-2 bg-rose-950/20 py-2 px-2.5 rounded-lg border border-rose-900/10 leading-relaxed text-left">
                  ⚠️ Atenção: ao sair do bolão, você abandonará o grupo e perderá de vez a chance de disputar o ranking e ganhar o prêmio acumulado com seus amigos!
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowGroupLeaveModal(false)}
                  className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-755 text-slate-300 font-bold text-xs rounded-xl border border-slate-705 transition cursor-pointer"
                >
                  Continuar no Grupo
                </button>
                <button
                  onClick={async () => {
                    setShowGroupLeaveModal(false);
                    await handleLeaveGroup(activeGroup.id);
                  }}
                  className="flex-1 py-1.5 px-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer active:scale-95"
                >
                  Sair do Grupo 👋
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* App Shell Footer Information */}
      <footer className="py-8 bg-slate-950 text-slate-600 text-[11px] text-center max-w-md mx-auto px-4 border-t border-slate-900/60 leading-relaxed mb-6">
        <p className="font-semibold text-slate-500">Desenvolvido com carinho por Dartanhan & Amigos</p>
        <p className="mt-1">PWA Responsivo ideal para iOS Safari (Adicionar à Tela de Início), Android Chrome e Web</p>
      </footer>

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasUnreadComments={matches.some(m => {
          if (activeGroup && m.league !== activeGroup.league) return false;
          
          const matchComments = comments.filter(c => c.matchId === m.id);
          if (matchComments.length === 0) return false;
          const lastReadTime = lastOpenedCommentsAt[m.id];
          if (!lastReadTime) return true;
          return matchComments.some(c => new Date(c.timestamp).getTime() > new Date(lastReadTime).getTime());
        })}
      />
    </div>
  );
}
