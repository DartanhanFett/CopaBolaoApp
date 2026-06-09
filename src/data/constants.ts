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

/**
 * Master switch that hides the public default group from the UI:
 *   - it disappears from the "Explorar Públicos" tab
 *   - the welcome modal that offered to join it stops showing
 *
 * The group itself is NOT deleted from the database — existing members keep
 * their membership and chat/predictions stay intact. Flip back to `true` to
 * re-enable everything without any migration.
 *
 * Reason for the kill switch: during the demo phase, brand-new users were
 * accidentally landing on Geral instead of the friend-invited bolão they came
 * from, and chat there was confusing the friends/family WhatsApp groups.
 */
export const DEFAULT_GROUP_VISIBLE = false;
