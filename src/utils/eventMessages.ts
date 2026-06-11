/**
 * Catálogo de mensagens zueiras que renderizam cada `AppEvent` na aba Novidades.
 *
 * Cada tipo tem N variantes; a função pickPhrase escolhe uma de forma estável
 * (hash do id do evento), então cada evento sempre mostra a mesma frase entre
 * renders/reloads — não fica embaralhando ao re-abrir a aba.
 *
 * As frases são deliberadamente brasileiras, conversacionais, e usam emojis
 * pra dar peso visual. Se algum dia migrarmos pra outros idiomas, esse arquivo
 * vira o ponto de extensão.
 */

import type { AppEvent } from "../types";

// Hash determinístico simples a partir do id do evento. Não precisa ser
// criptográfico — só estável pra rotacionar entre as variantes sem state.
function pickIndex(seed: string, length: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % length;
}

function pick(seed: string, options: string[]): string {
  if (options.length === 0) return "";
  return options[pickIndex(seed, options.length)];
}

const COMMENT_PHRASES = [
  "💬 {actor} cornetou em {match}",
  "💬 {actor} jogou um achismo em {match}",
  "💬 {actor} mandou a real em {match}",
  "🗣️ {actor} chegou no chat de {match}",
  "💬 {actor} resenhando em {match}",
];

const PREDICTION_PHRASES = [
  "🎯 {actor} cravou {score} em {match}",
  "🎯 {actor} apostou {score} no {match} — confiança máxima",
  "🎯 {actor} chutou {score} em {match}",
  "🎲 {actor} jogou {score} em {match}",
  "🎯 {actor} bateu o martelo: {score} em {match}",
];

const MEMBER_JOINED_PHRASES = [
  "👋 {actor} entrou no bolão",
  "🚪 {actor} chegou. Bem-vindo à roda!",
  "🎉 {actor} se juntou à galera",
  "🆕 {actor} acaba de entrar no bolão",
];

const MATCH_LIVE_PHRASES = [
  "🟢 {match} começou! Palpites trancados.",
  "🔥 Bola rolando em {match}!",
  "📺 {match} no ar — sem mais palpites.",
  "⚽ Apito inicial: {match}!",
];

const MATCH_COMPLETED_PHRASES = [
  "🏁 {match} terminou: {score}",
  "📋 Encerrado: {match} — {score}",
  "🔚 Fim de jogo em {match}: {score}",
  "✅ {match} ficou {score}. Hora de pontuar!",
];

const RANK_PASSED_PHRASES = [
  "🐍 {actor} passou {target} no ranking. Embolada pra cima.",
  "📈 {actor} subiu na frente de {target}. Chegou junto!",
  "🏃 {actor} ultrapassou {target}. Vai deixar?",
  "👀 {actor} tá no pé de {target} — foi ultrapassado.",
  "⚡ {actor} foi pra cima de {target} no ranking.",
  "🎢 {target} caiu uma posição: {actor} chegou.",
];

const RANK_PODIUM_PHRASES = [
  "🥉 {actor} chegou no pódio! Top 3 garantido.",
  "🎯 {actor} entrou no top 3 — tá voando.",
  "🏆 {actor} bateu na porta dos campeões: agora é top 3.",
  "🚀 {actor} subiu pro top 3. Atenção, galera.",
];

const RANK_EXACT_PHRASES = [
  "🔥 {actor} acertou o PLACAR EXATO de {match}! 5pts no bolso.",
  "🎯 {actor} cravou {score} em {match} — placar exato!",
  "💎 {actor} mitou: previu o placar exato de {match}.",
  "🏅 {actor} tirou letra: placar exato em {match}.",
];

const RANK_ZEROED_PHRASES = [
  "💀 {actor} zerou em {match}. Faz parte da resenha.",
  "🤡 {actor} viajou na maionese em {match}.",
  "📉 {actor} pipocou em {match} — 0 ponto.",
  "🙅 {actor} errou bonito em {match}.",
];

interface RenderInput {
  event: AppEvent;
  /** Resolves a userId (email) to a display name. Falls back to the email's
   *  local part when the user isn't loaded yet (e.g. brand-new member). */
  resolveName: (userId?: string | null) => string;
}

export interface RenderedEvent {
  /** Final phrase ready to render. Tokens like {actor}, {target}, {match}, {score}
   *  are already substituted. */
  text: string;
  /** Bucket used by the UI for per-type tinting. */
  category: "comment" | "prediction" | "member" | "match" | "rank";
}

export function renderEvent({ event, resolveName }: RenderInput): RenderedEvent {
  const actor = resolveName(event.actorId);
  const target = resolveName(event.targetId);
  const match = event.payload?.matchLabel || "um jogo";
  const score = event.payload?.score || "";

  const fill = (template: string) =>
    template
      .replace(/\{actor\}/g, actor)
      .replace(/\{target\}/g, target)
      .replace(/\{match\}/g, match)
      .replace(/\{score\}/g, score);

  switch (event.type) {
    case "comment.new":
      return { text: fill(pick(event.id, COMMENT_PHRASES)), category: "comment" };
    case "prediction.new":
      return { text: fill(pick(event.id, PREDICTION_PHRASES)), category: "prediction" };
    case "group.member.joined":
      return { text: fill(pick(event.id, MEMBER_JOINED_PHRASES)), category: "member" };
    case "match.live":
      return { text: fill(pick(event.id, MATCH_LIVE_PHRASES)), category: "match" };
    case "match.completed":
      return { text: fill(pick(event.id, MATCH_COMPLETED_PHRASES)), category: "match" };
    case "rank.passed":
      return { text: fill(pick(event.id, RANK_PASSED_PHRASES)), category: "rank" };
    case "rank.podium":
      return { text: fill(pick(event.id, RANK_PODIUM_PHRASES)), category: "rank" };
    case "rank.exact":
      return { text: fill(pick(event.id, RANK_EXACT_PHRASES)), category: "rank" };
    case "rank.zeroed":
      return { text: fill(pick(event.id, RANK_ZEROED_PHRASES)), category: "rank" };
    default:
      return { text: `Algo aconteceu (${event.type})`, category: "comment" };
  }
}
