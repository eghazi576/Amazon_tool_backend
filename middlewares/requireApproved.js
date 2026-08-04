import { authModel } from "../model/auth/authModel.js";
import { env } from "../config/env.js";
import { sendError } from "../utils/response.js";

const adminEmails = env.ADMIN_EMAILS
  ? env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  : [];
const isAdmin = (email) => adminEmails.includes(email?.toLowerCase());

/**
 * Gate the tool behind admin approval. Runs AFTER requireAuth (needs req.userId /
 * req.userEmail). Admins (by ADMIN_EMAILS) always pass; everyone else must have
 * an APPROVED account. PENDING and REJECTED users are signed in but blocked, so
 * the frontend can show the right waiting / rejected screen.
 */
export const requireApproved = async (req, res, next) => {
  try {
    if (isAdmin(req.userEmail)) return next();

    const user = await authModel.findById(req.userId);
    if (!user) return sendError(res, "User not found", 401, "UNAUTHORIZED");
    if (user.status === "APPROVED") return next();

    const rejected = user.status === "REJECTED";
    return sendError(
      res,
      rejected ? "Your account was not approved." : "Your account is awaiting admin approval.",
      403,
      rejected ? "ACCOUNT_REJECTED" : "PENDING_APPROVAL",
    );
  } catch (err) {
    next(err);
  }
};
