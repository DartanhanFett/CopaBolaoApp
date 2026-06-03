// Shared constants used by both the React client and the Express server.
// Keep this file dependency-free so it can be imported on either side.

/**
 * Public default group every new user is invited to via WelcomeModal.
 * The server ensures this row exists on each /api/auth/me call (idempotent),
 * and refuses to delete it. Hand-edit the row in Supabase if you need to
 * change name/description.
 */
export const DEFAULT_GROUP = {
  id: 'g_default_copa2026',
  name: 'Geral Copa 2026',
  description: 'Bolão público oficial — aberto a qualquer um. Boa sorte e que vença o melhor palpiteiro! ⚽',
  league: 'Copa do Mundo 2026',
  code: 'COPA2026',
} as const;
