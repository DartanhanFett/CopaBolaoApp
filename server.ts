import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { INITIAL_USERS, INITIAL_MATCHES, INITIAL_GROUPS, INITIAL_COMMENTS } from "./src/data/initialData";
import { calculatePredictionPoints } from "./src/utils/rules";
import { DEFAULT_GROUP } from "./src/data/constants";

dotenv.config();

// ─── Zod Validation Schemas ─────────────────────────────────────────────────

const footballFixturesQuerySchema = z.object({}).optional();

const aiSuggestScoreBodySchema = z.object({
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
});

const dbSyncQuerySchema = z.object({
  table: z.enum([
    "copabolao_matches",
    "copabolao_users",
    "copabolao_groups",
    "copabolao_predictions",
    "copabolao_comments",
  ]).optional(),
});

const dbResetBodySchema = z.object({
  confirmationToken: z.string().optional(),
});

const otpSendBodySchema = z.object({
  email: z.string().email().min(1),
  isSignUp: z.boolean().optional(),
  name: z.string().optional(),
});

const otpVerifyBodySchema = z.object({
  email: z.string().email().min(1),
  token: z.string().min(6).max(6),
  isSignUp: z.boolean().optional(),
  name: z.string().optional(),
  avatar: z.string().optional(),
});

const authLoginBodySchema = z.object({
  email: z.string().email().min(1),
});

const authRegisterBodySchema = z.object({
  email: z.string().email().min(1),
  name: z.string().min(1),
  avatar: z.string().optional(),
});

const dbUsersUpsertBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().min(1),
});

const dbPredictionsUpsertBodySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  matchId: z.string().min(1),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  pointsEarned: z.number().optional(),
  groupId: z.string().nullable().optional(),
});

const dbGroupsUpsertBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  league: z.string().min(1),
  entryFee: z.number().min(0),
  creatorId: z.string().min(1),
  code: z.string().min(1),
  members: z.array(z.string()),
  isPrivate: z.boolean().optional(),
});

const dbCommentsUpsertBodySchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  userAvatar: z.string().min(1),
  text: z.string().min(1),
  timestamp: z.string().min(1),
  reactions: z.array(z.object({
    emoji: z.string(),
    count: z.number().int().min(0),
    users: z.array(z.string()),
  })),
});

const dbMatchesUpsertBodySchema = z.object({
  id: z.string().min(1),
  homeTeam: z.object({
    name: z.string(),
    code: z.string(),
    flagUrl: z.string(),
  }),
  awayTeam: z.object({
    name: z.string(),
    code: z.string(),
    flagUrl: z.string(),
  }),
  date: z.string().min(1),
  status: z.enum(["upcoming", "live", "completed"]),
  homeScore: z.number().optional().nullable(),
  awayScore: z.number().optional().nullable(),
  scorers: z.array(z.string()).optional(),
  league: z.string().min(1),
});

const dbGroupsDeleteBodySchema = z.object({
  groupId: z.string().min(1),
  userId: z.string().optional(),
});

const dbUsersDeleteBodySchema = z.object({
  targetUserId: z.string().min(1),
  requesterUserId: z.string().optional(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Sanitize error messages for production — never leak internal details to client */
function sanitizeError(err: unknown): string {
  if (process.env.NODE_ENV === "production") {
    return "Ocorreu um erro interno no servidor. Tente novamente mais tarde.";
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Log errors safely without leaking secrets */
function logError(context: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${context}] ${message}`);
}

// ─── Auth Middleware ────────────────────────────────────────────────────────

/**
 * Extracts Supabase JWT from Authorization header and returns the authenticated user.
 * Uses service_role key if available, otherwise falls back to anon key.
 * Returns null if authentication fails (caller handles 401).
 */
async function authenticateRequest(
  supabase: any,
  authHeader: string | undefined,
): Promise<{ email: string; id: string } | null> {
  if (!supabase) return null;

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) return null;
    return { email: user.email.toLowerCase(), id: user.id };
  } catch {
    return null;
  }
}

/**
 * Checks if the given email belongs to an admin (configured via ADMIN_EMAILS env var).
 */
function isAdminEmail(email: string): boolean {
  const adminEmails: string[] = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const normalized = email.toLowerCase();
  const hasAdminOverride = process.env.ADMIN_OVERRIDE === normalized;
  return adminEmails.includes(normalized) || hasAdminOverride;
}

/**
 * Idempotently ensures the public default group exists in copabolao_groups.
 * Called on first auth/me of any session — cheap (one-row select), so safe to run often.
 * If the row was wiped (manual cleanup, migration, accidental delete), this recreates it
 * without touching any other group's data.
 */
async function ensureDefaultGroup(supabase: any): Promise<void> {
  if (!supabase) return;
  try {
    const { data: existing } = await supabase
      .from("copabolao_groups")
      .select("id, deleted")
      .eq("id", DEFAULT_GROUP.id)
      .maybeSingle();

    if (existing && existing.deleted !== true) return; // already healthy

    if (existing && existing.deleted === true) {
      // Resurrect a soft-deleted default group rather than create a new id.
      await supabase
        .from("copabolao_groups")
        .update({ deleted: false })
        .eq("id", DEFAULT_GROUP.id);
      return;
    }

    // Doesn't exist — create it. Anyone authenticated can later join via the welcome modal
    // or the explore tab. creator_id is null (no human owner) and members starts empty.
    await supabase.from("copabolao_groups").insert({
      id: DEFAULT_GROUP.id,
      name: DEFAULT_GROUP.name,
      description: DEFAULT_GROUP.description,
      league: DEFAULT_GROUP.league,
      entry_fee: 0,
      creator_id: null,
      code: DEFAULT_GROUP.code,
      members: [],
      is_private: false,
      deleted: false,
    });
  } catch (err) {
    // Non-fatal — if this fails, the user can still use the app, just won't see the
    // welcome offer. Worth logging so we notice if it's chronic.
    logError("ensure-default-group", err);
  }
}

// ─── Sync Mutex ────────────────────────────────────────────────────────────

/**
 * Simple mutex to prevent race conditions during sync operations.
 * Ensures only one sync/seed operation runs at a time.
 */
class SyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

// ─── Server Startup ────────────────────────────────────────────────────────

async function startServer() {
  const app = express();

  // Trust the first proxy hop. Required behind Fly.io / Railway / Render / nginx —
  // those platforms inject X-Forwarded-For with the real client IP. Without this:
  //   - express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
  //   - req.ip returns the proxy's IP, not the real client
  // Single-hop is correct for our deploys; if we ever stack more proxies, bump this.
  app.set("trust proxy", 1);

  // --- Security Headers (Helmet) ---
  // CSP allowlist — keep this in sync with hosts the app actually contacts:
  //   - *.supabase.co     → Supabase auth + database (PostgREST + Realtime WebSockets)
  //   - api.dicebear.com  → user avatars (svg)
  //   - flagcdn.com       → country flags for matches
  //   - data:             → inline data URIs used by some lucide-react icons
  // We extend Helmet's default policy instead of disabling it. unsafe-inline on
  // styles is required by Tailwind v4 dev-friendly mode and lucide-react.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "connect-src": [
          "'self'",
          "https://*.supabase.co",
          "wss://*.supabase.co", // Supabase Realtime channels
        ],
        "img-src": [
          "'self'",
          "data:",
          "blob:",
          "https://api.dicebear.com",
          "https://flagcdn.com",
          "https://images.unsplash.com",
        ],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "font-src": ["'self'", "data:"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        // Don't force HTTPS upgrades on the dev tunnel; in prod, Fly already does HTTPS.
        "upgrade-insecure-requests": process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    // Cross-Origin-Embedder-Policy off — we don't need it and it breaks 3rd-party images.
    crossOriginEmbedderPolicy: false,
  }));

  // --- CORS Configuration ---
  app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }));

  app.use(express.json({ limit: "1mb" }));

  // --- Rate limiters ---
  // Auth endpoints are abuse magnets (OTP spam, credential stuffing). Tight ceilings per IP.
  // standardHeaders 'draft-7' exposes RateLimit-* headers so clients can self-throttle.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    limit: 20,                 // 20 auth requests per IP per window
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Muitas tentativas de autenticação. Aguarde alguns minutos." },
  });
  app.use("/api/auth/", authLimiter);

  // The scoring endpoint hits Supabase hard (full-table scan + bulk upsert). Cap to avoid
  // a runaway script triggering Supabase rate limits and locking out real traffic.
  const scoreLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Muitas requisições de pontuação. Aguarde 1 minuto." },
  });
  app.use("/api/predictions/score", scoreLimiter);

  const PORT = Number(process.env.PORT) || 3000;

  // --- Sync Mutex Instance ---
  const syncMutex = new SyncMutex();

  // Supabase Client: Lazy initialization to prevent app crash if environment credentials are missing.
  // Prefer SERVICE_ROLE so the server can bypass RLS for legitimate operations on behalf of an
  // already-authenticated user (the bearer token is validated separately in authenticateRequest).
  // Falls back to anon if no service role is set — most reads still work, writes that need RLS
  // bypass will fail silently. Add SUPABASE_SERVICE_ROLE_KEY to .env to fix that.
  // realtime.params: disable Realtime client on the server — it requires WebSocket support
  // not present in Node 20, and we only use Realtime from the browser anyway. Without this,
  // any /api/* call that lazy-creates the client crashes with "Node.js 20 detected without
  // native WebSocket support".
  let supabaseInstance: any = null;
  function getSupabaseClient() {
    if (!supabaseInstance) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      if (url && key) {
        supabaseInstance = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          realtime: { params: { eventsPerSecond: 0 } },
        });
      }
    }
    return supabaseInstance;
  }

  // Gemini Client: Lazy initialization. Returns null if GEMINI_API_KEY is missing
  // so the AI suggestion endpoint falls back to canned random scores instead of crashing.
  let aiInstance: GoogleGenAI | null = null;
  function getGeminiClient() {
    if (!aiInstance) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return null;
      aiInstance = new GoogleGenAI({ apiKey: key });
    }
    return aiInstance;
  }

  // REST API: Suggest score and prediction with AI using Gemini.
  // Public endpoint (no auth required) — it doesn't read user data, just returns a score guess.
  app.post("/api/ai/suggest-score", async (req, res) => {
    const parsed = aiSuggestScoreBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos. Informe homeTeam e awayTeam." });
    }

    const { homeTeam, awayTeam } = parsed.data;

    const ai = getGeminiClient();
    if (!ai) {
      // Fallback: random score + canned reasoning. Lets the feature work even without a Gemini key.
      const randomHome = Math.floor(Math.random() * 4);
      const randomAway = Math.floor(Math.random() * 4);
      const fallbacks = [
        `Clássico equilibrado! ${homeTeam} e ${awayTeam} vão se estudar. Empate disputado ou vitória magra.`,
        `${homeTeam} vem ofensivo, ${awayTeam} sabe jogar fechado. Jogo de transições rápidas.`,
        `Jogo travado no meio-campo. Decisão na bola parada ou contra-ataque.`,
        `Confronto de zebra possível! ${awayTeam} pode surpreender se entrar ligado.`,
      ];
      return res.json({
        homeScore: randomHome,
        awayScore: randomAway,
        reasoning: fallbacks[Math.floor(Math.random() * fallbacks.length)],
        isAiGenerated: false,
      });
    }

    try {
      const prompt = `Analise de forma divertida o confronto de futebol entre "${homeTeam}" e "${awayTeam}" no contexto da Copa do Mundo 2026.
Você é um palpiteiro raiz, zoeiro, sincero e bem-humorado do futebol brasileiro.

REGRAS PARA OS PLACARES (DIVERSIDADE):
- NÃO sugira sempre 2x1 ou 1x1. Varie bastante.
- Empates malucos (2x2, 3x3), goleadas, zebras (derrotas surpresa), 0x0 — tudo cabe.
- Use sua intuição de torcedor.

Instruções para o "reasoning":
1. Use gírias da resenha brasileira (ex: "entregou a paçoca", "chocolate com dancinha", "retranca", "pé-frio", "iludido", "lei do ex", "sentou no patê").
2. Máximo 18 palavras.
3. Opinativo e direto.

Responda APENAS o JSON.`;

      const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              homeScore: { type: Type.INTEGER, description: "Gols do mandante" },
              awayScore: { type: Type.INTEGER, description: "Gols do visitante" },
              reasoning: { type: Type.STRING, description: "Comentário curto e divertido" },
            },
            required: ["homeScore", "awayScore", "reasoning"],
          },
        },
      });

      const responseText = response.text || "{}";
      const parsedAi = JSON.parse(responseText.trim());

      return res.json({
        homeScore: typeof parsedAi.homeScore === "number" ? parsedAi.homeScore : 1,
        awayScore: typeof parsedAi.awayScore === "number" ? parsedAi.awayScore : 0,
        reasoning: parsedAi.reasoning || "Futebol é caixinha de surpresa!",
        isAiGenerated: true,
      });
    } catch (e: any) {
      logError("ai-suggest-score", e);
      return res.json({
        homeScore: 1,
        awayScore: 1,
        reasoning: "Jogo travado, aposto num 1x1 de segurança.",
        isAiGenerated: false,
      });
    }
  });


  // REST API: Get Real-Time Match Data (API-Football integration proxy)
  app.get("/api/football/fixtures", async (req, res) => {
    const footballApiKey = process.env.FOOTBALL_API_KEY;
    if (!footballApiKey) {
      return res.json({
        useRealData: false,
        message: "Chave FOOTBALL_API_KEY ausente. Usando partidas simuladas de alta-fidelidade.",
        fixtures: [],
      });
    }

    try {
      const response = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
        method: "GET",
        headers: {
          "x-apisports-key": footballApiKey,
          "x-rapidapi-key": footballApiKey,
        },
      });

      const data: any = await response.json();

      if (data.errors && Object.keys(data.errors).length > 0) {
        return res.json({
          useRealData: false,
          message: "API-Football retornou dados indisponíveis no momento.",
          fixtures: [],
        });
      }

      const mapStatus = (apiStatus: string): "upcoming" | "live" | "completed" => {
        const liveStatuses = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"];
        const completedStatuses = ["FT", "AET", "PEN"];
        if (liveStatuses.includes(apiStatus)) return "live";
        if (completedStatuses.includes(apiStatus)) return "completed";
        return "upcoming";
      };

      const mappedFixtures = (data.response || []).map((item: any) => ({
        id: `real_${item.fixture.id}`,
        homeTeam: {
          name: item.teams.home.name,
          code: item.teams.home.code || item.teams.home.name.substring(0, 3).toUpperCase(),
          flagUrl: item.teams.home.logo || "⚽",
        },
        awayTeam: {
          name: item.teams.away.name,
          code: item.teams.away.code || item.teams.away.name.substring(0, 3).toUpperCase(),
          flagUrl: item.teams.away.logo || "⚽",
        },
        date: item.fixture.date,
        status: mapStatus(item.fixture.status.short),
        league: (item.league.name === "World Cup" || item.league.name === "FIFA World Cup") ? "Copa do Mundo 2026" : item.league.name,
        homeScore: item.goals.home !== null ? item.goals.home : undefined,
        awayScore: item.goals.away !== null ? item.goals.away : undefined,
        scorers: [],
      }));

      // Persist real matches to Supabase
      const supabase = getSupabaseClient();
      if (supabase && mappedFixtures.length > 0) {
        try {
          const mappedMatchesForSupabase = mappedFixtures.map((m: any) => ({
            id: m.id,
            home_team: m.homeTeam,
            away_team: m.awayTeam,
            date: m.date,
            status: m.status,
            home_score: m.homeScore !== undefined ? m.homeScore : null,
            away_score: m.awayScore !== undefined ? m.awayScore : null,
            scorers: m.scorers || [],
            league: m.league,
          }));
          await supabase.from("copabolao_matches").upsert(mappedMatchesForSupabase);
        } catch (dbErr: any) {
          logError("football-fixtures-supabase", dbErr);
        }
      }

      return res.json({
        useRealData: true,
        fixtures: mappedFixtures,
      });
    } catch (err: any) {
      logError("football-fixtures", err);
      return res.json({
        useRealData: false,
        message: "Serviço de dados de futebol temporariamente indisponível.",
        fixtures: [],
      });
    }
  });

  // REST API: Sync database states with Supabase (race-condition protected via mutex)
  app.get("/api/db/sync", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.json({
        connected: false,
        message: "Supabase não configurado localmente no backend.",
      });
    }

    const queryParsed = dbSyncQuerySchema.safeParse(req.query);
    const tableName = queryParsed.success ? queryParsed.data.table : undefined;

    await syncMutex.acquire();
    try {
      if (tableName) {
        // Table-specific sync requests (polling helper)
        if (tableName === "copabolao_matches") {
          const { data, error } = await supabase.from("copabolao_matches").select("*");
          if (error) return res.json({ success: false, error: "Erro ao consultar partidas." });
          const mappedMatches = (data || []).map((m: any) => ({
            id: m.id,
            homeTeam: m.home_team,
            awayTeam: m.away_team,
            date: m.date,
            status: m.status,
            homeScore: m.home_score !== null ? Number(m.home_score) : undefined,
            awayScore: m.away_score !== null ? Number(m.away_score) : undefined,
            scorers: m.scorers || [],
            league: m.league,
          }));
          return res.json({ success: true, data: mappedMatches });
        }
        if (tableName === "copabolao_users") {
          const { data, error } = await supabase.from("copabolao_users").select("*");
          if (error) return res.json({ success: false, error: "Erro ao consultar usuários." });
          const activeUsers = (data || []).filter((u: any) => u.deleted !== true);
          return res.json({ success: true, data: activeUsers });
        }
        if (tableName === "copabolao_groups") {
          const { data, error } = await supabase.from("copabolao_groups").select("*");
          if (error) return res.json({ success: false, error: "Erro ao consultar grupos." });
          const mappedGroups = (data || [])
            .filter((g: any) => g.deleted !== true)
            .map((g: any) => ({
              id: g.id,
              name: g.name,
              description: g.description,
              league: g.league,
              entryFee: Number(g.entry_fee || 0),
              creatorId: g.creator_id,
              code: g.code,
              members: g.members || [],
              isPrivate: g.is_private === true,
            }));
          return res.json({ success: true, data: mappedGroups });
        }
        if (tableName === "copabolao_predictions") {
          const { data, error } = await supabase.from("copabolao_predictions").select("*");
          if (error) return res.json({ success: false, error: "Erro ao consultar palpites." });
          const mappedPredictions = (data || []).map((p: any) => ({
            id: p.id,
            userId: p.user_id,
            matchId: p.match_id,
            homeScore: Number(p.home_score),
            awayScore: Number(p.away_score),
            pointsEarned: p.points_earned !== null ? Number(p.points_earned) : undefined,
            groupId: p.group_id || null,
          }));
          return res.json({ success: true, data: mappedPredictions });
        }
        if (tableName === "copabolao_comments") {
          const { data, error } = await supabase.from("copabolao_comments").select("*");
          if (error) return res.json({ success: false, error: "Erro ao consultar comentários." });
          const mappedComments = (data || []).map((c: any) => ({
            id: c.id,
            matchId: c.match_id,
            userId: c.user_id,
            userName: c.user_name,
            userAvatar: c.user_avatar,
            text: c.text,
            timestamp: c.timestamp,
            reactions: c.reactions || [],
          }));
          return res.json({ success: true, data: mappedComments });
        }
        return res.json({ success: false, error: "Tabela inválida." });
      }

      // Full sync
      const { data: users, error: uErr } = await supabase.from("copabolao_users").select("*");

      if (uErr) {
        return res.json({
          connected: false,
          message: "Banco de dados não configurado. Execute o script SQL no painel Supabase.",
        });
      }

      // Proactive Auto-Seeding if table is empty (DEV ONLY — never seed a production DB).
      if (!users || users.length === 0) {
        if (process.env.NODE_ENV === "production") {
          return res.json({
            connected: true,
            seeded: false,
            users: [],
            groups: [],
            predictions: [],
            comments: [],
            matches: null,
          });
        }

        console.log("Banco Supabase vazio! Iniciando Auto-Seeding para melhor experiência inicial...");

        await supabase.from("copabolao_users").insert(INITIAL_USERS);

        const mappedGroups = INITIAL_GROUPS.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          league: g.league,
          entry_fee: g.entryFee,
          creator_id: g.creatorId,
          code: g.code,
          members: g.members,
        }));
        await supabase.from("copabolao_groups").insert(mappedGroups);

        const mappedMatches = INITIAL_MATCHES.map((m) => ({
          id: m.id,
          home_team: m.homeTeam,
          away_team: m.awayTeam,
          date: m.date,
          status: m.status,
          home_score: m.homeScore,
          away_score: m.awayScore,
          scorers: m.scorers || [],
          league: m.league,
        }));
        await supabase.from("copabolao_matches").insert(mappedMatches);

        const mappedComments = INITIAL_COMMENTS.map((c) => ({
          id: c.id,
          match_id: c.matchId,
          user_id: c.userId,
          user_name: c.userName,
          user_avatar: c.userAvatar,
          text: c.text,
          timestamp: c.timestamp,
          reactions: c.reactions,
        }));
        await supabase.from("copabolao_comments").insert(mappedComments);

        const { data: seededUsers } = await supabase.from("copabolao_users").select("*");
        const activeSeededUsers = (seededUsers || []).filter((u: any) => u.deleted !== true);

        return res.json({
          connected: true,
          seeded: true,
          users: activeSeededUsers.length > 0 ? activeSeededUsers : INITIAL_USERS,
          groups: INITIAL_GROUPS,
          predictions: [],
          comments: INITIAL_COMMENTS,
          matches: INITIAL_MATCHES,
        });
      }

      // Already populated — fetch all collections in parallel
      const [gRes, pRes, cRes, mRes] = await Promise.all([
        supabase.from("copabolao_groups").select("*"),
        supabase.from("copabolao_predictions").select("*"),
        supabase.from("copabolao_comments").select("*"),
        supabase.from("copabolao_matches").select("*"),
      ]);

      const activeUsers = (users || []).filter((u: any) => u.deleted !== true);

      const mappedGroups = (gRes.data || [])
        .filter((g: any) => g.deleted !== true)
        .map((g: any) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          league: g.league,
          entryFee: Number(g.entry_fee || 0),
          creatorId: g.creator_id,
          code: g.code,
          members: g.members || [],
          isPrivate: g.is_private === true,
        }));

      const mappedPredictions = (pRes.data || []).map((p: any) => ({
        id: p.id,
        userId: p.user_id,
        matchId: p.match_id,
        homeScore: Number(p.home_score),
        awayScore: Number(p.away_score),
        pointsEarned: p.points_earned !== null ? Number(p.points_earned) : undefined,
        groupId: p.group_id || null,
      }));

      const mappedComments = (cRes.data || []).map((c: any) => ({
        id: c.id,
        matchId: c.match_id,
        userId: c.user_id,
        userName: c.user_name,
        userAvatar: c.user_avatar,
        text: c.text,
        timestamp: c.timestamp,
        reactions: c.reactions || [],
      }));

      const mappedMatches = (mRes.data || []).map((m: any) => ({
        id: m.id,
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        date: m.date,
        status: m.status,
        homeScore: m.home_score !== null ? Number(m.home_score) : undefined,
        awayScore: m.away_score !== null ? Number(m.away_score) : undefined,
        scorers: m.scorers || [],
        league: m.league,
      }));

      return res.json({
        connected: true,
        seeded: false,
        users: activeUsers,
        groups: mappedGroups,
        predictions: mappedPredictions,
        comments: mappedComments,
        matches: mappedMatches.length > 0 ? mappedMatches : null,
      });
    } catch (e: any) {
      logError("db-sync", e);
      return res.json({
        connected: false,
        message: "Serviço de sincronização temporariamente indisponível.",
      });
    } finally {
      syncMutex.release();
    }
  });

  // REST API: Reset MATCHES ONLY back to the initial seed (admin-only).
  // Important — this NEVER touches user-created groups, comments, or user accounts.
  // The simulator's "Restaurar Estado Inicial" button is the only caller; its purpose
  // is to put match scores/status back so admins can re-test the prediction flow.
  // Predictions are also wiped (since they reference matches whose state is changing).
  app.post("/api/db/reset", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase conectado." });

    // --- VALIDATION ---
    const parsed = dbResetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados inválidos." });
    }

    // --- AUTHENTICATION CHECK ---
    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Token de autenticação ausente ou inválido." });
    }

    // --- AUTHORIZATION CHECK ---
    if (!isAdminEmail(authUser.email)) {
      logError("security", `Unauthorized reset attempt by ${authUser.email}`);
      return res.status(403).json({ success: false, message: "Acesso negado. Apenas administradores podem resetar o banco de dados." });
    }

    // The reset is already gated by (1) Bearer JWT validation and (2) ADMIN_EMAILS check.
    // We previously also required a RESET_CONFIRMATION_TOKEN, but that doesn't compose with
    // a browser app — exposing the token to the client would defeat the purpose, and the
    // simulator UI now has its own visible confirmation step. If you want curl-level
    // protection back, re-add the token check here.

    // --- AUDIT LOG ---
    console.warn(`[AUDIT] MATCHES RESET initiated by admin: ${authUser.email} at ${new Date().toISOString()}`);

    await syncMutex.acquire();
    try {
      // Wipe predictions (they're tied to specific match states we're about to overwrite).
      await supabase.from("copabolao_predictions").delete().neq("id", "_");

      // Reset matches: replace the whole set with the initial seed.
      // Groups, comments, users, and the public default group are NOT touched.
      await supabase.from("copabolao_matches").delete().neq("id", "_");
      const mappedMatches = INITIAL_MATCHES.map((m) => ({
        id: m.id,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        date: m.date,
        status: m.status,
        home_score: m.homeScore !== undefined ? m.homeScore : null,
        away_score: m.awayScore !== undefined ? m.awayScore : null,
        scorers: m.scorers || [],
        league: m.league,
      }));
      await supabase.from("copabolao_matches").insert(mappedMatches);

      return res.json({ success: true, matches: INITIAL_MATCHES });
    } catch (error: any) {
      logError("db-reset", error);
      return res.json({ success: false, message: "Erro ao resetar banco de dados." });
    } finally {
      syncMutex.release();
    }
  });

  // OTP Verification API: Send OTP Code
  app.post("/api/auth/otp/send", async (req, res) => {
    const parsed = otpSendBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "E-mail inválido ou ausente." });
    }

    const supabase = getSupabaseClient();
    const { email, isSignUp, name } = parsed.data;
    const keyId = email.toLowerCase().trim();

    try {
      if (supabase) {
        const { data: existingUser } = await supabase
          .from("copabolao_users")
          .select("*")
          .eq("id", keyId)
          .maybeSingle();

        if (isSignUp) {
          if (existingUser && existingUser.deleted !== true) {
            return res.json({ success: false, message: "Este e-mail já está cadastrado. Alterne para a aba 'Entrar'." });
          }
        } else {
          if (!existingUser || existingUser.deleted === true) {
            return res.json({ success: false, message: "E-mail não cadastrado! Por favor, crie uma conta primeiro na aba 'Criar Conta'." });
          }
        }

        const { error } = await supabase.auth.signInWithOtp({
          email: keyId,
          options: {
            shouldCreateUser: true,
          },
        });

        if (error) {
          logError("otp-send", error);
          return res.json({ success: false, message: "Erro ao enviar o código de acesso. Tente novamente." });
        }

        return res.json({
          success: true,
          message: "Código enviado! Verifique sua caixa de entrada.",
          isMock: false,
        });
      } else {
        console.log(`[MOCK AUTH] Envio simulado de OTP para: ${keyId}`);
        return res.json({
          success: true,
          message: "Modo de simulação ativo: Seu código OTP de teste é 123456",
          isMock: true,
          mockCode: "123456",
        });
      }
    } catch (err: any) {
      logError("otp-send", err);
      return res.json({ success: false, message: "Erro ao processar solicitação de código." });
    }
  });

  // OTP Verification API: Verify Code & Session Setup
  app.post("/api/auth/otp/verify", async (req, res) => {
    const parsed = otpVerifyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados inválidos. Informe e-mail e código de 6 dígitos." });
    }

    const supabase = getSupabaseClient();
    const { email, token, isSignUp, name, avatar } = parsed.data;
    const keyId = email.toLowerCase().trim();

    try {
      if (supabase) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: keyId,
          token: token.trim(),
          type: "email",
        });

        if (verifyError) {
          const { error: retryError } = await supabase.auth.verifyOtp({
            email: keyId,
            token: token.trim(),
            type: "signup",
          });

          if (retryError) {
            logError("otp-verify", verifyError || retryError);
            return res.json({ success: false, message: "Código incorreto ou expirado. Solicite um novo código." });
          }
        }

        const { data: existingUser } = await supabase
          .from("copabolao_users")
          .select("*")
          .eq("id", keyId)
          .maybeSingle();

        let finalUser = existingUser;

        if (isSignUp) {
          if (existingUser) {
            const { data: updated } = await supabase
              .from("copabolao_users")
              .update({ deleted: false, name: (name || existingUser.name || "Palpiteiro").trim(), avatar: avatar || existingUser.avatar })
              .eq("id", keyId)
              .select()
              .single();
            finalUser = updated;
          } else {
            const { data: inserted } = await supabase
              .from("copabolao_users")
              .insert({
                id: keyId,
                name: (name || "Palpiteiro").trim(),
                avatar: avatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix",
                deleted: false,
              })
              .select()
              .single();
            finalUser = inserted || { id: keyId, name: (name || "Palpiteiro").trim(), avatar: avatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix" };
          }
        } else {
          if (!existingUser) {
            const { data: inserted } = await supabase
              .from("copabolao_users")
              .insert({
                id: keyId,
                name: (name || "Palpiteiro").trim(),
                avatar: avatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix",
                deleted: false,
              })
              .select()
              .single();
            finalUser = inserted || { id: keyId, name: "Palpiteiro", avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix" };
          }
        }

        return res.json({
          success: true,
          user: {
            id: finalUser.id,
            name: finalUser.name,
            avatar: finalUser.avatar,
            email: finalUser.id,
          },
        });
      } else {
        if (token.trim() === "123456" || token.trim() === "654321") {
          return res.json({
            success: true,
            user: {
              id: keyId,
              name: (name || "User Teste").trim(),
              avatar: avatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix",
              email: keyId,
            },
          });
        } else {
          return res.json({ success: false, message: "Código incorreto! No modo simulado use '123456'." });
        }
      }
    } catch (err: any) {
      logError("otp-verify", err);
      return res.json({ success: false, message: "Erro ao verificar código de acesso." });
    }
  });

  // REST API: Standard Account Login
  app.post("/api/auth/login", async (req, res) => {
    const parsed = authLoginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "E-mail inválido ou ausente." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase conectado." });
    const { email } = parsed.data;
    const keyId = email.toLowerCase().trim();

    try {
      const { data, error } = await supabase
        .from("copabolao_users")
        .select("*")
        .eq("id", keyId)
        .maybeSingle();

      if (error || !data || data.deleted === true) {
        return res.json({ success: false, message: "E-mail não cadastrado! Por favor, crie uma conta na aba 'Criar Conta'." });
      }

      return res.json({
        success: true,
        user: {
          id: data.id,
          name: data.name,
          avatar: data.avatar,
          email: data.id,
        },
      });
    } catch (err: any) {
      logError("auth-login", err);
      return res.json({ success: false, message: "Erro ao processar login." });
    }
  });

  // REST API: Standard Account Registration
  app.post("/api/auth/register", async (req, res) => {
    const parsed = authRegisterBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados inválidos. Informe nome e e-mail." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase conectado." });
    const { email, name, avatar } = parsed.data;
    const keyId = email.toLowerCase().trim();

    try {
      const { data: existingUser } = await supabase
        .from("copabolao_users")
        .select("*")
        .eq("id", keyId)
        .maybeSingle();

      if (existingUser) {
        if (existingUser.deleted === true) {
          const { error: reactivateErr } = await supabase
            .from("copabolao_users")
            .update({ deleted: false, name: name.trim(), avatar })
            .eq("id", keyId);
          if (reactivateErr) {
            logError("auth-register-reactivate", reactivateErr);
            return res.json({ success: false, message: "Erro ao reativar conta." });
          }
          return res.json({
            success: true,
            user: { id: keyId, name: name.trim(), avatar, email: keyId },
          });
        }
        return res.json({ success: false, message: "Este e-mail já está cadastrado. Alterne para a aba 'Entrar'." });
      }

      const { error } = await supabase
        .from("copabolao_users")
        .insert({ id: keyId, name: name.trim(), avatar });

      if (error) {
        logError("auth-register-insert", error);
        return res.json({ success: false, message: "Erro ao cadastrar usuário." });
      }

      return res.json({
        success: true,
        user: { id: keyId, name: name.trim(), avatar, email: keyId },
      });
    } catch (err: any) {
      logError("auth-register", err);
      return res.json({ success: false, message: "Erro ao processar cadastro." });
    }
  });

  // ─── New canonical endpoints (auth, groups join, scoring) ─────────────

  /**
   * Returns the authenticated user enriched with isAdmin (computed from ADMIN_EMAILS).
   * Used by the React app on mount/auth-change to populate sessionUser.
   * Returns 401 if no valid bearer token is present.
   */
  app.get("/api/auth/me", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(401).json({ user: null, message: "Supabase não configurado." });
    }

    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ user: null, message: "Não autenticado." });
    }

    // Make sure the public default group exists for any newcomer to join.
    // Fire-and-forget: non-blocking and self-healing if it ever gets wiped.
    ensureDefaultGroup(supabase);

    try {
      const { data: profile } = await supabase
        .from("copabolao_users")
        .select("*")
        .eq("id", authUser.email)
        .maybeSingle();

      // Auto-create a stub profile on first login so the rest of the app has something to render.
      let finalProfile = profile;
      const fallbackName = authUser.email.split("@")[0] || "Palpiteiro";
      const fallbackAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(fallbackName)}`;

      if (!profile || profile.deleted === true) {
        if (!profile) {
          const { data: inserted, error: insertErr } = await supabase
            .from("copabolao_users")
            .insert({ id: authUser.email, name: fallbackName, avatar: fallbackAvatar, deleted: false })
            .select()
            .single();
          if (insertErr) {
            // RLS blocked the insert (most common on free-tier without service_role key).
            // Don't crash — return the synthesized profile so the user can at least enter the app.
            // The next /api/db/users upsert from the client side will retry the persistence.
            logError("auth-me-insert", insertErr);
            finalProfile = { id: authUser.email, name: fallbackName, avatar: fallbackAvatar, deleted: false };
          } else {
            finalProfile = inserted || { id: authUser.email, name: fallbackName, avatar: fallbackAvatar, deleted: false };
          }
        } else {
          // Reactivate a soft-deleted profile.
          const { data: reactivated, error: reactivateErr } = await supabase
            .from("copabolao_users")
            .update({ deleted: false })
            .eq("id", authUser.email)
            .select()
            .single();
          if (reactivateErr) logError("auth-me-reactivate", reactivateErr);
          finalProfile = reactivated || { ...profile, deleted: false };
        }
      }

      // Final safety net: if anything above produced a null profile, synthesize one from the JWT.
      if (!finalProfile) {
        finalProfile = { id: authUser.email, name: fallbackName, avatar: fallbackAvatar, deleted: false };
      }

      return res.json({
        user: {
          id: finalProfile.id,
          name: finalProfile.name,
          avatar: finalProfile.avatar,
          email: finalProfile.id,
          isAdmin: isAdminEmail(authUser.email),
        },
      });
    } catch (err) {
      logError("auth-me", err);
      return res.status(500).json({ user: null, message: "Erro ao buscar perfil." });
    }
  });

  /**
   * Centralized group-join endpoint.
   * - Looks up the group by invite code (private groups are joinable as long as you have the code).
   * - Appends the authenticated user to `members[]` and returns the canonical row.
   */
  const groupsJoinBodySchema = z.object({ code: z.string().min(1) });
  app.post("/api/groups/join", async (req, res) => {
    const parsed = groupsJoinBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Código inválido." });
    }
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });

    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }

    const cleanCode = parsed.data.code.trim().toUpperCase();
    try {
      const { data: group, error } = await supabase
        .from("copabolao_groups")
        .select("*")
        .eq("code", cleanCode)
        .maybeSingle();
      if (error) {
        logError("groups-join-fetch", error);
        return res.json({ success: false, message: "Erro ao buscar bolão." });
      }
      if (!group || group.deleted === true) {
        return res.status(404).json({ success: false, message: "Bolão não encontrado para esse código." });
      }

      const members: string[] = Array.isArray(group.members) ? group.members : [];
      if (members.includes(authUser.email)) {
        return res.json({ success: true, group, alreadyMember: true });
      }
      const updatedMembers = [...members, authUser.email];

      const { data: updated, error: updateErr } = await supabase
        .from("copabolao_groups")
        .update({ members: updatedMembers })
        .eq("id", group.id)
        .select()
        .single();
      if (updateErr) {
        logError("groups-join-update", updateErr);
        return res.json({ success: false, message: "Erro ao atualizar membros." });
      }

      return res.json({ success: true, group: updated });
    } catch (err) {
      logError("groups-join", err);
      return res.json({ success: false, message: "Erro ao processar entrada no bolão." });
    }
  });

  /**
   * Admin-only: Recalculates and persists `points_earned` for every prediction of a finished match.
   * Triggered by the simulator when a match flips to "completed".
   */
  const scoreMatchBodySchema = z.object({ matchId: z.string().min(1) });
  app.post("/api/predictions/score", async (req, res) => {
    const parsed = scoreMatchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "matchId obrigatório." });
    }
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });

    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }
    if (!isAdminEmail(authUser.email)) {
      return res.status(403).json({ success: false, message: "Apenas administradores podem calcular pontuação." });
    }

    const { matchId } = parsed.data;
    try {
      const { data: matchRow, error: matchErr } = await supabase
        .from("copabolao_matches")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();
      if (matchErr || !matchRow) {
        return res.status(404).json({ success: false, message: "Partida não encontrada." });
      }
      if (matchRow.status !== "completed") {
        return res.status(400).json({ success: false, message: "Partida ainda não finalizada." });
      }

      const match = {
        id: matchRow.id,
        homeTeam: matchRow.home_team,
        awayTeam: matchRow.away_team,
        date: matchRow.date,
        status: matchRow.status as "completed",
        homeScore: matchRow.home_score !== null ? Number(matchRow.home_score) : undefined,
        awayScore: matchRow.away_score !== null ? Number(matchRow.away_score) : undefined,
        scorers: matchRow.scorers || [],
        league: matchRow.league,
      };

      const { data: predRows, error: predErr } = await supabase
        .from("copabolao_predictions")
        .select("*")
        .eq("match_id", matchId);
      if (predErr) {
        logError("score-fetch", predErr);
        return res.json({ success: false, message: "Erro ao buscar palpites." });
      }

      const updates = (predRows || []).map((p: any) => {
        const points = calculatePredictionPoints(
          {
            id: p.id,
            userId: p.user_id,
            matchId: p.match_id,
            homeScore: Number(p.home_score),
            awayScore: Number(p.away_score),
          },
          match
        );
        return {
          id: p.id,
          user_id: p.user_id,
          match_id: p.match_id,
          home_score: Number(p.home_score),
          away_score: Number(p.away_score),
          points_earned: points,
          group_id: p.group_id || null,
        };
      });

      if (updates.length > 0) {
        const { error: upsertErr } = await supabase.from("copabolao_predictions").upsert(updates);
        if (upsertErr) {
          logError("score-upsert", upsertErr);
          return res.json({ success: false, message: "Erro ao salvar pontuação." });
        }
      }

      return res.json({ success: true, scored: updates.length });
    } catch (err) {
      logError("predictions-score", err);
      return res.json({ success: false, message: "Erro ao calcular pontuação." });
    }
  });

  // ─── DB Operations (all protected by auth + Zod validation) ────────────

  // REST API: Upsert user to Supabase
  app.post("/api/db/users", async (req, res) => {
    const parsed = dbUsersUpsertBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados do usuário inválidos." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });

    // Auth check: user can only upsert their own profile
    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }
    if (authUser.id !== parsed.data.id && !isAdminEmail(authUser.email)) {
      return res.status(403).json({ success: false, message: "Você só pode modificar seu próprio perfil." });
    }

    try {
      const { id, name, avatar } = parsed.data;
      const { error } = await supabase.from("copabolao_users").upsert({ id, name, avatar });
      if (error) {
        logError("db-users-upsert", error);
      }
      return res.json({ success: !error });
    } catch (error: any) {
      logError("db-users", error);
      return res.json({ success: false, error: "Erro ao salvar usuário." });
    }
  });

  // REST API: Upsert prediction to Supabase
  app.post("/api/db/predictions", async (req, res) => {
    const parsed = dbPredictionsUpsertBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados do palpite inválidos." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });

    // Auth check: user can only upsert their own predictions
    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }
    if (authUser.id !== parsed.data.userId && !isAdminEmail(authUser.email)) {
      return res.status(403).json({ success: false, message: "Você só pode modificar seus próprios palpites." });
    }

    const { id, userId, matchId, homeScore, awayScore, pointsEarned, groupId } = parsed.data;

    // --- Bet-lock enforcement (server-side; complements client-side isMatchLocked) ---
    // Non-admins cannot palpitar after the match has started or within 15 minutes of kickoff.
    if (!isAdminEmail(authUser.email)) {
      try {
        const { data: match } = await supabase
          .from("copabolao_matches")
          .select("status,date")
          .eq("id", matchId)
          .maybeSingle();

        if (match) {
          if (match.status !== "upcoming") {
            return res.status(409).json({
              success: false,
              message: "Palpites bloqueados: a partida já começou ou foi finalizada.",
            });
          }
          const kickoff = new Date(match.date).getTime();
          if (Number.isFinite(kickoff) && Date.now() >= kickoff - 15 * 60 * 1000) {
            return res.status(409).json({
              success: false,
              message: "Palpites bloqueados: faltam menos de 15 minutos para o início da partida.",
            });
          }
        }
        // If the match row is missing, we let the upsert proceed — it could be a custom match
        // created client-side that hasn't been propagated yet.
      } catch (lockErr) {
        logError("predictions-betlock", lockErr);
      }
    }

    try {
      let { error } = await supabase.from("copabolao_predictions").upsert({
        id,
        user_id: userId,
        match_id: matchId,
        home_score: homeScore,
        away_score: awayScore,
        points_earned: pointsEarned !== undefined ? pointsEarned : null,
        group_id: groupId || null,
      });

      if (error && error.message?.includes("group_id")) {
        console.warn("Coluna 'group_id' ausente em copabolao_predictions. Salvando sem a coluna.");
        const fallback = await supabase.from("copabolao_predictions").upsert({
          id,
          user_id: userId,
          match_id: matchId,
          home_score: homeScore,
          away_score: awayScore,
          points_earned: pointsEarned !== undefined ? pointsEarned : null,
        });
        error = fallback.error;
      }

      if (error) logError("db-predictions-upsert", error);
      return res.json({ success: !error });
    } catch (error: any) {
      logError("db-predictions", error);
      return res.json({ success: false, error: "Erro ao salvar palpite." });
    }
  });

  // REST API: Upsert group to Supabase
  app.post("/api/db/groups", async (req, res) => {
    const parsed = dbGroupsUpsertBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados do grupo inválidos." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });

    // Auth check: user can only upsert their own groups
    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }
    if (authUser.id !== parsed.data.creatorId && !isAdminEmail(authUser.email)) {
      return res.status(403).json({ success: false, message: "Você só pode modificar seus próprios grupos." });
    }

    const { id, name, description, league, entryFee, creatorId, code, members, isPrivate } = parsed.data;
    try {
      const { error } = await supabase.from("copabolao_groups").upsert({
        id,
        name,
        description,
        league,
        entry_fee: entryFee,
        creator_id: creatorId,
        code,
        members,
        is_private: isPrivate ?? false,
      });
      if (error) logError("db-groups-upsert", error);
      return res.json({ success: !error });
    } catch (error: any) {
      logError("db-groups", error);
      return res.json({ success: false, error: "Erro ao salvar grupo." });
    }
  });

  // REST API: Upsert comment to Supabase
  app.post("/api/db/comments", async (req, res) => {
    const parsed = dbCommentsUpsertBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados do comentário inválidos." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });

    // Auth check: user can only upsert their own comments
    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }
    if (authUser.id !== parsed.data.userId && !isAdminEmail(authUser.email)) {
      return res.status(403).json({ success: false, message: "Você só pode modificar seus próprios comentários." });
    }

    const { id, matchId, userId, userName, userAvatar, text, timestamp, reactions } = parsed.data;
    try {
      const { error } = await supabase.from("copabolao_comments").upsert({
        id,
        match_id: matchId,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        text,
        timestamp,
        reactions,
      });
      if (error) logError("db-comments-upsert", error);
      return res.json({ success: !error });
    } catch (error: any) {
      logError("db-comments", error);
      return res.json({ success: false, error: "Erro ao salvar comentário." });
    }
  });

  // REST API: Upsert match to Supabase (Simulator sync)
  app.post("/api/db/matches", async (req, res) => {
    const parsed = dbMatchesUpsertBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados da partida inválidos." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });

    // Auth check: only admins can upsert matches
    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }
    if (!isAdminEmail(authUser.email)) {
      return res.status(403).json({ success: false, message: "Apenas administradores podem modificar partidas." });
    }

    const { id, homeTeam, awayTeam, date, status, homeScore, awayScore, scorers, league } = parsed.data;
    try {
      const { error } = await supabase.from("copabolao_matches").upsert({
        id,
        home_team: homeTeam,
        away_team: awayTeam,
        date,
        status,
        home_score: homeScore !== undefined ? homeScore : null,
        away_score: awayScore !== undefined ? awayScore : null,
        scorers,
        league,
      });
      if (error) logError("db-matches-upsert", error);
      return res.json({ success: !error });
    } catch (error: any) {
      logError("db-matches", error);
      return res.json({ success: false, error: "Erro ao salvar partida." });
    }
  });

  // REST API: Delete group (Soft Delete with hard-delete fallback)
  app.post("/api/db/groups/delete", async (req, res) => {
    const parsed = dbGroupsDeleteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados inválidos para exclusão do grupo." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.json({ success: true, message: "Deletado em modo de simulação local com sucesso.", mode: "simulated-local" });
    }

    // Auth check
    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }

    const { groupId, userId } = parsed.data;

    // Admin can delete the public default group, but `ensureDefaultGroup` recreates it
    // on the next /api/auth/me — useful to zero out memberships/palpites without permanently
    // losing the entry-point bolão. Non-admins are blocked outright.
    if (groupId === DEFAULT_GROUP.id && !isAdminEmail(authUser.email)) {
      return res.status(403).json({
        success: false,
        message: "O bolão público oficial só pode ser deletado por um administrador.",
      });
    }

    try {
      const { data: group, error: fetchErr } = await supabase
        .from("copabolao_groups")
        .select("*")
        .eq("id", groupId)
        .maybeSingle();

      if (fetchErr) {
        if (fetchErr.code === "42P01" || fetchErr.message?.includes("does not exist") || fetchErr.message?.includes("relation")) {
          return res.json({
            success: true,
            message: "Excluído com sucesso (modo local temporário - execute os scripts SQL no painel do Supabase!).",
            mode: "simulated-local-fallback",
          });
        }
        return res.json({ success: false, message: "Erro ao verificar permissões do bolão." });
      }

      if (!group) {
        return res.json({ success: true, message: "Removido localmente com sucesso.", mode: "not-found-fallback" });
      }

      const normalizedUserId = userId?.toLowerCase() || "";
      const isAdmin = isAdminEmail(authUser.email);
      const isCreator = group.creator_id?.toLowerCase() === normalizedUserId;

      if (!isAdmin && !isCreator) {
        return res.json({ success: false, message: "Você não tem permissão para deletar este grupo. Apenas o criador ou o administrador podem deletá-lo." });
      }

      // Try soft-delete
      const { error: updateErr } = await supabase
        .from("copabolao_groups")
        .update({ deleted: true })
        .eq("id", groupId);

      if (updateErr) {
        console.log("Soft-delete falhou (provavelmente sem a coluna 'deleted'). Executando Hard Delete...");
        const { error: hardDeleteErr } = await supabase
          .from("copabolao_groups")
          .delete()
          .eq("id", groupId);

        if (hardDeleteErr) {
          return res.json({
            success: true,
            message: "Excluído com sucesso localmente.",
            mode: "simulated-local-fallback",
          });
        }
        return res.json({ success: true, mode: "hard-delete", message: "Bolão excluído permanentemente do Supabase." });
      }

      return res.json({ success: true, mode: "soft-delete", message: "Bolão excluído com sucesso." });
    } catch (err: any) {
      logError("db-groups-delete", err);
      return res.json({
        success: true,
        message: "Excluído com sucesso localmente.",
        mode: "simulated-local-error-fallback",
      });
    }
  });

  // REST API: Delete user (Soft Delete with hard-delete fallback)
  app.post("/api/db/users/delete", async (req, res) => {
    const parsed = dbUsersDeleteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Dados inválidos para exclusão de conta." });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.json({ success: true, message: "Deletado em modo de simulação local com sucesso.", mode: "simulated-local" });
    }

    // Auth check
    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }

    const { targetUserId, requesterUserId } = parsed.data;
    const normalizedRequesterId = requesterUserId?.toLowerCase() || "";
    const normalizedTargetId = targetUserId?.toLowerCase() || "";
    const isAdmin = isAdminEmail(authUser.email);
    const isSelf = normalizedTargetId === normalizedRequesterId || authUser.id === normalizedTargetId;

    if (!isAdmin && !isSelf) {
      return res.json({ success: false, message: "Apenas administradores ou o próprio usuário podem deletar esta conta." });
    }

    try {
      const { error: updateErr } = await supabase
        .from("copabolao_users")
        .update({ deleted: true })
        .eq("id", targetUserId);

      if (updateErr) {
        console.log("Soft-delete de usuário falhou (provavelmente sem a coluna 'deleted'). Executando Hard Delete...");
        const { error: hardDeleteErr } = await supabase
          .from("copabolao_users")
          .delete()
          .eq("id", targetUserId);

        if (hardDeleteErr) {
          return res.json({
            success: true,
            message: "Sua conta foi removida com sucesso localmente.",
            mode: "simulated-local-fallback",
          });
        }
        return res.json({ success: true, mode: "hard-delete", message: "Sua conta foi excluída permanentemente do Supabase." });
      }

      return res.json({ success: true, mode: "soft-delete", message: "Sua conta foi excluída com sucesso." });
    } catch (err: any) {
      logError("db-users-delete", err);
      return res.json({
        success: true,
        message: "Sua conta foi excluída com sucesso localmente.",
        mode: "simulated-local-error-fallback",
      });
    }
  });

  // Vite dev server vs production build static server middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();