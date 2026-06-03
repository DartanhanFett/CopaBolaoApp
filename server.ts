import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { INITIAL_USERS, INITIAL_MATCHES, INITIAL_GROUPS, INITIAL_COMMENTS } from "./src/data/initialData";

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

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
        fixtures: []
      });
    }

    try {
      // API-Football endpoint: fetching all matches for World Cup 2026 (league=1, season=2026)
      const response = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
        method: "GET",
        headers: {
          "x-apisports-key": footballApiKey,
          "x-rapidapi-key": footballApiKey,
        }
      });

      const data: any = await response.json();

      if (data.errors && Object.keys(data.errors).length > 0) {
        return res.json({
          useRealData: false,
          message: `Erro recebido da API-Football: ${JSON.stringify(data.errors)}`,
          fixtures: []
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

      // Persist real matches to Supabase table so we have them loaded globally and stored securely
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
            league: m.league
          }));
          await supabase.from("copabolao_matches").upsert(mappedMatchesForSupabase);
        } catch (dbErr: any) {
          console.error("Falha ao salvar partidas reais no Supabase:", dbErr.message);
        }
      }

      return res.json({
        useRealData: true,
        fixtures: mappedFixtures
      });

    } catch (err: any) {
      return res.json({
        useRealData: false,
        message: `Falha na conexão com API-Football: ${err.message}`,
        fixtures: []
      });
    }
  });

  // REST API: Intelligent banter comments generator using Gemini (Option B)
  app.post("/api/ai/comment", async (req, res) => {
    const { homeTeam, awayTeam, userComment, userName, userPrediction, otherMembers } = req.body;
    
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
        "Duvido muito hein! Mas vamos ver no final do jogo!"
      ];
      return res.json({
        comment: fallbacks[Math.floor(Math.random() * fallbacks.length)],
        author: randomMember,
        isAiGenerated: false
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
        isAiGenerated: true
      });
    } catch (e: any) {
      console.error("Gemini Generation Error:", e);
      return res.json({
        comment: "Olha lá hein! Jogo vai ser muito pegado!",
        author: randomMember,
        isAiGenerated: false
      });
    }
  });

  // REST API: Suggest score and prediction with AI using Gemini
  app.post("/api/ai/suggest-score", async (req, res) => {
    const { homeTeam, awayTeam } = req.body;
    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ error: "Times de casa e visitante são obrigatórios." });
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Local smart fallback
      const randomHome = Math.floor(Math.random() * 3);
      const randomAway = Math.floor(Math.random() * 3);
      const fallbacks = [
        `Clássico equilibrado! ${homeTeam} e ${awayTeam} vão se estudar bastante. Acho que sai um empate disputado ou vitória magra do time que cometer menos erros.`,
        `O time do ${homeTeam} vem de boa fase ofensiva, mas o ${awayTeam} sabe jogar bem fechadinho. Jogo de transições rápidas e forte marcação!`,
        `Minha intuição de futebol diz que este confronto promete fortes emoções. Vejo uma leve vantagem tática para o ${homeTeam} neste momento.`
      ];
      return res.json({
        homeScore: randomHome,
        awayScore: randomAway,
        reasoning: fallbacks[Math.floor(Math.random() * fallbacks.length)],
        isAiGenerated: false
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
                description: "Placar sugerido para o time de casa (home team)"
              },
              awayScore: {
                type: Type.INTEGER,
                description: "Placar sugerido para o time visitante (away team)"
              },
              reasoning: {
                type: Type.STRING,
                description: "Breve comentário justificando o palpite de forma divertida e analítica"
              }
            },
            required: ["homeScore", "awayScore", "reasoning"]
          }
        }
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText.trim());

      return res.json({
        homeScore: typeof parsed.homeScore === 'number' ? parsed.homeScore : 1,
        awayScore: typeof parsed.awayScore === 'number' ? parsed.awayScore : 0,
        reasoning: parsed.reasoning || "Futebol é uma caixinha de surpresas!",
        isAiGenerated: true
      });
    } catch (e: any) {
      console.error("Gemini Suggestion Error:", e);
      return res.json({
        homeScore: 1,
        awayScore: 1,
        reasoning: "Esse jogo vai ser travado demais no meio de campo, aposto num 1 a 1 de segurança!",
        isAiGenerated: false
      });
    }
  });

  // REST API: Sync database states with Supabase
  app.get("/api/db/sync", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.json({
        connected: false,
        message: "Supabase não configurado localmente no backend.",
      });
    }

    const tableName = req.query.table as string | undefined;

    try {
      if (tableName) {
        // Table-specific sync requests (polling helper)
        if (tableName === "copabolao_matches") {
          const { data, error } = await supabase.from("copabolao_matches").select("*");
          if (error) return res.json({ success: false, error: error.message });
          const mappedMatches = (data || []).map((m: any) => ({
            id: m.id,
            homeTeam: m.home_team,
            awayTeam: m.away_team,
            date: m.date,
            status: m.status,
            homeScore: m.home_score !== null ? Number(m.home_score) : undefined,
            awayScore: m.away_score !== null ? Number(m.away_score) : undefined,
            scorers: m.scorers || [],
            league: m.league
          }));
          return res.json({ success: true, data: mappedMatches });
        }
        if (tableName === "copabolao_users") {
          const { data, error } = await supabase.from("copabolao_users").select("*");
          if (error) return res.json({ success: false, error: error.message });
          const activeUsers = (data || []).filter((u: any) => u.deleted !== true);
          return res.json({ success: true, data: activeUsers });
        }
        if (tableName === "copabolao_groups") {
          const { data, error } = await supabase.from("copabolao_groups").select("*");
          if (error) return res.json({ success: false, error: error.message });
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
              members: g.members || []
            }));
          return res.json({ success: true, data: mappedGroups });
        }
        if (tableName === "copabolao_predictions") {
          const { data, error } = await supabase.from("copabolao_predictions").select("*");
          if (error) return res.json({ success: false, error: error.message });
          const mappedPredictions = (data || []).map((p: any) => ({
            id: p.id,
            userId: p.user_id,
            matchId: p.match_id,
            homeScore: Number(p.home_score),
            awayScore: Number(p.away_score),
            pointsEarned: p.points_earned !== null ? Number(p.points_earned) : undefined,
            groupId: p.group_id || null
          }));
          return res.json({ success: true, data: mappedPredictions });
        }
        if (tableName === "copabolao_comments") {
          const { data, error } = await supabase.from("copabolao_comments").select("*");
          if (error) return res.json({ success: false, error: error.message });
          const mappedComments = (data || []).map((c: any) => ({
            id: c.id,
            matchId: c.match_id,
            userId: c.user_id,
            userName: c.user_name,
            userAvatar: c.user_avatar,
            text: c.text,
            timestamp: c.timestamp,
            reactions: c.reactions || []
          }));
          return res.json({ success: true, data: mappedComments });
        }
        return res.json({ success: false, error: `Invalid table: ${tableName}` });
      }

      // 1. Fetch Users
      const { data: users, error: uErr } = await supabase.from("copabolao_users").select("*");
      
      if (uErr) {
        return res.json({
          connected: false,
          message: `Erro na tabela de usuários. Execute o script SQL no painel Supabase! Detalhes: ${uErr.message}`,
        });
      }

      // 2. Proactive Auto-Seeding if table is empty
      if (!users || users.length === 0) {
        console.log("Banco Supabase vazio! Iniciando Auto-Seeding para melhor experiência inicial...");
        
        // Seed Users
        await supabase.from("copabolao_users").insert(INITIAL_USERS);
        
        // Seed Groups
        const mappedGroups = INITIAL_GROUPS.map(g => ({
          id: g.id,
          name: g.name,
          description: g.description,
          league: g.league,
          entry_fee: g.entryFee,
          creator_id: g.creatorId,
          code: g.code,
          members: g.members
        }));
        await supabase.from("copabolao_groups").insert(mappedGroups);

        // Seed Matches
        const mappedMatches = INITIAL_MATCHES.map(m => ({
          id: m.id,
          home_team: m.homeTeam,
          away_team: m.awayTeam,
          date: m.date,
          status: m.status,
          home_score: m.homeScore,
          away_score: m.awayScore,
          scorers: m.scorers || [],
          league: m.league
        }));
        await supabase.from("copabolao_matches").insert(mappedMatches);

        // Seed Comments
        const mappedComments = INITIAL_COMMENTS.map(c => ({
          id: c.id,
          match_id: c.matchId,
          user_id: c.userId,
          user_name: c.userName,
          user_avatar: c.userAvatar,
          text: c.text,
          timestamp: c.timestamp,
          reactions: c.reactions
        }));
        await supabase.from("copabolao_comments").insert(mappedComments);

        // Re-fetch users after seeding
        const { data: seededUsers } = await supabase.from("copabolao_users").select("*");
        const activeSeededUsers = (seededUsers || []).filter((u: any) => u.deleted !== true);

        return res.json({
          connected: true,
          seeded: true,
          users: activeSeededUsers.length > 0 ? activeSeededUsers : INITIAL_USERS,
          groups: INITIAL_GROUPS,
          predictions: [],
          comments: INITIAL_COMMENTS,
          matches: INITIAL_MATCHES
        });
      }

      // If already populated, fetch all other collections in parallel
      const [gRes, pRes, cRes, mRes] = await Promise.all([
        supabase.from("copabolao_groups").select("*"),
        supabase.from("copabolao_predictions").select("*"),
        supabase.from("copabolao_comments").select("*"),
        supabase.from("copabolao_matches").select("*")
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
          members: g.members || []
        }));

      const mappedPredictions = (pRes.data || []).map((p: any) => ({
        id: p.id,
        userId: p.user_id,
        matchId: p.match_id,
        homeScore: Number(p.home_score),
        awayScore: Number(p.away_score),
        pointsEarned: p.points_earned !== null ? Number(p.points_earned) : undefined,
        groupId: p.group_id || null
      }));

      const mappedComments = (cRes.data || []).map((c: any) => ({
        id: c.id,
        matchId: c.match_id,
        userId: c.user_id,
        userName: c.user_name,
        userAvatar: c.user_avatar,
        text: c.text,
        timestamp: c.timestamp,
        reactions: c.reactions || []
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
        league: m.league
      }));

      return res.json({
        connected: true,
        seeded: false,
        users: activeUsers,
        groups: mappedGroups,
        predictions: mappedPredictions,
        comments: mappedComments,
        matches: mappedMatches.length > 0 ? mappedMatches : null
      });

    } catch (e: any) {
      return res.json({
        connected: false,
        message: `Falha de conexão com Supabase: ${e.message}`,
      });
    }
  });

  // REST API: Reset database on Supabase with fresh dynamic match dates
  app.post("/api/db/reset", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase conectado." });

    try {
      // 1. Delete predictions
      await supabase.from("copabolao_predictions").delete().neq("id", "_");

      // 2. Delete and re-populate comments
      await supabase.from("copabolao_comments").delete().neq("id", "_");
      const mappedComments = INITIAL_COMMENTS.map(c => ({
        id: c.id,
        match_id: c.matchId,
        user_id: c.userId,
        user_name: c.userName,
        user_avatar: c.userAvatar,
        text: c.text,
        timestamp: c.timestamp,
        reactions: c.reactions
      }));
      if (mappedComments.length > 0) {
        await supabase.from("copabolao_comments").insert(mappedComments);
      }

      // 3. Delete and re-populate groups
      await supabase.from("copabolao_groups").delete().neq("id", "_");
      const mappedGroups = INITIAL_GROUPS.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        league: g.league,
        entry_fee: g.entryFee,
        creator_id: g.creatorId,
        code: g.code,
        members: g.members
      }));
      if (mappedGroups.length > 0) {
        await supabase.from("copabolao_groups").insert(mappedGroups);
      }

      // 4. Delete and re-populate matches with clean dynamic World Cup dates from INITIAL_MATCHES
      await supabase.from("copabolao_matches").delete().neq("id", "_");
      
      const mappedMatches = INITIAL_MATCHES.map(m => ({
        id: m.id,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        date: m.date,
        status: m.status,
        home_score: m.homeScore !== undefined ? m.homeScore : null,
        away_score: m.awayScore !== undefined ? m.awayScore : null,
        scorers: m.scorers || [],
        league: m.league
      }));
      await supabase.from("copabolao_matches").insert(mappedMatches);

      return res.json({ success: true, matches: INITIAL_MATCHES });
    } catch (error: any) {
      console.error("Erro ao resetar no Supabase:", error);
      return res.json({ success: false, error: error.message });
    }
  });

  // OTP Verification API: Send OTP Code
  app.post("/api/auth/otp/send", async (req, res) => {
    const supabase = getSupabaseClient();
    const { email, isSignUp, name } = req.body;
    if (!email) {
      return res.json({ success: false, message: "E-mail é obrigatório." });
    }

    const keyId = email.toLowerCase().trim();

    try {
      if (supabase) {
        // 1. Validation checks before sending code to improve UX
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

        // 2. Send real Supabase OTP
        const { error } = await supabase.auth.signInWithOtp({
          email: keyId,
          options: {
            shouldCreateUser: true
          }
        });

        if (error) {
          console.error("Supabase OTP send error:", error);
          return res.json({ success: false, message: `Erro ao enviar e-mail OTP de acesso: ${error.message}` });
        }

        return res.json({
          success: true,
          message: "Código enviado! Verifique sua caixa de entrada.",
          isMock: false
        });
      } else {
        // Offline/Mock mode fallback when no Supabase credentials are set
        console.log(`[MOCK AUTH] Envio simulado de OTP para: ${keyId}`);
        return res.json({
          success: true,
          message: "Modo de simulação ativo: Seu código OTP de teste é 123456",
          isMock: true,
          mockCode: "123456"
        });
      }
    } catch (err: any) {
      return res.json({ success: false, message: `Erro ao processar OTP: ${err.message}` });
    }
  });

  // OTP Verification API: Verify Code & Session Setup
  app.post("/api/auth/otp/verify", async (req, res) => {
    const supabase = getSupabaseClient();
    const { email, token, isSignUp, name, avatar } = req.body;
    if (!email || !token) {
      return res.json({ success: false, message: "E-mail e código OTP são obrigatórios." });
    }

    const keyId = email.toLowerCase().trim();

    try {
      if (supabase) {
        // 1. Verify OTP token through Supabase Auth
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: keyId,
          token: token.trim(),
          type: "email"
        });

        if (verifyError) {
          // If type email fails, try fallback verify with 'signup' type just in case Supabase expects it
          const { error: retryError } = await supabase.auth.verifyOtp({
            email: keyId,
            token: token.trim(),
            type: "signup"
          });

          if (retryError) {
            console.error("Verify OTP error:", verifyError, retryError);
            return res.json({ success: false, message: `Código incorreto ou expirado: ${verifyError.message || retryError.message}` });
          }
        }

        // 2. Fetch or create the user profile in database
        const { data: existingUser } = await supabase
          .from("copabolao_users")
          .select("*")
          .eq("id", keyId)
          .maybeSingle();

        let finalUser = existingUser;

        if (isSignUp) {
          if (existingUser) {
            // Reactivate
            const { data: updated, error: uErr } = await supabase
              .from("copabolao_users")
              .update({ deleted: false, name: (name || existingUser.name || "Palpiteiro").trim(), avatar: avatar || existingUser.avatar })
              .eq("id", keyId)
              .select()
              .single();
            finalUser = updated;
          } else {
            // New register insert
            const { data: inserted, error: iErr } = await supabase
              .from("copabolao_users")
              .insert({
                id: keyId,
                name: (name || "Palpiteiro").trim(),
                avatar: avatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix",
                deleted: false
              })
              .select()
              .single();
            if (iErr) {
              console.error("Error creating user profile in copabolao_users:", iErr);
              // Fallback
              finalUser = { id: keyId, name: (name || "Palpiteiro").trim(), avatar: avatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix" };
            } else {
              finalUser = inserted;
            }
          }
        } else {
          // Sign in: ensure user exists
          if (!existingUser) {
            const { data: inserted } = await supabase
              .from("copabolao_users")
              .insert({
                id: keyId,
                name: (name || "Palpiteiro").trim(),
                avatar: avatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix",
                deleted: false
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
            email: finalUser.id
          }
        });
      } else {
        // Offline / Mock mode verification
        if (token.trim() === "123456" || token.trim() === "654321") {
          return res.json({
            success: true,
            user: {
              id: keyId,
              name: (name || "User Teste").trim(),
              avatar: avatar || "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix",
              email: keyId
            }
          });
        } else {
          return res.json({ success: false, message: "Código incorreto! No modo simulado use '123456'." });
        }
      }
    } catch (err: any) {
      return res.json({ success: false, message: `Erro ao verificar OTP: ${err.message}` });
    }
  });

  // REST API: Standard Account Login
  app.post("/api/auth/login", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase conectado." });
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: "E-mail é obrigatório." });

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
          email: data.id
        }
      });
    } catch (err: any) {
      return res.json({ success: false, message: `Erro de login: ${err.message}` });
    }
  });

  // REST API: Standard Account Registration
  app.post("/api/auth/register", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase conectado." });
    const { email, name, avatar } = req.body;
    if (!email || !name) return res.json({ success: false, message: "Nome e E-mail são obrigatórios." });

    const keyId = email.toLowerCase().trim();

    try {
      // Check if user exists
      const { data: existingUser } = await supabase
        .from("copabolao_users")
        .select("*")
        .eq("id", keyId)
        .maybeSingle();

      if (existingUser) {
        if (existingUser.deleted === true) {
          // Reactivate previously deleted user!
          const { error: reactivateErr } = await supabase
            .from("copabolao_users")
            .update({ deleted: false, name: name.trim(), avatar })
            .eq("id", keyId);
          if (reactivateErr) {
            return res.json({ success: false, message: `Erro ao reativar conta: ${reactivateErr.message}` });
          }
          return res.json({
            success: true,
            user: {
              id: keyId,
              name: name.trim(),
              avatar,
              email: keyId
            }
          });
        }
        return res.json({ success: false, message: "Este e-mail já está cadastrado. Alterne para a aba 'Entrar'." });
      }

      // Create new user in Supabase
      const { error } = await supabase
        .from("copabolao_users")
        .insert({
          id: keyId,
          name: name.trim(),
          avatar: avatar
        });

      if (error) {
        return res.json({ success: false, message: `Erro ao salvar usuário: ${error.message}` });
      }

      return res.json({
        success: true,
        user: {
          id: keyId,
          name: name.trim(),
          avatar: avatar,
          email: keyId
        }
      });
    } catch (err: any) {
      return res.json({ success: false, message: `Erro de cadastro: ${err.message}` });
    }
  });

  // REST API: Upsert user to Supabase
  app.post("/api/db/users", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });
    const { id, name, avatar } = req.body;
    try {
      const { error } = await supabase.from("copabolao_users").upsert({ id, name, avatar });
      return res.json({ success: !error, error });
    } catch (error: any) {
      return res.json({ success: false, error: error.message });
    }
  });

  // REST API: Upsert prediction to Supabase
  app.post("/api/db/predictions", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });
    const { id, userId, matchId, homeScore, awayScore, pointsEarned, groupId } = req.body;
    try {
      let { error } = await supabase.from("copabolao_predictions").upsert({
        id,
        user_id: userId,
        match_id: matchId,
        home_score: homeScore,
        away_score: awayScore,
        points_earned: pointsEarned !== undefined ? pointsEarned : null,
        group_id: groupId || null
      });

      if (error && error.message?.includes("group_id")) {
        console.warn("Coluna 'group_id' ausente em copabolao_predictions. Salvando sem a coluna.");
        const fallback = await supabase.from("copabolao_predictions").upsert({
          id,
          user_id: userId,
          match_id: matchId,
          home_score: homeScore,
          away_score: awayScore,
          points_earned: pointsEarned !== undefined ? pointsEarned : null
        });
        error = fallback.error;
      }

      return res.json({ success: !error, error });
    } catch (error: any) {
      return res.json({ success: false, error: error.message });
    }
  });

  // REST API: Upsert group to Supabase
  app.post("/api/db/groups", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });
    const { id, name, description, league, entryFee, creatorId, code, members } = req.body;
    try {
      const { error } = await supabase.from("copabolao_groups").upsert({
        id,
        name,
        description,
        league,
        entry_fee: entryFee,
        creator_id: creatorId,
        code,
        members
      });
      return res.json({ success: !error, error });
    } catch (error: any) {
      return res.json({ success: false, error: error.message });
    }
  });

  // REST API: Upsert comment to Supabase
  app.post("/api/db/comments", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });
    const { id, matchId, userId, userName, userAvatar, text, timestamp, reactions } = req.body;
    try {
      const { error } = await supabase.from("copabolao_comments").upsert({
        id,
        match_id: matchId,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        text,
        timestamp,
        reactions
      });
      return res.json({ success: !error, error });
    } catch (error: any) {
      return res.json({ success: false, error: error.message });
    }
  });

  // REST API: Upsert match to Supabase (Simulator sync)
  app.post("/api/db/matches", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) return res.json({ success: false, message: "Sem Supabase" });
    const { id, homeTeam, awayTeam, date, status, homeScore, awayScore, scorers, league } = req.body;
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
        league
      });
      return res.json({ success: !error, error });
    } catch (error: any) {
      return res.json({ success: false, error: error.message });
    }
  });

  // REST API: Delete group (Soft Delete with hard-delete fallback if column doesn't exist)
  app.post("/api/db/groups/delete", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      // Allow testing/local deletion when Supabase is not configured yet
      return res.json({ success: true, message: "Deletado em modo de simulação local com sucesso.", mode: "simulated-local" });
    }
    const { groupId, userId } = req.body;

    try {
      // Fetch group creator id first to check privilege
      const { data: group, error: fetchErr } = await supabase
        .from("copabolao_groups")
        .select("*")
        .eq("id", groupId)
        .maybeSingle();

      if (fetchErr) {
        // If the table doesn't exist or doesn't have permissions, return success to let the user delete it from localStorage
        if (fetchErr.code === "42P01" || fetchErr.message?.includes("does not exist") || fetchErr.message?.includes("relation")) {
          return res.json({ 
            success: true, 
            message: "Excluído com sucesso (modo local temporário - execute os scripts SQL no painel do Supabase!).", 
            mode: "simulated-local-fallback" 
          });
        }
        return res.json({ success: false, message: `Erro ao buscar o bolão: ${fetchErr.message}` });
      }

      if (!group) {
        // If not found in DB but client requested it, succeed local cleanup
        return res.json({ success: true, message: "Removido localmente com sucesso.", mode: "not-found-fallback" });
      }

      const isAdmin = userId?.toLowerCase() === "dartanhan.fett@gmail.com";
      const isCreator = group.creator_id?.toLowerCase() === userId?.toLowerCase();

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
        // Fallback to hard delete
        const { error: hardDeleteErr } = await supabase
          .from("copabolao_groups")
          .delete()
          .eq("id", groupId);

        if (hardDeleteErr) {
          // If hard delete fails (e.g. constraints/RLS), return success inside local context so user is not stuck
          return res.json({ 
            success: true, 
            message: "Excluído com sucesso localmente (erro ao excluir no Supabase).", 
            mode: "simulated-local-fallback",
            details: hardDeleteErr.message 
          });
        }
        return res.json({ success: true, mode: "hard-delete", message: "Bolão excluído permanentemente do Supabase." });
      }

      return res.json({ success: true, mode: "soft-delete", message: "Bolão excluído com sucesso." });
    } catch (err: any) {
      return res.json({ 
        success: true, 
        message: "Excluído com sucesso localmente.", 
        mode: "simulated-local-error-fallback" 
      });
    }
  });

  // REST API: Delete user (Soft Delete with hard-delete fallback if column doesn't exist)
  app.post("/api/db/users/delete", async (req, res) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      // Allow testing/local account deletion when Supabase is not configured yet
      return res.json({ success: true, message: "Deletado em modo de simulação local com sucesso.", mode: "simulated-local" });
    }
    const { targetUserId, requesterUserId } = req.body;

    const isAdmin = requesterUserId?.toLowerCase() === "dartanhan.fett@gmail.com";
    const isSelf = targetUserId?.toLowerCase() === requesterUserId?.toLowerCase();

    if (!isAdmin && !isSelf) {
      return res.json({ success: false, message: "Apenas administradores ou o próprio usuário podem deletar esta conta." });
    }

    try {
      // Try soft-delete
      const { error: updateErr } = await supabase
        .from("copabolao_users")
        .update({ deleted: true })
        .eq("id", targetUserId);

      if (updateErr) {
        console.log("Soft-delete de usuário falhou (provavelmente sem a coluna 'deleted'). Executando Hard Delete...");
        // Fallback to hard delete
        const { error: hardDeleteErr } = await supabase
          .from("copabolao_users")
          .delete()
          .eq("id", targetUserId);

        if (hardDeleteErr) {
          // If hard delete fails (due to database constraints or foreign keys), return success so the browser can log out and clear storage
          return res.json({ 
            success: true, 
            message: "Sua conta foi removida com sucesso localmente.", 
            mode: "simulated-local-fallback",
            details: hardDeleteErr.message 
          });
        }
        return res.json({ success: true, mode: "hard-delete", message: "Sua conta foi excluída permanentemente do Supabase." });
      }

      return res.json({ success: true, mode: "soft-delete", message: "Sua conta foi excluída com sucesso." });
    } catch (err: any) {
      return res.json({ 
        success: true, 
        message: "Sua conta foi excluída com sucesso localmente.", 
        mode: "simulated-local-error-fallback" 
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
