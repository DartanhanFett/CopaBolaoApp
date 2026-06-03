import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import helmet from "helmet";
import cors from "cors";
import { INITIAL_USERS, INITIAL_MATCHES, INITIAL_GROUPS, INITIAL_COMMENTS } from "./src/data/initialData";

dotenv.config();

// ─── Zod Validation Schemas ─────────────────────────────────────────────────

const footballFixturesQuerySchema = z.object({}).optional();

const aiCommentBodySchema = z.object({
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  userComment: z.string().min(1),
  userName: z.string().min(1),
  userPrediction: z.string().optional(),
  otherMembers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    avatar: z.string(),
  })).optional(),
});

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

  // --- Security Headers (Helmet) ---
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  }));

  // --- CORS Configuration ---
  app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }));

  app.use(express.json({ limit: "1mb" }));
  const PORT = 3000;

  // --- Sync Mutex Instance ---
  const syncMutex = new SyncMutex();

  // Supabase Client: Lazy initialization to prevent app crash if environment credentials are missing
  let supabaseInstance: any = null;
  function getSupabaseClient() {
    if (!supabaseInstance) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && key) {
        supabaseInstance = createClient(url, key);
      }
    }
    return supabaseInstance;
  }

  // Gemini Client: Lazy initialization to prevent app crash if environment key is missing
  let aiInstance: GoogleGenAI | null = null;
  function getGeminiClient() {
    if (!aiInstance) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return null;
      aiInstance = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiInstance;
  }

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

  // REST API: Intelligent banter comments generator using Gemini (Option B)
  app.post("/api/ai/comment", async (req, res) => {
    const parsed = aiCommentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos para geração de comentário." });
    }

    const { homeTeam, awayTeam, userComment, userName, userPrediction, otherMembers } = parsed.data;

    const randomMember = otherMembers && otherMembers.length > 0
      ? otherMembers[Math.floor(Math.random() * otherMembers.length)]
      : { id: "u2", name: "Guilherme", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80" };

    const ai = getGeminiClient();
    if (!ai) {
      const fallbacks = [
        "Rapaz, que palpite ousado! Eu apostei no empate em?! 🤔",
        "Estou achando que vai ser jogo duro, mas seu bolão está bem cotado!",
        "Vixi, se der esse placar eu subo pro primeiro lugar haha! 🚀🔥",
        "Concordo plenamente com o comentário de cima. Esse jogo promete!",
        "Duvido muito hein! Mas vamos ver no final do jogo!",
      ];
      return res.json({
        comment: fallbacks[Math.floor(Math.random() * fallbacks.length)],
        author: randomMember,
        isAiGenerated: false,
      });
    }

    try {
      const prompt = `Você é um participante zueiro, fanático por futebol e altamente corneteiro em um grupo de Whatsapp de bolão da Copa do Mundo chamado "${randomMember.name}".
Seu amigo "${userName}" acabou de mandar um comentário/palpite sobre o jogo entre ${homeTeam} e ${awayTeam}.
A mensagem de "${userName}" foi: "${userComment}".
O palpite exato dele para esse jogo é: "${userPrediction || "Não palpitou ainda"}".

Instruções para seu comentário de resposta rápida:
1. Responda de forma extremamente natural, como se estivesse digitando rápido no Whatsapp deitado no sofá.
2. Escreva prioritariamente em letras minúsculas, use abreviações normais de internet (ex: 'tb', 'vc', 'nd', 'q', 'ta', 'mto', 'kkkk'). No máximo uma exclamação ou interrogação.
3. Use gírias reais e atuais do futebol brasileiro (ex: 'viajou legal', 'zicou', 'empolgou', 'na retranca', 'cheirinho', 'mala', 'pé frio', 'mitaço', 'pipocou', 'iludido').
4. Não dê respostas compridas, genéricas nem formais! Se o palpite dele for absurdo, ironize rápido. Se for pé-frio, corneteie.
5. Limite-se a no máximo 12 palavras.
6. Responda APENAS com a mensagem de chat direta, sem aspas, preâmbulos ou explicações.

Exemplos de tom esperado:
- "kkkkk viajou demais, esse time não faz gol nem se o goleiro sair"
- "nem ferrando, o ataque deles tá mto ruim de pontaria"
- "zicou legal agora clã kkkkk se der esse placar eu pago a breja"
- "boa mestre tb acho q o contra-ataque vai liquidar os caras hoje"`;

      const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });

      const responseText = (response.text || "").replace(/"/g, "").trim();
      return res.json({
        comment: responseText || "Rapaz, concordo com você!",
        author: randomMember,
        isAiGenerated: true,
      });
    } catch (e: any) {
      logError("ai-comment", e);
      return res.json({
        comment: "Olha lá hein! Jogo vai ser muito pegado!",
        author: randomMember,
        isAiGenerated: false,
      });
    }
  });

  // REST API: Suggest score and prediction with AI using Gemini
  app.post("/api/ai/suggest-score", async (req, res) => {
    const parsed = aiSuggestScoreBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos. Informe homeTeam e awayTeam." });
    }

    const { homeTeam, awayTeam } = parsed.data;

    const ai = getGeminiClient();
    if (!ai) {
      const randomHome = Math.floor(Math.random() * 3);
      const randomAway = Math.floor(Math.random() * 3);
      const fallbacks = [
        `Clássico equilibrado! ${homeTeam} e ${awayTeam} vão se estudar bastante. Acho que sai um empate disputado ou vitória magra do time que cometer menos erros.`,
        `O time do ${homeTeam} vem de boa fase ofensiva, mas o ${awayTeam} sabe jogar bem fechadinho. Jogo de transições rápidas e forte marcação!`,
        `Minha intuição de futebol diz que este confronto promete fortes emoções. Vejo uma leve vantagem tática para o ${homeTeam} neste momento.`,
      ];
      return res.json({
        homeScore: randomHome,
        awayScore: randomAway,
        reasoning: fallbacks[Math.floor(Math.random() * fallbacks.length)],
        isAiGenerated: false,
      });
    }

    try {
      const prompt = `Analise de forma divertida o confronto de futebol entre "${homeTeam}" e "${awayTeam}" de acordo com o clima da Copa do Mundo.
Você é um palpiteiro raiz, fanfarrão, extremamente sincero, analítico e bem-humorado do futebol brasileiro. 

REGRAS CRÍTICAS PARA OS PLACARES (DIVERSIDADE):
- NÃO sugira sempre o mesmo placar! Varie bastante as suposições. Evite a mesmice de sempre sugerir 2x1 ou 1x1.
- Sinta-se livre para prever empates malucos (ex: 2 a 2, 3 a 3), vitórias folgadas, derrotas surpreendentes (zebras históricas), ou jogos ultra defense (0 a 0).
- Proponha placares criativos e variados de acordo com sua intuição de torcedor fanfarrão.

Instruções para o comentário explicativo ('reasoning'):
1. NÃO fale como um robô. Use expressões clássicas da resenha pós-jogo brasileira de forma super natural (ex: 'entregar a paçoca', 'chocolate com direito a dancinha', 'retranca pesada', 'jogo de compadres', 'lei do ex infalível', 'oxigênio extra', 'suco de futebol brasileiro').
2. Seja super curto e divertido (máximo de 18 palavras).
3. Seja opinativo, zueiro e direto ao ponto. Por exemplo, se antecipar uma zebra ou goleada, meta a boca ou celebre o futebol arte.

Seu retorno DEVE seguir estritamente o formato JSON fornecido.
Seu JSON de retorno DEVE conter estes campos exatos:
{
  "homeScore": número inteiro de gols para o time da casa (home team),
  "awayScore": número inteiro de gols para o time visitante (away team),
  "reasoning": "explicação curta, zueira e cheia de gíria da resenha de futebol brasileiro"
}`;

      const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash";
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              homeScore: {
                type: Type.INTEGER,
                description: "Placar sugerido para o time de casa (home team)",
              },
              awayScore: {
                type: Type.INTEGER,
                description: "Placar sugerido para o time visitante (away team)",
              },
              reasoning: {
                type: Type.STRING,
                description: "Breve comentário justificando o palpite de forma divertida e analítica",
              },
            },
            required: ["homeScore", "awayScore", "reasoning"],
          },
        },
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText.trim());

      return res.json({
        homeScore: typeof parsed.homeScore === "number" ? parsed.homeScore : 1,
        awayScore: typeof parsed.awayScore === "number" ? parsed.awayScore : 0,
        reasoning: parsed.reasoning || "Futebol é uma caixinha de surpresas!",
        isAiGenerated: true,
      });
    } catch (e: any) {
      logError("ai-suggest-score", e);
      return res.json({
        homeScore: 1,
        awayScore: 1,
        reasoning: "Esse jogo vai ser travado demais no meio de campo, aposto num 1 a 1 de segurança!",
        isAiGenerated: false,
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

      // Proactive Auto-Seeding if table is empty
      if (!users || users.length === 0) {
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

  // REST API: Reset database on Supabase with fresh dynamic match dates
  // PROTECTED: Requires admin authentication via Bearer token + confirmation token
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

    // --- CONFIRMATION TOKEN CHECK ---
    const { confirmationToken } = parsed.data;
    const expectedToken = process.env.RESET_CONFIRMATION_TOKEN;

    if (expectedToken && confirmationToken !== expectedToken) {
      return res.status(403).json({
        success: false,
        message: "Token de confirmação inválido. O reset requer um token de segurança adicional.",
      });
    }

    // --- AUDIT LOG ---
    console.warn(`[AUDIT] DATABASE RESET initiated by admin: ${authUser.email} at ${new Date().toISOString()}`);

    await syncMutex.acquire();
    try {
      await supabase.from("copabolao_predictions").delete().neq("id", "_");

      await supabase.from("copabolao_comments").delete().neq("id", "_");
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
      if (mappedComments.length > 0) {
        await supabase.from("copabolao_comments").insert(mappedComments);
      }

      await supabase.from("copabolao_groups").delete().neq("id", "_");
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
      if (mappedGroups.length > 0) {
        await supabase.from("copabolao_groups").insert(mappedGroups);
      }

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

    const { id, name, description, league, entryFee, creatorId, code, members } = parsed.data;
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