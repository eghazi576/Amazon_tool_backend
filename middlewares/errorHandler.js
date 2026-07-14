import { ZodError } from "zod";
import { sendError } from "../utils/response.js";
import { redact, redactError } from "../utils/redact.js";
import { env } from "../config/env.js";

/**
 * Global error handler middleware.
 * Must be registered LAST in Express (4 arguments).
 *
 * Handles:
 *   - AppError   → structured app errors (our own)
 *   - ZodError   → validation errors (400)
 *   - Prisma     → known DB errors
 *   - Generic    → 500 Internal Server Error
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  // ── AppError (our own) ────────────────────────────────────────────────────
  if (err.isAppError) {
    return sendError(res, err.message, err.statusCode, err.code, err.details);
  }

  // ── Zod validation error ──────────────────────────────────────────────────
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field:   issue.path.join("."),
      message: issue.message,
    }));
    return sendError(res, "Validation failed", 400, "VALIDATION_ERROR", details);
  }

  // ── Malformed JSON body ───────────────────────────────────────────────────
  if (err.type === "entity.parse.failed") {
    return sendError(res, "Invalid JSON body", 400, "INVALID_JSON");
  }

  // ── Payload too large ─────────────────────────────────────────────────────
  if (err.type === "entity.too.large" || err.status === 413) {
    return sendError(res, "Request body too large", 413, "PAYLOAD_TOO_LARGE");
  }

  // ── Prisma known errors ───────────────────────────────────────────────────
  if (err.code === "P2002") {
    // Unique constraint violation
    const field = err.meta?.target?.join(", ") ?? "field";
    return sendError(res, `${field} already exists`, 409, "DUPLICATE_ENTRY");
  }
  if (err.code === "P2025") {
    // Record not found
    return sendError(res, "Record not found", 404, "NOT_FOUND");
  }
  if (err.code === "P2003") {
    // Foreign key constraint
    return sendError(res, "Related record not found", 400, "FK_CONSTRAINT");
  }

  // ── Unknown / unhandled ───────────────────────────────────────────────────
  //
  // This used to be `console.error("[Error]", err)`, dumping the whole object. A
  // Prisma error embeds the failing query AND its parameters in its own message,
  // so a database hiccup during registration wrote the user's email and their
  // bcrypt hash straight into the server log. err.stack repeats the message, so
  // scrubbing one without the other would have achieved nothing.
  //
  // redactError() keeps what debugs the problem (name, code, route, stack shape)
  // and removes what identifies a person. See utils/redact.js.
  console.error("[Error]", redactError(err, req));

  return sendError(
    res,
    // Even in development the raw message is not returned: it is the same Prisma
    // message that can carry an email or a hash, and it would be going to a
    // browser rather than a log.
    env.NODE_ENV === "production" ? "Internal server error" : redact(err.message),
    500,
    "INTERNAL_ERROR"
  );
};
