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

const models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
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
