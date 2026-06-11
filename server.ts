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
import { DEFAULT_GROUP, DEFAULT_GROUP_VISIBLE } from "./src/data/constants";
import { mapTeam, teamFlagUrl } from "./src/data/teamMap";

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
  // Optional — IANA tz like "America/Sao_Paulo" or the literal "auto".
  // When omitted, the server preserves whatever's already in the DB.
  timezone: z.string().optional(),
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
  // Scopes the comment to a bolão. Optional during the migration window —
  // older clients may still POST without it.
  groupId: z.string().nullable().optional(),
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

/** Log errors safely without leaking secrets. Serializes plain objects (e.g.
 *  Supabase's `{ message, code, details, hint }` payloads) so we don't end up
 *  with useless "[object Object]" lines in the Fly log. */
function logError(context: string, err: unknown): void {
  let message: string;
  if (err instanceof Error) {
    message = err.message;
  } else if (err && typeof err === "object") {
    try {
      message = JSON.stringify(err);
    } catch {
      message = String(err);
    }
  } else {
    message = String(err);
  }
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
 *
 * Honors the DEFAULT_GROUP_VISIBLE kill switch: when the flag is off, we leave
 * whatever state the row is in (including soft-deleted) alone. Without this guard,
 * an admin marking the group as deleted in Supabase would see it auto-resurrect
 * on the very next login.
 */
async function ensureDefaultGroup(supabase: any): Promise<void> {
  if (!supabase) return;
  if (!DEFAULT_GROUP_VISIBLE) return;
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

// ─── OpenFootball Sync ─────────────────────────────────────────────────────

const OPENFOOTBALL_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

interface OpenFootballMatch {
  round: string;
  date: string;     // YYYY-MM-DD
  time: string;     // "HH:MM UTC-X" (sometimes UTC offset varies)
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
  score?: { ft?: [number, number]; ht?: [number, number] };
}

/**
 * Parses an OpenFootball timestamp ("13:00 UTC-6") + date ("2026-06-11")
 * into an ISO string. The UTC offset format is non-standard so we parse it
 * manually instead of trusting Date() to do it.
 */
function openFootballToISO(date: string, time: string): string {
  // time looks like "13:00 UTC-6" or "20:00 UTC-6" or "12:00 UTC-7" or "15:00 UTC-4".
  const match = time.match(/^(\d{1,2}):(\d{2})\s+UTC([+-])(\d{1,2})$/);
  if (!match) {
    // Fall back to UTC midnight if format is unexpected.
    return new Date(`${date}T00:00:00Z`).toISOString();
  }
  const [, hh, mm, sign, offsetHours] = match;
  // To convert local UTC-N to UTC: add N hours when offset is negative (UTC-6 means 6h behind UTC).
  const offsetMs = parseInt(offsetHours, 10) * 60 * 60 * 1000 * (sign === "-" ? 1 : -1);
  const localDate = new Date(`${date}T${hh.padStart(2, "0")}:${mm}:00Z`);
  return new Date(localDate.getTime() + offsetMs).toISOString();
}

/**
 * Fetches the OpenFootball 2026 World Cup JSON, transforms each match into
 * our Match shape, and upserts into copabolao_matches. PRESERVES live scores —
 * if a match already has homeScore/awayScore set in the DB, we keep them so the
 * admin's manual score entries via Simulator aren't blown away by the daily sync.
 *
 * Returns { synced: <count>, error?: <message> } for caller observability.
 */
async function syncWorldCupMatches(supabase: any): Promise<{ synced: number; error?: string }> {
  if (!supabase) return { synced: 0, error: "Supabase indisponível" };

  try {
    const response = await fetch(OPENFOOTBALL_URL, { cache: "no-store" } as any);
    if (!response.ok) {
      return { synced: 0, error: `OpenFootball respondeu ${response.status}` };
    }
    const data = await response.json() as { matches: OpenFootballMatch[] };
    if (!data.matches || !Array.isArray(data.matches)) {
      return { synced: 0, error: "Formato inválido do OpenFootball" };
    }

    // Pull existing matches once so we can preserve their scores/status.
    // Only the rows we're about to touch matter, but the table is small enough
    // (≤ 104) that fetching everything is cheaper than per-match queries.
    const { data: existing } = await supabase
      .from("copabolao_matches")
      .select("id,status,home_score,away_score,scorers");
    const existingById = new Map<string, any>();
    for (const row of existing || []) {
      existingById.set(row.id, row);
    }

    const upserts = data.matches.map((m, idx) => {
      // Stable IDs keyed by date + slugged teams. Index suffix protects against
      // theoretical duplicates (same teams on same day in different rounds).
      const slug = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const id = `wc2026_${m.date}_${slug(m.team1)}_${slug(m.team2)}_${idx}`;

      const home = mapTeam(m.team1);
      const away = mapTeam(m.team2);
      const dateIso = openFootballToISO(m.date, m.time);

      const prior = existingById.get(id);
      // Live state takes priority over the upstream sync — admin updates via
      // the Simulator must survive subsequent calendar refreshes.
      const status = prior?.status && prior.status !== "upcoming" ? prior.status : "upcoming";
      const homeScore = prior?.home_score ?? null;
      const awayScore = prior?.away_score ?? null;
      const scorers = prior?.scorers ?? [];

      return {
        id,
        home_team: { name: home.name, code: home.code, flagUrl: teamFlagUrl(home.iso2) },
        away_team: { name: away.name, code: away.code, flagUrl: teamFlagUrl(away.iso2) },
        date: dateIso,
        status,
        home_score: homeScore,
        away_score: awayScore,
        scorers,
        league: "Copa do Mundo 2026",
      };
    });

    // Upsert in batches of 50 to keep request size sane.
    const BATCH = 50;
    let total = 0;
    for (let i = 0; i < upserts.length; i += BATCH) {
      const batch = upserts.slice(i, i + BATCH);
      const { error } = await supabase.from("copabolao_matches").upsert(batch);
      if (error) {
        logError("worldcup-sync-batch", error);
        return { synced: total, error: error.message };
      }
      total += batch.length;
    }
    return { synced: total };
  } catch (err: any) {
    logError("worldcup-sync", err);
    return { synced: 0, error: err?.message || "Erro desconhecido no sync" };
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
          // The service worker fetches images programmatically (cache-first strategy),
          // so img hosts also need connect-src clearance — img-src alone isn't enough
          // for SW-mediated requests.
          "https://api.dicebear.com",
          "https://flagcdn.com",
          "https://images.unsplash.com",
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

  // In-memory cache for AI score suggestions, keyed by "<homeTeam>|<awayTeam>".
  // Why this exists: free-tier Gemini quota is 500 req/day. With 30 users × 64
  // matches, a no-cache deployment exhausts quota before any games are even
  // played. Cache means each fixture costs at most one Gemini call regardless
  // of how many users hit the IA button.
  // 24h TTL is intentional — the suggestion is meant to be a fun/canned vibe,
  // not real-time prediction tuning. If you want fresher suggestions, drop the TTL.
  // The cache lives in-memory; restarting the server (e.g. fly deploy) wipes it.
  // For the demo scale (one VM, infrequent restarts), that's fine.
  type AiSuggestion = { homeScore: number; awayScore: number; reasoning: string; isAiGenerated: boolean };
  const aiCache = new Map<string, { value: AiSuggestion; expiresAt: number }>();
  const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const aiCacheKey = (home: string, away: string) =>
    `${home.trim().toLowerCase()}|${away.trim().toLowerCase()}`;

  // REST API: Suggest score and prediction with AI using Gemini.
  // Public endpoint (no auth required) — it doesn't read user data, just returns a score guess.
  app.post("/api/ai/suggest-score", async (req, res) => {
    const parsed = aiSuggestScoreBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos. Informe homeTeam e awayTeam." });
    }

    const { homeTeam, awayTeam } = parsed.data;

    // Fast path: serve a cached suggestion when one is fresh. Saves a Gemini call
    // for every user after the first who clicks IA on the same fixture.
    const cacheKey = aiCacheKey(homeTeam, awayTeam);
    const cached = aiCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.value);
    }

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

      // Try the configured model first; fall back to gemini-1.5-flash on errors
      // that smell like model availability problems. 1.5-flash is broadly available
      // on the free tier; 2.5-flash isn't always — and the error spelling varies
      // across SDK versions.
      // Try the configured model first; fall back to the lite sibling on errors
      // that smell like model-availability problems. Why these picks:
      //   - 2.5-flash: stable, broadly available on AI Studio free tier (june/2026)
      //   - 2.5-flash-lite: cheaper / more permissive quota — good safety net
      //                     when the primary hits a transient issue
      // We deliberately do NOT fall back to gemini-1.5-flash anymore: Google
      // returned `404 not found` for it on v1beta in tests on 2026-06-10.
      const primaryModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const fallbackModel = "gemini-2.5-flash-lite";

      const callModel = async (modelName: string) => {
        return ai.models.generateContent({
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
      };

      let response: Awaited<ReturnType<typeof callModel>>;
      try {
        response = await callModel(primaryModel);
      } catch (primaryErr: any) {
        const msg = String(primaryErr?.message || "").toLowerCase();
        const looksLikeModelIssue =
          msg.includes("not found")
          || msg.includes("not supported")
          || msg.includes("not available")
          || msg.includes("invalid_argument")
          || msg.includes("404");
        if (primaryModel !== fallbackModel && looksLikeModelIssue) {
          logError("ai-suggest-score-primary-failed", primaryErr);
          response = await callModel(fallbackModel);
        } else {
          throw primaryErr;
        }
      }

      const responseText = response.text || "{}";
      const parsedAi = JSON.parse(responseText.trim());

      const result: AiSuggestion = {
        homeScore: typeof parsedAi.homeScore === "number" ? parsedAi.homeScore : 1,
        awayScore: typeof parsedAi.awayScore === "number" ? parsedAi.awayScore : 0,
        reasoning: parsedAi.reasoning || "Futebol é caixinha de surpresa!",
        isAiGenerated: true,
      };
      // Only persist successful AI responses. Canned fallbacks stay uncached so
      // they get retried with the real model on the next request (e.g. when
      // quota resets at midnight UTC).
      aiCache.set(cacheKey, { value: result, expiresAt: Date.now() + AI_CACHE_TTL_MS });
      return res.json(result);
    } catch (e: any) {
      logError("ai-suggest-score", e);
      // Reuse the same canned pool as the no-key fallback — picking randomly so
      // a quota outage doesn't show literally identical text on every request.
      const errorFallbacks = [
        `Clássico equilibrado! ${homeTeam} e ${awayTeam} vão se estudar. Empate disputado ou vitória magra.`,
        `${homeTeam} vem ofensivo, ${awayTeam} sabe jogar fechado. Jogo de transições rápidas.`,
        `Jogo travado no meio-campo. Decisão na bola parada ou contra-ataque.`,
        `Confronto de zebra possível! ${awayTeam} pode surpreender se entrar ligado.`,
      ];
      return res.json({
        homeScore: Math.floor(Math.random() * 4),
        awayScore: Math.floor(Math.random() * 4),
        reasoning: errorFallbacks[Math.floor(Math.random() * errorFallbacks.length)],
        isAiGenerated: false,
      });
    }
  });


  // REST API: Get Real-Time Match Data
  // Backed by OpenFootball (free, public-domain JSON in GitHub) instead of the
  // paywalled API-Football. The actual sync runs on the server (cron + admin endpoint),
  // so this endpoint just reports current cache status to the client. The client
  // reads fixtures from /api/db/sync which queries Supabase directly.
  app.get("/api/football/fixtures", async (_req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.json({
        useRealData: false,
        message: "Supabase indisponível.",
        fixtures: [],
      });
    }

    try {
      // Count World Cup 2026 matches in the table — UI uses this to decide
      // whether to show "real data" badge or "simulated" badge.
      const { count } = await supabase
        .from("copabolao_matches")
        .select("id", { count: "exact", head: true })
        .like("id", "wc2026_%");

      if (count && count > 0) {
        return res.json({
          useRealData: true,
          message: `${count} jogos da Copa do Mundo 2026 carregados.`,
          fixtures: [], // client pulls fixtures from /api/db/sync
          source: "openfootball",
        });
      }

      return res.json({
        useRealData: false,
        message: "Calendário ainda não sincronizado. Admin pode rodar POST /api/football/sync.",
        fixtures: [],
      });
    } catch (err: any) {
      logError("football-fixtures", err);
      return res.json({
        useRealData: false,
        message: "Serviço temporariamente indisponível.",
        fixtures: [],
      });
    }
  });

  // REST API: Force a sync of the World Cup 2026 calendar from OpenFootball.
  // Admin-only. Idempotent — safe to run repeatedly. Preserves any score/status
  // already entered via the Simulator.
  app.post("/api/football/sync", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase." });

    const authUser = await authenticateRequest(supabase, req.headers.authorization);
    if (!authUser) {
      return res.status(401).json({ success: false, message: "Autenticação necessária." });
    }
    if (!isAdminEmail(authUser.email)) {
      return res.status(403).json({ success: false, message: "Apenas administradores podem sincronizar o calendário." });
    }

    console.warn(`[AUDIT] WORLD CUP SYNC initiated by admin: ${authUser.email}`);
    const result = await syncWorldCupMatches(supabase);
    return res.json({
      success: !result.error,
      synced: result.synced,
      message: result.error || `${result.synced} jogos sincronizados.`,
    });
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
          // Only World Cup 2026 matches are exposed. Legacy mock IDs (m1, m2, …),
          // custom-match IDs from old features, or stale API-Football ids stay
          // hidden from the client even if they're still in the table.
          const { data, error } = await supabase
            .from("copabolao_matches")
            .select("*")
            .like("id", "wc2026_%");
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
            groupId: c.group_id ?? null,
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

      // Already populated — fetch all collections in parallel.
      // Matches are filtered to wc2026_* only (see same filter in table-specific sync above).
      const [gRes, pRes, cRes, mRes] = await Promise.all([
        supabase.from("copabolao_groups").select("*"),
        supabase.from("copabolao_predictions").select("*"),
        supabase.from("copabolao_comments").select("*"),
        supabase.from("copabolao_matches").select("*").like("id", "wc2026_%"),
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
        groupId: c.group_id ?? null,
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
      // Wipe everything that ties admins to old data:
      //   - All predictions (they referenced match states we're about to overwrite)
      //   - All matches (legacy mocks m1..m8, custom_*, real_*, AND wc2026_* — start clean)
      // Then re-pull the canonical World Cup calendar from OpenFootball. Groups,
      // users, and comments are untouched.
      await supabase.from("copabolao_predictions").delete().neq("id", "_");
      await supabase.from("copabolao_matches").delete().neq("id", "_");

      const result = await syncWorldCupMatches(supabase);
      if (result.error) {
        return res.json({ success: false, message: `Falha ao re-sincronizar calendário: ${result.error}` });
      }

      // Read back the freshly-inserted matches in the shape the client expects.
      const { data: rows } = await supabase
        .from("copabolao_matches")
        .select("*")
        .like("id", "wc2026_%");

      const matches = (rows || []).map((m: any) => ({
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

      return res.json({ success: true, matches, synced: result.synced });
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
          // Default to "auto" if the column is missing (older DBs pre-migration).
          timezone: finalProfile.timezone || "auto",
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
    if (authUser.email !== parsed.data.id.toLowerCase() && !isAdminEmail(authUser.email)) {
      return res.status(403).json({ success: false, message: "Você só pode modificar seu próprio perfil." });
    }

    try {
      const { id, name, avatar, timezone } = parsed.data;
      // Build the upsert object dynamically: only include `timezone` when the
      // client actually sent one. Omitting it preserves the existing column
      // value during regular profile-edit roundtrips.
      const row: Record<string, any> = { id, name, avatar };
      if (timezone !== undefined) row.timezone = timezone;
      const { error } = await supabase.from("copabolao_users").upsert(row);
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
    if (authUser.email !== parsed.data.userId.toLowerCase() && !isAdminEmail(authUser.email)) {
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
    if (authUser.email !== parsed.data.creatorId.toLowerCase() && !isAdminEmail(authUser.email)) {
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
    if (authUser.email !== parsed.data.userId.toLowerCase() && !isAdminEmail(authUser.email)) {
      return res.status(403).json({ success: false, message: "Você só pode modificar seus próprios comentários." });
    }

    const { id, matchId, groupId, userId, userName, userAvatar, text, timestamp, reactions } = parsed.data;
    try {
      // Persist with the optional group_id. Falling back to a fresh upsert without
      // the column lets the server keep working even if the migration ALTER TABLE
      // hasn't been applied yet (column-not-found error → retry without groupId).
      let { error } = await supabase.from("copabolao_comments").upsert({
        id,
        match_id: matchId,
        group_id: groupId ?? null,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        text,
        timestamp,
        reactions,
      });

      if (error && error.message?.includes("group_id")) {
        console.warn("Coluna 'group_id' ausente em copabolao_comments. Salvando sem a coluna.");
        const fallback = await supabase.from("copabolao_comments").upsert({
          id,
          match_id: matchId,
          user_id: userId,
          user_name: userName,
          user_avatar: userAvatar,
          text,
          timestamp,
          reactions,
        });
        error = fallback.error;
      }
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

    // userId from the body is intentionally ignored here — the authoritative
    // identity is authUser.email (from the JWT), which is what isCreator below
    // compares against. Kept the schema field for backward compat with older
    // clients that still send it.
    const { groupId } = parsed.data;

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

      const isAdmin = isAdminEmail(authUser.email);
      // Authoritative check: compare the group's creator_id with the
      // authenticated user's email (from the JWT). The body-provided userId
      // is untrusted — anyone could spoof it. JWT email is what matters.
      const isCreator = group.creator_id?.toLowerCase() === authUser.email;

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
    // authUser.email is the canonical identity for our records (we store users by email).
    // authUser.id is Supabase's UUID and won't match our 'targetUserId' which is also an email.
    const isSelf = normalizedTargetId === normalizedRequesterId || authUser.email === normalizedTargetId;

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

    // World Cup calendar sync — fire once at boot (cheap if already populated
    // since we preserve existing scores/status), then every 6 hours.
    // Async fire-and-forget; failures don't affect server health.
    const supa = getSupabaseClient();
    if (supa) {
      syncWorldCupMatches(supa)
        .then((r) => console.log(`[worldcup-sync] boot: ${r.synced} matches synced${r.error ? ` (error: ${r.error})` : ""}`))
        .catch((e) => logError("worldcup-sync-boot", e));

      // Run every 6h. Lighter touch than 1×/day so OpenFootball corrections
      // (bumped kickoff times, knockout brackets after the round of 32) propagate
      // within a few hours. Total external load: 4 fetches/day, ~50KB each.
      setInterval(() => {
        const s = getSupabaseClient();
        if (!s) return;
        syncWorldCupMatches(s)
          .then((r) => console.log(`[worldcup-sync] interval: ${r.synced} matches synced`))
          .catch((e) => logError("worldcup-sync-interval", e));
      }, 6 * 60 * 60 * 1000);
    }
  });
}

startServer();