/**
 * Maps team names from OpenFootball (English) to display names (Portuguese)
 * and ISO codes for flag icons. The 48 teams of the 2026 World Cup.
 *
 * Source format from OpenFootball:
 *   { team1: "Brazil", team2: "Morocco", ... }
 *
 * Mapped output:
 *   { name: "Brasil", code: "BRA", flagUrl: "https://flagcdn.com/w160/br.png" }
 *
 * If a team isn't in this map (e.g. knockout placeholders like "W101"), the
 * caller falls back to using the raw English name as-is.
 */

export interface TeamMapping {
  name: string;     // Portuguese display name
  code: string;     // FIFA-style 3-letter code, used in compact UI
  iso2: string;     // ISO-3166 alpha-2 for flagcdn URLs
}

// Lowercase keys for case-insensitive lookups.
const TEAMS: Record<string, TeamMapping> = {
  // ─── Hosts (3) ───
  "mexico":              { name: "México",          code: "MEX", iso2: "mx" },
  "canada":              { name: "Canadá",          code: "CAN", iso2: "ca" },
  "united states":       { name: "Estados Unidos",  code: "USA", iso2: "us" },
  "usa":                 { name: "Estados Unidos",  code: "USA", iso2: "us" },

  // ─── South America (6) ───
  "brazil":              { name: "Brasil",          code: "BRA", iso2: "br" },
  "argentina":           { name: "Argentina",       code: "ARG", iso2: "ar" },
  "uruguay":             { name: "Uruguai",         code: "URU", iso2: "uy" },
  "colombia":            { name: "Colômbia",        code: "COL", iso2: "co" },
  "ecuador":             { name: "Equador",         code: "EQU", iso2: "ec" },
  "paraguay":            { name: "Paraguai",        code: "PAR", iso2: "py" },

  // ─── Europe (16) ───
  "england":             { name: "Inglaterra",      code: "ENG", iso2: "gb-eng" },
  "france":              { name: "França",          code: "FRA", iso2: "fr" },
  "spain":               { name: "Espanha",         code: "ESP", iso2: "es" },
  "germany":             { name: "Alemanha",        code: "GER", iso2: "de" },
  "portugal":            { name: "Portugal",        code: "POR", iso2: "pt" },
  "netherlands":         { name: "Holanda",         code: "NED", iso2: "nl" },
  "belgium":             { name: "Bélgica",         code: "BEL", iso2: "be" },
  "italy":               { name: "Itália",          code: "ITA", iso2: "it" },
  "croatia":             { name: "Croácia",         code: "CRO", iso2: "hr" },
  "switzerland":         { name: "Suíça",           code: "SUI", iso2: "ch" },
  "denmark":             { name: "Dinamarca",       code: "DEN", iso2: "dk" },
  "austria":             { name: "Áustria",         code: "AUT", iso2: "at" },
  "scotland":            { name: "Escócia",         code: "SCO", iso2: "gb-sct" },
  "norway":              { name: "Noruega",         code: "NOR", iso2: "no" },
  "ukraine":             { name: "Ucrânia",         code: "UKR", iso2: "ua" },
  "poland":              { name: "Polônia",         code: "POL", iso2: "pl" },
  "czech republic":      { name: "Rep. Tcheca",     code: "CZE", iso2: "cz" },
  "wales":               { name: "Gales",           code: "WAL", iso2: "gb-wls" },
  "serbia":              { name: "Sérvia",          code: "SRB", iso2: "rs" },
  "turkey":              { name: "Turquia",         code: "TUR", iso2: "tr" },
  "albania":             { name: "Albânia",         code: "ALB", iso2: "al" },
  "ireland":             { name: "Irlanda",         code: "IRL", iso2: "ie" },
  "slovakia":            { name: "Eslováquia",      code: "SVK", iso2: "sk" },
  "slovenia":            { name: "Eslovênia",       code: "SVN", iso2: "si" },
  "bosnia & herzegovina":{ name: "Bósnia",          code: "BIH", iso2: "ba" },
  "bosnia and herzegovina":{ name: "Bósnia",        code: "BIH", iso2: "ba" },
  "north macedonia":     { name: "Macedônia",       code: "MKD", iso2: "mk" },
  "iceland":             { name: "Islândia",        code: "ISL", iso2: "is" },
  "greece":              { name: "Grécia",          code: "GRE", iso2: "gr" },
  "sweden":              { name: "Suécia",          code: "SWE", iso2: "se" },
  "kosovo":              { name: "Kosovo",          code: "KOS", iso2: "xk" },
  "georgia":             { name: "Geórgia",         code: "GEO", iso2: "ge" },
  "northern ireland":    { name: "Irl. do Norte",   code: "NIR", iso2: "gb-nir" },
  "finland":             { name: "Finlândia",       code: "FIN", iso2: "fi" },

  // ─── Africa (9) ───
  "morocco":             { name: "Marrocos",        code: "MAR", iso2: "ma" },
  "senegal":             { name: "Senegal",         code: "SEN", iso2: "sn" },
  "tunisia":             { name: "Tunísia",         code: "TUN", iso2: "tn" },
  "egypt":               { name: "Egito",           code: "EGY", iso2: "eg" },
  "algeria":             { name: "Argélia",         code: "ALG", iso2: "dz" },
  "ghana":               { name: "Gana",            code: "GHA", iso2: "gh" },
  "nigeria":             { name: "Nigéria",         code: "NGA", iso2: "ng" },
  "ivory coast":         { name: "Costa do Marfim", code: "CIV", iso2: "ci" },
  "cameroon":            { name: "Camarões",        code: "CMR", iso2: "cm" },
  "south africa":        { name: "África do Sul",   code: "RSA", iso2: "za" },
  "mali":                { name: "Mali",            code: "MLI", iso2: "ml" },
  "burkina faso":        { name: "Burkina Faso",    code: "BFA", iso2: "bf" },
  "cape verde":          { name: "Cabo Verde",      code: "CPV", iso2: "cv" },

  // ─── Asia / Oceania ───
  "japan":               { name: "Japão",           code: "JPN", iso2: "jp" },
  "south korea":         { name: "Coreia do Sul",   code: "KOR", iso2: "kr" },
  "iran":                { name: "Irã",             code: "IRN", iso2: "ir" },
  "saudi arabia":        { name: "Arábia Saudita",  code: "KSA", iso2: "sa" },
  "australia":           { name: "Austrália",       code: "AUS", iso2: "au" },
  "qatar":               { name: "Catar",           code: "QAT", iso2: "qa" },
  "uzbekistan":          { name: "Uzbequistão",     code: "UZB", iso2: "uz" },
  "jordan":              { name: "Jordânia",        code: "JOR", iso2: "jo" },
  "iraq":                { name: "Iraque",          code: "IRQ", iso2: "iq" },
  "new zealand":         { name: "Nova Zelândia",   code: "NZL", iso2: "nz" },

  // ─── CONCACAF / Caribbean ───
  "panama":              { name: "Panamá",          code: "PAN", iso2: "pa" },
  "costa rica":          { name: "Costa Rica",      code: "CRC", iso2: "cr" },
  "honduras":            { name: "Honduras",        code: "HON", iso2: "hn" },
  "jamaica":             { name: "Jamaica",         code: "JAM", iso2: "jm" },
  "haiti":               { name: "Haiti",           code: "HAI", iso2: "ht" },
  "el salvador":         { name: "El Salvador",     code: "SLV", iso2: "sv" },
  "guatemala":           { name: "Guatemala",       code: "GUA", iso2: "gt" },
  "trinidad & tobago":   { name: "Trinidad",        code: "TRI", iso2: "tt" },
};

/**
 * Look up a team by its English name (case-insensitive). If not found —
 * common for knockout placeholders like "Winner Group A" or "W101" — returns
 * a synthesized record using the raw input as the display name.
 */
export function mapTeam(rawName: string): TeamMapping {
  if (!rawName) {
    return { name: "?", code: "TBD", iso2: "" };
  }
  const key = rawName.trim().toLowerCase();
  const found = TEAMS[key];
  if (found) return found;

  // Fallback for placeholders / unknown teams. Generates a 3-letter code from
  // the input so the UI doesn't break, and uses an empty iso2 so the flag
  // component falls back to a generic ⚽ icon.
  const fallbackCode = rawName
    .replace(/[^a-zA-Z]/g, "")
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  return { name: rawName, code: fallbackCode, iso2: "" };
}

/**
 * Builds the flagcdn.com URL for a team. Returns a soccer-ball emoji as
 * fallback for placeholders (knockout TBDs).
 */
export function teamFlagUrl(iso2: string): string {
  if (!iso2) return "⚽";
  return `https://flagcdn.com/w160/${iso2}.png`;
}
