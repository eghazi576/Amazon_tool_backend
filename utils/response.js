// ─── Response Wrapper ─────────────────────────────────────────────────────────
// All API responses go through these helpers for consistency.
//
// Success shape:  { success: true,  data: <payload>,  message?: string }
// Error shape:    { success: false, error: <message>, code?: string, details?: any }

/**
 * Send a success response.
 * @param {import("express").Response} res
 * @param {any} data
 * @param {string} [message]
 * @param {number} [statusCode=200]
 */
export const sendSuccess = (res, data, message = null, statusCode = 200) => {
  const body = { success: true, data };
  if (message) body.message = message;
  return res.status(statusCode).json(body);
};

/**
 * Send an error response.
 * @param {import("express").Response} res
 * @param {string} message
 * @param {number} [statusCode=500]
 * @param {string} [code]
 * @param {any} [details]
 */
export const sendError = (res, message, statusCode = 500, code = null, details = null) => {
  const body = { success: false, error: message };
  if (code)    body.code    = code;
  if (details) body.details = details;
  return res.status(statusCode).json(body);
};

// ─── App Error Class ──────────────────────────────────────────────────────────
// Throw this from services/controllers for predictable error handling.
//
// Usage:
//   throw new AppError("User not found", 404, "USER_NOT_FOUND");

export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {string} [code]
   * @param {any} [details]
   */
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code       = code;
    this.details    = details;
    this.isAppError = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
