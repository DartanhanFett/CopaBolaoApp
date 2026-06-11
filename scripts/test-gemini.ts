// Standalone smoke test for the Gemini call. Run locally via:
//   npx tsx scripts/test-gemini.ts
// Reads GEMINI_API_KEY from .env (same as the server). Useful when the prod
// endpoint silently falls back to canned strings — this surfaces the raw error
// the Google SDK throws.
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("❌ GEMINI_API_KEY missing from .env");
  process.exit(1);
}

// Models to probe. Updated 2026-06-10 — 1.5-flash is deprecated on v1beta and
// 2.0-flash isn't enabled by default for new free-tier accounts. The "lite"
// sibling of 2.5 is the best free-tier safety net we've found.
const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const ai = new GoogleGenAI({ apiKey: key });

for (const model of models) {
  console.log(`\n──────  Testing ${model}  ──────`);
  try {
    const response = await ai.models.generateContent({
      model,
      contents: 'Brasil x Argentina pela Copa 2026. Sugira um placar e um comentário curto em português.',
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            homeScore: { type: Type.INTEGER },
            awayScore: { type: Type.INTEGER },
            reasoning: { type: Type.STRING },
          },
          required: ["homeScore", "awayScore", "reasoning"],
        },
      },
    });
    console.log(`✅ ${model} responded:`);
    console.log(response.text);
  } catch (err: any) {
    console.error(`❌ ${model} failed:`);
    console.error("  message:", err.message);
    if (err.status) console.error("  status:", err.status);
    if (err.code) console.error("  code:", err.code);
  }
}
