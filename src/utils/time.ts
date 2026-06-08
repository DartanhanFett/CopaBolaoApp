/**
 * Timezone-aware date/time formatting.
 *
 * Why a dedicated helper:
 *  - The browser's auto-detected timezone is wrong for users on VPN (e.g. someone
 *    in China with VPN exiting through US sees match times in PST). The user can
 *    override this in Profile, and we honor that override everywhere consistently.
 *  - Default ('auto') falls back to the browser/device timezone — the right
 *    behavior for the 95% of users who aren't on a VPN.
 */

/** A short curated list of timezones we expose in the UI. Add more as needed. */
export const TIMEZONE_OPTIONS = [
  { value: "auto",                 label: "Automático (dispositivo)" },
  { value: "America/Sao_Paulo",    label: "São Paulo · Brasília (GMT-3)" },
  { value: "America/Manaus",       label: "Manaus (GMT-4)" },
  { value: "America/Noronha",      label: "Fernando de Noronha (GMT-2)" },
  { value: "America/New_York",     label: "Nova York · Miami (GMT-5/-4)" },
  { value: "America/Los_Angeles",  label: "Los Angeles · São Francisco (GMT-8/-7)" },
  { value: "America/Mexico_City",  label: "Cidade do México (GMT-6)" },
  { value: "Europe/Lisbon",        label: "Lisboa (GMT+0/+1)" },
  { value: "Europe/London",        label: "Londres (GMT+0/+1)" },
  { value: "Europe/Paris",         label: "Paris · Berlim · Madrid (GMT+1/+2)" },
  { value: "Africa/Johannesburg",  label: "Joanesburgo (GMT+2)" },
  { value: "Asia/Dubai",           label: "Dubai (GMT+4)" },
  { value: "Asia/Shanghai",        label: "China · Xangai (GMT+8)" },
  { value: "Asia/Tokyo",           label: "Tóquio (GMT+9)" },
  { value: "Australia/Sydney",     label: "Sydney (GMT+10/+11)" },
] as const;

export type TimezonePref = string; // "auto" | IANA timezone

/**
 * Resolve "auto" to the browser/device timezone. Returns the IANA string ready
 * to pass to Intl APIs.
 */
export function resolveTimezone(pref: TimezonePref): string {
  if (!pref || pref === "auto") {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
    } catch {
      return "America/Sao_Paulo";
    }
  }
  return pref;
}

/**
 * Formats a match kickoff time in the user's preferred timezone.
 * Default mirrors what MatchList/SimulatorPanel were doing (toLocaleString pt-BR
 * with weekday + day + month + hour:minute).
 */
export function formatMatchTime(
  isoString: string,
  pref: TimezonePref = "auto",
  opts?: Intl.DateTimeFormatOptions,
): string {
  const tz = resolveTimezone(pref);
  const date = new Date(isoString);
  return date.toLocaleString("pt-BR", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    ...opts,
  });
}

/**
 * Compact variant for tight UI spots (Simulator rows). E.g. "04 jun, 16:00".
 */
export function formatMatchTimeCompact(isoString: string, pref: TimezonePref = "auto"): string {
  const tz = resolveTimezone(pref);
  const date = new Date(isoString);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}

/**
 * Returns a short human-readable label for the resolved timezone (used as a
 * passive indicator in the UI, e.g. "Horários em América/São Paulo").
 */
export function timezoneLabel(pref: TimezonePref): string {
  const tz = resolveTimezone(pref);
  if (pref === "auto") return `${tz} (auto)`;
  return tz;
}
