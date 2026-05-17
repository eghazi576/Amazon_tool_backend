import { ZodError } from "zod";
import { AppError, sendError } from "../utils/response.js";
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
  console.error("[Error]", err);
  return sendError(
    res,
    env.NODE_ENV === "production" ? "Internal server error" : err.message,
    500,
    "INTERNAL_ERROR"
  );
};
