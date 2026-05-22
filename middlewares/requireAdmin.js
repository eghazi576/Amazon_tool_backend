import { env } from "../config/env.js";
import { sendError } from "../utils/response.js";

const adminEmails = env.ADMIN_EMAILS
  ? env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  : [];

export const requireAdmin = (req, res, next) => {
  if (!req.userEmail) {
    return sendError(res, "Unauthorized", 401, "UNAUTHORIZED");
  }
  if (!adminEmails.includes(req.userEmail.toLowerCase())) {
    return sendError(res, "Admin access required", 403, "FORBIDDEN");
  }
  next();
};
