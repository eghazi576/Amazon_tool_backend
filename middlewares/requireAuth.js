import { verifyToken } from "../utils/jwt.js";
import { sendError } from "../utils/response.js";

/**
 * Auth middleware — verifies JWT from Authorization header.
 * Sets req.userId and req.userEmail on success.
 */
export const requireAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return sendError(res, "Missing Authorization header", 401, "UNAUTHORIZED");
    }

    const token   = header.slice(7);
    const payload = verifyToken(token);

    req.userId    = payload.userId;
    req.userEmail = payload.email;

    next();
  } catch (err) {
    next(err);
  }
};
