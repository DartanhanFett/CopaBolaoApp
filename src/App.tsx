import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Trophy, Users, Star, MessageSquare, ChevronLeft, Calendar, HelpCircle, UserCheck, Plus, Sparkles, BookOpen, AlertCircle, Share2, Info, Copy, Trash2, LogOut, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'react-hot-toast';

// Data and components
import { INITIAL_USERS, INITIAL_MATCHES, INITIAL_GROUPS, INITIAL_COMMENTS } from './data/initialData';
import { INITIAL_PREDICTIONS } from './data/initialPredictions';
import BottomNav from './components/BottomNav';
import GroupList from './components/GroupList';
import MatchList from './components/MatchList';
import Leaderboard from './components/Leaderboard';
import MatchCommentSection from './components/MatchCommentSection';
import CreateGroupModal from './components/CreateGroupModal';
import SimulatorPanel from './components/SimulatorPanel';
import AuthScreen from './components/AuthScreen';
import UserProfile from './components/UserProfile';
import WelcomeModal from './components/WelcomeModal';
import NewsTab from './components/NewsTab';
import { Group, Match, Prediction, User, Comment, AppEvent } from './types';
import { apiFetch, apiJson } from './lib/api';
import { getSupabase } from '../lib/supabase/client';
import { DEFAULT_GROUP, DEFAULT_GROUP_VISIBLE } from './data/constants';
import { encodePredictionMessage } from './utils/predictionMessage';
import { requestNotificationPermission, showNotification } from './utils/notifications';

const DEFAULT_GROUP_CODE = DEFAULT_GROUP.code;

export default function App() {
  // Session user is derived from Supabase auth + /api/auth/me — never persisted standalone in localStorage.
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [users, setUsers] = useState<User[]>(() => {
    // Cache only — populated by /api/db/sync from Supabase. Don't fall back to mocks
    // because they leak fake names into the leaderboard ("Lucas", "Bia"...) when the
    // server returns nothing.
    // One-time migration: if the cached list contains the legacy mock IDs (u1/u2/u3...),
    // wipe it. Real Supabase users use email as id, so any 'u<digit>' is stale data.
    const saved = localStorage.getItem('copabolao_users_list');
    if (!saved) return [];
    try {
      const parsed: User[] = JSON.parse(saved);
      const hasLegacyMock = parsed.some((u) => /^u\d+$/i.test(u.id));
      if (hasLegacyMock) {
        localStorage.removeItem('copabolao_users_list');
        return [];
      }
      return parsed;
    } catch {
      return [];
    }
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

  // Activity feed state. Server populates copabolao_events via /api/db/sync;
  // we mirror it here for rendering and to drive the unread-news badge.
  const [appEvents, setAppEvents] = useState<AppEvent[]>([]);
  // Per-user last-read timestamp for the news tab. localStorage only — no need
  // to round-trip Supabase for something this ephemeral.
  const [newsLastReadAt, setNewsLastReadAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem('copabolao_news_last_read') || null;
    } catch {
      return null;
    }
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

  // Defensive default: if /api/auth/me hasn't populated sessionUser yet, render with
  // a placeholder rather than crashing on null. The auth gate above this component
  // ensures we never actually render this branch in normal flow.
  const currentUser: User = sessionUser || { id: '', name: '', avatar: '', email: '' };

  // --- Supabase Persistence Helper Triggers (Proxy REST) ---
  //
  // All save helpers return a Promise<{ ok: boolean; message?: string }> instead
  // of swallowing failures. Call sites that built optimistic UI on top of the
  // write *must* await and roll back on `ok === false`, otherwise the UI ends
  // up green ("palpite enviado!") while the row never reached Supabase. Toasts
  // are surfaced by callers, not here, because the right copy depends on what
  // the user just tried to do (palpitar / comentar / reagir / etc).
  type SaveResult = { ok: boolean; message?: string };
  const persistSave = async (path: string, body: unknown, label: string): Promise<SaveResult> => {
    try {
      const data = await apiJson<{ success?: boolean; message?: string }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (data?.success) return { ok: true };
      return { ok: false, message: data?.message };
    } catch (e: any) {
      console.error(`Falha ao salvar (${label}):`, e);
      return { ok: false, message: e?.message };
    }
  };

  const savePredictionToDb = (pred: Prediction): Promise<SaveResult> =>
    persistSave("/api/db/predictions", pred, "palpite");

  const saveCommentToDb = (comment: Comment): Promise<SaveResult> =>
    persistSave("/api/db/comments", comment, "comentário");

  const saveGroupToDb = (group: Group): Promise<SaveResult> =>
    persistSave("/api/db/groups", group, "bolão");

  const deleteGroupFromDb = async (groupId: string): Promise<boolean> => {
    try {
      const data = await apiJson<{ success?: boolean }>("/api/db/groups/delete", {
        method: "POST",
        body: JSON.stringify({ groupId, userId: currentUser?.id })
      });
      return !!data.success;
    } catch (e) {
      console.error("Falha ao deletar grupo no Supabase:", e);
      return false;
    }
  };

  const deleteUserFromDb = async (targetUserId: string): Promise<boolean> => {
    try {
      const data = await apiJson<{ success?: boolean }>("/api/db/users/delete", {
        method: "POST",
        body: JSON.stringify({ targetUserId, requesterUserId: currentUser?.id })
      });
      return !!data.success;
    } catch (e) {
      console.error("Falha ao deletar usuário no Supabase:", e);
      return false;
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const data = await apiJson<{ success?: boolean; message?: string }>(
        "/api/db/groups/delete",
        {
          method: "POST",
          body: JSON.stringify({ groupId, userId: currentUser?.id })
        }
      );

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
      const data = await apiJson<{ success?: boolean; message?: string }>(
        "/api/db/users/delete",
        {
          method: "POST",
          body: JSON.stringify({ targetUserId: targetId, requesterUserId: currentUser.id })
        }
      );

      if (data.success) {
        toast.success(data.message || "Sua conta foi excluída com sucesso.");
        setUsers(prev => {
          const updated = prev.filter(u => u.id !== targetId);
          localStorage.setItem('copabolao_users_list', JSON.stringify(updated));
          return updated;
        });
        await getSupabase()?.auth.signOut();
        setSessionUser(null);
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
      await getSupabase()?.auth.signOut();
      setSessionUser(null);
      toast.success("Sua conta foi excluída localmente devido a problemas de rede.");
    }
  };

  const saveUserToDb = (user: User): Promise<SaveResult> =>
    persistSave("/api/db/users", user, "perfil");

  const saveMatchToDb = (match: Match): Promise<SaveResult> =>
    persistSave("/api/db/matches", match, "partida");

  // Active navigation states
  const [activeTab, setActiveTab] = useState<'groups' | 'matches' | 'ranking' | 'profile' | 'news'>('groups');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null); // No active bolão until the user picks one — avoids defaulting to a stale 'g1' seed.
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
    // Opening a chat is a strong "I care about updates" signal — request
    // notification permission opportunistically. Browsers ignore the call if
    // permission is already granted/denied, so this is safe to fire repeatedly.
    requestNotificationPermission().catch(() => {});
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

  /**
   * Reconcile a local list with the server's authoritative view.
   *
   * The server's list is treated as the source of truth: anything missing from
   * the server response is dropped from the merged result. Locally-created
   * records that haven't propagated yet are preserved by `keepLocal` — pass a
   * predicate that returns `true` for ids that are still in-flight (e.g.
   * client-generated `custom_match_*` ids). Without that callback, every local
   * delete that the server confirms also propagates here, which is what we want
   * for groups/users/events. The previous version preferred the union, so a
   * server-side delete never made it back to the client until a hard reload.
   */
  const reconcileWithServer = <T extends { id: string }>(
    local: T[],
    server: T[],
    keepLocal?: (id: string) => boolean,
  ): T[] => {
    const serverIds = new Set(server.map((it) => it.id));
    const out: T[] = [...server];
    if (keepLocal) {
      for (const item of local) {
        if (!serverIds.has(item.id) && keepLocal(item.id)) out.push(item);
      }
    }
    return out;
  };

  const syncData = async (silent = true) => {
    try {
      if (!silent) setIsSyncing(true);
      const [matchesRes, usersRes, predictionsRes, commentsRes, groupsRes, eventsRes] = await Promise.all([
        apiJson<any>("/api/db/sync?table=copabolao_matches"),
        apiJson<any>("/api/db/sync?table=copabolao_users"),
        apiJson<any>("/api/db/sync?table=copabolao_predictions"),
        apiJson<any>("/api/db/sync?table=copabolao_comments"),
        apiJson<any>("/api/db/sync?table=copabolao_groups"),
        apiJson<any>("/api/db/sync?table=copabolao_events"),
      ]);

      // Reconcile against the server's canonical view. Local-only records
      // (custom matches in flight, optimistic writes) are preserved via the
      // `keepLocal` predicate. Everything else: if the server didn't return
      // it, it's gone — that way deletes on the backend reach the client on
      // the next sync instead of zombie-living until a hard reload.
      if (matchesRes.success) {
        setMatches((prev) =>
          reconcileWithServer(prev, matchesRes.data || [], (id) => id.startsWith("custom_match_")),
        );
      }
      if (usersRes.success) {
        setUsers((prev) => reconcileWithServer(prev, usersRes.data || []));
      }
      if (predictionsRes.success) {
        // Predictions are server-canonical and the server's view is authoritative.
        // Replace as long as we got a non-empty list (an empty array could mean
        // a transient RLS hiccup — don't blank the UI in that case).
        if ((predictionsRes.data || []).length > 0) {
          setPredictions((prev) =>
            reconcileWithServer(prev, predictionsRes.data, (id) => id.startsWith("temp_")),
          );
        }
      }
      if (commentsRes.success) {
        if ((commentsRes.data || []).length > 0) {
          setComments((prev) =>
            reconcileWithServer(prev, commentsRes.data, (id) => id.startsWith("temp_")),
          );
        }
      }
      if (groupsRes.success) {
        setGroups((prev) => reconcileWithServer(prev, groupsRes.data || []));
      }
      if (eventsRes && eventsRes.success) {
        // Events are append-only on the server; the server is canonical.
        setAppEvents((prev) => reconcileWithServer(prev, eventsRes.data || []));
      }

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
    if (!sessionUser) return;

    // Initial pull.
    syncData(true);

    // Realtime: subscribe to postgres_changes on the 5 tables. Any event triggers
    // a debounced re-sync — much cheaper than re-fetching everything per change.
    const supabase = getSupabase();
    let resyncTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedResync = () => {
      if (resyncTimer) clearTimeout(resyncTimer);
      resyncTimer = setTimeout(() => syncData(true), 400);
    };

    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      channel = supabase
        .channel("copabolao-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "copabolao_predictions" }, debouncedResync)
        .on("postgres_changes", { event: "*", schema: "public", table: "copabolao_comments" }, debouncedResync)
        .on("postgres_changes", { event: "*", schema: "public", table: "copabolao_groups" }, debouncedResync)
        .on("postgres_changes", { event: "*", schema: "public", table: "copabolao_matches" }, debouncedResync)
        .on("postgres_changes", { event: "*", schema: "public", table: "copabolao_users" }, debouncedResync)
        .subscribe();
    }

    // Heartbeat fallback: catches missed events (network blips, sleeping tab waking up).
    // 60s instead of the previous 25s — Realtime carries the live load now.
    const heartbeat = setInterval(() => syncData(true), 60_000);

    return () => {
      if (resyncTimer) clearTimeout(resyncTimer);
      clearInterval(heartbeat);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [sessionUser]);

  // Invite & Sharing States
  // Read the invite code from the URL on first mount, with a localStorage fallback.
  // The fallback matters because OAuth providers (Google, magic link) round-trip the
  // browser through their own domains and can strip query params. AuthScreen mirrors
  // the code to localStorage right before kicking off the sign-in flow.
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('invite');
      if (fromUrl) return fromUrl.trim().toUpperCase();
      const fromStorage = localStorage.getItem('copabolao_pending_invite');
      return fromStorage ? fromStorage.trim().toUpperCase() : null;
    } catch {
      return null;
    }
  });
  const [copiedActiveCode, setCopiedActiveCode] = useState(false);

  // Strips the invite code from both the URL bar and the localStorage fallback.
  // Called once the invite flow finishes (accepted, declined, or invalid) so it
  // doesn't keep haunting future sessions on the same browser.
  const clearInviteQueryParam = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      console.error("Erro ao limpar convite da URL:", e);
    }
    try { localStorage.removeItem('copabolao_pending_invite'); } catch {}
  };

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalInitialTab, setCreateModalInitialTab] = useState<'create' | 'join'>('create');
  
  // Admin status is determined by the server during authentication and stored in the session user.
  // This prevents hardcoding admin emails in client-side code.
  const isAdmin = !!(sessionUser?.isAdmin);

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isWelcomeJoining, setIsWelcomeJoining] = useState(false);

  // Welcome modal: show on first login when the user has no group memberships yet,
  // unless they already dismissed it (tracked per-user-per-browser via localStorage).
  const welcomeDismissedKey = sessionUser ? `copabolao_welcome_dismissed_${sessionUser.id}` : '';
  const userGroupCount = sessionUser
    ? groups.filter((g) => g.members?.includes(sessionUser.id)).length
    : 0;
  const welcomeAlreadyDismissed =
    !!welcomeDismissedKey && localStorage.getItem(welcomeDismissedKey) === '1';
  // Suppress the "join the public Geral" modal whenever there's a pending invite —
  // the friend's invite card is far more relevant for someone who arrived via link,
  // and stacking both makes the UX confusing.
  // Also suppress it entirely when the public default group is disabled
  // (DEFAULT_GROUP_VISIBLE = false). See constants.ts for the rationale.
  const showWelcomeModal =
    DEFAULT_GROUP_VISIBLE
    && !!sessionUser
    && isFirstSyncDone
    && userGroupCount === 0
    && !welcomeAlreadyDismissed
    && !pendingInviteCode;

  const handleWelcomeAccept = async () => {
    setIsWelcomeJoining(true);
    try {
      const success = await handleJoinGroup(DEFAULT_GROUP_CODE);
      if (success) {
        toast.success('Bem-vindo! Você entrou no bolão Geral Copa 2026.');
        if (welcomeDismissedKey) localStorage.setItem(welcomeDismissedKey, '1');
        setActiveTab('matches');
      } else {
        toast.error(
          'Bolão público ainda não foi configurado. Avise o administrador (código: ' +
            DEFAULT_GROUP_CODE + ').'
        );
        if (welcomeDismissedKey) localStorage.setItem(welcomeDismissedKey, '1');
      }
    } finally {
      setIsWelcomeJoining(false);
    }
  };

  const handleWelcomeDecline = () => {
    if (welcomeDismissedKey) localStorage.setItem(welcomeDismissedKey, '1');
    // Force a re-render by toggling a state — simplest is to flip isWelcomeJoining.
    setIsWelcomeJoining((v) => !v);
    setIsWelcomeJoining((v) => !v);
  };

  const handleOpenCreateModal = (tab: 'create' | 'join' = 'create') => {
    setCreateModalInitialTab(tab);
    setIsCreateModalOpen(true);
  };

  // Sync state initially from database
  useEffect(() => {
    if (!sessionUser) return;
    apiJson<any>("/api/db/sync")
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
  }, [useRealFootball, sessionUser]);

  // Fetch real football fixtures
  useEffect(() => {
    setRealFootballLoading(true);
    apiJson<any>("/api/football/fixtures")
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
    let isNewPrediction = false;
    let prevSnapshot: Prediction[] = [];

    setPredictions((prev) => {
      prevSnapshot = prev;
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
        return copy;
      } else {
        isNewPrediction = true;
        targetPred = {
          id: `pred_${activeGroupId}_${currentUser.id}_${matchId}`, // Composite ID unique per group, user & match
          userId: currentUser.id,
          matchId,
          homeScore,
          awayScore,
          groupId: activeGroupId
        };
        return [...prev, targetPred];
      }
    });

    // Persist + roll back the optimistic state on failure. We snapshot above
    // and replay it instead of trying to splice out targetPred — handles both
    // create and update cleanly with a single restore path.
    void savePredictionToDb(targetPred!).then((res) => {
      if (!res.ok) {
        setPredictions(prevSnapshot);
        toast.error(res.message || "Não consegui salvar seu palpite. Tenta de novo.");
      }
    });

    // Post a system-style chat message announcing the prediction. Only fire on
    // first save (not on score edits) to avoid spam — if someone tweaks their
    // pick, the row in "Ver Palpites do Grupo" already reflects it.
    if (isNewPrediction && activeGroupId) {
      const predictionMsg: Comment = {
        id: `cpred_${activeGroupId}_${currentUser.id}_${matchId}`,
        matchId,
        // Same scoping rule as human comments — keeps prediction announcements
        // inside the bolão they were posted from.
        groupId: activeGroupId,
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        text: encodePredictionMessage({ homeScore, awayScore, groupId: activeGroupId }),
        timestamp: new Date().toISOString(),
        reactions: [],
      };
      setComments((prev) => {
        // Idempotency: if the same id already exists locally (e.g. quick double-click),
        // don't duplicate. Server upsert handles the same case via primary key.
        if (prev.some((c) => c.id === predictionMsg.id)) return prev;
        return [...prev, predictionMsg];
      });
      // Best-effort: the predictionMsg is a courtesy chat post. If it fails to
      // save we don't roll back the prediction itself (which has already been
      // confirmed above), but we do roll back the local chat row so the next
      // sync doesn't show the message as missing on other devices.
      void saveCommentToDb(predictionMsg).then((res) => {
        if (!res.ok) {
          setComments((prev) => prev.filter((c) => c.id !== predictionMsg.id));
        }
      });
    }
  };

  const handleAddComment = (matchId: string, text: string) => {
    const newComment: Comment = {
      id: `c_${Date.now()}`,
      matchId,
      // Scope to the active bolão so the chat doesn't bleed into other groups
      // that share the same match (e.g. World Cup 2026 fixtures appear in every
      // bolão of that league). Null only happens if a user somehow opens chat
      // without a selected group — defensive default.
      groupId: activeGroupId ?? null,
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      text,
      timestamp: new Date().toISOString(),
      reactions: [],
    };
    let prevComments: Comment[] = [];
    setComments((prev) => {
      prevComments = prev;
      return [...prev, newComment];
    });
    void saveCommentToDb(newComment).then((res) => {
      if (!res.ok) {
        setComments(prevComments);
        toast.error(res.message || "Não consegui enviar seu comentário. Tenta de novo.");
        return;
      }
    });

    // Also mark as read instantly to keep sync
    const now = new Date().toISOString();
    setLastOpenedCommentsAt((prev) => {
      const next = { ...prev, [matchId]: now };
      localStorage.setItem('copabolao_comments_read_timestamps', JSON.stringify(next));
      return next;
    });
  };

  const handleToggleReaction = (commentId: string, emoji: string) => {
    let prevComments: Comment[] = [];
    let updatedTarget: Comment | null = null;
    setComments((prev) => {
      prevComments = prev;
      return prev.map((comment) => {
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
        updatedTarget = updatedComment;
        return updatedComment;
      });
    });

    if (updatedTarget) {
      // Reactions are low-stakes — if the save fails, roll back silently and
      // surface a quiet toast. We don't want the UI flickering each time
      // someone double-taps an emoji.
      void saveCommentToDb(updatedTarget).then((res) => {
        if (!res.ok) {
          setComments(prevComments);
          toast.error("Reação não pegou. Tenta de novo.");
        }
      });
    }
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
    void saveGroupToDb(newGroup).then((res) => {
      if (!res.ok) {
        // Critical create — if the server rejects, the user thinks they have
        // a group that nobody else can find. Roll back and explain.
        setGroups((prev) => prev.filter((g) => g.id !== newGroup.id));
        if (activeGroupId === newGroup.id) setActiveGroupId(null);
        toast.error(res.message || "Não consegui criar o bolão. Tenta de novo.");
      }
    });

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
      void saveMatchToDb(newMatch).then((res) => {
        if (!res.ok) {
          // Custom match save failed — drop it from local state so the
          // bolão's match list doesn't show a phantom row.
          setMatches((prev) => prev.filter((m) => m.id !== newMatch.id));
          toast.error(res.message || "Bolão criado, mas o jogo personalizado não salvou.");
        }
      });
    }

    setActiveGroupId(newGroup.id);
    setActiveTab('matches'); // open matches instantly for predictions
  };

  const handleJoinGroup = async (code: string): Promise<boolean> => {
    const cleanCode = code.trim().toUpperCase();

    // Server-side join (validates membership uniqueness, returns the canonical group row).
    try {
      const data = await apiJson<{ success?: boolean; group?: any; message?: string }>(
        "/api/groups/join",
        { method: "POST", body: JSON.stringify({ code: cleanCode }) }
      );
      if (data.success && data.group) {
        const updatedGroup: Group = {
          id: data.group.id,
          name: data.group.name,
          description: data.group.description,
          league: data.group.league,
          entryFee: Number(data.group.entry_fee || 0),
          creatorId: data.group.creator_id,
          code: data.group.code,
          members: data.group.members || [],
          isPrivate: data.group.is_private === true,
        };
        setGroups((prev) => {
          const exists = prev.find((g) => g.id === updatedGroup.id);
          if (exists) return prev.map((g) => (g.id === updatedGroup.id ? updatedGroup : g));
          return [...prev, updatedGroup];
        });
        setActiveGroupId(updatedGroup.id);
        return true;
      }
      return false;
    } catch (e: any) {
      // Fallback to local-state join if server is unreachable.
      console.warn("Join via server falhou, tentando local:", e?.message);
      const matched = groups.find((g) => g.code.trim().toUpperCase() === cleanCode);
      if (!matched) return false;
      if (matched.members.includes(currentUser.id)) return false;
      const updatedGroup = { ...matched, members: [...matched.members, currentUser.id] };
      setGroups((prev) => prev.map((g) => (g.id === matched.id ? updatedGroup : g)));
      saveGroupToDb(updatedGroup);
      setActiveGroupId(matched.id);
      return true;
    }
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
          // Score predictions server-side (admin-only endpoint).
          apiFetch("/api/predictions/score", {
            method: "POST",
            body: JSON.stringify({ matchId }),
          }).catch((e) => console.error("Falha ao calcular pontos:", e));
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

  const handleResetSimulator = async () => {
    // Calls the admin-only /api/db/reset endpoint, which ONLY resets matches +
    // wipes predictions. Groups, comments, and users are preserved so we don't blow
    // away other people's data in shared environments.
    //
    // The server requires the typed phrase below verbatim. We mirror that gate here
    // so a misclick on the simulator button doesn't even reach the API. Keep the
    // string in sync with RESET_CONFIRMATION_PHRASE in server.ts.
    const RESET_PHRASE = "RESETAR PALPITES E JOGOS";
    const typed = window.prompt(
      `⚠️ Isso apaga TODAS as partidas e TODOS os palpites de TODOS os bolões.\n\nDigite exatamente para confirmar:\n${RESET_PHRASE}`
    );
    if (typed === null) return; // user cancelled
    if (typed.trim() !== RESET_PHRASE) {
      toast.error("Texto de confirmação não bateu. Reset cancelado.");
      return;
    }

    try {
      const data = await apiJson<{ success?: boolean; matches?: Match[]; message?: string }>(
        "/api/db/reset",
        {
          method: "POST",
          body: JSON.stringify({ confirmationPhrase: typed.trim() }),
        }
      );
      if (data.success && data.matches) {
        setMatches(data.matches);
        setPredictions([]); // matches the server-side wipe
        toast.success("Partidas resetadas. Seus bolões foram preservados.");
      } else {
        toast.error(data.message || "Não foi possível resetar as partidas.");
      }
    } catch (e: any) {
      console.error("Falha ao resetar simulador:", e);
      toast.error("Falha de rede ao resetar.");
    }
    // After the reset, re-sync to refresh state from the source of truth.
    syncData(true);
  };

  // --- Bootstrap session from Supabase + /api/auth/me ---
  // The Supabase client persists session in localStorage; on mount we read it,
  // then ask the server who we are (so isAdmin is set authoritatively from ADMIN_EMAILS).
  useEffect(() => {
    const supabase = getSupabase();

    const refreshFromServer = async () => {
      try {
        const me = await apiJson<{ user: User | null }>("/api/auth/me");
        if (me?.user) {
          setSessionUser(me.user);
          // Mirror in users list for leaderboard rendering
          setUsers((prev) => {
            const exists = prev.find((u) => u.id === me.user!.id);
            if (exists) {
              const next = prev.map((u) => (u.id === me.user!.id ? me.user! : u));
              localStorage.setItem('copabolao_users_list', JSON.stringify(next));
              return next;
            }
            const next = [...prev, me.user!];
            localStorage.setItem('copabolao_users_list', JSON.stringify(next));
            return next;
          });
          // Note: we no longer silently auto-join the default group on login.
          // Instead, WelcomeModal offers the user an explicit opt-in below.
        } else {
          setSessionUser(null);
        }
      } catch (e: any) {
        // 401 = no session yet; anything else is a server error we just log.
        if (e?.status !== 401) console.error("Falha ao buscar /api/auth/me:", e);
        setSessionUser(null);
      } finally {
        setAuthChecked(true);
      }
    };

    refreshFromServer();

    if (supabase) {
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, _session) => {
        refreshFromServer();
      });
      return () => subscription.subscription.unsubscribe();
    }
  }, []);

  // Auto-mark the news tab as read once it's been visible for a moment. We
  // wait a beat (rather than firing immediately on tab change) so that someone
  // who taps the tab and bounces away by mistake still sees their unread badge
  // when they come back. If they actually stay, the timestamp updates and the
  // badge clears on the next render.
  useEffect(() => {
    if (activeTab !== 'news') return;
    const t = setTimeout(() => {
      const now = new Date().toISOString();
      setNewsLastReadAt(now);
      try { localStorage.setItem('copabolao_news_last_read', now); } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [activeTab]);

  // Per-match unread comment counts, scoped to the active bolão. Computed once
  // here and threaded into MatchList + BottomNav so badges show "3" instead of
  // a generic "•". Legacy comments without a groupId stay visible everywhere
  // (preserves chat history from before group scoping landed).
  const unreadByMatch = useMemo(() => {
    const out = new Map<string, number>();
    for (const m of matches) {
      const matchComments = comments.filter(
        (c) => c.matchId === m.id && (!c.groupId || c.groupId === activeGroupId)
      );
      if (matchComments.length === 0) continue;
      const lastRead = lastOpenedCommentsAt[m.id];
      const lastReadMs = lastRead ? new Date(lastRead).getTime() : 0;
      let unread = 0;
      for (const c of matchComments) {
        if (new Date(c.timestamp).getTime() > lastReadMs) unread++;
      }
      // Skip the user's own messages — you don't get notified about your own typing.
      // Filter is approximate (only by userId, doesn't handle prediction system messages
      // separately), but good enough to avoid the "you typed 1 message → badge says 1" surprise.
      const ownNew = matchComments.filter(
        (c) => c.userId === currentUser.id && new Date(c.timestamp).getTime() > lastReadMs
      ).length;
      const externalUnread = unread - ownNew;
      if (externalUnread > 0) out.set(m.id, externalUnread);
    }
    return out;
  }, [matches, comments, lastOpenedCommentsAt, activeGroupId, currentUser.id]);

  // (Removed: totalUnread per-tab badge. All cross-tab notifications are
  // funneled through the unified Novidades feed below — keeping a separate
  // comment-only counter on Bolões/Jogos was redundant noise.)

  // Unread events for the news tab. Same scoping rule as the NewsTab itself:
  // events from the active bolão (or globally-scoped) that arrived after the
  // last time the user opened the tab.
  const unreadNewsCount = useMemo(() => {
    const lastReadMs = newsLastReadAt ? new Date(newsLastReadAt).getTime() : 0;
    let count = 0;
    for (const e of appEvents) {
      // Skip events the user themselves caused — your own action shouldn't
      // ping you. Also skip events from other bolões.
      if (e.actorId === currentUser.id) continue;
      if (activeGroup && e.groupId && e.groupId !== activeGroup.id) continue;
      if (new Date(e.createdAt).getTime() > lastReadMs) count++;
    }
    return count;
  }, [appEvents, newsLastReadAt, activeGroup, currentUser.id]);

  // Track which comment IDs we've already shown / seen, so we don't re-notify
  // for the same comment on every re-render. Ref instead of state because we
  // don't want to re-trigger the effect when this set updates.
  const seenCommentIdsRef = useRef<Set<string>>(new Set());
  // Remember whether this effect has run once. On the first render after login
  // the comments list arrives all at once — we don't want to spam a flood of
  // "new comment" notifications for messages that are days old.
  const notificationsBootstrappedRef = useRef(false);

  useEffect(() => {
    if (!sessionUser) return;

    // First pass: just remember everything that's already there. No notifications.
    if (!notificationsBootstrappedRef.current) {
      for (const c of comments) seenCommentIdsRef.current.add(c.id);
      notificationsBootstrappedRef.current = true;
      return;
    }

    // Subsequent passes: any comment id we haven't seen is "new since last render".
    // Notify only when:
    //   - it's not from the current user (don't notify yourself about yourself),
    //   - it's scoped to the active bolão (or legacy unscoped),
    //   - the chat for that match isn't currently open in foreground,
    //   - and the tab is hidden (showNotification handles the visibility check).
    const newOnes = comments.filter((c) => !seenCommentIdsRef.current.has(c.id));
    for (const c of newOnes) {
      seenCommentIdsRef.current.add(c.id);
      if (c.userId === currentUser.id) continue;
      if (c.groupId && c.groupId !== activeGroupId) continue;
      if (activeMatchForComments?.id === c.matchId) continue;

      const match = matches.find((m) => m.id === c.matchId);
      const matchLabel = match
        ? `${match.homeTeam.name} x ${match.awayTeam.name}`
        : "Novo comentário";
      showNotification({
        title: `${c.userName} comentou em ${matchLabel}`,
        body: c.text.length > 120 ? `${c.text.slice(0, 117)}…` : c.text,
        matchId: c.matchId,
        tag: `match:${c.matchId}`,
      });
    }
  }, [comments, sessionUser, currentUser.id, activeGroupId, activeMatchForComments, matches]);

  // When the user clicks a system notification (handler in utils/notifications.ts
  // dispatches a CustomEvent), open the corresponding match chat.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.matchId) return;
      const match = matches.find((m) => m.id === detail.matchId);
      if (match) handleOpenComments(match);
    };
    window.addEventListener("copabolao:open-match-chat", onOpen);
    return () => window.removeEventListener("copabolao:open-match-chat", onOpen);
  }, [matches]);

  if (!authChecked) {
    // Brief splash while we figure out who is logged in
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Carregando sua conta...</span>
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    return <AuthScreen onLoginSuccess={() => { /* onAuthStateChange will refresh sessionUser */ }} />;
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

      {showWelcomeModal && (
        <WelcomeModal
          onAccept={handleWelcomeAccept}
          onDecline={handleWelcomeDecline}
          isLoading={isWelcomeJoining}
        />
      )}

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
              userTimezone={sessionUser?.timezone || 'auto'}
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
                    onClick={async () => {
                      const success = await handleJoinGroup(pendingInviteCode);
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

        {/* Selected Group Header Context Card if a group is open */}
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
                    isAdmin) ? (
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

            {/* Sub-tab quick nav was here — only made sense when this card showed on the
                groups tab. Now the card only renders on matches/ranking, so this block
                would never trigger. Removed to keep the layout simple. */}
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
                unreadMatchIds={Array.from(unreadByMatch.keys())}
                unreadCountByMatch={unreadByMatch}
                onMarkAllCommentsAsRead={handleMarkAllCommentsAsRead}
                userTimezone={sessionUser?.timezone || 'auto'}
              />
            ) : activeTab === 'ranking' ? (
              <Leaderboard
                activeGroup={activeGroup}
                matches={matches}
                predictions={predictions}
                users={users}
                currentUserId={currentUser.id}
              />
            ) : activeTab === 'news' ? (
              <NewsTab
                events={appEvents}
                users={users}
                activeGroup={activeGroup}
                currentUserId={currentUser.id}
                lastReadAt={newsLastReadAt}
              />
            ) : (
              <UserProfile
                currentUser={currentUser}
                onUpdateProfile={(updatedName, updatedAvatar, updatedTimezone) => {
                  const updatedUser = {
                    ...currentUser,
                    name: updatedName,
                    avatar: updatedAvatar,
                    ...(updatedTimezone !== undefined ? { timezone: updatedTimezone } : {}),
                  };
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
                onLogout={async () => {
                  await getSupabase()?.auth.signOut();
                  setSessionUser(null);
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
              comments={comments.filter((c) =>
                c.matchId === activeMatchForComments.id
                // Group-scope chat: only show messages tagged with this bolão's id.
                // Legacy rows (groupId null/undefined, pre-migration) appear in every
                // group as a shared past — we don't want to hide chat history.
                && (!c.groupId || c.groupId === activeGroupId)
              )}
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
        unreadNewsCount={unreadNewsCount}
      />
    </div>
  );
}
