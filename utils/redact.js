/**
 * Strips personal data and credentials out of anything on its way to a log.
 *
 * This exists because Prisma errors are not safe to log verbatim. A failed
 * `prisma.user.create()` produces a message that embeds the whole data object:
 *
 *   Invalid `prisma.user.create()` invocation:
 *   { data: { email: "someone@example.com", password: "$2a$12$Xy…" } }
 *
 * So a database hiccup during registration would write a real user's email and
 * their bcrypt hash into the server log. Logs get tailed, shipped and pasted into
 * tickets. They are the wrong place for either.
 *
 * The patterns below are deliberately broad. Over-redacting a log line costs
 * nothing; under-redacting it leaks a person.
 */

const PATTERNS = [
  // Email addresses.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]"],
  // bcrypt hashes ($2a$ / $2b$ / $2y$).
  [/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, "[REDACTED_HASH]"],
  // JWTs.
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]"],
  // Long hex strings -- reset tokens (32 bytes) and refresh tokens (40 bytes)
  // are both hex, and both are as good as a password to whoever reads them.
  [/\b[a-f0-9]{32,}\b/gi, "[REDACTED_TOKEN]"],
  // A password field, however it is quoted.
  [/("?password"?\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1"[REDACTED]"'],
  // Postgres connection strings, if one ever surfaces in an error.
  [/postgres(ql)?:\/\/[^\s"']+/gi, "[REDACTED_DB_URL]"],
];

/** @param {unknown} value @returns {string} */
export function redact(value) {
  if (value === null || value === undefined) return String(value);
  let s = typeof value === "string" ? value : String(value);
  for (const [pattern, replacement] of PATTERNS) s = s.replace(pattern, replacement);
  return s;
}

/**
 * The safe shape of an error for a log line: enough to debug, nothing that
 * identifies a person.
 */
export function redactError(err, req) {
  return {
    name: err?.name,
    code: err?.code,
    message: redact(err?.message),
    route: req ? `${req.method} ${req.originalUrl}` : undefined,
    stack: redact(err?.stack),
  };
}
